import * as path from "path";
import { formatDuration, PATHS, sleep } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

// SET 1: "HYPE", "AVAX", "ARKM"
// SET 2: "PEPE", "POPCAT", "MOODENG" +? "USUAL"
// OTHERS: "USUAL", "FARTCOIN", "ADA", "RARE", "SUI", "ENA", "AAVE", "WIF", "OP", "LINK"
// "ADA", "RARE"
// "SUI" ?+ "ENA" ?+ "AAVE"

// HYPE-4.0.11-best-r
// HYPE-5.0.0-safe-best
// HYPE-5.1.0-grid-close-best

interface ConfigOptions {
    version: string;
    templateVersion: string;
    startingVersion?: string;
    disableOptimizationLong: boolean;
    disableOptimizationShort: boolean;
    nPositionsMin: number;
    nPositionsMax: number;
    configSymbols: string[];
    totalWalletExposureLimit: [number, number];
}

const configOptions: ConfigOptions = {
    version: "HYPE-5.2.2",
    templateVersion: "HYPE-5.2",
    startingVersion: undefined, //"HYPE-4.0.6-best",
    disableOptimizationLong: false,
    disableOptimizationShort: false,
    nPositionsMin: 1,
    nPositionsMax: 1,
    configSymbols: ["HYPE"],
    totalWalletExposureLimit: [0.75, 1],
};

const configPath = path.resolve(PATHS.CONFIGS, `bybit-${configOptions.version}`);
const startingConfigPath = configOptions.startingVersion
    ? path.resolve(PATHS.CONFIGS, `bybit-${configOptions.startingVersion}`)
    : undefined;
//const optimizationPrimarySymbols: string[] = ["BTC"];
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, `templates/bybit-${configOptions.templateVersion}.json`);
const startTime = new Date();

const optimize = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile(
        "config",
        configPath,
        templateConfigFilePath,
        startingConfigPath
    );
    config.setSymbols(configOptions.configSymbols);
    config.setOptimizationBoundsNPositions(configOptions.nPositionsMin, configOptions.nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = configOptions.totalWalletExposureLimit;
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = configOptions.totalWalletExposureLimit;
    }

    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            version: configOptions.version,
            //optimizationPrimarySymbols,
            symbols: configOptions.configSymbols,
            dateRange,
            nPositions: [configOptions.nPositionsMin, configOptions.nPositionsMax],
            templateConfigFilePath,
        },
        { spaces: 4 }
    );

    await config.optimize();
    config.applyOptimizedConfig();

    // Save config
    config.setSymbols(configOptions.configSymbols);
    config.save();
    await config.backtest();

    for (const symbol of configOptions.configSymbols) {
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
    config.setSymbols(configOptions.configSymbols);
    config.setDateRange(dateRange);
    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            version: configOptions.version,
            //optimizationPrimarySymbols,
            symbols: configOptions.configSymbols,
            dateRange,
            nPositions: [configOptions.nPositionsMin, configOptions.nPositionsMax],
            totalWalletExposureLimit: configOptions.totalWalletExposureLimit,
            templateConfigFilePath,
        },
        { spaces: 4 }
    );

    for (const symbol of configOptions.configSymbols) {
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

    for (const symbol of configOptions.configSymbols) {
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
    config.setSymbols(configOptions.configSymbols);
    config.setOptimizationBoundsNPositions(configOptions.nPositionsMin, configOptions.nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = configOptions.totalWalletExposureLimit;
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = configOptions.totalWalletExposureLimit;
    }

    configOptions.disableOptimizationLong && config.disableOptimizationLong();
    configOptions.disableOptimizationShort && config.disableOptimizationShort();

    config.save();

    await config.optimize();
    await config.analyzeOptimizationResults();
    config.copyOptimizedConfig();
    config.setSymbols(configOptions.configSymbols);
    config.save();

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            duration: formatDuration(new Date().getTime() - startTime.getTime()),
            version: configOptions.version,
            //optimizationPrimarySymbols,
            symbols: configOptions.configSymbols,
            dateRange,
            nPositions: [configOptions.nPositionsMin, configOptions.nPositionsMax],
            totalWalletExposureLimit: configOptions.totalWalletExposureLimit,
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

const optimizeDateRangeDays = 80; // 160

(async () => {
    //await optimizeSingle(7 * 4 * 1);
    //await optimizeSingle(7 * 4 * 12);

    // await sleep(2000);
    // await backtestSingle(7 * 4 * 1);

    await optimizeSingle(optimizeDateRangeDays);

    await sleep(2000);
    await backtestSingle(optimizeDateRangeDays);

    await sleep(2000);
    await backtestSingle(14);

    await sleep(2000);
    await backtestSingle(500);

    //await optimize(7 * 2);
    //await optimizeSymbols(7 * 2);
    //await backtest(7 * 6);
    //await backtest(7 * 12);
})();
