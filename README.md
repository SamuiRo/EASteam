# EASteam

A secure Node.js application for managing multiple Steam accounts, analyzing market transactions, and generating comprehensive Excel reports with ROI calculations.

## 🌟 Features

- **Multi-Account Management**: Store and manage multiple Steam accounts with encrypted credentials
- **Automated Login**: Supports Steam Guard (email codes) and TOTP (shared secret)
- **Inventory Tracking**: Fetch complete inventory across multiple games (CS2, Dota 2, TF2, PUBG, etc.)
- **Market History Analysis**: Retrieve full Steam Market transaction history
- **ROI Calculations**: Automatic profit/loss analysis for each item
- **Inventory Matching**: Match current inventory items with purchase history
- **Excel Reports**: Generate detailed reports with Dashboard, ROI, Matched/Unmatched items
- **Secure Encryption**: AES-256 encryption for all sensitive data (passwords, tokens, cookies)
- **Session Persistence**: Automatic session restoration using refresh tokens

## 📋 Prerequisites

- **Node.js**: v18.x or higher (ESM support required)
- **npm**: v9.x or higher

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/SamuiRo/EASteam.git
cd EASteam
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and set your master password:

```env
MASTER_PASSWORD=your_very_secure_master_password_here
```

⚠️ **CRITICAL**: The `MASTER_PASSWORD` is used to encrypt all sensitive data. Store it securely - without it, you cannot decrypt your account credentials!

### 4. Configure Inventory Sources

Edit `config.json` to customize which game inventories to fetch:

```json
{
  "inventory_list": [
    {
      "appId": 730,
      "contextId": 2,
      "tradableOnly": true,
      "title": "Counter Strike 2"
    }
  ],
  "inventory_delay": 3000,
  "market_history_delay": 3000,
  "default_reports_folder": "reports"
}
```

## 📝 Account Management

### Adding Accounts

#### Option 1: Interactive Mode (Single Account)

```bash
npm run account:add
```

You'll be prompted to enter:
- Steam Username
- Steam Password
- Steam Shared Secret (optional - for auto-2FA)

#### Option 2: Bulk Import (Multiple Accounts)

1. Create an `accounts.json` file:

```json
[
  {
    "username": "account1",
    "password": "password1",
    "sharedSecret": "ABC123DEF456"
  },
  {
    "username": "account2",
    "password": "password2"
  }
]
```

2. Import accounts:

```bash
npm run account:import
# Or with custom file path:
node scripts/bulkImportAccounts.js ./path/to/accounts.json
```

### Viewing Accounts

```bash
# List all accounts
npm run account:list

# Detailed account information
npm run account:details
```

## 🎮 Usage

### Running the Application

#### Interactive Account Selection

```bash
npm start
# or
node main.js
```

The application will display all available accounts and prompt you to select one.

#### Direct Account Execution

```bash
node main.js <username>

# Example:
node main.js mysteamaccount
```

### Workflow

1. **System Initialization**: Database connection and encryption service setup
2. **Account Selection**: Choose account interactively or via CLI argument
3. **Steam Authentication**: Automatic login using stored credentials or refresh tokens
4. **Data Collection**: 
   - Fetch inventory from configured games
   - Retrieve complete market transaction history
5. **Analysis**:
   - Calculate ROI for sold items
   - Match inventory items with purchase history
   - Generate transaction statistics
6. **Report Generation**: Create Excel file with multiple sheets

### Steam Guard Handling

- **Shared Secret (TOTP)**: If configured, codes are generated automatically
- **Email Codes**: You'll be prompted to enter the code sent to your email

## 📊 Generated Reports

Reports are saved in the `./reports/` folder with the format: `report_<accountId>_<date>.xlsx`

### Report Structure

#### 1. Dashboard Sheet
- Total Invested
- Total Received
- Total Profit
- ROI %
- Transaction counts (purchases, sales)

#### 2. Matched Sheet
Items currently in inventory with their purchase history:
- App ID
- Asset ID
- Market Hash Name
- Purchase Price
- Currency
- Match Type
- Transaction Status

#### 3. Unmatched Sheet
Items purchased but no longer in inventory (sold or consumed)

#### 4. ROI Sheet
Profit/loss analysis for each item:
- Market Name
- Buy Price
- Sell Price
- Profit
- ROI Percentage
- Purchase/Sale Timestamps

#### 5. Inventory Sheet
Complete current inventory:
- Asset ID
- App ID
- Market Hash Name
- Item Type
- Tradable/Marketable status

## 🔐 Security Features

### What Gets Encrypted

- Steam account passwords
- Shared secrets (2FA codes)
- Refresh tokens
- Session cookies

### What Remains Unencrypted

- Usernames (needed for account selection)
- Steam IDs
- Last login timestamps
- Active/inactive status

### Encryption Method

- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with SHA-256
- **Iterations**: 100,000

## 🔧 Configuration Options

### Environment Variables (`.env`)

```env
# Required
MASTER_PASSWORD=your_secure_password

```

### Application Config (`config.json`)

```json
{
  "inventory_list": [...],        // Games to fetch inventory from
  "inventory_delay": 3000,        // Delay between inventory requests (ms)
  "market_history_delay": 3000,   // Delay between market history requests (ms)
  "default_reports_folder": "reports",
  "excel_style": {                // Excel formatting options
    "autoFitColumns": true,
    "dataStyle": {...},
    "headerStyle": {...}
  }
}
```

## 📦 NPM Scripts

```bash
npm start                 # Run the main application
npm run account:add       # Add a single account interactively
npm run account:import    # Bulk import accounts from JSON
npm run account:list      # List all stored accounts
npm run account:details   # Show detailed account information
```

## 🎯 Example Workflow

### First Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set MASTER_PASSWORD

# 3. Add your first account
npm run account:add
# Enter: username, password, shared secret (optional)

# 4. Run the application
npm start
# Select your account from the list

# 5. Check the generated report
ls reports/
# report_<accountId>_2024-11-25.xlsx
```

### Working with Multiple Accounts

```bash
# Prepare accounts file
cat > accounts.json << EOF
[
  {"username": "trader1", "password": "pass1", "sharedSecret": "SECRET1"},
  {"username": "trader2", "password": "pass2", "sharedSecret": "SECRET2"},
  {"username": "trader3", "password": "pass3"}
]
EOF

# Import all accounts
npm run account:import

# Run for specific account
node main.js trader1
node main.js trader2
node main.js trader3
```

## ⚠️ Important Notes

1. **Master Password**: Keep a secure backup of your `MASTER_PASSWORD`. Without it, all encrypted data is irrecoverable.

2. **Database**: The SQLite database (`database.sqlite`) contains encrypted credentials. Never share it publicly.

3. **Rate Limits**: Steam has rate limits for API requests. The application includes delays between requests to avoid throttling.

4. **Session Management**: The app automatically saves refresh tokens and cookies for faster subsequent logins.

5. **2FA Requirement**: Some operations may require Steam Guard authentication. Use shared secrets for fully automated operation.

## 🐛 Troubleshooting

### "MASTER_PASSWORD not found"
**Solution**: Add `MASTER_PASSWORD` to your `.env` file

### "Account not found"
**Solution**: Run `npm run account:list` to see available accounts

### "Failed to decrypt"
**Solution**: Verify your `MASTER_PASSWORD` is correct

### "Web session not ready"
**Solution**: Wait for the web session to establish or check Steam Guard authentication

### "Login timeout"
**Solution**: 
- Check internet connection
- Verify credentials are correct
- Check if Steam is experiencing issues

## 🔄 Session Restoration

The application automatically handles session restoration:

1. **First attempt**: Try to use saved refresh token
2. **Second attempt**: Use saved cookies (if not expired)
3. **Fallback**: Full login with credentials

This minimizes the need for Steam Guard codes on subsequent runs.

## 📈 Market Analysis Features

- **Transaction Statistics**: Total invested, received, profit, ROI%
- **Per-Item ROI**: Individual profit/loss for each traded item
- **Inventory Matching**: Links current items to their purchase history
- **Transaction History**: Complete record of all market activities
- **Currency Support**: Handles multiple currency types

## 🛡️ Best Practices

1. **Regular Backups**: Backup your database and `.env` file securely
2. **Shared Secrets**: Use shared secrets for unattended operation
3. **Secure Storage**: Never commit `.env` or database files to version control
4. **Update Regularly**: Keep dependencies updated for security patches
5. **Monitor Logs**: Check console output for errors or warnings

## 🔮 Planned Features
If this project gains popularity, the following improvements are planned:

- [ ] **Proxy** - Add proxy usage
- [ ] **Parallel Working** - Working with accounts in parallel
- [ ] **Your ideas**

## 📄 License

GNU GENERAL PUBLIC LICENSE

---

**Disclaimer**: This tool is for personal use only. Ensure compliance with Steam's Terms of Service and API usage policies.