import * as path from "path";
import * as fs from "fs";
import {
    applyOptimizationGlobalBounds,
    backtestConfig,
    fixJSON,
    loadConfig,
    moveFile,
    optimizeConfig,
    saveConfig,
} from "./utils";
import { ConfigFile } from "./types";
import { moveSync } from "fs-extra";

export class Config {
    public get configFilePath(): string {
        return path.join(this.configPath, `${this.configName}.json`);
    }

    private constructor(public configName: string, public configPath: string, public configFile: ConfigFile) {}

    static createFromTemplateConfigFile(
        configName: string,
        configPath: string,
        templateConfigFilePath: string
    ): Config {
        const templateConfigFile = loadConfig(templateConfigFilePath);
        return new Config(configName, configPath, templateConfigFile);
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

    public setOptimizationBoundsNPositions(nPositions: number): void {
        if (this.configFile.optimize) {
            this.configFile.optimize.bounds.long_n_positions = [nPositions, nPositions];
            this.configFile.optimize.bounds.short_n_positions = [nPositions, nPositions];
        }
    }

    public async optimize(): Promise<void> {
        const { optimizationResultsFilePath, optimizationAnalysisFilePath, optimizedConfigFilePath } =
            await optimizeConfig(this.configFilePath);
        // Move result files to the config folder

        moveSync(
            optimizationResultsFilePath,
            path.join(this.configPath, "optimization", this.configName, "results.txt"),
            { overwrite: true }
        );
        moveSync(
            optimizationAnalysisFilePath,
            path.join(this.configPath, "optimization", this.configName, "results_analysis.txt"),
            { overwrite: true }
        );
        moveSync(optimizedConfigFilePath, path.join(this.configPath, "optimization", this.configName, "config.json"), {
            overwrite: true,
        });
    }

    public applyOptimizedConfig(): void {
        // Load optimized config
        const optimizedConfigFilePath = path.join(this.configPath, "optimization", this.configName, "config.json");
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
        const backtestDirPath = await backtestConfig(this.configFilePath);
        moveSync(backtestDirPath, path.join(this.configPath, "backtest", this.configName), { overwrite: true });
    }
}
