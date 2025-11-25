import { print, banner } from "./src/shared/utils.js";
import { sequelize } from "./src/module/teapot/sqlite/sqlite_db.js";
import { Account } from "./src/module/teapot/models/index.js";
import { encryptionService } from "./src/service/encryption.js";
import { SteamAccountManager } from "./src/service/SteamService.js";
import { ExcelHandler } from "./src/module/excel/Excel.js"
import readline from 'readline';
import chalk from 'chalk';

import { MASTER_PASSWORD, INVENTORY_LIST, DEFAULT_REPORTS_FOLDER, EXCEL_STYLE } from "./src/config/app.config.js"
import { WELCOM_MESSAGE, SUB_TITLE } from "./src/shared/message.js"

const steamManager = new SteamAccountManager();
const excel = new ExcelHandler();

// ============= CLI ARGUMENTS =============
const targetUsername = process.argv[2]; // node index.js username

// ============= HELPER FUNCTIONS =============
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// ============= MAIN =============
async function main() {
    try {
        banner(WELCOM_MESSAGE, SUB_TITLE)

        // System initialization
        if (!await initializeSystem()) {
            return;
        }

        // Select account
        const accountData = await selectAccount(targetUsername);
        if (!accountData) {
            print("No account selected", "error");
            return;
        }

        // Connecting to Steam
        const client = await handleSteamLogin(accountData);
        if (!client?.isConnected()) {
            print("Failed to connect to Steam", "error");
            return;
        }

        // Data retrieval and report generation
        const reportData = await fetchSteamData(client);
        if (reportData) {
            await generateExcelReport(reportData);
        }
    } catch (error) {
        print(`Main error: ${error.message}`, "error");
        console.error(error.stack);
    }
}

// ============= ACCOUNT SELECTION =============
async function selectAccount(username) {
    try {
        const accounts = await Account.findAll({ 
            where: { isActive: true },
            attributes: ['username', 'steamId', 'lastLogin']
        });

        if (accounts.length === 0) {
            print("No accounts found in database", "error");
            print("Please run 'npm run account:add' to add accounts", "info");
            return null;
        }

        // If username provided via CLI
        if (username) {
            const account = accounts.find(acc => acc.username === username);
            if (!account) {
                print(`Account '${username}' not found`, "error");
                print(`Available accounts: ${accounts.map(a => a.username).join(', ')}`, "info");
                return null;
            }
            
            print(`Selected account: ${username}`, "success");
            return await loadAccountCredentials(account);
        }

        // Interactive selection
        print(`Available accounts: ${accounts.length}`, "data");
        print("", "system");

        const gray = chalk.hex("#808080");
        const white = chalk.hex("#F4F4F4");
        
        accounts.forEach((acc, i) => {
            const lastLogin = acc.lastLogin ? new Date(acc.lastLogin).toLocaleString() : 'Never';
            console.log(gray(`  ${i + 1}.`) + white(` ${acc.username}`) + gray(` (Last login: ${lastLogin})`));
        });

        const answer = await askQuestion(chalk.hex("#A7D6D6")('\nSelect account number: '));
        
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < accounts.length) {
            const selected = accounts[index];
            print(`Selected account: ${selected.username}`, "success");
            const accountData = await loadAccountCredentials(selected);
            return accountData;
        } else {
            print("Invalid selection", "error");
            return null;
        }
    } catch (error) {
        print(`Error selecting account: ${error.message}`, "error");
        return null;
    }
}

async function loadAccountCredentials(account) {
    try {
        if (!encryptionService.isInitialized()) {
            throw new Error('Encryption service not initialized');
        }

        const fullAccount = await Account.findOne({ where: { username: account.username } });
        
        return {
            username: fullAccount.username,
            password: encryptionService.decrypt(fullAccount.encryptedPassword),
            sharedSecret: fullAccount.encryptedSharedSecret 
                ? encryptionService.decrypt(fullAccount.encryptedSharedSecret)
                : null
        };
    } catch (error) {
        print(`Error loading credentials for ${account.username}: ${error.message}`, "error");
        return null;
    }
}

// ============= SYSTEM INITIALIZATION =============
async function initializeSystem() {
    const dbInit = await initializeDatabase();
    const encryptionInit = await initializeEncryption();

    if (!dbInit || !encryptionInit) {
        print("System initialization failed", "error");
        return false;
    }

    return true;
}

async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        print("Database connection established", "system");

        await sequelize.sync({ alter: true });
        print("Database models synchronized", "system");

        return true;
    } catch (error) {
        print(`Database error: ${error.message}`, "error");
        return false;
    }
}

async function initializeEncryption() {
    try {
        if (!MASTER_PASSWORD) {
            print("MASTER_PASSWORD not found in .env file", "error");
            print("Please add MASTER_PASSWORD=your_secure_password to .env", "warning");
            return false;
        }

        await encryptionService.initialize(MASTER_PASSWORD);
        print("Encryption service initialized", "system");

        return true;
    } catch (error) {
        print(`Encryption error: ${error.message}`, "error");
        return false;
    }
}

// ============= STEAM AUTHENTICATION =============
async function handleSteamLogin(accountData) {
    try {
        if (!accountData || !accountData.username || !accountData.password) {
            print("Invalid account data", "error");
            return null;
        }

        const client = steamManager.createClient(accountData.username);

        print(`Logging in to Steam as ${accountData.username}...`, "system");
        
        // Callback для запиту Steam Guard коду
        const steamGuardCallback = async (callback) => {
            print("Steam Guard code is required", "warning");
            const code = await askQuestion(chalk.hex("#A7D6D6")('Enter Steam Guard code: '));
            callback(code);
        };

        await client.login(
            accountData.username, 
            accountData.password, 
            accountData.sharedSecret,
            accountData.sharedSecret ? null : steamGuardCallback
        );

        print("Successfully connected to Steam", "success");
        print(`Steam ID: ${client.getSteamId()}`, "system");

        return client;
    } catch (error) {
        print(`Steam login error: ${error.message}`, "error");
        console.error(error.stack);
        return null;
    }
}

// ============= GETTING DATA FROM STEAM =============
async function fetchSteamData(client) {
    print("Fetching Steam inventory and market history...", "system");

    const inventory = await fetchInventory(client);
    const marketData = await fetchMarketData(client, inventory);

    if (!inventory && !marketData) {
        print("No data retrieved from Steam", "warning");
        return null;
    }

    return {
        accountId: client.accountId,
        inventory,
        ...marketData
    };
}

async function fetchInventory(client) {
    try {
        const inventory = await client.getFullInventory(INVENTORY_LIST);
        print(`Successfully fetched ${inventory.items.length} items from inventory`, "success");
        return inventory;
    } catch (error) {
        print(`Error fetching inventory: ${error.message}`, "error");
        return null;
    }
}

async function fetchMarketData(client, inventory) {
    try {
        const marketHistory = await client.getFullMarketHistory();
        const processedHistory = client.parseMarketHistory(marketHistory);

        return {
            market_history: marketHistory,
            market_overall_stats: client.calculateTransactionStatistics(processedHistory),
            market_stats: client.calculateROI(processedHistory.transactions),
            matched_inventory_with_purchases: inventory
                ? client.matchInventoryWithPurchases(processedHistory.transactions, inventory.items)
                : null
        };
    } catch (error) {
        print(`Error fetching market history: ${error.message}`, "error");
        console.error(error.stack);
        return {};
    }
}

// ============= GENERATION OF EXCEL REPORT =============
async function generateExcelReport(data) {
    try {
        const date = new Date().toISOString().split('T')[0];
        excel.createNew();

        writeDashboardSheet(data);
        if (data.matched_inventory_with_purchases) {
            writeMatchedSheets(data.matched_inventory_with_purchases);
        }
        if (data.market_stats) {
            writeROISheet(data.market_stats);
        }
        if (data.inventory) {
            writeInventorySheet(data.inventory);
        }

        await excel.save(`./${DEFAULT_REPORTS_FOLDER}/report_${data.accountId}_${date}.xlsx`);
        print(`Excel report saved: report_${data.accountId}_${date}.xlsx`, "success");
    } catch (error) {
        print(`Error generating excel report: ${error.message}`, "error");
        console.error(error.stack);
    }
}

function writeDashboardSheet(data) {
    if (!data.market_overall_stats) return;

    const stats = data.market_overall_stats.overall;
    const dashboardData = [
        ["Total Invested", stats.totalInvested, "", "Total Transactions", stats.totalTransactions],
        ["Total Received", stats.totalReceived, "", "Purchases Count", stats.purchasesCount],
        ["Total Profit", stats.totalProfit, "", "Sales Count", stats.salesCount],
        ["ROI %", stats.roiPercent, "", "Received Sales", stats.receivedSales],
    ];

    excel.writeArrayToSheet("Dashboard", dashboardData, EXCEL_STYLE);
}

function writeMatchedSheets(matchedData) {
    const matched = matchedData.matched.map(item => ({
        appid: item.appid,
        assetid: item.assetid,
        market_hash_name: item.market_hash_name,
        paid_total: item.paid_total,
        currencyid: item.currencyid,
        match_type: item.match_type,
        time_sold: item.time_sold,
        transaction_status: item.transaction_status
    }));

    const unmatched = matchedData.unmatched.map(item => ({
        appid: item.appid,
        assetid: item.assetid,
        market_name: item.market_name,
        paid_total: item.paid_total,
        currencyid: item.currencyid,
        match_type: item.match_type,
        time_sold: item.time_sold,
        transaction_status: item.transaction_status
    }));

    excel.writeObjectsToSheet("Matched", matched, EXCEL_STYLE);
    excel.writeObjectsToSheet("Unmatched", unmatched, EXCEL_STYLE);
}

function writeROISheet(marketStats) {
    const roiData = marketStats.map(item => ({
        appid: item.appid,
        market_name: item.market_name,
        buy_price: item.buy_price,
        sell_price: item.sell_price,
        profit: item.profit,
        roi_percent: item.roi_percent,
        time_purchase: item.time_purchase,
        time_sale: item.time_sale
    }));

    excel.writeObjectsToSheet("ROI", roiData, EXCEL_STYLE);
}

function writeInventorySheet(inventory) {
    const inventoryData = inventory.items.map(item => ({
        assetid: item.assetid,
        appId: item.appId,
        market_hash_name: item.market_hash_name,
        type: item.type,
        tradable: item.tradable,
        marketable: item.marketable,
        commodity: item.commodity
    }));

    excel.writeObjectsToSheet("Inventory", inventoryData, EXCEL_STYLE);
}

// ============= SIGNAL PROCESSORS =============
async function gracefulShutdown(signal) {
    print(`Received ${signal}. Shutting down gracefully...`, "system");

    const activeAccounts = steamManager.getActiveAccounts();
    for (const acc of activeAccounts) {
        steamManager.removeClient(acc.accountId);
    }

    await sequelize.close();
    print("Database connection closed", "system");

    process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on('unhandledRejection', (reason, promise) => {
    print(`Unhandled Rejection at: ${promise}, reason: ${reason}`, "error");
});

process.on('uncaughtException', (error) => {
    print(`Uncaught Exception: ${error.message}`, "error");
    console.error(error.stack);
    process.exit(1);
});

// ============= START =============
main().catch((error) => {
    print(`Fatal error: ${error.message}`, "error");
    console.error(error.stack);
    process.exit(1);
});