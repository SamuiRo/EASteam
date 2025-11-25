import { print } from "../shared/utils.js";

export class MarketAnalyzer {
    constructor(accountId, steamId) {
        this.accountId = accountId;
        this.steamId = steamId;
    }

     /**
     * Parsing market transaction history
     * @param {Object} history - raw history from Steam API
     * @returns {Object} Processed transactions with purchases and sales
     */
    parseMarketHistory(history) {
        try {
            const mySteamId = String(this.steamId);

            if (!history) throw new Error("Invalid history object");

            const accountPurchases = [];
            const accountSales = [];
            const transactions = [];

            for (const [key, transaction] of Object.entries(history.purchases)) {
                const isMyPurchase = transaction.steamid_purchaser === mySteamId;
                const appid = transaction.asset?.appid;
                const contextid = transaction.asset?.contextid;
                const assetid = transaction.asset?.id;
                const new_id = transaction.asset?.new_id;

                let itemInfo = null;
                if (appid && contextid && assetid) {
                    itemInfo = history.assets?.[appid]?.[contextid]?.[assetid] || null;
                    if (!itemInfo) {
                        const contextAssets = history.assets?.[appid]?.[contextid];
                        if (contextAssets) {
                            itemInfo = Object.values(contextAssets).find(
                                item => item.unowned_id === assetid
                            ) || null;
                        }
                    }
                }

                const parsed = {
                    id: key,
                    new_id: new_id ?? null,
                    appid,
                    contextid,
                    assetid: assetid ?? null,
                    type: isMyPurchase ? "purchase" : "sale",
                    market_name: itemInfo?.market_hash_name || transaction.market_name || "Unknown Item",
                    paid_amount: transaction.paid_amount || 0,
                    paid_fee: transaction.paid_fee || 0,
                    paid_total: (transaction.paid_amount || 0) + (transaction.paid_fee || 0),
                    currencyid: transaction.currencyid,
                    time_sold: transaction.time_sold || null,
                    steamid_purchaser: transaction.steamid_purchaser || null,
                    raw: transaction,
                };

                if (parsed.market_name === "Unknown Item") {
                    print("Unknown Item detected: " + assetid, "warning");
                }

                if (isMyPurchase) {
                    accountPurchases.push(parsed);
                } else {
                    accountSales.push(parsed);
                }
            }

            const purchasesByNewId = new Map(
                accountPurchases
                    .filter(p => p.new_id)
                    .map(p => [String(p.new_id), p])
            );

            const salesByAssetId = new Map(
                accountSales
                    .filter(s => s.assetid)
                    .map(s => [String(s.assetid), s])
            );

            const matchedSaleIds = new Set();

            for (const purchase of accountPurchases) {
                const new_id = String(purchase.new_id);
                const matchedSale = salesByAssetId.get(new_id);

                if (matchedSale) {
                    matchedSaleIds.add(String(matchedSale.id));

                    transactions.push(
                        {
                            transaction_id: `purchase:${purchase.id}`,
                            transaction_status: "completed",
                            role: "purchase",
                            purchase_id: purchase.id,
                            purchase: purchase,
                            linked_sale_id: matchedSale.id,
                            time_sold: purchase.time_sold
                        },
                        {
                            transaction_id: `sale:${matchedSale.id}`,
                            transaction_status: "completed",
                            role: "sale",
                            purchase_id: matchedSale.id,
                            purchase: matchedSale,
                            linked_purchase_id: purchase.id,
                            time_sold: matchedSale.time_sold
                        }
                    );
                } else {
                    transactions.push({
                        transaction_id: `purchase:${purchase.id}`,
                        transaction_status: "uncompleted",
                        role: "purchase",
                        purchase_id: purchase.id,
                        purchase: purchase,
                        linked_sale_id: null,
                        time_sold: purchase.time_sold
                    });
                }
            }

            for (const sale of accountSales) {
                if (!matchedSaleIds.has(String(sale.id))) {
                    transactions.push({
                        transaction_id: `sale:${sale.id}`,
                        transaction_status: "received",
                        role: "sale",
                        purchase_id: sale.id,
                        purchase: sale,
                        time_sold: sale.time_sold
                    });
                }
            }

            const stats = transactions.reduce((acc, t) => {
                if (t.transaction_status === "completed" && t.role === "sale") acc.completed++;
                if (t.transaction_status === "uncompleted") acc.uncompleted++;
                if (t.transaction_status === "received") acc.received++;
                return acc;
            }, { completed: 0, uncompleted: 0, received: 0 });

            return {
                transactions,
                purchases_count: accountPurchases.length,
                completed_purchases_count: stats.completed,
                uncompleted_purchases_count: stats.uncompleted,
                sales_count: accountSales.length,
                received_sales_count: stats.received,
                totalTransactions: accountPurchases.length + accountSales.length
            };
        } catch (error) {
            console.log(error);
            throw error;
        }
    }

    /**
     * Matching inventory with purchases
     * @param {Array} transactions - transactions after parsing
     * @param {Array} inventory - items from inventory
     * @returns {Object} Matched and unmatched purchases
     */
    matchInventoryWithPurchases(transactions, inventory) {
        const inventoryMap = new Map(
            inventory.map(item => [String(item.assetid), item])
        );

        const purchases = transactions
            .filter(t => t.role === "purchase" && t.purchase?.new_id)
            .map(t => ({
                ...t.purchase,
                transaction_id: t.transaction_id,
                transaction_status: t.transaction_status
            }));

        const matched = [];
        const unmatched = [];

        for (const purchase of purchases) {
            const purchaseAssetId = String(purchase.new_id);
            const linkedInventoryItem = inventoryMap.get(purchaseAssetId);

            const baseItem = {
                appid: purchase.appid,
                assetid: purchase.new_id,
                market_hash_name: purchase.market_name,
                paid_amount: purchase.paid_amount,
                paid_fee: purchase.paid_fee,
                paid_total: purchase.paid_total,
                currencyid: purchase.currencyid,
                time_sold: purchase.time_sold,
                transaction_id: purchase.transaction_id,
                transaction_status: purchase.transaction_status
            };

            if (linkedInventoryItem) {
                matched.push({
                    ...baseItem,
                    icon_url: linkedInventoryItem.icon_url,
                    match_type: "purchased"
                });
            } else {
                unmatched.push({
                    ...baseItem,
                    market_name: purchase.market_name,
                    match_type: "other_source"
                });
            }
        }

        const total = purchases.length;
        return {
            matched,
            unmatched,
            total_purchases: total,
            matched_count: matched.length,
            unmatched_count: unmatched.length,
            statistics: {
                matched_percentage: total ? ((matched.length / total) * 100).toFixed(2) + "%" : "0%",
                unmatched_percentage: total ? ((unmatched.length / total) * 100).toFixed(2) + "%" : "0%"
            }
        };
    }

    /**
     * Calculate ROI for completed buy/sell pairs
     * @param {Array} transactions - processed transactions
     * @returns {Array} array of ROI results for each completed purchase
     */
    calculateROI(transactions) {
        if (!Array.isArray(transactions)) {
            throw new Error("transactions must be an array");
        }

        const results = [];

        const salesMap = new Map(
            transactions
                .filter(t => t.role === "sale")
                .map(t => [t.purchase_id, t])
        );

        for (const purchaseTx of transactions) {
            if (purchaseTx.role !== "purchase" || purchaseTx.transaction_status !== "completed") {
                continue;
            }

            const saleId = purchaseTx.linked_sale_id;
            if (!saleId) continue;

            const saleTx = salesMap.get(saleId);
            if (!saleTx) continue;

            const buy = purchaseTx.purchase;
            const sell = saleTx.purchase;

            const buyPrice = buy.paid_total;
            const sellPrice = sell.raw?.received_amount || 0;
            const profit = sellPrice - buyPrice;
            const roi = buyPrice > 0 ? (profit / buyPrice) * 100 : 0;

            results.push({
                transaction_id: purchaseTx.purchase_id,
                market_name: buy.market_name,
                appid: buy.appid,
                buy_price: buyPrice,
                sell_price: sellPrice,
                profit,
                roi_percent: Number(roi.toFixed(2)),
                time_purchase: buy.time_sold || null,
                time_sale: sell.time_sold || null,
                purchase_raw: buy,
                sale_raw: sell
            });
        }

        return results;
    }

    /**
     * Calculation of general transaction statistics
     * @param {Object} data - transaction data
     * @returns {Object} general statistics
     */
    calculateTransactionStatistics(data) {
        const { transactions } = data;

        let totalInvested = 0;
        let totalReceived = 0;

        const itemStats = new Map();
        const itemTransactions = new Map();

        for (const transaction of transactions) {
            const { role, purchase, transaction_status, transaction_id, time_sold } = transaction;
            const marketName = purchase.market_name;

            if (!itemStats.has(marketName)) {
                itemStats.set(marketName, {
                    marketName,
                    totalInvested: 0,
                    totalReceived: 0,
                    purchaseCount: 0,
                    saleCount: 0,
                    completedCount: 0,
                    receivedCount: 0,
                    uncomletedCount: 0
                });
                itemTransactions.set(marketName, []);
            }

            const itemStat = itemStats.get(marketName);
            const txList = itemTransactions.get(marketName);

            if (role === 'purchase') {
                const invested = purchase.paid_total;

                totalInvested += invested;
                itemStat.totalInvested += invested;
                itemStat.purchaseCount++;

                if (transaction_status === 'completed') {
                    itemStat.completedCount++;
                } else if (transaction_status === 'uncompleted') {
                    itemStat.uncomletedCount++;
                }

                txList.push({
                    type: 'purchase',
                    transactionId: transaction_id,
                    assetId: purchase.assetid,
                    newId: purchase.new_id,
                    amount: invested,
                    status: transaction_status,
                    timestamp: time_sold,
                    date: new Date(time_sold * 1000).toISOString(),
                    currencyId: purchase.currencyid
                });
            } else if (role === 'sale') {
                const received = purchase.raw.received_amount;

                totalReceived += received;
                itemStat.totalReceived += received;
                itemStat.saleCount++;

                if (transaction_status === 'received') {
                    itemStat.receivedCount++;
                }

                txList.push({
                    type: 'sale',
                    transactionId: transaction_id,
                    assetId: purchase.assetid,
                    newId: purchase.new_id,
                    amount: received,
                    status: transaction_status,
                    timestamp: time_sold,
                    date: new Date(time_sold * 1000).toISOString(),
                    currencyId: purchase.raw.received_currencyid,
                    purchaserId: purchase.steamid_purchaser
                });
            }
        }

        const totalProfit = totalReceived - totalInvested;
        const totalROIPercent = totalInvested > 0
            ? ((totalProfit / totalInvested) * 100).toFixed(2)
            : 0;

        return {
            overall: {
                totalInvested,
                totalReceived,
                totalProfit,
                roiPercent: parseFloat(totalROIPercent),
                totalTransactions: transactions.length,
                purchasesCount: data.purchases_count,
                salesCount: data.sales_count,
                completedPurchases: data.completed_purchases_count,
                uncomletedPurchases: data.uncompleted_purchases_count,
                receivedSales: data.received_sales_count
            }
        };
    }
}