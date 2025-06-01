import * as path from "path";
import { formatDuration, PATHS, sleep } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

// SET 1: "HYPE", "AVAX", "ARKM"
// SET 2: "PEPE", "POPCAT", "MOODENG" +? "USUAL"
// OTHERS: "USUAL", "FARTCOIN", "ADA", "RARE", "SUI", "ENA", "AAVE", "WIF", "OP", "LINK"
// "ADA", "RARE"
// "SUI" ?+ "ENA" ?+ "AAVE"

const version = "HYPE-4.0.5";
const templateVersion = "HYPE-4.4";
const startingVersion = "bybit-HYPE-4.0.2-best";
const disableOptimizationLong: boolean = false;
const disableOptimizationShort: boolean = false;
const nPositionsMin = 1;
const nPositionsMax = 1;
const configSymbols: string[] = ["HYPE"];
const totalWalletExposureLimit: [number, number] = [0.75, 1];

const configPath = path.resolve(PATHS.CONFIGS, `bybit-${version}`);
const startingConfigPath = startingVersion ? path.resolve(PATHS.CONFIGS, `bybit-${startingVersion}`) : undefined;
//const optimizationPrimarySymbols: string[] = ["BTC"];
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, `templates/bybit-${templateVersion}.json`);
const startTime = new Date();

const optimize = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile(
        "config",
        configPath,
        templateConfigFilePath,
        startingConfigPath
    );
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
        const symbolConfig = Config.createFromTemplateConfigFile(
            symbol,
            configPath,
            templateConfigFilePath,
            startingConfigPath
        );
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
        const symbolConfig = Config.createFromTemplateConfigFile(
            symbol,
            configPath,
            templateConfigFilePath,
            startingConfigPath
        );
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

const optimizeSingle = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile(
        "config",
        configPath,
        templateConfigFilePath,
        startingConfigPath
    );
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = totalWalletExposureLimit;
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = totalWalletExposureLimit;
    }

    disableOptimizationLong && config.disableOptimizationLong();
    disableOptimizationShort && config.disableOptimizationShort();

    config.save();

    await config.optimize();
    await config.analyzeOptimizationResults();
    config.copyOptimizedConfig();
    config.setSymbols(configSymbols);
    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            duration: formatDuration(new Date().getTime() - startTime.getTime()),
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
    // await config.backtest();
};

const backtestSingle = async (dateRange: number) => {
    const config = Config.load("config", configPath);
    config.setDateRange(dateRange);
    config.save();

    await config.backtest();
};

(async () => {
    //await optimizeSingle(7 * 4 * 1);
    //await optimizeSingle(7 * 4 * 12);

    // await sleep(2000);
    // await backtestSingle(7 * 4 * 1);

    await optimizeSingle(160);

    await sleep(2000);
    await backtestSingle(160);

    await sleep(2000);
    await backtestSingle(14);

    await sleep(2000);
    await backtestSingle(500);

    //await optimize(7 * 2);
    //await optimizeSymbols(7 * 2);
    //await backtest(7 * 6);
    //await backtest(7 * 12);
})();
