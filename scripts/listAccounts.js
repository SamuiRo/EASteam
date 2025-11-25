import { sequelize } from "../src/module/teapot/sqlite/sqlite_db.js";
import { Account } from "../src/module/teapot/models/index.js";
import { encryptionService } from "../src/service/encryption.js";
import { print, banner } from "../src/shared/utils.js";
import { MASTER_PASSWORD } from "../src/config/app.config.js";
import chalk from "chalk";

async function listAccounts() {
    try {
        banner("STEAM ACCOUNTS DATABASE", "View all registered accounts");

        // Initialize system
        await sequelize.authenticate();
        // await sequelize.sync({ alter: true });
        await sequelize.sync();

        if (!MASTER_PASSWORD) {
            print("MASTER_PASSWORD not found in .env file", "error");
            process.exit(1);
        }

        await encryptionService.initialize(MASTER_PASSWORD);

        // Get all accounts
        const accounts = await Account.findAll({
            order: [['lastLogin', 'DESC NULLS LAST'], ['createdAt', 'DESC']]
        });

        if (accounts.length === 0) {
            print("No accounts found in database", "warning");
            print("Run 'npm run account:add' to add accounts", "info");
            process.exit(0);
        }

        print(`Total accounts in database: ${accounts.length}`, "data");
        print("", "system");

        // Table header
        const gray = chalk.hex("#808080");
        const white = chalk.hex("#F4F4F4");
        const green = chalk.hex("#8FA98F");
        const red = chalk.hex("#A62626");

        console.log(gray('┌─────┬─────────────────────────┬──────────────────────┬─────────────────────┬────────┐'));
        console.log(gray('│') + white(' No. ') + gray('│') + white(' Username                ') + gray('│') + white(' Steam ID             ') + gray('│') + white(' Last Login          ') + gray('│') + white(' Status ') + gray('│'));
        console.log(gray('├─────┼─────────────────────────┼──────────────────────┼─────────────────────┼────────┤'));

        accounts.forEach((acc, i) => {
            const num = String(i + 1).padEnd(3);
            const username = (acc.username || 'N/A').padEnd(23).substring(0, 23);
            const steamId = (acc.steamId || 'Not logged in').padEnd(20).substring(0, 20);
            const lastLogin = acc.lastLogin
                ? new Date(acc.lastLogin).toLocaleString().padEnd(19).substring(0, 19)
                : 'Never'.padEnd(19);
            const statusSymbol = acc.isActive ? green('+ ') : red('- ');

            console.log(gray('│') + white(` ${num} `) + gray('│') + white(` ${username} `) + gray('│') + white(` ${steamId} `) + gray('│') + white(` ${lastLogin} `) + gray('│') + ` ${statusSymbol}     ` + gray('│'));
        });

        console.log(gray('└─────┴─────────────────────────┴──────────────────────┴─────────────────────┴────────┘'));

        // Show detailed info if requested
        const showDetails = process.argv[2] === '--details' || process.argv[2] === '-d';

        if (showDetails) {
            print("", "system");
            print("=== DETAILED INFORMATION ===", "data");

            for (const acc of accounts) {
                print("", "system");
                print(`Account: ${acc.username}`, "info");
                print(`  Steam ID: ${acc.steamId || 'Not set'}`, "system");
                print(`  Active: ${acc.isActive ? 'Yes' : 'No'}`, "system");
                print(`  Has 2FA: ${acc.encryptedSharedSecret ? 'Yes' : 'No'}`, "system");
                print(`  Has Refresh Token: ${acc.encryptedRefreshToken ? 'Yes' : 'No'}`, "system");
                print(`  Cookies Expiry: ${acc.cookiesExpiry ? new Date(acc.cookiesExpiry).toLocaleString() : 'N/A'}`, "system");
                print(`  Last Login: ${acc.lastLogin ? new Date(acc.lastLogin).toLocaleString() : 'Never'}`, "system");
                print(`  Created: ${new Date(acc.createdAt).toLocaleString()}`, "system");
            }
        } else {
            print("", "system");
            print("Tip: Use --details or -d flag to see detailed information", "info");
        }

        process.exit(0);
    } catch (error) {
        print(`Error: ${error.message}`, "error");
        console.error(error.stack);
        process.exit(1);
    }
}

listAccounts();