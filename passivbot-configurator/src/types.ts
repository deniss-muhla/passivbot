export interface BotConfig {
    close_grid_markup_range: number;
    close_grid_min_markup: number;
    close_grid_qty_pct: number;
    close_trailing_grid_ratio: number;
    close_trailing_qty_pct: number;
    close_trailing_retracement_pct: number;
    close_trailing_threshold_pct: number;
    ema_span_0: number;
    ema_span_1: number;
    entry_grid_double_down_factor: number;
    entry_grid_spacing_pct: number;
    entry_grid_spacing_weight: number;
    entry_initial_ema_dist: number;
    entry_initial_qty_pct: number;
    entry_trailing_grid_ratio: number;
    entry_trailing_retracement_pct: number;
    entry_trailing_threshold_pct: number;
    filter_relative_volume_clip_pct: number;
    filter_rolling_window: number;
    n_positions: number;
    total_wallet_exposure_limit: number;
    unstuck_close_pct: number;
    unstuck_ema_dist: number;
    unstuck_loss_allowance_pct: number;
    unstuck_threshold: number;
}

export interface LiveConfig {
    approved_coins: string[];
    auto_gs: boolean;
    coin_flags: Record<string, string>;
    empty_means_all_approved: boolean;
    execution_delay_seconds: number;
    filter_by_min_effective_cost: boolean;
    forced_mode_long: string;
    forced_mode_short: string;
    ignored_coins: {
        long: string[];
        short: string[];
    };
    leverage: number;
    max_n_cancellations_per_batch: number;
    max_n_creations_per_batch: number;
    max_n_restarts_per_day: number;
    minimum_coin_age_days: number;
    ohlcvs_1m_rolling_window_days: number;
    ohlcvs_1m_update_after_minutes: number;
    pnls_max_lookback_days: number;
    price_distance_threshold: number;
    time_in_force: string;
    user: string;
}

export interface OptimizeBounds {
    long_close_grid_markup_range: [number, number];
    long_close_grid_min_markup: [number, number];
    long_close_grid_qty_pct: [number, number];
    long_close_trailing_grid_ratio: [number, number];
    long_close_trailing_qty_pct: [number, number];
    long_close_trailing_retracement_pct: [number, number];
    long_close_trailing_threshold_pct: [number, number];
    long_ema_span_0: [number, number];
    long_ema_span_1: [number, number];
    long_entry_grid_double_down_factor: [number, number];
    long_entry_grid_spacing_pct: [number, number];
    long_entry_grid_spacing_weight: [number, number];
    long_entry_initial_ema_dist: [number, number];
    long_entry_initial_qty_pct: [number, number];
    long_entry_trailing_grid_ratio: [number, number];
    long_entry_trailing_retracement_pct: [number, number];
    long_entry_trailing_threshold_pct: [number, number];
    long_filter_relative_volume_clip_pct: [number, number];
    long_filter_rolling_window: [number, number];
    long_n_positions: [number, number];
    long_total_wallet_exposure_limit: [number, number];
    long_unstuck_close_pct: [number, number];
    long_unstuck_ema_dist: [number, number];
    long_unstuck_loss_allowance_pct: [number, number];
    long_unstuck_threshold: [number, number];
    short_close_grid_markup_range: [number, number];
    short_close_grid_min_markup: [number, number];
    short_close_grid_qty_pct: [number, number];
    short_close_trailing_grid_ratio: [number, number];
    short_close_trailing_qty_pct: [number, number];
    short_close_trailing_retracement_pct: [number, number];
    short_close_trailing_threshold_pct: [number, number];
    short_ema_span_0: [number, number];
    short_ema_span_1: [number, number];
    short_entry_grid_double_down_factor: [number, number];
    short_entry_grid_spacing_pct: [number, number];
    short_entry_grid_spacing_weight: [number, number];
    short_entry_initial_ema_dist: [number, number];
    short_entry_initial_qty_pct: [number, number];
    short_entry_trailing_grid_ratio: [number, number];
    short_entry_trailing_retracement_pct: [number, number];
    short_entry_trailing_threshold_pct: [number, number];
    short_filter_relative_volume_clip_pct: [number, number];
    short_filter_rolling_window: [number, number];
    short_n_positions: [number, number];
    short_total_wallet_exposure_limit: [number, number];
    short_unstuck_close_pct: [number, number];
    short_unstuck_ema_dist: [number, number];
    short_unstuck_loss_allowance_pct: [number, number];
    short_unstuck_threshold: [number, number];
}

export interface OptimizeConfig {
    bounds: OptimizeBounds;
    compress_results_file: boolean;
    crossover_probability: number;
    iters: number;
    limits: {
        lower_bound_drawdown_worst: number;
        lower_bound_drawdown_worst_mean_1pct: number;
        lower_bound_equity_balance_diff_mean: number;
        lower_bound_loss_profit_ratio: number;
    };
    mutation_probability: number;
    n_cpus: number;
    population_size: number;
    scoring: string[];
}

export interface Config {
    backtest: {
        base_dir: string;
        compress_cache: boolean;
        end_date: string;
        exchanges: string[];
        start_date: string;
        starting_balance: number;
    };
    bot: {
        long: BotConfig;
        short: BotConfig;
    };
    live: LiveConfig;
    optimize: OptimizeConfig;
}
