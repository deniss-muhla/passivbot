import * as path from "path";
import { loadConfig, createConfigFolder, createNewConfig, saveConfig, optimizeConfig } from "./utils";

const templateConfigPath = path.resolve(__dirname, "../config/template.json");
const templateConfig = loadConfig(templateConfigPath);

const configName = "bybit";
const configSymbols = ["FARTCOIN", "HYPE", "OP"];

(async () => {
    // 1. Create config folder
    const newConfigFolder = createConfigFolder(configName);

    // 2 & 3. Duplicate from template, place symbols
    const newConfig = createNewConfig(templateConfig, configSymbols);

    // 4. Save new config
    const configPath = saveConfig(newConfigFolder, newConfig);

    // 5. Optimize config
    const { long, short } = await optimizeConfig(configPath);
    console.log("Optimized long:", long);
    console.log("Optimized short:", short);
})();
