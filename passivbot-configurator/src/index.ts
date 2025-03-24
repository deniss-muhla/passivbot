import * as path from "path";
import { PATHS } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

// SET 1: "HYPE", "AVAX", "ARKM"
// SET 2: "PEPE", "POPCAT", "MOODENG" +? "USUAL"
// OTHERS: "USUAL", "FARTCOIN", "ADA", "RARE", "SUI", "ENA", "AAVE", "WIF", "OP", "LINK"
// TODO: "ADA", "RARE"
// TODO: "SUI" ?+ "ENA" ?+ "AAVE"
const version = "2.6.1";
const configPath = path.resolve(PATHS.CONFIGS, `bybit-${version}`);
//const optimizationPrimarySymbols: string[] = ["BTC"];
const configSymbols: string[] = ["HYPE", "ARKM", "NEIROETH"]; //POPCAT
const nPositionsMin = 2.5;
const nPositionsMax = 3.4;
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, "templates/bybit-1.2.0.json");

const optimize = async (dateRange: number) => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = [0.5, 1];
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = [0.5, 1];
    }

    config.save();
    await config.optimize();
    config.applyOptimizedConfig();

    // Save config
    config.setSymbols(configSymbols);
    config.save();
    //await config.backtest();

    for (const symbol of configSymbols) {
        const symbolConfig = Config.createFromTemplateConfigFile(symbol, configPath, templateConfigFilePath);
        symbolConfig.setSymbols([symbol]);
        symbolConfig.setDateRange(dateRange);
        symbolConfig.setOptimizationGlobalBounds(config.configFile);
        symbolConfig.save();
        await symbolConfig.optimize();
        symbolConfig.applyOptimizedConfig();

        // Save symbol config
        symbolConfig.save();
        //await symbolConfig.backtest();
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
    //await optimize(7 * 3);
    await backtest(7 * 12);
})();
