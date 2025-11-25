import "dotenv/config";

import config from "../../config.json" with { type: "json" };

export const MASTER_PASSWORD = process.env.MASTER_PASSWORD;
export const STEAM_USERNAME = process.env.STEAM_USERNAME;
export const STEAM_PASSWORD = process.env.STEAM_PASSWORD;
export const STEAM_SHARED_SECRET = process.env.STEAM_SHARED_SECRET;
export const INVENTORY_LIST = config.inventory_list
export const INVENTORY_DELAY = config.inventory_delay
export const MARKET_HISTORY_DELAY = config.market_history_delay
export const DEFAULT_REPORTS_FOLDER = config.default_reports_folder
export const EXCEL_STYLE = config.excel_style
