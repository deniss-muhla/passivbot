import * as path from "path";
import * as fs from "fs";

import { ConfigFile, ConfigFileOptimizationResult } from "./types";
import { spawn } from "child_process";

export const PATHS = ((rootPath: string) =>
    ({
        ROOT: rootPath,
        CONFIGS: path.resolve(rootPath, "configs"),
        OPTIMIZE_RESULTS: path.resolve(rootPath, "optimize_results"),
        OPTIMIZE_RESULTS_ANALYSIS: path.resolve(rootPath, "optimize_results_analysis"),
        BACKTEST: path.resolve(rootPath, "backtests/combined"),
    } as const))(path.resolve(__dirname, "../../"));

export function getLastFilePath(basePath: string, filter: (f: string) => boolean): string {
    const files = fs.readdirSync(basePath).filter(filter);
    if (files.length === 0) {
        throw new Error("No files found in " + basePath);
    }
    // Sort files by modified time descending
    files.sort((a, b) => fs.statSync(path.join(basePath, b)).mtimeMs - fs.statSync(path.join(basePath, a)).mtimeMs);
    return path.join(basePath, files[0]);
}

export function getLastDirPath(basePath: string, filter: (f: string) => boolean): string {
    const dirs = fs
        .readdirSync(basePath)
        .filter((f) => fs.lstatSync(path.join(basePath, f)).isDirectory() && filter(f));
    if (dirs.length === 0) {
        throw new Error("No directories found in " + basePath);
    }
    // Sort dirs by modified time descending
    dirs.sort((a, b) => fs.statSync(path.join(basePath, b)).mtimeMs - fs.statSync(path.join(basePath, a)).mtimeMs);
    return path.join(basePath, dirs[0]);
}

export function fixJSON(content: string): string {
    // Fix ': inf,' occurrences
    content = content.replace(/: inf,/g, ': "inf",');
    return content;
}

export function loadConfig(configFilePath: string): ConfigFile {
    console.info("Loading config from: ", configFilePath);
    const data = fs.readFileSync(configFilePath, "utf-8");
    return JSON.parse(fixJSON(data)) as ConfigFile;
}

export function createConfigFolder(configName: string): string {
    const folderPath = path.resolve(PATHS.CONFIGS, configName);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
    return folderPath;
}

// export function createConfigFromTemplate(templateConfig: ConfigFile, configSymbols: string[]): ConfigFile {
//     return {
//         ...templateConfig,
//         live: {
//             ...templateConfig.live,
//             approved_coins: configSymbols,
//         },
//     };
// }

export function saveConfig(configFilePath: string, newConfig: ConfigFile): void {
    const dirPath = path.dirname(configFilePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2));
    console.log("Saving config to: ", configFilePath);
}

export function moveFile(srcFilePath: string, destFilePath: string): void {
    const dirPath = path.dirname(destFilePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.copyFileSync(srcFilePath, destFilePath);
    fs.rmSync(srcFilePath);
}

export function moveDir(srcDirPath: string, destDirPath: string): void {
    if (!fs.existsSync(destDirPath)) {
        fs.mkdirSync(destDirPath, { recursive: true });
    }
}

export function optimizeConfig(configFilePath: string): Promise<ConfigFileOptimizationResult> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", ["src/optimize.py", configFilePath], {
            cwd: PATHS.ROOT,
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
                const optimizationResultsFilePath = getLastFilePath(PATHS.OPTIMIZE_RESULTS, (f) => f.endsWith(".txt"));
                const optimizationAnalysisFilePath = getLastFilePath(PATHS.OPTIMIZE_RESULTS_ANALYSIS, (f) =>
                    f.endsWith(".txt")
                );
                const optimizedConfigFilePath = getLastFilePath(PATHS.OPTIMIZE_RESULTS_ANALYSIS, (f) =>
                    f.endsWith(".json")
                );
                resolve({
                    optimizationResultsFilePath,
                    optimizationAnalysisFilePath,
                    optimizedConfigFilePath,
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}

export function backtestConfig(configFilePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", ["src/backtest.py", configFilePath, "--disable_plotting"], {
            cwd: PATHS.ROOT,
        });

        pythonProcess.stdout.on("data", (data) => {
            console.log(data.toString());
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(data.toString());
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(`Backtest process exited with code: ${code}`));
            }
            resolve(getLastDirPath(PATHS.BACKTEST, (f) => !!f));
        });
    });
}

export function getMinMax(
    value: number,
    options?: {
        offsetPercentage: number;
        min: number;
        max: number;
    }
): [number, number] {
    return !options
        ? [value, value]
        : [
              Math.max(options.min, value * (1 - options.offsetPercentage)),
              Math.min(options.max, value * (1 + options.offsetPercentage)),
          ];
}

export function applyOptimizationGlobalBounds(srcConfigFile: ConfigFile, destConfigFile: ConfigFile): void {
    if (srcConfigFile.bot && destConfigFile.optimize) {
        ["long", "short"].forEach((side) => {
            [
                "filter_relative_volume_clip_pct",
                "filter_rolling_window",
                "total_wallet_exposure_limit",
                "unstuck_close_pct",
                "unstuck_loss_allowance_pct",
                "n_positions",
            ].forEach((key) => {
                if (destConfigFile.optimize && destConfigFile.optimize.bounds) {
                    if (srcConfigFile.bot && (side === "long" || side === "short")) {
                        (destConfigFile.optimize.bounds as any)[`${side}_${key}`] = getMinMax(
                            (srcConfigFile.bot as any)[side][key]
                        );
                    }
                }
            });
        });
    }
}
