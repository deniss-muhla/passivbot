import * as path from "path";
import * as fs from "fs";
import {
    analyzeOptimizationResults,
    applyOptimizationGlobalBounds,
    backtestConfig,
    fixJSON,
    loadConfig,
    moveFile,
    optimizeConfig,
    saveConfig,
} from "./utils";
import { ConfigFile } from "./types";
import { copySync, ensureFileSync, moveSync, rmSync } from "fs-extra";

export class Config {
    public get configFilePath(): string {
        return path.join(this.configPath, `${this.configName}.json`);
    }

    private constructor(
        public configName: string,
        public configPath: string,
        public configFile: ConfigFile,
        public startingConfigPath?: string
    ) {}

    static createFromTemplateConfigFile(
        configName: string,
        configPath: string,
        templateConfigFilePath: string,
        startingConfigPath: string | undefined
    ): Config {
        const templateConfigFile = loadConfig(templateConfigFilePath);
        return new Config(configName, configPath, templateConfigFile, startingConfigPath);
    }

    static load(configName: string, configPath: string): Config {
        const configFile = loadConfig(path.join(configPath, `${configName}.json`));
        return new Config(configName, configPath, configFile);
    }

    public load(): void {
        this.configFile = loadConfig(this.configFilePath);
    }

    public save(): void {
        saveConfig(this.configFilePath, this.configFile);
    }

    public setSymbols(symbols: string[]): void {
        if (this.configFile.live) {
            this.configFile.live.approved_coins = symbols;
        }
    }

    public linkSymbolConfig(symbol: string): void {
        if (this.configFile.live) {
            this.configFile.live.coin_flags[symbol] = `-lm n -sm n -lc ${symbol}.json`;
        }
    }

    public setDateRange(days: number, startDate?: string): void {
        if (this.configFile.backtest) {
            this.configFile.backtest.end_date = startDate || new Date().toISOString().split("T")[0];
            this.configFile.backtest.start_date = new Date(
                new Date(this.configFile.backtest.end_date).getTime() - days * 24 * 60 * 60 * 1000
            )
                .toISOString()
                .split("T")[0];
        }
    }

    public setOptimizationGlobalBounds(configFile: ConfigFile): void {
        applyOptimizationGlobalBounds(configFile, this.configFile);
    }

    public setOptimizationBoundsNPositions(nPositionsMin: number, nPositionsMax?: number): void {
        if (this.configFile.optimize) {
            this.configFile.optimize.bounds.long_n_positions = [nPositionsMin, nPositionsMax || nPositionsMin];
            this.configFile.optimize.bounds.short_n_positions = [nPositionsMin, nPositionsMax || nPositionsMin];
        }
    }

    public disableOptimizationLong(): void {
        if (this.configFile.optimize) {
            this.configFile.optimize.bounds.long_n_positions = [0, 0];
            this.configFile.optimize.bounds.long_total_wallet_exposure_limit = [0, 0];
        }
    }

    public disableOptimizationShort(): void {
        if (this.configFile.optimize) {
            this.configFile.optimize.bounds.short_n_positions = [0, 0];
            this.configFile.optimize.bounds.short_total_wallet_exposure_limit = [0, 0];
        }
    }

    public async optimize(): Promise<void> {
        ensureFileSync(path.join(this.configPath, "optimization", this.configName, "optimization_log.txt"));
        const optimizationResultsDirPath = await optimizeConfig(
            this.configFilePath,
            this.startingConfigPath,
            path.join(this.configPath, "optimization", this.configName, "optimization_log.txt")
        );
        copySync(optimizationResultsDirPath, path.join(this.configPath, "optimization", this.configName), {
            overwrite: true,
        });
        fs.rmdirSync(optimizationResultsDirPath, { recursive: true });
    }

    public async analyzeOptimizationResults(): Promise<void> {
        ensureFileSync(path.join(this.configPath, "optimization", this.configName, "analyzation_log.txt"));
        const idealConfigFilePath = await analyzeOptimizationResults(
            path.join(this.configPath, "optimization", this.configName, "pareto"),
            path.join(this.configPath, "optimization", this.configName, "analyzation_log.txt")
        );
        if (idealConfigFilePath) {
            copySync(
                idealConfigFilePath,
                path.join(this.configPath, "optimization", this.configName, "ideal_config.json"),
                {
                    overwrite: true,
                }
            );
        }
    }

    public copyOptimizedConfig(): void {
        const optimizedConfigFilePath = path.join(
            this.configPath,
            "optimization",
            this.configName,
            "ideal_config.json"
        );
        copySync(optimizedConfigFilePath, this.configFilePath, {
            overwrite: true,
        });
        this.load();
    }

    public applyOptimizedConfig(): void {
        // Load optimized config
        const optimizedConfigFilePath = path.join(
            this.configPath,
            "optimization",
            this.configName,
            "ideal_config.json"
        );
        const optimizedConfig = loadConfig(optimizedConfigFilePath);
        // Apply optimized config
        if (optimizedConfig.bot) {
            this.configFile = {
                ...this.configFile,
                bot: {
                    ...this.configFile.bot,
                    long: optimizedConfig.bot.long,
                    short: optimizedConfig.bot.short,
                },
            };
        }
    }

    public async backtest(): Promise<void> {
        ensureFileSync(path.join(this.configPath, "backtest", this.configName, "backtest_log.txt"));
        const backtestDirPath = await backtestConfig(
            this.configFilePath,
            path.join(this.configPath, "backtest", this.configName, "backtest_log.txt")
        );
        const currentDate = new Date().toISOString().replace("T", "_").split(".")[0].replace(/:/g, "-");
        copySync(backtestDirPath, path.join(this.configPath, "backtest", this.configName, currentDate), {
            overwrite: true,
        });
        fs.rmdirSync(backtestDirPath, { recursive: true });
    }
}
