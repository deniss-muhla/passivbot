from config_utils import require_config_value


def optimizer_overrides(overrides_list, config, pside):
    if not overrides_list:
        # No overrides to apply
        return config

    for override in overrides_list:
        if override == "lossless_close_trailing":

            # Logic for lossless close
            threshold = require_config_value(config, f"bot.{pside}.close_trailing_threshold_pct")
            retracement = require_config_value(config, f"bot.{pside}.close_trailing_retracement_pct")
            config["bot"][pside]["close_trailing_threshold_pct"] = max(threshold, retracement)

        elif override == "forward_tp_grid":
            close_grid_markup_start = require_config_value(
                config, f"bot.{pside}.close_grid_markup_start"
            )
            close_grid_markup_end = require_config_value(config, f"bot.{pside}.close_grid_markup_end")

            config["bot"][pside]["close_grid_markup_start"] = min(
                close_grid_markup_start, close_grid_markup_end
            )
            config["bot"][pside]["close_grid_markup_end"] = max(
                close_grid_markup_start, close_grid_markup_end
            )

        elif override == "backward_tp_grid":
            close_grid_markup_start = require_config_value(
                config, f"bot.{pside}.close_grid_markup_start"
            )
            close_grid_markup_end = require_config_value(config, f"bot.{pside}.close_grid_markup_end")

            config["bot"][pside]["close_grid_markup_start"] = max(
                close_grid_markup_start, close_grid_markup_end
            )
            config["bot"][pside]["close_grid_markup_end"] = min(
                close_grid_markup_start, close_grid_markup_end
            )

        elif override == "loss_close_trailing":

            # Logic for loss close
            config["bot"][pside]["close_trailing_threshold_pct"] = min(
                config["bot"][pside]["close_trailing_threshold_pct"],
                config["bot"][pside]["close_trailing_retracement_pct"],
            )

        elif override == "lossless_entry_trailing":

            # Logic for lossless entry
            config["bot"][pside]["entry_trailing_threshold_pct"] = max(
                config["bot"][pside]["entry_trailing_threshold_pct"],
                config["bot"][pside]["entry_trailing_retracement_pct"],
            )


        elif override == "example":
            # Logic for override 'example'
            pass

        else:
            print(f"Unknown override: {override}")
            return config

    return config
