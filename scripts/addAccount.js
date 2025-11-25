import readline from 'readline';
import { sequelize } from "../src/module/teapot/sqlite/sqlite_db.js";
import { Account } from "../src/module/teapot/models/index.js";
import { encryptionService } from "../src/service/encryption.js";
import { print, banner } from "../src/shared/utils.js";
import { MASTER_PASSWORD } from "../src/config/app.config.js";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

async function addAccount() {
    try {
        banner("ADD STEAM ACCOUNT", "Securely add new account to database");

        // Initialize system
        await sequelize.authenticate();
        await sequelize.sync({ alter: true });
        
        if (!MASTER_PASSWORD) {
            print("MASTER_PASSWORD not found in .env file", "error");
            process.exit(1);
        }
        
        await encryptionService.initialize(MASTER_PASSWORD);
        print("System initialized", "success");

        // Get account details
        print("\nEnter account credentials:", "data");
        const username = await question('  Steam Username: ');
        if (!username) {
            print("Username is required", "error");
            process.exit(1);
        }

        // Check if account exists
        const existingAccount = await Account.findOne({ where: { username } });
        if (existingAccount) {
            print(`Account '${username}' already exists in database`, "warning");
            const overwrite = await question('  Overwrite existing account? (yes/no): ');
            if (overwrite.toLowerCase() !== 'yes') {
                print("Operation cancelled", "warning");
                process.exit(0);
            }
        }

        const password = await question('  Steam Password: ');
        if (!password) {
            print("Password is required", "error");
            process.exit(1);
        }

        const sharedSecret = await question('  Steam Shared Secret (optional, press Enter to skip): ');

        // Save account
        if (existingAccount) {
            existingAccount.encryptedPassword = encryptionService.encrypt(password);
            existingAccount.encryptedSharedSecret = sharedSecret 
                ? encryptionService.encrypt(sharedSecret)
                : null;
            existingAccount.isActive = true;
            await existingAccount.save();
            print(`Account '${username}' updated successfully`, "success");
        } else {
            await Account.create({
                username,
                encryptedPassword: encryptionService.encrypt(password),
                encryptedSharedSecret: sharedSecret ? encryptionService.encrypt(sharedSecret) : null,
                isActive: true
            });
            print(`Account '${username}' added successfully`, "success");
        }

        const addMore = await question('\n  Add another account? (yes/no): ');
        if (addMore.toLowerCase() === 'yes') {
            print("", "system");
            await addAccount();
        } else {
            print("All accounts saved to database", "success");
            process.exit(0);
        }
    } catch (error) {
        print(`Error: ${error.message}`, "error");
        console.error(error.stack);
        process.exit(1);
    }
}

addAccount();