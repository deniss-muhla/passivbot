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
        //BACKTEST: path.resolve(rootPath, "backtests/bybit"),
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

export function optimizeConfig(configFilePath: string, logFilePath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", ["src/optimize.py", configFilePath], {
            cwd: PATHS.ROOT,
        });

        pythonProcess.stdout.on("data", (data) => {
            if (logFilePath) {
                fs.appendFileSync(logFilePath, data.toString());
            } else {
                console.log(data.toString());
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            if (logFilePath) {
                fs.appendFileSync(logFilePath, data.toString());
            } else {
                console.error(data.toString());
            }
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(`Optimization process exited with code: ${code}`));
            }
            try {
                resolve(getLastDirPath(PATHS.OPTIMIZE_RESULTS, (f) => !!f));
            } catch (err) {
                reject(err);
            }
        });
    });
}

export function analyzeOptimizationResults(
    optimizationResultsDirPath: string,
    logFilePath?: string
): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", ["src/pareto_store.py", optimizationResultsDirPath], {
            cwd: PATHS.ROOT,
        });

        pythonProcess.stdout.on("data", (data) => {
            if (logFilePath) {
                fs.appendFileSync(logFilePath, data.toString());
            } else {
                console.log(data.toString());
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            if (logFilePath) {
                fs.appendFileSync(logFilePath, data.toString());
            } else {
                console.error(data.toString());
            }
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                return reject(new Error(`Optimization process exited with code: ${code}`));
            }
            try {
                resolve(extractIdealConfigPath(logFilePath));
            } catch (err) {
                reject(err);
            }
        });
    });
}

export function backtestConfig(configFilePath: string, logFilePath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python", ["src/backtest.py", configFilePath, "--disable_plotting"], {
            cwd: PATHS.ROOT,
        });

        pythonProcess.stdout.on("data", (data) => {
            if (logFilePath) {
                fs.appendFileSync(logFilePath, data.toString());
            } else {
                console.log(data.toString());
            }
        });

        pythonProcess.stderr.on("data", (data) => {
            if (logFilePath) {
                fs.appendFileSync(logFilePath, data.toString());
            } else {
                console.error(data.toString());
            }
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

export function extractIdealConfigPath(analysisLogFilePath: string | undefined): string | undefined {
    if (!analysisLogFilePath || !fs.existsSync(analysisLogFilePath)) {
        console.error("Analysis log file not found: ", analysisLogFilePath);
        return undefined;
    }
    const logContent = fs.readFileSync(analysisLogFilePath, "utf-8");
    const lines = logContent.split("\n");
    for (const line of lines) {
        if (line.startsWith("Closest to ideal:")) {
            return line.split(": ", 2)[1].split(" | ", 1)[0];
        }
    }
    return undefined;
}

export function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600)
        .toString()
        .padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
}
