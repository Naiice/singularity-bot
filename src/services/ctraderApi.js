// cTrader Open API JSON WebSocket Service
// Supports both Live (wss://live.ctraderapi.com:5036) and Demo (wss://demo.ctraderapi.com:5036)

export const PAYLOAD_TYPE = {
  HEARTBEAT_EVENT: 51,
  ERROR_RES: 50,
  APPLICATION_AUTH_REQ: 2100,
  APPLICATION_AUTH_RES: 2101,
  ACCOUNT_AUTH_REQ: 2102,
  ACCOUNT_AUTH_RES: 2103,
  SYMBOLS_LIST_REQ: 2114,
  SYMBOLS_LIST_RES: 2115,
  SYMBOL_BY_ID_REQ: 2116,
  SYMBOL_BY_ID_RES: 2117,
  TRADER_REQ: 2121,
  TRADER_RES: 2122,
  RECONCILE_REQ: 2124,
  RECONCILE_RES: 2125,
  EXECUTION_EVENT: 2126,
  SUBSCRIBE_SPOTS_REQ: 2127,
  SUBSCRIBE_SPOTS_RES: 2128,
  UNSUBSCRIBE_SPOTS_REQ: 2129,
  SPOT_EVENT: 2131,
  DEAL_LIST_REQ: 2133,
  DEAL_LIST_RES: 2134,
  OA_ERROR_RES: 2142,
  GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ: 2149,
  GET_ACCOUNTS_BY_ACCESS_TOKEN_RES: 2150,
  REFRESH_TOKEN_REQ: 2173,
  REFRESH_TOKEN_RES: 2174,
  GET_POSITION_UNREALIZED_PNL_REQ: 2187,
  GET_POSITION_UNREALIZED_PNL_RES: 2188,
};

const ENDPOINTS = {
  live: 'wss://live.ctraderapi.com:5036',
  demo: 'wss://demo.ctraderapi.com:5036',
};

function formatSyncTime() {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  return `${timeStr} UTC+7`;
}

function formatDateYYYYMMDD(timestamp) {
  const dt = new Date(timestamp);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class CTraderSocketManager {
  constructor({
    onStatusChange,
    onAccountsLoaded,
    onPortfolioUpdate,
    onPositionsUpdate,
    onDealsUpdate,
    onLog,
  }) {
    this.ws = null;
    this.currentEnv = null; // 'live' | 'demo'
    this.msgCounter = 1;
    this.pendingRequests = new Map();
    this.heartbeatInterval = null;
    this.pnlInterval = null;
    this.lastPingMs = 18;

    this.credentials = {
      clientId: '',
      clientSecret: '',
      accessToken: '',
      refreshToken: '',
    };

    this.accounts = [];
    this.selectedAccount = null;
    this.symbolsMap = new Map(); // symbolId -> { symbolName, digits, lotSize }
    this.spotPrices = new Map(); // symbolId -> { bid, ask }
    this.subscribedSymbols = new Set();

    this.traderInfo = {
      balance: 0,
      moneyDigits: 2,
      leverage: 100,
      traderLogin: null,
      brokerName: 'cTrader',
    };
    this.rawPositions = [];
    this.rawOrders = [];
    this.unrealizedPnlMap = new Map(); // positionId -> { gross, net }

    // Callbacks
    this.onStatusChange = onStatusChange || (() => {});
    this.onAccountsLoaded = onAccountsLoaded || (() => {});
    this.onPortfolioUpdate = onPortfolioUpdate || (() => {});
    this.onPositionsUpdate = onPositionsUpdate || (() => {});
    this.onDealsUpdate = onDealsUpdate || (() => {});
    this.onLog = onLog || (() => {});
  }

  log(msg, level = 'INFO') {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toTimeString().split(' ')[0],
      level, // 'INFO' | 'SIGNAL' | 'SYSTEM' | 'TRADE' | 'RISK'
      msg,
    };
    this.onLog(entry);
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.pnlInterval) {
      clearInterval(this.pnlInterval);
      this.pnlInterval = null;
    }
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // ignore close error
      }
      this.ws = null;
    }
    this.currentEnv = null;
    this.subscribedSymbols.clear();
  }

  sendRequest(payloadType, payload = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('WebSocket is not connected'));
      }
      const clientMsgId = `msg_${this.msgCounter++}_${Date.now()}`;
      const sentAt = performance.now();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(clientMsgId);
        reject(new Error(`Request timeout (payloadType: ${payloadType})`));
      }, timeoutMs);

      this.pendingRequests.set(clientMsgId, {
        resolve,
        reject,
        timer,
        payloadType,
        sentAt,
      });

      const message = JSON.stringify({
        clientMsgId,
        payloadType,
        payload,
      });
      this.ws.send(message);
    });
  }

  sendHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          payloadType: PAYLOAD_TYPE.HEARTBEAT_EVENT,
          payload: {},
        })
      );
    }
  }

  async connectSocket(env = 'demo') {
    this.disconnect();
    const url = ENDPOINTS[env];
    this.currentEnv = env;
    this.onStatusChange({
      state: 'connecting',
      env,
      openApiStatus: `Connecting (${env.toUpperCase()})...`,
      pingMs: this.lastPingMs,
      lastSync: formatSyncTime(),
    });
    this.log(`Connecting to cTrader ${env.toUpperCase()} endpoint (${url})...`, 'SYSTEM');

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      const connectTimeout = setTimeout(() => {
        reject(new Error(`Connection timeout to ${url}`));
      }, 15000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.log(`WebSocket connected to ${env.toUpperCase()} server.`, 'SYSTEM');
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 10000);
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
        reject(new Error(`WebSocket connection error (${url})`));
      };

      ws.onclose = (event) => {
        this.log(`WebSocket closed (${env.toUpperCase()}, code: ${event.code})`, 'RISK');
        this.onStatusChange({
          state: 'disconnected',
          env,
          openApiStatus: 'Disconnected',
          pingMs: 0,
          lastSync: formatSyncTime(),
        });
      };

      ws.onmessage = (event) => {
        this.handleIncomingMessage(event.data);
      };
    });

    // Authenticate Application
    const cleanClientId = this.credentials.clientId.trim();
    const cleanSecret = this.credentials.clientSecret.trim();
    this.log('Authenticating cTrader Open API Application (2100)...', 'SYSTEM');

    await this.sendRequest(PAYLOAD_TYPE.APPLICATION_AUTH_REQ, {
      clientId: cleanClientId,
      clientSecret: cleanSecret,
    });

    this.log(`cTrader Open API application authenticated (${this.lastPingMs}ms latency).`, 'SYSTEM');
  }

  async initialize(credentials) {
    this.credentials = {
      clientId: (credentials.clientId || '').trim(),
      clientSecret: (credentials.clientSecret || '').trim(),
      accessToken: (credentials.accessToken || '').trim(),
      refreshToken: (credentials.refreshToken || '').trim(),
    };

    if (!this.credentials.clientId || !this.credentials.clientSecret || !this.credentials.accessToken) {
      throw new Error('กรุณากรอก Client ID, Client Secret และ Access Token ให้ครบถ้วน');
    }

    await this.connectSocket('demo');

    this.log('Fetching linked Live & Demo trading accounts (2149)...', 'INFO');
    const res = await this.sendRequest(PAYLOAD_TYPE.GET_ACCOUNTS_BY_ACCESS_TOKEN_REQ, {
      accessToken: this.credentials.accessToken,
    });

    const rawAccounts = res?.ctidTraderAccount || [];
    this.accounts = rawAccounts.map((acc) => ({
      ctidTraderAccountId: Number(acc.ctidTraderAccountId),
      traderLogin: acc.traderLogin ? String(acc.traderLogin) : String(acc.ctidTraderAccountId),
      isLive: Boolean(acc.isLive),
      env: acc.isLive ? 'live' : 'demo',
    }));

    this.log(
      `Loaded ${this.accounts.length} account(s): ${
        this.accounts.map((a) => `#${a.traderLogin} (${a.isLive ? 'LIVE' : 'DEMO'})`).join(', ') ||
        'None'
      }`,
      'SYSTEM'
    );

    this.onAccountsLoaded(this.accounts);

    if (this.accounts.length === 0) {
      this.onStatusChange({
        state: 'connected_no_accounts',
        env: this.currentEnv,
        openApiStatus: 'No Accounts Found',
        pingMs: this.lastPingMs,
        lastSync: formatSyncTime(),
      });
      return [];
    }

    return this.accounts;
  }

  async selectAccount(account) {
    if (!account) return;
    const targetEnv = account.isLive ? 'live' : 'demo';
    this.selectedAccount = account;

    // Reset per-account caches
    this.symbolsMap.clear();
    this.spotPrices.clear();
    this.subscribedSymbols.clear();
    this.rawPositions = [];
    this.rawOrders = [];
    this.unrealizedPnlMap.clear();
    if (this.pnlInterval) {
      clearInterval(this.pnlInterval);
      this.pnlInterval = null;
    }

    // Switch WebSocket server if needed (Live vs Demo)
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.currentEnv !== targetEnv) {
      this.log(
        `Switching endpoint to ${targetEnv.toUpperCase()} for account #${account.traderLogin}...`,
        'SYSTEM'
      );
      await this.connectSocket(targetEnv);
    }

    const ctidTraderAccountId = Number(account.ctidTraderAccountId);
    this.log(
      `Authorizing ${account.isLive ? 'LIVE' : 'DEMO'} account #${account.traderLogin}...`,
      'INFO'
    );

    await this.sendRequest(PAYLOAD_TYPE.ACCOUNT_AUTH_REQ, {
      ctidTraderAccountId,
      accessToken: this.credentials.accessToken,
    });

    this.onStatusChange({
      state: 'authenticated',
      env: targetEnv,
      account,
      openApiStatus: 'Connected',
      pingMs: this.lastPingMs,
      lastSync: formatSyncTime(),
    });

    // 1. Load Symbols List
    try {
      const symRes = await this.sendRequest(PAYLOAD_TYPE.SYMBOLS_LIST_REQ, {
        ctidTraderAccountId,
        includeArchivedSymbols: false,
      });
      const symbols = symRes?.symbol || [];
      for (const s of symbols) {
        this.symbolsMap.set(Number(s.symbolId), {
          symbolId: Number(s.symbolId),
          symbolName: s.symbolName || `SYM_${s.symbolId}`,
          digits: 5,
          lotSize: 10000000,
        });
      }
      this.log(`Synchronized ${symbols.length} market symbols for #${account.traderLogin}.`, 'INFO');
    } catch (err) {
      this.log(`Symbols sync note: ${err.message}`, 'RISK');
    }

    // 2. Load Trader Profile (Balance, Broker Name, Leverage)
    await this.fetchTraderInfo(ctidTraderAccountId);

    // 3. Reconcile Active Positions & Orders
    await this.reconcileAccount(ctidTraderAccountId);

    // 4. Load Closed Deal History for Trade History, Statistics & Daily Performance Calendar
    await this.fetchRecentDeals(ctidTraderAccountId);

    // 5. Poll Unrealized PnL every 3s when positions are open
    this.pnlInterval = setInterval(() => {
      if (
        this.ws &&
        this.ws.readyState === WebSocket.OPEN &&
        this.selectedAccount?.ctidTraderAccountId === ctidTraderAccountId
      ) {
        if (this.rawPositions.length > 0) {
          this.fetchUnrealizedPnl(ctidTraderAccountId).catch(() => {});
        }
      }
    }, 3000);
  }

  async fetchTraderInfo(ctidTraderAccountId) {
    const res = await this.sendRequest(PAYLOAD_TYPE.TRADER_REQ, {
      ctidTraderAccountId,
    });
    const trader = res?.trader || res || {};
    const moneyDigits = trader.moneyDigits !== undefined ? Number(trader.moneyDigits) : 2;
    const scale = Math.pow(10, moneyDigits);
    const balance = Number(trader.balance || 0) / scale;
    const leverage = trader.leverageInCents ? Number(trader.leverageInCents) / 100 : 100;

    this.traderInfo = {
      balance,
      moneyDigits,
      leverage,
      traderLogin: trader.traderLogin
        ? String(trader.traderLogin)
        : this.selectedAccount?.traderLogin,
      brokerName: trader.brokerName || 'cTrader Broker',
      registrationTimestamp: trader.registrationTimestamp
        ? Number(trader.registrationTimestamp)
        : 0,
    };

    this.emitPortfolioAndPositions();
  }

  async reconcileAccount(ctidTraderAccountId) {
    const res = await this.sendRequest(PAYLOAD_TYPE.RECONCILE_REQ, {
      ctidTraderAccountId,
    });

    this.rawPositions = res?.position || [];
    this.rawOrders = res?.order || [];

    this.log(
      `Account #${this.selectedAccount?.traderLogin}: ${this.rawPositions.length} active position(s) reconciled.`,
      'TRADE'
    );

    const neededSymbolIds = [
      ...new Set(
        this.rawPositions.map((p) => Number(p.tradeData?.symbolId)).filter((id) => Boolean(id))
      ),
    ];

    if (neededSymbolIds.length > 0) {
      await this.loadDetailedSymbols(ctidTraderAccountId, neededSymbolIds);

      const toSubscribe = neededSymbolIds.filter((id) => !this.subscribedSymbols.has(id));
      if (toSubscribe.length > 0) {
        try {
          await this.sendRequest(PAYLOAD_TYPE.SUBSCRIBE_SPOTS_REQ, {
            ctidTraderAccountId,
            symbolId: toSubscribe,
          });
          toSubscribe.forEach((id) => this.subscribedSymbols.add(id));
        } catch (err) {
          this.log(`Spot feed warning: ${err.message}`, 'RISK');
        }
      }
    }

    if (this.rawPositions.length > 0) {
      await this.fetchUnrealizedPnl(ctidTraderAccountId);
    } else {
      this.unrealizedPnlMap.clear();
      this.emitPortfolioAndPositions();
    }
  }

  async loadDetailedSymbols(ctidTraderAccountId, symbolIds) {
    if (!symbolIds || symbolIds.length === 0) return;
    try {
      const symDetailRes = await this.sendRequest(PAYLOAD_TYPE.SYMBOL_BY_ID_REQ, {
        ctidTraderAccountId,
        symbolId: symbolIds,
      });
      for (const sym of symDetailRes?.symbol || []) {
        const existing = this.symbolsMap.get(Number(sym.symbolId)) || {};
        this.symbolsMap.set(Number(sym.symbolId), {
          ...existing,
          symbolId: Number(sym.symbolId),
          symbolName: existing.symbolName || sym.symbolName || `SYM_${sym.symbolId}`,
          digits: sym.digits !== undefined ? Number(sym.digits) : 5,
          lotSize: sym.lotSize ? Number(sym.lotSize) : 10000000,
           loadedDetails: true,
        });
      }
    } catch {
      // ignore if symbol details unavailable
    }
  }

  async fetchUnrealizedPnl(ctidTraderAccountId) {
    const res = await this.sendRequest(PAYLOAD_TYPE.GET_POSITION_UNREALIZED_PNL_REQ, {
      ctidTraderAccountId,
    });
    const moneyDigits =
      res?.moneyDigits !== undefined ? Number(res.moneyDigits) : this.traderInfo.moneyDigits;
    const scale = Math.pow(10, moneyDigits);
    const list = res?.positionUnrealizedPnL || [];

    this.unrealizedPnlMap.clear();
    for (const item of list) {
      const posId = Number(item.positionId);
      const gross = Number(item.grossUnrealizedPnL || 0) / scale;
      const net = Number(item.netUnrealizedPnL || 0) / scale;
      this.unrealizedPnlMap.set(posId, { gross, net });
    }

    this.onStatusChange({
      state: 'authenticated',
      env: this.currentEnv,
      account: this.selectedAccount,
      openApiStatus: 'Connected',
      pingMs: this.lastPingMs,
      lastSync: formatSyncTime(),
    });

    this.emitPortfolioAndPositions();
  }

  async fetchRecentDeals(ctidTraderAccountId) {
    try {
      const now = Date.now();
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      const accountStartTs =
        this.traderInfo.registrationTimestamp && this.traderInfo.registrationTimestamp > 0
          ? this.traderInfo.registrationTimestamp
          : oneYearAgo;

      this.log(
        `Fetching complete trade history since account opened (${formatDateYYYYMMDD(
          accountStartTs
        )})...`,
        'INFO'
      );

      const dealsById = new Map();

      // Try full range first (with pagination if hasMore is true); fallback to 30-day chunks if server restricts window size
      let fullRangeSucceeded = false;
      try {
        let cursorTo = now;
        let safetyLoops = 0;
        while (cursorTo > accountStartTs && safetyLoops < 20) {
          safetyLoops++;
          const res = await this.sendRequest(PAYLOAD_TYPE.DEAL_LIST_REQ, {
            ctidTraderAccountId,
            fromTimestamp: accountStartTs,
            toTimestamp: cursorTo,
            maxRows: 2000,
          });
          const batch = res?.deal || [];
          for (const d of batch) {
            dealsById.set(String(d.dealId), d);
          }
          if (!res?.hasMore || batch.length === 0) {
            break;
          }
          const timestamps = batch
            .map((d) => Number(d.executionTimestamp || 0))
            .filter((t) => t > 0);
          if (timestamps.length === 0) break;
          const minTs = Math.min(...timestamps);
          if (minTs >= cursorTo) break;
          cursorTo = minTs - 1;
        }
        fullRangeSucceeded = true;
      } catch {
        // Server restricts time window per request; walk in 30-day windows from accountStartTs to now
        fullRangeSucceeded = false;
      }

      if (!fullRangeSucceeded) {
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        let winEnd = now;
        let chunks = 0;
        // Walk backwards from now to accountStartTs so most recent deals load first
        while (winEnd > accountStartTs && chunks < 36) {
          chunks++;
          const winStart = Math.max(accountStartTs, winEnd - thirtyDaysMs);
          try {
            const res = await this.sendRequest(PAYLOAD_TYPE.DEAL_LIST_REQ, {
              ctidTraderAccountId,
              fromTimestamp: winStart,
              toTimestamp: winEnd,
              maxRows: 1000,
            });
            for (const d of res?.deal || []) {
              dealsById.set(String(d.dealId), d);
            }
          } catch {
            // continue to next window
          }
          winEnd = winStart - 1;
        }
      }

      const allRawDeals = Array.from(dealsById.values());
      const closingDeals = allRawDeals.filter((d) => d.closePositionDetail);

      // Load accurate lotSize & digits for symbols in trade history
      const dealSymbolIds = [
        ...new Set(
          closingDeals
            .map((d) => Number(d.symbolId))
            .filter((id) => id && !this.symbolsMap.get(id)?.loadedDetails)
        ),
      ];
      if (dealSymbolIds.length > 0) {
        await this.loadDetailedSymbols(ctidTraderAccountId, dealSymbolIds.slice(0, 50));
      }

      const formattedDeals = closingDeals
        .map((d) => {
          const symId = Number(d.symbolId);
          const symInfo = this.symbolsMap.get(symId) || {
            symbolName: `SYM_${symId}`,
            digits: 5,
            lotSize: 10000000,
          };
          const detail = d.closePositionDetail;
          const moneyDigits =
            detail.moneyDigits !== undefined
              ? Number(detail.moneyDigits)
              : this.traderInfo.moneyDigits;
          const scale = Math.pow(10, moneyDigits);
          const grossProfit = Number(detail.grossProfit || 0) / scale;
          const swap = Number(detail.swap || 0) / scale;
          const commission = Number(detail.commission || 0) / scale;
          const netProfit = grossProfit + swap + commission;

          // Closing deal side is opposite to the original position side
          const dealSide =
            d.tradeSide === 1 ||
            d.tradeSide === 'BUY' ||
            d.tradeSide === 'PROTO_OA_TRADE_SIDE_BUY'
              ? 'SELL'
              : 'BUY';
          const closedVolume = Number(detail.closedVolume || d.volume || 0) / symInfo.lotSize;
          const ts = Number(d.executionTimestamp || Date.now());

          return {
            id: String(d.dealId),
            date: formatDateYYYYMMDD(ts),
            timestamp: ts,
            symbol: symInfo.symbolName,
            type: dealSide,
            volume: Number(closedVolume.toFixed(2)),
            openPrice: Number(detail.entryPrice || 0),
            closePrice: Number(d.executionPrice || 0),
            profit: Number(netProfit.toFixed(2)),
            digits: symInfo.digits || 5,
          };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

      this.log(
        `Loaded ${formattedDeals.length} closed trade(s) since account opened (${formatDateYYYYMMDD(
          accountStartTs
        )}).`,
        'INFO'
      );
      this.onDealsUpdate(formattedDeals);
    } catch (err) {
      this.log(`Could not load trade history: ${err.message}`, 'RISK');
    }
  }

  emitPortfolioAndPositions() {
    let totalNetProfit = 0;
    let totalExposureLots = 0;
    let totalUsedMargin = 0;

    const formattedPositions = this.rawPositions.map((pos) => {
      const posId = Number(pos.positionId);
      const tradeData = pos.tradeData || {};
      const symbolId = Number(tradeData.symbolId);
      const symInfo = this.symbolsMap.get(symbolId) || {
        symbolName: `ID:${symbolId}`,
        digits: 5,
        lotSize: 10000000,
      };

      const isBuy =
        tradeData.tradeSide === 1 ||
        tradeData.tradeSide === 'BUY' ||
        tradeData.tradeSide === 'PROTO_OA_TRADE_SIDE_BUY';
      const type = isBuy ? 'BUY' : 'SELL';

      const rawVolume = Number(tradeData.volume || 0);
      const lots = symInfo.lotSize > 0 ? rawVolume / symInfo.lotSize : rawVolume / 10000000;
      totalExposureLots += lots;

      const openPrice = Number(pos.price || 0);
      const spot = this.spotPrices.get(symbolId);
      let currentPrice = openPrice;
      if (spot) {
        currentPrice = isBuy ? spot.bid || openPrice : spot.ask || openPrice;
      }

      const pnlObj = this.unrealizedPnlMap.get(posId) || { gross: 0, net: 0 };
      totalNetProfit += pnlObj.net;

      const moneyDigits =
        pos.moneyDigits !== undefined ? Number(pos.moneyDigits) : this.traderInfo.moneyDigits;
      const scale = Math.pow(10, moneyDigits);
      const usedMargin = Number(pos.usedMargin || 0) / scale;
      totalUsedMargin += usedMargin;

      return {
        id: String(posId),
        symbolId,
        symbol: symInfo.symbolName,
        digits: symInfo.digits || 5,
        type,
        volume: Number(lots.toFixed(2)),
        openPrice,
        currentPrice,
        sl: Number(pos.stopLoss || 0),
        tp: Number(pos.takeProfit || 0),
        profit: Number(pnlObj.net.toFixed(2)),
      };
    });

    const balance = this.traderInfo.balance;
    const equity = Number((balance + totalNetProfit).toFixed(2));
    const freeMargin = Number((equity - totalUsedMargin).toFixed(2));
    const marginLevel =
      totalUsedMargin > 0 ? Number(((equity / totalUsedMargin) * 100).toFixed(1)) : 0;
    const dailyDrawdown =
      totalNetProfit < 0 && balance > 0
        ? Number(((Math.abs(totalNetProfit) / balance) * 100).toFixed(2))
        : 0;

    this.onPortfolioUpdate({
      balance: Number(balance.toFixed(2)),
      equity,
      unrealizedProfit: Number(totalNetProfit.toFixed(2)),
      freeMargin,
      marginLevel,
      dailyDrawdown,
      totalExposureLots: Number(totalExposureLots.toFixed(2)),
      leverage: this.traderInfo.leverage,
      traderLogin: this.traderInfo.traderLogin,
      brokerName: this.traderInfo.brokerName,
      registrationTimestamp: this.traderInfo.registrationTimestamp || 0,
      isLive: this.selectedAccount?.isLive ?? false,
    });

    this.onPositionsUpdate(formattedPositions);
  }

  handleIncomingMessage(rawData) {
    let data;
    try {
      data = JSON.parse(rawData);
    } catch {
      return;
    }

    const { clientMsgId, payloadType, payload } = data;

    if (payloadType === PAYLOAD_TYPE.HEARTBEAT_EVENT) {
      this.sendHeartbeat();
      return;
    }

    if (clientMsgId && this.pendingRequests.has(clientMsgId)) {
      const pending = this.pendingRequests.get(clientMsgId);
      clearTimeout(pending.timer);
      this.pendingRequests.delete(clientMsgId);
      this.lastPingMs = Math.max(1, Math.round(performance.now() - pending.sentAt));

      if (payloadType === PAYLOAD_TYPE.ERROR_RES || payloadType === PAYLOAD_TYPE.OA_ERROR_RES) {
        const errCode = payload?.errorCode || 'API_ERROR';
        const errDesc = payload?.description || 'Unknown cTrader API error';
        this.log(`API Error [${errCode}]: ${errDesc}`, 'RISK');
        pending.reject(new Error(`${errCode}: ${errDesc}`));
      } else {
        pending.resolve(payload);
      }
      return;
    }

    if (payloadType === PAYLOAD_TYPE.SPOT_EVENT && payload) {
      const symbolId = Number(payload.symbolId);
      const prev = this.spotPrices.get(symbolId) || {};
      const bid = payload.bid ? Number(payload.bid) / 100000 : prev.bid;
      const ask = payload.ask ? Number(payload.ask) / 100000 : prev.ask;
      this.spotPrices.set(symbolId, { bid, ask });
      if (this.rawPositions.some((p) => Number(p.tradeData?.symbolId) === symbolId)) {
        this.emitPortfolioAndPositions();
      }
    } else if (payloadType === PAYLOAD_TYPE.EXECUTION_EVENT && payload) {
      this.log(
        `Execution event (${payload.executionType || 'UPDATE'}) detected. Synchronizing account...`,
        'TRADE'
      );
      if (this.selectedAccount) {
        const ctid = Number(this.selectedAccount.ctidTraderAccountId);
        this.fetchTraderInfo(ctid).catch(() => {});
        this.reconcileAccount(ctid).catch(() => {});
        this.fetchRecentDeals(ctid).catch(() => {});
      }
    }
  }
}
