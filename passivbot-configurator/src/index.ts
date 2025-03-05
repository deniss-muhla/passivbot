import * as path from "path";
import { PATHS } from "./utils";
import { Config } from "./config";
import { writeJSON } from "fs-extra";

const version = "2.1.1";
const configPath = path.resolve(PATHS.CONFIGS, "bybit");
const configSymbols = ["PEPE", "HYPE", "USUAL"]; //WIF PEPE HYPE PNUT USUAL HBAR
const dateRange = 30;
const nPositionsMin = 2.5;
const nPositionsMax = 3.4;
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, "templates/bybit.json");

(async () => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(nPositionsMin, nPositionsMax);
    config.setDateRange(dateRange);
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
        },
        { spaces: 4 }
    );
})();
