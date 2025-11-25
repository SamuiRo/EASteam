import SteamUser from 'steam-user';
import SteamTotp from 'steam-totp';
import SteamCommunity from 'steamcommunity';
import TradeOfferManager from 'steam-tradeoffer-manager';
import { Account } from "../module/teapot/models/index.js";
import { encryptionService } from "../service/encryption.js";
import { MarketAnalyzer } from "../service/MarketAnalyzer.js"
import { print, sleep } from "../shared/utils.js";

import { INVENTORY_DELAY, MARKET_HISTORY_DELAY } from "../config/app.config.js"

export class SteamAccountManager {
    constructor() {
        this.accounts = new Map();
    }

    createClient(accountId) {
        const client = new SteamClient(accountId);
        this.accounts.set(accountId, client);
        return client;
    }

    getClient(accountId) {
        return this.accounts.get(accountId) || null;
    }

    removeClient(accountId) {
        const client = this.accounts.get(accountId);
        if (client) {
            client.disconnect();
            this.accounts.delete(accountId);
        }
    }

    getActiveAccounts() {
        return Array.from(this.accounts.entries()).map(([accountId, client]) => ({
            accountId,
            isConnected: client.isConnected(),
            steamId: client.getSteamId(),
            accountName: client.getAccountName()
        }));
    }
}

export class SteamClient {
    constructor(accountId) {
        this.accountId = accountId;
        this.client = new SteamUser();
        this.community = new SteamCommunity();
        this.manager = new TradeOfferManager({
            steam: this.client,
            community: this.community,
            language: 'en',
        });

        this.isLoggedIn = false;
        this.webSessionReady = false;
        this.accountName = null;
        this.steamId = null;
        this.refreshToken = null;
        this.marketAnalyzer = null;

        // Callback для запиту коду
        this.onSteamGuardCodeRequired = null;

        this.addEventHandlers();
    }

    addEventHandlers() {
        this.client.once('loggedOn', (details) => {
            this.isLoggedIn = true;
            this.steamId = this.client.steamID.getSteamID64();

            if (!this.marketAnalyzer) {
                this.marketAnalyzer = new MarketAnalyzer(this.accountId, this.steamId);
                print(`${this.accountId} MarketAnalyzer initialized`, "success");
            }

            this.updateLastLogin();
            print(`${this.accountId} Steam client logged in as ${details.client_supplied_steamid || this.accountName}`, "success");
        });

        this.client.on('webSession', async (sessionID, cookies) => {
            this.manager.setCookies(cookies);
            this.community.setCookies(cookies);
            this.webSessionReady = true;
            await this.saveCookies(cookies);
            print(`${this.accountId} Web session established and cookies saved`, "success");
        });

        this.client.on('steamGuard', (domain, callback) => {
            print(`${this.accountId} Steam Guard code needed from email ending in ${domain}`, "warning");
            this.emit('steamGuardRequired', { accountId: this.accountId, domain });

            // Викликаємо callback для запиту коду
            if (this.onSteamGuardCodeRequired) {
                this.onSteamGuardCodeRequired(callback);
            }
        });

        this.client.on('disconnected', (eresult, msg) => {
            this.isLoggedIn = false;
            this.webSessionReady = false;
            this.emit('disconnected', { accountId: this.accountId, reason: msg });
            print(`${this.accountId} Disconnected from Steam: ${msg}`, "warning");
        });

        this.client.on('refreshToken', async (refreshToken) => {
            this.refreshToken = refreshToken;
            await this.saveRefreshToken(refreshToken);
            print(`${this.accountId} Refresh token received`, "system");
        });

        this.client.on('error', (error) => {
            print(`${this.accountId} Steam error: ${error.message}`, "error");
            this.emit('error', { accountId: this.accountId, error: error.message });
        });

        this.community.on('sessionExpired', async (error) => {
            print(`${this.accountId} Session expired, attempting to restore...`, "warning");
            this.webSessionReady = false;
            await this.tryRestoreSession();
        });

        this.manager.on('newOffer', (offer) => {
            print(`${this.accountId} New trade offer #${offer.id}`, "system");
        });

        this.client.on('accountLimitations', (limited, communityBanned, locked, canInviteFriends) => {
            const status = {
                limited: limited ? 'Yes' : 'No',
                communityBanned: communityBanned ? 'Yes' : 'No',
                locked: locked ? 'Yes' : 'No',
                canInviteFriends: canInviteFriends ? 'Yes' : 'No'
            };
            print(`${this.accountId} Account limitations: ${JSON.stringify(status)}`, "system");
        });

        this.client.on('wallet', (hasWallet, currency, balance) => {
            if (hasWallet) {
                print(`${this.accountId} Wallet: ${balance} ${currency}`, "system");
            }
        });

        print(`${this.accountId} Event handlers initialized`, "system");
    }

    async saveCookies(cookies) {
        try {
            if (!encryptionService.isInitialized()) {
                throw new Error('Encryption service not initialized');
            }

            const account = await Account.findOne({ where: { username: this.accountName } });
            if (account) {
                const cookiesData = {
                    cookies: cookies,
                    timestamp: new Date().toISOString()
                };

                account.encryptedCookies = encryptionService.encryptObject(cookiesData);
                account.cookiesExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await account.save();

                print(`${this.accountId} Cookies encrypted and saved`, "success");
            }
        } catch (error) {
            print(`${this.accountId} Error saving cookies: ${error.message}`, "error");
        }
    }

    async saveRefreshToken(refreshToken) {
        try {
            if (!encryptionService.isInitialized()) {
                throw new Error('Encryption service not initialized');
            }

            const account = await Account.findOne({ where: { username: this.accountName } });
            if (account) {
                account.encryptedRefreshToken = encryptionService.encrypt(refreshToken);
                account.steamId = this.steamId;
                await account.save();

                print(`${this.accountId} Refresh token encrypted and saved`, "success");
            }
        } catch (error) {
            print(`${this.accountId} Error saving refresh token: ${error.message}`, "error");
        }
    }

    async updateLastLogin() {
        try {
            const account = await Account.findOne({ where: { username: this.accountName } });
            if (account) {
                account.lastLogin = new Date();
                account.steamId = this.steamId;
                await account.save();
            }
        } catch (error) {
            print(`${this.accountId} Error updating last login: ${error.message}`, "error");
        }
    }

    async tryRestoreSession() {
        try {
            const account = await Account.findOne({ where: { username: this.accountName } });
            if (!account) {
                print(`${this.accountId} Account not found in database`, "error");
                return false;
            }

            if (account.encryptedRefreshToken) {
                try {
                    const refreshToken = encryptionService.decrypt(account.encryptedRefreshToken);
                    print(`${this.accountId} Attempting to restore with refresh token`, "system");

                    return new Promise((resolve) => {
                        this.client.logOn({ refreshToken });

                        const timeout = setTimeout(() => {
                            print(`${this.accountId} Refresh token restore timeout`, "warning");
                            resolve(false);
                        }, 15000);

                        this.client.once('loggedOn', () => {
                            clearTimeout(timeout);
                            print(`${this.accountId} Session restored via refresh token`, "success");
                            resolve(true);
                        });

                        this.client.once('error', () => {
                            clearTimeout(timeout);
                            print(`${this.accountId} Failed to restore with refresh token`, "warning");
                            resolve(false);
                        });
                    });
                } catch (error) {
                    print(`${this.accountId} Error decrypting refresh token: ${error.message}`, "error");
                }
            }

            if (account.encryptedCookies && account.cookiesExpiry && new Date(account.cookiesExpiry) > new Date()) {
                try {
                    const cookiesData = encryptionService.decryptObject(account.encryptedCookies);
                    print(`${this.accountId} Attempting to restore with cookies`, "system");

                    this.community.setCookies(cookiesData.cookies);
                    this.manager.setCookies(cookiesData.cookies);
                    this.webSessionReady = true;

                    return true;
                } catch (error) {
                    print(`${this.accountId} Error restoring cookies: ${error.message}`, "error");
                }
            }

            print(`${this.accountId} No valid session data available`, "warning");
            return false;
        } catch (error) {
            print(`${this.accountId} Error restoring session: ${error.message}`, "error");
            return false;
        }
    }

    async login(accountName, password, sharedSecret, steamGuardCodeCallback = null) {
        return new Promise(async (resolve, reject) => {
            this.accountName = accountName;
            this.onSteamGuardCodeRequired = steamGuardCodeCallback;

            try {
                const restored = await this.tryExistingAuth(accountName);
                if (restored) {
                    print(`${this.accountId} Logged in using existing credentials`, "success");

                    if (!this.webSessionReady) {
                        await this.waitForWebSession();
                    }

                    resolve(true);
                    return;
                }

                print(`${this.accountId} Logging in with credentials`, "system");

                const logonOptions = {
                    accountName,
                    password,
                    rememberPassword: true,
                };

                // Додаємо TOTP тільки якщо є sharedSecret
                if (sharedSecret) {
                    logonOptions.twoFactorCode = SteamTotp.generateAuthCode(sharedSecret);
                    print(`${this.accountId} Using TOTP code from shared secret`, "system");
                }

                this.client.logOn(logonOptions);

                const loginTimeout = setTimeout(() => {
                    this.client.removeAllListeners('loggedOn');
                    this.client.removeAllListeners('error');
                    reject(new Error('Login timeout (30s)'));
                }, 30000);

                this.client.once('loggedOn', async () => {
                    clearTimeout(loginTimeout);
                    print(`${this.accountId} Successfully logged into Steam`, "success");
                    await this.waitForWebSession();
                    resolve(true);
                });

                this.client.once('error', (error) => {
                    clearTimeout(loginTimeout);
                    print(`${this.accountId} Login error: ${error.message}`, "error");
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async waitForWebSession(timeout = 10000) {
        if (this.webSessionReady) {
            return true;
        }

        print(`${this.accountId} Waiting for web session...`, "system");

        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (this.webSessionReady) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutHandler);
                    print(`${this.accountId} Web session ready`, "success");
                    resolve(true);
                }
            }, 100);

            const timeoutHandler = setTimeout(() => {
                clearInterval(checkInterval);
                print(`${this.accountId} Web session wait timeout`, "warning");
                resolve(false);
            }, timeout);
        });
    }

    async tryExistingAuth(username) {
        try {
            const account = await Account.findOne({ where: { username } });
            if (!account) {
                return false;
            }

            if (account.encryptedRefreshToken) {
                try {
                    const refreshToken = encryptionService.decrypt(account.encryptedRefreshToken);
                    print(`${this.accountId} Trying to login with saved refresh token`, "system");

                    return new Promise((resolve) => {
                        this.client.logOn({ refreshToken });

                        const timeout = setTimeout(() => {
                            resolve(false);
                        }, 15000);

                        this.client.once('loggedOn', async () => {
                            clearTimeout(timeout);
                            print(`${this.accountId} Logged in with refresh token`, "success");
                            await this.waitForWebSession();
                            resolve(true);
                        });

                        this.client.once('error', (err) => {
                            clearTimeout(timeout);
                            print(`${this.accountId} Refresh token failed: ${err.message}`, "warning");
                            resolve(false);
                        });
                    });
                } catch (error) {
                    print(`${this.accountId} Error decrypting refresh token: ${error.message}`, "error");
                }
            }

            return false;
        } catch (error) {
            print(`${this.accountId} Error in tryExistingAuth: ${error.message}`, "error");
            return false;
        }
    }

    disconnect() {
        if (this.client && this.isLoggedIn) {
            this.client.logOff();
            this.isLoggedIn = false;
            this.webSessionReady = false;
            print(`${this.accountId} Disconnected from Steam`, "system");
        }
    }

    isConnected() {
        return this.isLoggedIn && this.client.steamID && this.webSessionReady;
    }

    getSteamId() {
        return this.steamId;
    }

    getAccountName() {
        return this.accountName;
    }

    async getInventory(appId, contextId = 2, tradableOnly = true) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected()) {
                reject(new Error('Not connected to Steam or web session not ready'));
                return;
            }

            print(`${this.accountId} Fetching inventory for app ${appId}, context ${contextId}`, "system");

            this.manager.getUserInventoryContents(
                this.steamId,
                appId,
                contextId,
                tradableOnly,
                (error, inventory, currencies) => {
                    if (error) {
                        print(`${this.accountId} Error fetching inventory: ${error.message}`, "error");
                        reject(error);
                        return;
                    }

                    print(`${this.accountId} Successfully fetched ${inventory.length} items from inventory`, "success");

                    const formattedInventory = inventory.map(item => ({
                        assetid: item.assetid,
                        classid: item.classid,
                        instanceid: item.instanceid,
                        amount: item.amount,
                        pos: item.pos,
                        name: item.name || item.market_name,
                        market_name: item.market_name,
                        market_hash_name: item.market_hash_name,
                        type: item.type,
                        tradable: item.tradable,
                        marketable: item.marketable,
                        commodity: item.commodity,
                        icon_url: item.icon_url,
                        icon_url_large: item.icon_url_large,
                        descriptions: item.descriptions,
                        actions: item.actions,
                        tags: item.tags
                    }));

                    resolve({
                        items: formattedInventory,
                        total: formattedInventory.length,
                        currencies: currencies || []
                    });
                }
            );
        });
    }

    async getInventoryAPI(steamId = null, appId = 730, contextId = 2) {
        const targetSteamId = steamId || this.steamId;

        if (!targetSteamId) throw new Error('Steam ID not provided');

        print(`${this.accountId} Fetching inventory via API for ${targetSteamId}`, "system");

        const url = `https://steamcommunity.com/inventory/${targetSteamId}/${appId}/${contextId}`;

        try {
            const response = await this.httpRequestGet(url, {
                count: 5000,
                l: 'english'
            });

            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch inventory');
            }

            print(`${this.accountId} Successfully fetched ${response.total_inventory_count} items via API`, "success");

            return {
                assets: response.assets || [],
                descriptions: response.descriptions || [],
                total: response.total_inventory_count || 0,
                success: response.success
            };
        } catch (error) {
            print(`${this.accountId} Error fetching inventory via API: ${error.message}`, "error");
            throw error;
        }
    }

    async getFullInventory(inventoryConfigs = [{ appId: 730, contextId: 2 }]) {
        if (!this.isConnected()) {
            throw new Error('Not connected to Steam or web session not ready');
        }

        print(`${this.accountId} Starting to fetch full inventory from ${inventoryConfigs.length} source(s)...`, "system");

        const fullInventory = {
            items: [],
            byApp: {},
            total: 0,
            currencies: []
        };

        try {
            for (const config of inventoryConfigs) {
                const { appId, contextId = 2, tradableOnly = true } = config;

                print(`${this.accountId} Fetching inventory: appId=${appId}, contextId=${contextId}`, "system");

                try {
                    const inventoryData = await this.getInventory(appId, contextId, tradableOnly);

                    const itemsWithMeta = inventoryData.items.map(item => ({
                        ...item,
                        appId,
                        contextId
                    }));

                    fullInventory.items.push(...itemsWithMeta);

                    if (!fullInventory.byApp[appId]) {
                        fullInventory.byApp[appId] = {
                            appId,
                            items: [],
                            count: 0
                        };
                    }

                    fullInventory.byApp[appId].items.push(...itemsWithMeta);
                    fullInventory.byApp[appId].count = fullInventory.byApp[appId].items.length;

                    if (inventoryData.currencies && inventoryData.currencies.length > 0) {
                        fullInventory.currencies.push(...inventoryData.currencies);
                    }

                    print(`${this.accountId} Fetched ${inventoryData.total} items from appId ${appId}`, "success");

                    if (inventoryConfigs.indexOf(config) < inventoryConfigs.length - 1) {
                        await sleep(INVENTORY_DELAY);
                    }

                } catch (error) {
                    print(`${this.accountId} Error fetching inventory for appId ${appId}: ${error.message}`, "error");
                    continue;
                }
            }

            fullInventory.total = fullInventory.items.length;

            print(`${this.accountId} Successfully fetched full inventory: ${fullInventory.total} total items from ${Object.keys(fullInventory.byApp).length} app(s)`, "success");

            return fullInventory;

        } catch (error) {
            print(`${this.accountId} Error fetching full inventory: ${error.message}`, "error");
            throw error;
        }
    }

    async getMarketHistory(start = 0, count = 100, query = '') {
        if (!this.isConnected()) throw new Error('Not connected to Steam or web session not ready');

        const url = 'https://steamcommunity.com/market/myhistory/';

        try {
            print(`${this.accountId} Fetching market history (start: ${start}, count: ${count})`, "system");

            const response = await this.httpRequestGet(url, {
                query: query,
                start: start,
                count: count,
                norender: 1
            }, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Prototype-Version': '1.7'
                }
            });

            if (!response.success) {
                throw new Error('Failed to fetch market history');
            }

            print(`${this.accountId} Successfully fetched market history. Total: ${response.total_count}`, "success");

            return {
                success: response.success,
                pagesize: response.pagesize,
                total_count: response.total_count,
                start: response.start,
                assets: response.assets || {},
                purchases: response.purchases || {},
                listings: response.listings || {},
                events: response.events || []
            };
        } catch (error) {
            print(`${this.accountId} Error fetching market history: ${error.message}`, "error");
            throw error;
        }
    }

    async getFullMarketHistory(maxItems = Infinity) {
        if (!this.isConnected()) throw new Error('Not connected to Steam or web session not ready');

        print(`${this.accountId} Starting to fetch full market history...`, "system");

        let full_history = {
            assets: {},
            purchases: {},
            listings: {},
            events: []
        };

        let start = 0;
        const count = 100;
        let totalCount = null;

        try {
            while (start < (totalCount || Infinity) && start < maxItems) {
                const history = await this.getMarketHistory(start, count);

                if (totalCount === null) {
                    totalCount = history.total_count;
                    print(`${this.accountId} Total market history records: ${totalCount}`, "system");
                }

                for (const appid in history.assets) {
                    if (!full_history.assets[appid]) full_history.assets[appid] = {};
                    for (const contextid in history.assets[appid]) {
                        if (!full_history.assets[appid][contextid])
                            full_history.assets[appid][contextid] = {};
                        Object.assign(
                            full_history.assets[appid][contextid],
                            history.assets[appid][contextid]
                        );
                    }
                }

                Object.assign(full_history.purchases, history.purchases);

                Object.assign(full_history.listings, history.listings);

                full_history.events.push(...history.events);

                start += count;
                print(`${this.accountId} Fetched ${start} / ${totalCount} records`, "system");

                if (start < totalCount && start < maxItems) {
                    await sleep(MARKET_HISTORY_DELAY);
                }
            }

            print(`${this.accountId} Successfully fetched full market history (${full_history.events.length} events)`, "success");

            return full_history;
        } catch (error) {
            print(`${this.accountId} Error fetching full market history: ${error.message}`, "error");
            throw error;
        }
    }

    parseMarketHistory(history) {
        if (!this.marketAnalyzer) {
            throw new Error('Market analyzer not initialized. Please login first.');
        }
        return this.marketAnalyzer.parseMarketHistory(history);
    }

    matchInventoryWithPurchases(transactions, inventory) {
        if (!this.marketAnalyzer) {
            throw new Error('Market analyzer not initialized. Please login first.');
        }
        return this.marketAnalyzer.matchInventoryWithPurchases(transactions, inventory);
    }

    calculateROI(transactions) {
        if (!this.marketAnalyzer) {
            throw new Error('Market analyzer not initialized. Please login first.');
        }
        return this.marketAnalyzer.calculateROI(transactions);
    }

    calculateTransactionStatistics(data) {
        if (!this.marketAnalyzer) {
            throw new Error('Market analyzer not initialized. Please login first.');
        }
        return this.marketAnalyzer.calculateTransactionStatistics(data);
    }

    async httpRequestPost(url, form = {}, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.community) {
                reject(new Error('Steam community not initialized'));
                return;
            }

            if (!this.webSessionReady) {
                reject(new Error('Web session not ready'));
                return;
            }

            print(`${this.accountId} Making POST request to: ${url}`, "system");

            const requestOptions = {
                uri: url,
                form: form,
                json: options.json !== false,
                ...options
            };

            this.community.httpRequestPost(requestOptions, (err, response, body) => {
                if (err) {
                    print(`${this.accountId} POST request error: ${err.message}`, "error");
                    reject(err);
                    return;
                }

                if (response.statusCode !== 200) {
                    print(`${this.accountId} POST request failed with status ${response.statusCode}`, "error");
                    reject(new Error(`HTTP ${response.statusCode}: ${body}`));
                    return;
                }

                print(`${this.accountId} POST request successful`, "success");
                resolve(body);
            });
        });
    }

    async httpRequestGet(url, qs = {}, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.community) {
                reject(new Error('Steam community not initialized'));
                return;
            }

            if (!this.webSessionReady) {
                reject(new Error('Web session not ready'));
                return;
            }

            print(`${this.accountId} Making GET request to: ${url}`, "system");

            const requestOptions = {
                uri: url,
                qs: qs,
                json: options.json !== false,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    ...options.headers
                },
                ...options
            };

            this.community.httpRequestGet(requestOptions, (err, response, body) => {
                if (err) {
                    print(`${this.accountId} GET request error: ${err.message}`, "error");
                    reject(err);
                    return;
                }

                if (response.statusCode !== 200) {
                    print(`${this.accountId} GET request failed with status ${response.statusCode}`, "error");
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                print(`${this.accountId} GET request successful`, "success");
                resolve(body);
            });
        });
    }

    async getItemInfo(appID, marketHashName, currency = 'USD') {
        return new Promise((resolve, reject) => {
            if (!this.webSessionReady) {
                reject(new Error('Web session not ready'));
                return;
            }

            this.community.getMarketItem(appID, marketHashName, currency, (error, item) => {
                if (error) {
                    print(`${this.accountId} Error fetching market item: ${error.message}`, "error");
                    reject(error);
                    return;
                }
                resolve(item);
            });
        });
    }

    emit(event, data) {
        print(`${this.accountId} Event: ${event}`, "system");
        // TODO Socket.IO or EventEmitter
    }
}