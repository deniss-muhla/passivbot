import * as path from "path";
import { PATHS } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

// TODO: "ADA", "RARE"
// TODO: "SUI" ?+ "ENA" ?+ "AAVE"
const version = "2.3.3";
const configPath = path.resolve(PATHS.CONFIGS, `bybit-${version}`);
const configSymbols = ["PEPE", "HYPE", "USUAL", "AVAX"];
// const optimizationSymbols = ["PEPE", "HYPE", "USUAL", "AVAX"];
const dateRange = 30;
const nPositionsMin = 3.5;
const nPositionsMax = 4.4;
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, "templates/bybit-1.1.1.json");

(async () => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);

    if (config.configFile.optimize) {
        config.configFile.optimize.bounds.long_total_wallet_exposure_limit = [0.75, 1];
        config.configFile.optimize.bounds.short_total_wallet_exposure_limit = [0.75, 1];
    }

    config.save();
    await config.optimize();
    config.applyOptimizedConfig();
    config.save();
    await config.backtest();

    for (const symbol of configSymbols) {
        const symbolConfig = Config.createFromTemplateConfigFile(symbol, configPath, templateConfigFilePath);
        symbolConfig.setSymbols([symbol]);
        symbolConfig.setDateRange(dateRange);
        symbolConfig.setOptimizationGlobalBounds(config.configFile);
        symbolConfig.save();
        await symbolConfig.optimize();
        symbolConfig.applyOptimizedConfig();
        symbolConfig.save();
        await symbolConfig.backtest();
        config.linkSymbolConfig(symbol);
        config.save();
    }

    await writeJSON(
        path.resolve(configPath, "meta.json"),
        {
            version,
            symbols: configSymbols,
            dateRange,
            nPositions: [nPositionsMin, nPositionsMax],
            templateConfigFilePath,
        },
        { spaces: 4 }
    );
})();
