import * as path from "path";
import { PATHS } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

// SET 1: "HYPE", "AVAX", "ARKM"
// SET 2: "PEPE", "POPCAT", "MOODENG" +? "USUAL"
// OTHERS: "USUAL", "FARTCOIN", "ADA", "RARE", "SUI", "ENA", "AAVE", "WIF", "OP", "LINK"
// TODO: "ADA", "RARE"
// TODO: "SUI" ?+ "ENA" ?+ "AAVE"
const version = "3.0.0";
const configPath = path.resolve(PATHS.CONFIGS, `bybit-${version}`);
//const optimizationPrimarySymbols: string[] = ["BTC"];
const configSymbols: string[] = ["HYPE", "NEIROETH"];
const nPositionsMin = 1.5;
const nPositionsMax = 2.4;
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, "templates/bybit-3.0.0.json");

const optimize = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = [0.25, 2];
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = [0.25, 2];
    }

    config.save();
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
};

const optimizeSymbols = async (dateRange: number) => {
    const config = Config.load("config", configPath);
    config.setSymbols(configSymbols);
    config.setDateRange(dateRange);
    config.save();

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

(async () => {
    await optimize(7 * 2);
    //await optimizeSymbols(7 * 2);
    await backtest(7 * 6);
    //await backtest(7 * 12);
})();
