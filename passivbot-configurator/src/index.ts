import * as path from "path";
import { PATHS } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

// SET 1: "HYPE", "AVAX", "ARKM"
// SET 2: "PEPE", "POPCAT", "MOODENG" +? "USUAL"
// OTHERS: "USUAL", "FARTCOIN", "ADA", "RARE", "SUI", "ENA", "AAVE", "WIF", "OP", "LINK"
// TODO: "ADA", "RARE"
// TODO: "SUI" ?+ "ENA" ?+ "AAVE"

// TODO: entry_trailing_double_down_factor
// "long_entry_trailing_double_down_factor": [0.1, 3.0],
// "short_entry_trailing_double_down_factor": [0.1, 3.0],

const version = "HYPE-3.3.0";
const configPath = path.resolve(PATHS.CONFIGS, `bybit-${version}`);
//const optimizationPrimarySymbols: string[] = ["BTC"];
const configSymbols: string[] = ["HYPE"];
const nPositionsMin = 1;
const nPositionsMax = 1;
const totalWalletExposureLimit: [number, number] = [1.25, 2.25];
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, `templates/bybit-${version}.json`);

const optimize = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = totalWalletExposureLimit;
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = totalWalletExposureLimit;
    }

    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            version,
            //optimizationPrimarySymbols,
            symbols: configSymbols,
            dateRange,
            nPositions: [nPositionsMin, nPositionsMax],
            templateConfigFilePath,
        },
        { spaces: 4 }
    );

    await config.optimize();
    config.applyOptimizedConfig();

    // Save config
    config.setSymbols(configSymbols);
    config.save();
    await config.backtest();

    for (const symbol of configSymbols) {
        const symbolConfig = Config.createFromTemplateConfigFile(symbol, configPath, templateConfigFilePath);
        symbolConfig.setSymbols([symbol]);
        symbolConfig.setDateRange(dateRange * 2);
        symbolConfig.setOptimizationGlobalBounds(config.configFile);
        symbolConfig.save();
        await symbolConfig.optimize();
        symbolConfig.applyOptimizedConfig();

        // Save symbol config
        symbolConfig.save();
        await symbolConfig.backtest();
        config.linkSymbolConfig(symbol);
        config.save();
    }
};

const optimizeSymbols = async (dateRange: number) => {
    const config = Config.load("config", configPath);
    config.setSymbols(configSymbols);
    config.setDateRange(dateRange);
    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            version,
            //optimizationPrimarySymbols,
            symbols: configSymbols,
            dateRange,
            nPositions: [nPositionsMin, nPositionsMax],
            totalWalletExposureLimit,
            templateConfigFilePath,
        },
        { spaces: 4 }
    );

    for (const symbol of configSymbols) {
        const symbolConfig = Config.createFromTemplateConfigFile(symbol, configPath, templateConfigFilePath);
        symbolConfig.setSymbols([symbol]);
        symbolConfig.setDateRange(dateRange * 2);
        symbolConfig.setOptimizationGlobalBounds(config.configFile);
        symbolConfig.save();

        await symbolConfig.optimize();
        symbolConfig.applyOptimizedConfig();

        // Save symbol config
        symbolConfig.save();
        await symbolConfig.backtest();
        config.linkSymbolConfig(symbol);
        config.save();
    }
};

const optimizeSingle = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = totalWalletExposureLimit;
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = totalWalletExposureLimit;
    }

    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            version,
            //optimizationPrimarySymbols,
            symbols: configSymbols,
            dateRange,
            nPositions: [nPositionsMin, nPositionsMax],
            totalWalletExposureLimit,
            templateConfigFilePath,
        },
        { spaces: 4 }
    );

    await config.optimize();
    config.applyOptimizedConfig();

    // Save config
    config.setSymbols(configSymbols);
    config.save();
    await config.backtest();
};

const backtest = async (dateRange: number) => {
    const config = Config.load("config", configPath);
    config.setDateRange(dateRange);
    config.save();

    await config.backtest();

    for (const symbol of configSymbols) {
        const symbolConfig = Config.load(symbol, configPath);
        symbolConfig.setDateRange(dateRange);
        symbolConfig.save();

        await symbolConfig.backtest();
    }
};

const backtestSingle = async (dateRange: number) => {
    const config = Config.load("config", configPath);
    config.setDateRange(dateRange);
    config.save();

    await config.backtest();
};

(async () => {
    await optimizeSingle(7 * 4);
    //await optimize(7 * 2);
    //await optimizeSymbols(7 * 2);
    await backtestSingle(7 * 4 * 12);
    //await backtest(7 * 6);
    //await backtest(7 * 12);
})();
