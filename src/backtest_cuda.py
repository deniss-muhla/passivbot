import torch
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional, Set
import logging

# Constants for indexing
HIGH = 0
LOW = 1
CLOSE = 2
VOLUME = 3

# Constants for position side
LONG = 0
SHORT = 1
NO_POS = 2


@dataclass
class EMABands:
    upper: float
    lower: float


@dataclass
class Order:
    price: float
    qty: float
    type: str
    pside: int
    idx: int


@dataclass
class Fill:
    price: float
    qty: float
    type: str
    pside: int
    idx: int
    timestamp: int


@dataclass
class Position:
    size: float
    price: float
    idx: int
    pside: int


class CUDABacktest:
    def __init__(
        self,
        hlcv_tensor: torch.Tensor,
        bot_params: dict,
        exchange_params: dict,
        backtest_params: dict,
    ):
        """Initialize CUDA backtest with tensor data and parameters"""
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Set default dtype and device (PyTorch 2.1+ recommended way)
        torch.set_default_dtype(torch.float32)
        torch.set_default_device(self.device)

        # Store bot and backtest parameters
        self.bot_params = bot_params
        self.backtest_params = backtest_params

        # Process exchange parameters if passed as list
        if isinstance(exchange_params, list):
            processed_params = {}
            for param in exchange_params:
                if isinstance(param, dict):
                    processed_params.update(param)
            exchange_params = processed_params

        self.exchange_params = exchange_params

        # Extract and validate exchange parameters with defaults
        try:
            self.leverage = torch.as_tensor(
                float(exchange_params.get("leverage", 1.0)),
                dtype=torch.float32,
                device=self.device,
            )
            self.min_qty = torch.as_tensor(
                float(exchange_params.get("min_qty", 1e-3)),
                dtype=torch.float32,
                device=self.device,
            )
            self.price_step = torch.as_tensor(
                float(exchange_params.get("price_step", 1e-1)),
                dtype=torch.float32,
                device=self.device,
            )
            self.maker_fee = torch.as_tensor(
                float(exchange_params.get("maker_fee", 0.0)),
                dtype=torch.float32,
                device=self.device,
            )
            self.taker_fee = torch.as_tensor(
                float(exchange_params.get("taker_fee", 0.0)),
                dtype=torch.float32,
                device=self.device,
            )
        except (TypeError, ValueError) as e:
            logging.error(f"Error processing exchange parameters: {str(e)}")
            self.leverage = torch.as_tensor(
                1.0, dtype=torch.float32, device=self.device
            )
            self.min_qty = torch.as_tensor(
                1e-3, dtype=torch.float32, device=self.device
            )
            self.price_step = torch.as_tensor(
                1e-1, dtype=torch.float32, device=self.device
            )
            self.maker_fee = torch.as_tensor(
                0.0, dtype=torch.float32, device=self.device
            )
            self.taker_fee = torch.as_tensor(
                0.0, dtype=torch.float32, device=self.device
            )

        # Enable TF32 and cudnn optimizations
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        torch.backends.cudnn.benchmark = True

        # Pre-process and move data to GPU efficiently
        with torch.cuda.stream(torch.cuda.Stream()):
            # Move HLCV data to GPU and ensure correct shape
            self.hlcv = hlcv_tensor.to(
                device=self.device, dtype=torch.float32, non_blocking=True
            )

            # Get tensor dimensions and validate
            if len(self.hlcv.shape) != 3:
                raise ValueError(
                    f"Expected 3D tensor (n_candles, n_symbols, n_indicators), got shape {self.hlcv.shape}"
                )

            # Ensure HLCV tensor has correct shape [n_candles, n_symbols, n_indicators]
            if self.hlcv.shape[2] != 4:  # Should have 4 indicators (HLCV)
                if self.hlcv.shape[0] == 4:
                    self.hlcv = self.hlcv.permute(1, 2, 0)  # Permute to correct shape
                else:
                    raise ValueError(
                        f"Expected 4 indicators (HLCV), got shape {self.hlcv.shape}"
                    )

            # Get tensor dimensions after potential permutation
            self.n_candles = self.hlcv.shape[0]  # Number of candles is first dimension
            self.n_symbols = self.hlcv.shape[1]  # Number of symbols is second dimension

            if self.n_candles == 0 or self.n_symbols == 0:
                raise ValueError(
                    f"Invalid tensor dimensions: n_candles={self.n_candles}, n_symbols={self.n_symbols}"
                )

            # Pre-allocate tensors for price data with correct shapes
            self.high_prices = self.hlcv[
                :, :, HIGH
            ].contiguous()  # [n_candles, n_symbols]
            self.low_prices = self.hlcv[
                :, :, LOW
            ].contiguous()  # [n_candles, n_symbols]
            self.close_prices = self.hlcv[
                :, :, CLOSE
            ].contiguous()  # [n_candles, n_symbols]

            # Pre-allocate memory for positions and equity
            self.positions = torch.zeros(
                (2, self.n_symbols, 2), dtype=torch.float32, device=self.device
            )
            starting_balance = torch.as_tensor(
                float(backtest_params.get("starting_balance", 100.0)),
                dtype=torch.float32,
                device=self.device,
            )

            # Initialize equity trackers with correct shapes
            self.equity = torch.full(
                (self.n_symbols,),
                starting_balance.item(),
                dtype=torch.float32,
                device=self.device,
            )
            self.equity_tensor = torch.full(
                (self.n_candles, self.n_symbols),
                starting_balance.item(),
                dtype=torch.float32,
                device=self.device,
            )

            # Calculate optimal batch size with safety checks
            total_gpu_mem = torch.cuda.get_device_properties(self.device).total_memory
            free_gpu_mem = max(
                1024 * 1024,
                torch.cuda.memory_reserved(self.device)
                - torch.cuda.memory_allocated(self.device),
            )  # Minimum 1MB
            mem_per_candle = max(
                1024,
                self.hlcv.element_size()
                * self.hlcv.nelement()
                / max(1, self.n_candles),
            )  # Minimum 1KB per candle
            max_batch_size = max(1, int(0.2 * free_gpu_mem / mem_per_candle))
            self.batch_size = max(1, min(max_batch_size, 1024, self.n_candles))

            # Pre-allocate buffers for intermediate calculations
            self.pnl_buffer = torch.zeros(
                self.n_symbols, dtype=torch.float32, device=self.device
            )
            self.entry_prices_buffer = torch.zeros(
                self.n_symbols, dtype=torch.float32, device=self.device
            )
            self.fills = []

        # Wait for all GPU operations to complete
        torch.cuda.synchronize()

        # Setup EMAs
        self.setup_emas()

    def setup_emas(self):
        """Setup EMA calculations for entry/exit signals"""
        try:
            # Setup spans
            self.spans = {
                0: [
                    self.bot_params["long"]["ema_span_0"],
                    self.bot_params["long"]["ema_span_1"],
                ],
                1: [
                    self.bot_params["short"]["ema_span_0"],
                    self.bot_params["short"]["ema_span_1"],
                ],
            }

            # Calculate alpha values for EMA updates
            self.ema_alphas = {
                0: torch.as_tensor(
                    [2.0 / (span + 1.0) for span in self.spans[0]], device=self.device
                ),
                1: torch.as_tensor(
                    [2.0 / (span + 1.0) for span in self.spans[1]], device=self.device
                ),
            }

            # Initialize EMA tensors
            n_symbols = self.hlcv.shape[1]
            self.emas = {
                0: torch.zeros((2, n_symbols), device=self.device),
                1: torch.zeros((2, n_symbols), device=self.device),
            }

            # Initialize with first valid close prices
            close_prices = self.hlcv[0, :, CLOSE]
            mask = close_prices == 0

            if mask.any():
                # Find first non-zero prices
                for i in range(min(100, self.hlcv.shape[0])):
                    next_prices = self.hlcv[i, :, CLOSE]
                    close_prices = torch.where(mask, next_prices, close_prices)
                    mask = close_prices == 0
                    if not mask.any():
                        break

            # Set any remaining zeros to minimum price step
            if mask.any():
                min_price = self.price_step
                close_prices = torch.where(
                    mask, torch.as_tensor(min_price, device=self.device), close_prices
                )

            # Initialize EMAs with valid prices
            for pside in [0, 1]:
                self.emas[pside][0] = close_prices
                self.emas[pside][1] = close_prices

        except Exception as e:
            logging.error(f"Error in EMA setup: {str(e)}")
            raise

    def initialize_emas(self):
        """Initialize EMAs with first valid close prices"""
        try:
            # Get first valid close prices
            close_prices = self.close_prices[0]  # [symbols]

            # Handle zero prices
            mask = close_prices == 0
            if mask.any():
                # Find first non-zero prices
                for i in range(min(100, self.n_candles)):
                    next_prices = self.close_prices[i]
                    close_prices = torch.where(mask, next_prices, close_prices)
                    mask = close_prices == 0
                    if not mask.any():
                        break

                if mask.any():
                    # If still have zeros, use price step as fallback
                    close_prices = torch.where(mask, self.price_step, close_prices)

            # Initialize EMAs for both sides
            self.emas = {
                0: [close_prices.clone() for _ in range(2)],  # Long side EMAs
                1: [close_prices.clone() for _ in range(2)],  # Short side EMAs
            }

            # Initialize EMA alphas (can be adjusted based on requirements)
            self.ema_alphas = {
                0: [
                    torch.as_tensor(0.1, device=self.device),
                    torch.as_tensor(0.05, device=self.device),
                ],  # Long alphas
                1: [
                    torch.as_tensor(0.1, device=self.device),
                    torch.as_tensor(0.05, device=self.device),
                ],  # Short alphas
            }

        except Exception as e:
            logging.error(f"Error initializing EMAs: {str(e)}")
            raise

    def run(self):
        """Run the backtest using batched processing"""
        try:
            # Initialize EMAs with first candle
            self.initialize_emas()

            # Process batches with safety checks
            if self.batch_size <= 0:
                self.batch_size = 1  # Ensure minimum batch size

            # Calculate number of batches safely
            n_batches = (self.n_candles + self.batch_size - 1) // self.batch_size
            if n_batches <= 0:
                n_batches = 1  # Ensure at least one batch

            # Process each batch
            for batch_idx in range(n_batches):
                start_idx = batch_idx * self.batch_size
                end_idx = min(start_idx + self.batch_size, self.n_candles)

                # Ensure valid batch indices
                if start_idx >= self.n_candles:
                    break
                if start_idx >= end_idx:
                    continue

                current_batch_size = end_idx - start_idx
                if current_batch_size <= 0:
                    continue

                # Process entire batch on GPU with automatic mixed precision
                with torch.amp.autocast(device_type="cuda"):
                    with torch.cuda.stream(torch.cuda.Stream()):
                        # Update EMAs
                        self.update_emas_batch(start_idx, end_idx, current_batch_size)

                        # Process fills
                        self.process_fills_batch(start_idx, end_idx, current_batch_size)

                        # Update equity
                        self.update_equity_batch(start_idx, end_idx, current_batch_size)

            # Return results
            return self.fills, self.equity_tensor.cpu().numpy(), {}

        except Exception as e:
            logging.error(f"Error in backtest: {str(e)}")
            raise

    def update_emas_batch(self, start_idx: int, end_idx: int, batch_size: int):
        """Update EMAs for a batch of candles"""
        with torch.amp.autocast(device_type="cuda"):
            try:
                # Ensure valid batch size
                if batch_size <= 0:
                    return

                # Get the batch of close prices (already on GPU)
                close_prices = self.close_prices[
                    start_idx:end_idx
                ]  # [batch_size, symbols]

                # Update EMAs with proper broadcasting on GPU
                for pside in [0, 1]:
                    for i, (ema, alpha) in enumerate(
                        zip(self.emas[pside], self.ema_alphas[pside])
                    ):
                        # Update EMA values
                        ema_update = alpha * (close_prices - ema)
                        self.emas[pside][i] = ema + ema_update

            except Exception as e:
                logging.error(f"Error updating EMAs: {str(e)}")
                raise

    def process_fills_batch(self, start_idx: int, end_idx: int, batch_size: int):
        """Process fills for a batch of candles"""
        with torch.amp.autocast(device_type="cuda"):
            try:
                # Ensure valid batch size
                if batch_size <= 0:
                    return

                # Log tensor shapes for debugging
                logging.info(
                    f"Processing batch: start_idx={start_idx}, end_idx={end_idx}, batch_size={batch_size}"
                )
                logging.info(f"HLCV tensor shape: {self.hlcv.shape}")
                logging.info(f"Number of symbols: {self.n_symbols}")

                # Use pre-allocated price data
                high_prices_batch = self.high_prices[
                    start_idx:end_idx
                ]  # [batch_size, symbols]
                low_prices_batch = self.low_prices[
                    start_idx:end_idx
                ]  # [batch_size, symbols]

                logging.info(f"High prices batch shape: {high_prices_batch.shape}")
                logging.info(f"Low prices batch shape: {low_prices_batch.shape}")

                # Process fills for each symbol
                for symbol_idx in range(self.n_symbols):
                    # Log symbol processing
                    logging.info(f"Processing symbol {symbol_idx}")

                    # Skip invalid symbol indices
                    if symbol_idx >= self.n_symbols:
                        logging.warning(
                            f"Skipping invalid symbol index {symbol_idx} >= {self.n_symbols}"
                        )
                        continue

                    # Process long entries
                    if not self.positions[0, symbol_idx, 0]:  # If no long position
                        try:
                            entry_price = self.calc_entry_price_long(symbol_idx)
                            if entry_price is not None:  # Check if entry price is valid
                                logging.info(
                                    f"Symbol {symbol_idx} entry_price shape: {entry_price.shape if hasattr(entry_price, 'shape') else 'scalar'}"
                                )

                                self.entry_prices_buffer[symbol_idx] = entry_price
                                symbol_low_prices = low_prices_batch[
                                    :, symbol_idx
                                ]  # [batch_size]

                                logging.info(
                                    f"Symbol {symbol_idx} low_prices shape: {symbol_low_prices.shape}"
                                )

                                # Ensure entry_price is a tensor and has correct shape
                                if not isinstance(entry_price, torch.Tensor):
                                    entry_price = torch.tensor(
                                        entry_price, device=self.device
                                    )
                                entry_price = entry_price.reshape(
                                    1
                                )  # Ensure it's a 1D tensor

                                # Expand entry price to match batch dimension with explicit shape
                                entry_price_expanded = entry_price.expand(
                                    symbol_low_prices.size()
                                )

                                logging.info(
                                    f"Symbol {symbol_idx} entry_price_expanded shape: {entry_price_expanded.shape}"
                                )

                                # Check for fills
                                fill_mask = symbol_low_prices <= entry_price_expanded
                                if torch.any(fill_mask):
                                    size = self.calc_position_size(
                                        entry_price, 0, symbol_idx
                                    )
                                    if (
                                        size is not None
                                    ):  # Check if size calculation is valid
                                        fill_idx = (
                                            start_idx
                                            + torch.nonzero(fill_mask)[0].item()
                                        )

                                        # Record fill
                                        self.fills.append(
                                            Fill(
                                                price=float(entry_price.item()),
                                                qty=float(size.item()),
                                                type="long",
                                                pside=0,
                                                idx=symbol_idx,
                                                timestamp=int(fill_idx),
                                            )
                                        )
                                        self.positions[0, symbol_idx] = torch.as_tensor(
                                            [size, entry_price], device=self.device
                                        )
                        except Exception as e:
                            logging.error(
                                f"Error processing long entry for symbol {symbol_idx}: {str(e)}"
                            )
                            continue

                    # Process short entries
                    if not self.positions[1, symbol_idx, 0]:  # If no short position
                        try:
                            entry_price = self.calc_entry_price_short(symbol_idx)
                            if entry_price is not None:  # Check if entry price is valid
                                symbol_high_prices = high_prices_batch[
                                    :, symbol_idx
                                ]  # [batch_size]

                                logging.info(
                                    f"Symbol {symbol_idx} high_prices shape: {symbol_high_prices.shape}"
                                )

                                # Ensure entry_price is a tensor and has correct shape
                                if not isinstance(entry_price, torch.Tensor):
                                    entry_price = torch.tensor(
                                        entry_price, device=self.device
                                    )
                                entry_price = entry_price.reshape(
                                    1
                                )  # Ensure it's a 1D tensor

                                # Expand entry price to match batch dimension with explicit shape
                                entry_price_expanded = entry_price.expand(
                                    symbol_high_prices.size()
                                )

                                logging.info(
                                    f"Symbol {symbol_idx} entry_price_expanded shape: {entry_price_expanded.shape}"
                                )

                                # Check for fills
                                fill_mask = symbol_high_prices >= entry_price_expanded
                                if torch.any(fill_mask):
                                    size = self.calc_position_size(
                                        entry_price, 1, symbol_idx
                                    )
                                    if (
                                        size is not None
                                    ):  # Check if size calculation is valid
                                        fill_idx = (
                                            start_idx
                                            + torch.nonzero(fill_mask)[0].item()
                                        )

                                        # Record fill
                                        self.fills.append(
                                            Fill(
                                                price=float(entry_price.item()),
                                                qty=float(size.item()),
                                                type="short",
                                                pside=1,
                                                idx=symbol_idx,
                                                timestamp=int(fill_idx),
                                            )
                                        )
                                        self.positions[1, symbol_idx] = torch.as_tensor(
                                            [size, entry_price], device=self.device
                                        )
                        except Exception as e:
                            logging.error(
                                f"Error processing short entry for symbol {symbol_idx}: {str(e)}"
                            )
                            continue

            except Exception as e:
                logging.error(f"Error processing fills: {str(e)}")
                raise

    def update_equity_batch(self, start_idx: int, end_idx: int, batch_size: int):
        """Update equity for a batch of candles"""
        with torch.amp.autocast(device_type="cuda", dtype=torch.float32):
            try:
                # Ensure valid batch size
                if batch_size <= 0:
                    return

                with torch.no_grad():
                    # Get closing prices for the batch (ensure correct indexing)
                    close = self.close_prices[end_idx - 1]  # [symbols]

                    # Calculate PnL for each position
                    total_pnl = torch.zeros(
                        self.n_symbols, dtype=torch.float32, device=self.device
                    )
                    for pside in [0, 1]:
                        pos_sizes = self.positions[pside, :, 0]  # [symbols]
                        pos_prices = self.positions[pside, :, 1]  # [symbols]

                        if pside == 0:
                            pnl = pos_sizes * (close - pos_prices)
                        else:
                            pnl = pos_sizes * (pos_prices - close)

                        total_pnl += pnl

                    # Update equity
                    self.equity += total_pnl

                    # Update equity tensor for the batch
                    batch_equity = self.equity.unsqueeze(0).expand(
                        batch_size, -1
                    )  # [batch_size, symbols]
                    self.equity_tensor[start_idx:end_idx] = batch_equity

            except Exception as e:
                logging.error(f"Error updating equity: {str(e)}")
                raise

    def calc_entry_price_long(self, symbol_idx):
        """Calculate entry price for long position"""
        try:
            logging.info(f"Calculating long entry price for symbol {symbol_idx}")
            logging.info(
                f"EMA shapes - ema_0: {self.emas[0][0].shape}, ema_1: {self.emas[0][1].shape}"
            )

            if symbol_idx >= self.emas[0][0].shape[0]:
                logging.error(
                    f"Symbol index {symbol_idx} >= {self.emas[0][0].shape[0]} (ema shape)"
                )
                raise IndexError(f"Symbol index {symbol_idx} out of bounds")

            ema_0, ema_1 = self.emas[0]
            initial_dist = self.bot_params["long"]["entry_initial_ema_dist"]

            logging.info(f"Symbol {symbol_idx} ema_0 value: {ema_0[symbol_idx]}")
            logging.info(f"Initial dist: {initial_dist}")

            entry_price = ema_0[symbol_idx] * (1 + initial_dist)
            entry_price = torch.clamp(entry_price, min=float(self.price_step))

            logging.info(
                f"Calculated entry price: {entry_price}, shape: {entry_price.shape if hasattr(entry_price, 'shape') else 'scalar'}"
            )

            return entry_price
        except Exception as e:
            logging.error(
                f"Error calculating long entry price for symbol {symbol_idx}: {str(e)}"
            )
            raise

    def calc_entry_price_short(self, symbol_idx):
        """Calculate entry price for short position"""
        try:
            if symbol_idx >= self.emas[1][0].shape[0]:
                raise IndexError(f"Symbol index {symbol_idx} out of bounds")
            ema_0, ema_1 = self.emas[1]
            initial_dist = self.bot_params["short"]["entry_initial_ema_dist"]
            entry_price = ema_0[symbol_idx] * (1 - initial_dist)
            entry_price = torch.clamp(entry_price, min=float(self.price_step))
            return entry_price
        except Exception as e:
            logging.error(
                f"Error calculating short entry price for symbol {symbol_idx}: {str(e)}"
            )
            raise

    def calc_position_size(self, entry_price, pside, symbol_idx):
        """Calculate position size based on entry price and current equity"""
        try:
            current_equity = self.equity[symbol_idx]

            # Get parameters based on position side
            side_params = (
                self.bot_params["long"] if pside == 0 else self.bot_params["short"]
            )

            # Get wallet exposure with fallback values
            wallet_exposure = side_params.get(
                "wallet_exposure_limit", side_params.get("wallet_exposure", 1.0)
            )

            # Calculate position size using leverage and wallet exposure
            size = (current_equity * wallet_exposure * self.leverage) / entry_price

            # Adjust for minimum quantity step
            size = torch.floor(size / self.min_qty) * self.min_qty

            # Ensure size is non-negative
            size = torch.max(size, torch.as_tensor(0.0, device=self.device))

            return size

        except Exception as e:
            logging.error(
                f"Error calculating position size for symbol {symbol_idx}: {str(e)}"
            )
            # Return zero size on error
            return torch.as_tensor(0.0, device=self.device)


def run(
    hlcv_tensor: torch.Tensor,
    bot_params: dict,
    exchange_params: dict,
    backtest_params: dict,
) -> Tuple[List[Fill], List[float], dict]:
    """
    Main entry point for CUDA-accelerated backtesting

    Args:
        hlcv_tensor: PyTorch tensor of shape (4, n_symbols, n_candles) containing HLCV data
        bot_params: Dictionary containing bot parameters
        exchange_params: Dictionary containing exchange parameters
        backtest_params: Dictionary containing backtest parameters

    Returns:
        Tuple containing:
        - List of fills
        - List of equity values
        - Dictionary containing analysis results
    """
    try:
        backtest = CUDABacktest(
            hlcv_tensor, bot_params, exchange_params, backtest_params
        )
        fills, equities = backtest.run()

        # Calculate required metrics
        equity_array = np.array(equities)
        drawdowns = np.maximum.accumulate(equity_array) - equity_array
        max_drawdown = float(
            np.max(drawdowns) / np.max(equity_array) if len(equity_array) > 0 else 0.0
        )

        # Calculate mean drawdown of worst 1%
        n_samples = max(1, int(len(drawdowns) * 0.01))
        worst_drawdowns = np.sort(drawdowns)[-n_samples:]
        mean_worst_drawdown = float(
            np.mean(worst_drawdowns) / np.max(equity_array)
            if len(worst_drawdowns) > 0
            else 0.0
        )

        # Calculate profit/loss metrics
        profit_sum = sum(f.qty * f.price for f in fills if f.type == "entry")
        loss_sum = sum(f.qty * f.price for f in fills if f.type == "exit")
        loss_profit_ratio = float(abs(loss_sum) / profit_sum if profit_sum > 0 else 1.0)

        # Calculate equity balance difference metrics
        if len(equity_array) > 0:
            equity_balance_diffs = np.diff(equity_array)
            equity_balance_diff_mean = float(np.mean(np.abs(equity_balance_diffs)))
            equity_balance_diff_max = float(np.max(np.abs(equity_balance_diffs)))
        else:
            equity_balance_diff_mean = 0.0
            equity_balance_diff_max = 0.0

        # Calculate returns and time metrics
        if len(equity_array) > 0:
            # Calculate returns
            returns = np.diff(equity_array) / equity_array[:-1]
            negative_returns = returns[returns < 0]

            # Time calculations (assuming 1-minute candles)
            n_days = len(equity_array) / (24 * 60)
            total_gain = (equity_array[-1] / equity_array[0]) - 1

            # Mean Daily Gain (MDG) - Geometric mean of daily returns
            # Handle negative gains properly
            if total_gain < -1:  # Complete loss
                mdg = -1.0
            else:
                # Use the sign-preserving geometric mean formula
                gain_sign = np.sign(total_gain)
                abs_gain = abs(total_gain)
                mdg = float(
                    gain_sign * ((1 + abs_gain) ** (1 / n_days) - 1)
                    if n_days > 0
                    else 0.0
                )

            # Average Daily Gain (ADG) - Arithmetic mean of daily returns
            adg = float(total_gain / n_days if n_days > 0 else 0.0)

            # Return statistics
            avg_return = np.mean(returns)
            std_return = np.std(returns) if len(returns) > 0 else 0.0
            downside_std = (
                np.std(negative_returns) if len(negative_returns) > 0 else 0.0
            )

            # Risk-adjusted return metrics
            risk_free_rate = 0.0  # Assuming zero risk-free rate
            excess_returns = returns - risk_free_rate
            sharpe_ratio = float(
                np.mean(excess_returns) / std_return if std_return > 0 else 0.0
            )
            sortino_ratio = float(
                avg_return / downside_std if downside_std > 0 else 0.0
            )
        else:
            mdg = adg = sharpe_ratio = sortino_ratio = 0.0

        analysis = {
            "n_fills": len(fills),
            "final_equity": equities[-1] if equities else 0.0,
            "drawdown_worst": max_drawdown,
            "drawdown_worst_mean_1pct": mean_worst_drawdown,
            "loss_profit_ratio": loss_profit_ratio,
            "equity_balance_diff_mean": equity_balance_diff_mean,
            "equity_balance_diff_max": equity_balance_diff_max,
            "profit_ratio": equities[-1] / equities[0] if equities else 1.0,
            "mdg": mdg,
            "adg": adg,
            "sharpe_ratio": sharpe_ratio,
            "sortino_ratio": sortino_ratio,
        }

        return fills, equities, analysis

    except Exception as e:
        logging.error(f"Error in CUDA backtest: {str(e)}")
        raise


def calc_max_drawdown(equities: List[float]) -> float:
    """Calculate maximum drawdown from equity curve"""
    if not equities:
        return 0.0

    peak = equities[0]
    max_dd = 0.0

    for equity in equities:
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak
        max_dd = max(max_dd, dd)

    return max_dd
