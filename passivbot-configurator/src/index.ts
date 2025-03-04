import * as path from "path";
import { PATHS } from "./utils";
import { Config } from "./config";

const configPath = path.resolve(PATHS.CONFIGS, "bybit");
const configSymbols = ["FARTCOIN", "HYPE", "OP"];
const templateConfigFilePath = path.resolve(PATHS.CONFIGS, "templates/bybit.json");

(async () => {
    const config = Config.createFromTemplateConfigFile("config", configPath, templateConfigFilePath);
    config.setSymbols(configSymbols);
    config.setOptimizationBoundsNPositions(configSymbols.length);
    config.setDateRange(30);
    config.save();
    await config.optimize();
    config.applyOptimizedConfig();
    config.save();
    await config.backtest();

    for (const symbol of configSymbols) {
        const symbolConfig = Config.createFromTemplateConfigFile(symbol, configPath, templateConfigFilePath);
        symbolConfig.setSymbols([symbol]);
        symbolConfig.setDateRange(30);
        symbolConfig.setOptimizationGlobalBounds(config.configFile);
        symbolConfig.setOptimizationBoundsNPositions(configSymbols.length);
        symbolConfig.save();
        await symbolConfig.optimize();
        symbolConfig.applyOptimizedConfig();
        symbolConfig.save();
        await symbolConfig.backtest();
        config.linkSymbolConfig(symbol);
        config.save();
    }
})();
