import fs from 'fs/promises';
import { sequelize } from "../src/module/teapot/sqlite/sqlite_db.js";
import { Account } from "../src/module/teapot/models/index.js";
import { encryptionService } from "../src/service/encryption.js";
import { print, banner } from "../src/shared/utils.js";
import { MASTER_PASSWORD } from "../src/config/app.config.js";

/**
 * Bulk import accounts from JSON file
 * 
 * File format: accounts.json
 * [
 *   {
 *     "username": "account1",
 *     "password": "password1",
 *     "sharedSecret": "SECRET123" // optional
 *   },
 *   {
 *     "username": "account2",
 *     "password": "password2"
 *   }
 * ]
 */

async function bulkImport() {
    try {
        banner("BULK IMPORT ACCOUNTS", "Import multiple Steam accounts from JSON file");

        // Initialize system
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        
        if (!MASTER_PASSWORD) {
            print("MASTER_PASSWORD not found in .env file", "error");
            process.exit(1);
        }
        
        await encryptionService.initialize(MASTER_PASSWORD);
        print("System initialized", "success");

        // Read accounts file
        const filePath = process.argv[2] || './accounts.json';
        print(`Reading accounts from: ${filePath}`, "system");

        let fileContent;
        try {
            fileContent = await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            print(`Failed to read file: ${error.message}`, "error");
            print("Usage: node scripts/bulkImportAccounts.js [path/to/accounts.json]", "info");
            print("\nExample accounts.json format:", "data");
            
            // Using console.log for JSON example to preserve formatting
            console.log(`[
  {
    "username": "account1",
    "password": "password1",
    "sharedSecret": "SECRET123"
  },
  {
    "username": "account2",
    "password": "password2"
  }
]`);
            process.exit(1);
        }

        // Parse JSON
        let accounts;
        try {
            accounts = JSON.parse(fileContent);
        } catch (error) {
            print(`Invalid JSON format: ${error.message}`, "error");
            process.exit(1);
        }

        if (!Array.isArray(accounts)) {
            print("Accounts file must contain an array of accounts", "error");
            process.exit(1);
        }

        print(`Found ${accounts.length} accounts to import`, "data");

        // Import accounts
        let imported = 0;
        let updated = 0;
        let errors = 0;

        for (const acc of accounts) {
            try {
                if (!acc.username || !acc.password) {
                    print(`Skipping invalid account (missing username or password)`, "warning");
                    errors++;
                    continue;
                }

                const existingAccount = await Account.findOne({ where: { username: acc.username } });

                if (existingAccount) {
                    existingAccount.encryptedPassword = encryptionService.encrypt(acc.password);
                    existingAccount.encryptedSharedSecret = acc.sharedSecret 
                        ? encryptionService.encrypt(acc.sharedSecret)
                        : null;
                    existingAccount.isActive = true;
                    await existingAccount.save();
                    print(`Updated: ${acc.username}`, "success");
                    updated++;
                } else {
                    await Account.create({
                        username: acc.username,
                        encryptedPassword: encryptionService.encrypt(acc.password),
                        encryptedSharedSecret: acc.sharedSecret 
                            ? encryptionService.encrypt(acc.sharedSecret)
                            : null,
                        isActive: true
                    });
                    print(`Added: ${acc.username}`, "success");
                    imported++;
                }
            } catch (error) {
                print(`Error processing ${acc.username}: ${error.message}`, "error");
                errors++;
            }
        }

        print("", "system");
        print("=== IMPORT SUMMARY ===", "data");
        print(`Total accounts processed: ${accounts.length}`, "info");
        print(`New accounts added: ${imported}`, "success");
        print(`Accounts updated: ${updated}`, "info");
        print(`Errors: ${errors}`, errors > 0 ? "error" : "info");

        if (errors > 0) {
            print("Some accounts failed to import", "warning");
        } else {
            print("All accounts imported successfully!", "success");
        }

        process.exit(0);
    } catch (error) {
        print(`Fatal error: ${error.message}`, "error");
        console.error(error.stack);
        process.exit(1);
    }
}

bulkImport();