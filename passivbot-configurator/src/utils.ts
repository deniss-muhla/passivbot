import * as path from "path";
import * as fs from "fs";
import { Config } from "./types";
import { spawn } from "child_process";

export function loadConfig(filePath: string): Config {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as Config;
}

export function createConfigFolder(configName: string): string {
    const folderPath = path.resolve(__dirname, "../config", configName);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
    return folderPath;
}

export function createNewConfig(templateConfig: Config, configSymbols: string[]): Config {
    return {
        ...templateConfig,
        live: {
            ...templateConfig.live,
            approved_coins: configSymbols,
        },
    };
}

export function saveConfig(folderPath: string, newConfig: Config): string {
    const configPath = path.join(folderPath, "config.json");
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    console.log("New config created at:", configPath);
    return configPath;
}

export function optimizeConfig(configPath: string): Promise<Config["bot"]> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", ["src/optimize.py", configPath], {
            cwd: path.resolve(__dirname, "../../"),
        });

        pythonProcess.stdout.on("data", (data) => {
            console.log(data.toString());
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(data.toString());
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(`Optimization process exited with code: ${code}`));
            }
            try {
                const analysisDir = path.resolve(__dirname, "../optimize_results_analysis");
                const files = fs.readdirSync(analysisDir).filter((f) => f.endsWith(".json"));
                if (files.length === 0) {
                    return reject(new Error("No JSON found in optimize_results_analysis"));
                }
                // Sort files by modified time descending
                files.sort(
                    (a, b) =>
                        fs.statSync(path.join(analysisDir, b)).mtimeMs - fs.statSync(path.join(analysisDir, a)).mtimeMs
                );
                const lastFilePath = path.join(analysisDir, files[0]);
                let content = fs.readFileSync(lastFilePath, "utf-8");
                // Fix :inf occurrences
                content = content.replace(/:inf/g, ':"inf"');
                const parsed = JSON.parse(content);
                resolve(parsed.bot);
            } catch (err) {
                reject(err);
            }
        });
    });
}
