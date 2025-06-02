def optimizer_overrides(overrides_list, config, pside):
    if not overrides_list:
        # No overrides to apply
        return config

    for override in overrides_list:
        if override == "lossless_close_trailing":

            # Logic for lossless close
            config["bot"][pside]["close_trailing_threshold_pct"] = max(
                config["bot"][pside]["close_trailing_threshold_pct"],
                config["bot"][pside]["close_trailing_retracement_pct"],
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
