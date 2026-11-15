import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CTraderSocketManager } from './services/ctraderApi';

const STORAGE_KEY = 'singularity_ctrader_credentials_v1';
const SELECTED_ACC_KEY = 'singularity_ctrader_selected_account_v1';

const DEFAULT_CREDENTIALS = {
  clientId: import.meta.env.VITE_CTRADER_CLIENT_ID || '',
  clientSecret: import.meta.env.VITE_CTRADER_CLIENT_SECRET || '',
  accessToken:
    import.meta.env.VITE_CTRADER_ACCESS_TOKEN ||
    'JqC8sVot91zI3ilvhHkZolF2Q7CD8SotxDMklD_8O8U',
  refreshToken:
    import.meta.env.VITE_CTRADER_REFRESH_TOKEN ||
    'FSmaaQFoKliSG9wTCJKsiJm3yQ7LdkvcecDOLnd0ZoE',
};

const INITIAL_FALLBACK_POSITIONS = [
  {
    id: '1001',
    symbol: 'EURUSD',
    type: 'BUY',
    volume: 0.1,
    openPrice: 1.085,
    currentPrice: 1.0865,
    sl: 1.082,
    tp: 1.091,
    profit: 15,
    digits: 5,
  },
  {
    id: '1002',
    symbol: 'XAUUSD',
    type: 'SELL',
    volume: 0.05,
    openPrice: 2020.5,
    currentPrice: 2018.2,
    sl: 2028,
    tp: 2005,
    profit: -2.3,
    digits: 2,
  },
];

const INITIAL_FALLBACK_HISTORY = [
  { id: 'H001', date: '2026-11-08', symbol: 'GBPUSD', type: 'SELL', volume: 0.1, openPrice: 1.265, closePrice: 1.261, profit: 40, digits: 5 },
  { id: 'H002', date: '2026-11-07', symbol: 'USDJPY', type: 'BUY', volume: 0.05, openPrice: 150.2, closePrice: 150.0, profit: -10.5, digits: 3 },
  { id: 'H003', date: '2026-11-05', symbol: 'EURUSD', type: 'BUY', volume: 0.2, openPrice: 1.08, closePrice: 1.085, profit: 100, digits: 5 },
  { id: 'H004', date: '2026-10-28', symbol: 'XAUUSD', type: 'SELL', volume: 0.05, openPrice: 2020.5, closePrice: 2010.0, profit: 52.5, digits: 2 },
  { id: 'H005', date: '2026-10-25', symbol: 'EURUSD', type: 'BUY', volume: 0.1, openPrice: 1.082, closePrice: 1.08, profit: -20, digits: 5 },
  { id: 'H006', date: '2026-11-01', symbol: 'XAUUSD', type: 'BUY', volume: 0.05, openPrice: 2000.0, closePrice: 2005.0, profit: 25, digits: 2 },
  { id: 'H007', date: '2026-11-02', symbol: 'EURUSD', type: 'SELL', volume: 0.1, openPrice: 1.09, closePrice: 1.092, profit: -20, digits: 5 },
  { id: 'H008', date: '2026-11-03', symbol: 'GBPUSD', type: 'BUY', volume: 0.1, openPrice: 1.26, closePrice: 1.265, profit: 50, digits: 5 },
];

const INITIAL_LOGS = [
  { time: '13:58:12', level: 'INFO', msg: 'Market scan complete. Volatility within acceptable parameters.' },
  { time: '13:55:04', level: 'SIGNAL', msg: 'XAUUSD M15 resistance rejection detected at 2021.10.' },
  { time: '13:50:30', level: 'SYSTEM', msg: 'cTrader Open API ping verified: 18ms latency stable.' },
  { time: '13:42:15', level: 'TRADE', msg: 'Order #1002 filled: SELL 0.05 XAUUSD @ 2020.50.' },
  { time: '13:30:00', level: 'RISK', msg: 'Account Margin Level: 1492.3% (Safe threshold > 300%).' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const HISTORY_PAGE_SIZE = 10;

const Dashboard = () => {
  const [showChart, setShowChart] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [calendarDate, setCalendarDate] = useState(new Date('2026-11-01'));
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');

  // Load saved API credentials
  const [credentials, setCredentials] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          clientId: parsed.clientId || DEFAULT_CREDENTIALS.clientId,
          clientSecret: parsed.clientSecret || DEFAULT_CREDENTIALS.clientSecret,
          accessToken: parsed.accessToken || DEFAULT_CREDENTIALS.accessToken,
          refreshToken: parsed.refreshToken || DEFAULT_CREDENTIALS.refreshToken,
        };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CREDENTIALS;
  });

  // System & Connection status
  const [systemStatus, setSystemStatus] = useState({
    status: 'ONLINE',
    strategy: 'Singularity Trend & Momentum v2.1',
    pingMs: 18,
    lastSync: '14:00:24 UTC+7',
    openApiStatus: 'Disconnected',
    state: 'disconnected',
  });

  // Accounts list (both Live & Demo)
  const [accounts, setAccounts] = useState([]);
  const [accountFilter, setAccountFilter] = useState('ALL'); // 'ALL' | 'LIVE' | 'DEMO'
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    return Number(localStorage.getItem(SELECTED_ACC_KEY)) || null;
  });

  // Portfolio, Active Positions, Trade History, Telemetry Logs
  const [portfolio, setPortfolio] = useState({
    balance: 2038.78,
    equity: 2481.77,
    unrealizedProfit: 442.99,
    freeMargin: 2315.4,
    marginLevel: 1492.3,
    dailyDrawdown: 1.15,
    totalExposureLots: 0.15,
    brokerName: 'IC Markets',
    traderLogin: '4092817',
    isLive: true,
  });

  const [openPositions, setOpenPositions] = useState(INITIAL_FALLBACK_POSITIONS);
  const [tradeHistory, setTradeHistory] = useState(INITIAL_FALLBACK_HISTORY);
  const [logs, setLogs] = useState(INITIAL_LOGS);

  const managerRef = useRef(null);

  useEffect(() => {
    const manager = new CTraderSocketManager({
      onStatusChange: (statusUpdate) => {
        setSystemStatus((prev) => ({
          ...prev,
          state: statusUpdate.state || prev.state,
          openApiStatus: statusUpdate.openApiStatus || prev.openApiStatus,
          pingMs: statusUpdate.pingMs ?? prev.pingMs,
          lastSync: statusUpdate.lastSync || prev.lastSync,
        }));
      },
      onAccountsLoaded: (loadedAccounts) => {
        setAccounts(loadedAccounts);
      },
      onPortfolioUpdate: (data) => {
        setPortfolio((prev) => ({
          ...prev,
          ...data,
        }));
      },
      onPositionsUpdate: (positions) => {
        setOpenPositions(positions);
      },
      onDealsUpdate: (deals) => {
        setTradeHistory(deals);
        setHistoryPage(1);
        // Jump calendar to the month of the most recent deal if deals exist
        if (deals.length > 0 && deals[0].date) {
          const [y, m] = deals[0].date.split('-').map(Number);
          if (y && m) {
            setCalendarDate(new Date(y, m - 1, 1));
          }
        }
      },
      onLog: (entry) => {
        setLogs((prev) => [entry, ...prev.slice(0, 99)]);
      },
    });

    managerRef.current = manager;

    if (credentials.clientId && credentials.clientSecret && credentials.accessToken) {
      connectToCTrader(credentials, manager);
    }

    return () => {
      manager.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectToCTrader = async (credsToUse = credentials, managerInstance = managerRef.current) => {
    if (!managerInstance) return;
    setErrorBanner('');

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(credsToUse));
      const accList = await managerInstance.initialize(credsToUse);

      if (accList.length > 0) {
        const savedId = Number(localStorage.getItem(SELECTED_ACC_KEY));
        const targetAcc =
          accList.find((a) => a.ctidTraderAccountId === savedId) || accList[0];
        setSelectedAccountId(targetAcc.ctidTraderAccountId);
        localStorage.setItem(SELECTED_ACC_KEY, String(targetAcc.ctidTraderAccountId));
        await managerInstance.selectAccount(targetAcc);
      }
    } catch (err) {
      setErrorBanner(err.message || 'ไม่สามารถเชื่อมต่อ cTrader Open API ได้');
      setSystemStatus((prev) => ({
        ...prev,
        state: 'error',
        openApiStatus: 'Auth Error',
      }));
    }
  };

  const handleSelectAccount = async (ctidTraderAccountId) => {
    const numId = Number(ctidTraderAccountId);
    const targetAcc = accounts.find((a) => a.ctidTraderAccountId === numId);
    if (!targetAcc || !managerRef.current) return;

    setErrorBanner('');
    setSelectedAccountId(numId);
    localStorage.setItem(SELECTED_ACC_KEY, String(numId));

    try {
      await managerRef.current.selectAccount(targetAcc);
    } catch (err) {
      setErrorBanner(`เกิดข้อผิดพลาดในการสลับบัญชี #${targetAcc.traderLogin}: ${err.message}`);
    }
  };

  const handleFilterChange = (newFilter) => {
    setAccountFilter(newFilter);
    if (newFilter !== 'ALL') {
      const wantLive = newFilter === 'LIVE';
      const currentAcc = accounts.find((a) => a.ctidTraderAccountId === selectedAccountId);
      if (currentAcc && currentAcc.isLive !== wantLive) {
        const firstMatching = accounts.find((a) => a.isLive === wantLive);
        if (firstMatching) {
          handleSelectAccount(firstMatching.ctidTraderAccountId);
        }
      }
    }
  };

  const filteredAccounts = useMemo(() => {
    if (accountFilter === 'LIVE') return accounts.filter((a) => a.isLive);
    if (accountFilter === 'DEMO') return accounts.filter((a) => !a.isLive);
    return accounts;
  }, [accounts, accountFilter]);

  const liveCount = useMemo(() => accounts.filter((a) => a.isLive).length, [accounts]);
  const demoCount = useMemo(() => accounts.filter((a) => !a.isLive).length, [accounts]);

  // Filter Trade History by Start Date & End Date
  const filteredHistory = useMemo(() => {
    return tradeHistory.filter((trade) => {
      if (!startDate && !endDate) return true;
      const tradeDate = new Date(trade.date);
      const start = startDate ? new Date(startDate) : new Date('2000-01-01');
      const end = endDate ? new Date(endDate) : new Date('2100-01-01');
      return tradeDate >= start && tradeDate <= end;
    });
  }, [tradeHistory, startDate, endDate]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedHistory = useMemo(() => {
    const startIdx = (safeHistoryPage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(startIdx, startIdx + HISTORY_PAGE_SIZE);
  }, [filteredHistory, safeHistoryPage]);

  // Calculate Statistics dynamically from filteredHistory
  const stats = useMemo(() => {
    const totalTrades = filteredHistory.length;
    const wins = filteredHistory.filter((t) => t.profit > 0);
    const losses = filteredHistory.filter((t) => t.profit <= 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));
    const netProfit = grossProfit - grossLoss;

    // Calculate Max Drawdown % from cumulative PnL curve relative to current/starting balance
    let peak = Math.max(portfolio.balance - netProfit, 100);
    let running = peak;
    let maxDdPct = 0;
    const chronological = [...filteredHistory].reverse();
    for (const t of chronological) {
      running += t.profit;
      if (running > peak) peak = running;
      const dd = peak > 0 ? ((peak - running) / peak) * 100 : 0;
      if (dd > maxDdPct) maxDdPct = dd;
    }

    return {
      totalTrades,
      winRate: totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(1) : 0,
      profitFactor:
        grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00',
      netProfit,
      grossProfit,
      grossLoss,
      maxDrawdown: maxDdPct > 0 ? maxDdPct.toFixed(1) : '0.0',
      avgWin: wins.length > 0 ? (grossProfit / wins.length).toFixed(2) : '0.00',
      avgLoss: losses.length > 0 ? (grossLoss / losses.length).toFixed(2) : '0.00',
    };
  }, [filteredHistory, portfolio.balance]);

  // Daily Performance Calendar calculations
  const currentYear = calendarDate.getFullYear();
  const currentMonth = calendarDate.getMonth();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const handlePrevMonth = () => setCalendarDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setCalendarDate(new Date(currentYear, currentMonth + 1, 1));

  const dailyPerformance = useMemo(() => {
    const map = {};
    tradeHistory.forEach((t) => {
      map[t.date] = (map[t.date] || 0) + t.profit;
    });
    return map;
  }, [tradeHistory]);

  // Build weekly rows (Sun-Sat + 8th column for Weekly Summary) and Monthly Total
  const { calendarWeeks, monthlySummary } = useMemo(() => {
    const totalSlots = firstDayOfMonth + daysInMonth;
    const numWeeks = Math.ceil(totalSlots / 7);
    const weeks = [];
    let monthTotalPnl = 0;
    let monthWinDays = 0;
    let monthLossDays = 0;
    let monthTradedDays = 0;

    for (let w = 0; w < numWeeks; w++) {
      const days = [];
      let weekTotal = 0;
      let weekTradedDays = 0;

      for (let dow = 0; dow < 7; dow++) {
        const slotIdx = w * 7 + dow;
        const dayNum = slotIdx - firstDayOfMonth + 1;
        if (dayNum < 1 || dayNum > daysInMonth) {
          days.push({ isEmpty: true, key: `empty-${w}-${dow}` });
        } else {
          const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(
            2,
            '0'
          )}-${String(dayNum).padStart(2, '0')}`;
          const pnl = dailyPerformance[dateKey];
          if (pnl !== undefined) {
            weekTotal += pnl;
            weekTradedDays += 1;
            monthTotalPnl += pnl;
            monthTradedDays += 1;
            if (pnl >= 0) monthWinDays += 1;
            else monthLossDays += 1;
          }
          days.push({
            isEmpty: false,
            day: dayNum,
            dateKey,
            pnl,
          });
        }
      }

      weeks.push({
        weekNum: w + 1,
        days,
        weekTotal,
        tradedDays: weekTradedDays,
      });
    }

    return {
      calendarWeeks: weeks,
      monthlySummary: {
        totalPnl: monthTotalPnl,
        winDays: monthWinDays,
        lossDays: monthLossDays,
        tradedDays: monthTradedDays,
      },
    };
  }, [firstDayOfMonth, daysInMonth, currentYear, currentMonth, dailyPerformance]);

  const isConnected = systemStatus.state === 'authenticated';

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white p-4 lg:p-6 font-sans">
      {/* Header */}
      <header className="w-full mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
            A.Singularity Trading
          </h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
            <span>
              Strategy: <span className="text-gray-200">{systemStatus.strategy}</span>
            </span>
            <span className="text-gray-600">•</span>
            <span className="text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[10px] uppercase font-semibold">
              Public Read-Only
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Account Type Filter (ALL / LIVE / DEMO) */}
          {accounts.length > 0 && (
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 text-xs">
              <button
                onClick={() => handleFilterChange('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  accountFilter === 'ALL'
                    ? 'bg-white/15 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                ALL ({accounts.length})
              </button>
              <button
                onClick={() => handleFilterChange('LIVE')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  accountFilter === 'LIVE'
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                    : 'text-gray-400 hover:text-emerald-300'
                }`}
              >
                🟢 LIVE ({liveCount})
              </button>
              <button
                onClick={() => handleFilterChange('DEMO')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  accountFilter === 'DEMO'
                    ? 'bg-blue-500/25 text-blue-300 border border-blue-500/40'
                    : 'text-gray-400 hover:text-blue-300'
                }`}
              >
                🔵 DEMO ({demoCount})
              </button>
            </div>
          )}

          {/* Account Selector Dropdown (Live & Demo) */}
          {accounts.length > 0 && (
            <select
              value={selectedAccountId || ''}
              onChange={(e) => handleSelectAccount(Number(e.target.value))}
              className="bg-slate-800/90 border border-white/15 text-white text-xs rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-blue-400"
            >
              {filteredAccounts.map((acc) => (
                <option key={acc.ctidTraderAccountId} value={acc.ctidTraderAccountId}>
                  {acc.isLive ? '🟢 [LIVE]' : '🔵 [DEMO]'} #{acc.traderLogin}
                </option>
              ))}
            </select>
          )}

          {/* API Status & Latency */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 animate-pulse'
                  : systemStatus.state === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-red-400'
              }`}
            />
            <span>
              API: <strong className="text-white">{systemStatus.openApiStatus}</strong>
            </span>
            <span className="text-gray-600">|</span>
            <span>
              Latency: <strong className="text-emerald-400">{systemStatus.pingMs}ms</strong>
            </span>
          </div>

          {/* Last Sync */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-400">
            <span>
              Sync: <strong className="text-gray-200">{systemStatus.lastSync}</strong>
            </span>
          </div>

          {/* cTrader API Credentials Setup Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-xs font-semibold text-blue-300 transition-colors"
          >
            <span>⚙️ ตั้งค่า cTrader API</span>
            {(!credentials.clientId || !credentials.clientSecret) && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {errorBanner && (
        <div className="w-full mb-6 bg-red-500/15 border border-red-500/40 text-red-200 px-5 py-3 rounded-2xl flex justify-between items-center text-xs">
          <span>⚠️ {errorBanner}</span>
          <button
            onClick={() => setErrorBanner('')}
            className="text-red-300 hover:text-white font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal for API Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">
                  ⚙️ ตั้งค่าการเชื่อมต่อ cTrader Open API
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  รองรับการดึงข้อมูลและสลับบัญชีทั้ง Live และ Demo
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-white text-lg font-bold px-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-400 font-semibold mb-1">
                  Client ID (จากหน้า Credentials ของ cTrader)
                </label>
                <input
                  type="text"
                  value={credentials.clientId}
                  onChange={(e) =>
                    setCredentials({ ...credentials, clientId: e.target.value })
                  }
                  placeholder="เช่น 12345_abcde1234567890..."
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1">
                  Client Secret (จากหน้า Credentials ของ cTrader)
                </label>
                <input
                  type="password"
                  value={credentials.clientSecret}
                  onChange={(e) =>
                    setCredentials({ ...credentials, clientSecret: e.target.value })
                  }
                  placeholder="ใส่ Client Secret ของแอป Singularlity"
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1">
                  Access Token (ตั้งค่าให้แล้วจากหน้า Sandbox)
                </label>
                <input
                  type="text"
                  value={credentials.accessToken}
                  onChange={(e) =>
                    setCredentials({ ...credentials, accessToken: e.target.value })
                  }
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-emerald-300 font-mono focus:outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-gray-400 font-semibold mb-1">
                  Refresh Token
                </label>
                <input
                  type="text"
                  value={credentials.refreshToken}
                  onChange={(e) =>
                    setCredentials({ ...credentials, refreshToken: e.target.value })
                  }
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-gray-300 font-mono focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="flex justify-end items-center gap-3 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-gray-300"
              >
                ปิดหน้าต่าง
              </button>
              <button
                onClick={async () => {
                  setShowSettingsModal(false);
                  await connectToCTrader(credentials);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-white shadow-lg"
              >
                💾 บันทึกและเชื่อมต่อ cTrader
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* LEFT COLUMN (3 cols): System Telemetry, Statistics, Currency Converter */}
        <div className="md:col-span-3 space-y-6">
          {/* 1. System Telemetry */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <h2 className="text-gray-400 text-sm uppercase tracking-wider font-semibold mb-4">
              System Telemetry
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-gray-400">Mode</span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium border border-blue-500/20">
                  Fully Automated
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-gray-400">cTrader Backend</span>
                <span className="text-emerald-400 font-mono">
                  {isConnected
                    ? `Connected (${portfolio.isLive ? 'LIVE' : 'DEMO'})`
                    : 'Running (VPS)'}
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-gray-400">Total In-Use Lots</span>
                <span className="font-semibold text-white">
                  {portfolio.totalExposureLots} Lots
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Fail-Safe Guard</span>
                <span className="text-emerald-400 font-semibold">Active</span>
              </div>
            </div>
          </div>

          {/* 2. Statistics */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-gray-400 text-sm uppercase tracking-wider font-semibold">
                Statistics
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  portfolio.isLive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}
              >
                {portfolio.isLive ? 'Live Account' : 'Demo Account'}
              </span>
            </div>

            <div className="mb-5 p-3 rounded-xl bg-black/25 border border-white/5 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Broker:</span>
                <span className="font-semibold text-white tracking-wide">
                  {portfolio.brokerName || 'IC Markets'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Account ID:</span>
                <span className="font-mono text-gray-200">
                  #{portfolio.traderLogin || '4092817'}
                </span>
              </div>

              {/* Account Switcher right inside Statistics Card */}
              {accounts.length > 0 && (
                <div className="pt-2 border-t border-white/10">
                  <label className="text-[11px] text-gray-400 block mb-1">
                    สลับบัญชี (Live / Demo):
                  </label>
                  <select
                    value={selectedAccountId || ''}
                    onChange={(e) => handleSelectAccount(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-400"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.ctidTraderAccountId} value={acc.ctidTraderAccountId}>
                        {acc.isLive ? '🟢 LIVE' : '🔵 DEMO'} - #{acc.traderLogin}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Date Filter */}
            <div className="mb-5 pb-5 border-b border-white/10 space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full bg-black/20 border border-white/10 rounded-lg text-sm px-3 py-2 text-gray-300 focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="w-full bg-black/20 border border-white/10 rounded-lg text-sm px-3 py-2 text-gray-300 focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setHistoryPage(1);
                  }}
                  className="w-full text-xs text-red-400 hover:text-red-300 pt-1"
                >
                  Clear Filter
                </button>
              )}
            </div>

            {/* Stats Metrics */}
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Total Trades</span>
                <span className="font-semibold">{stats.totalTrades}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Win Rate</span>
                <span className="font-semibold text-emerald-400">{stats.winRate}%</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Profit Factor</span>
                <span className="font-semibold text-blue-400">{stats.profitFactor}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Max Drawdown</span>
                <span className="font-semibold text-red-400">-{stats.maxDrawdown}%</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Net Profit</span>
                <span
                  className={`font-bold ${
                    stats.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {stats.netProfit >= 0 ? '+' : ''}$
                  {stats.netProfit.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Gross Profit</span>
                <span className="font-semibold text-emerald-400/80">
                  ${stats.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Gross Loss</span>
                <span className="font-semibold text-red-400/80">
                  -${stats.grossLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/5">
                <span className="text-sm text-gray-400">Avg Win</span>
                <span className="font-medium text-emerald-400/80">${stats.avgWin}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Avg Loss</span>
                <span className="font-medium text-red-400/80">-${stats.avgLoss}</span>
              </div>
            </div>
          </div>

          {/* 3. Currency Converter */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-2xl">
            <h2 className="text-gray-400 text-sm uppercase tracking-wider font-semibold mb-3">
              Currency Converter
            </h2>
            <div className="w-full h-[375px] rounded-2xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center">
              <iframe
                title="Xe FX widget"
                src="https://www.xe.com/currencyconverter/fx-widget?amount=1&from=USD&to=THB"
                width={340}
                height={410}
                scrolling="no"
                className="border-0 scale-90 sm:scale-85 origin-center [filter:invert(0.93)_hue-rotate(180deg)_contrast(1.05)]"
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (9 cols): Top Metrics, TradingView Chart, Active Positions, Trade History, Daily Performance Calendar, Live Bot Telemetry Logs */}
        <div className="md:col-span-9 space-y-6">
          {/* 1. Top 5 Portfolio Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
              <p className="text-gray-400 text-xs font-medium">Balance</p>
              <p className="text-xl md:text-2xl font-bold mt-1">
                ${portfolio.balance.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
              <p className="text-gray-400 text-xs font-medium">Equity</p>
              <p className="text-xl md:text-2xl font-bold mt-1">
                ${portfolio.equity.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
              <p className="text-gray-400 text-xs font-medium">Unrealized P/L</p>
              <p
                className={`text-xl md:text-2xl font-bold mt-1 ${
                  portfolio.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {portfolio.unrealizedProfit >= 0 ? '+' : ''}$
                {portfolio.unrealizedProfit.toLocaleString()}
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
              <p className="text-gray-400 text-xs font-medium">Margin Level</p>
              <p className="text-xl md:text-2xl font-bold mt-1 text-blue-400">
                {portfolio.marginLevel}%
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl col-span-2 md:col-span-1">
              <p className="text-gray-400 text-xs font-medium">Daily DD</p>
              <p className="text-xl md:text-2xl font-bold mt-1 text-amber-400">
                -{portfolio.dailyDrawdown}%
              </p>
            </div>
          </div>

          {/* 2. Live Market Overview (TradingView Advanced Chart) */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl transition-all duration-500">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Live Market Overview</h2>
              <button
                onClick={() => setShowChart(!showChart)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                {showChart ? '👁️ Hide Chart' : '📊 Show Chart'}
              </button>
            </div>
            {showChart && (
              <div className="w-full h-[450px] rounded-xl overflow-hidden border border-white/10 animate-fade-in">
                <tv-advanced-chart
                  allow-symbol-change="true"
                  theme="dark"
                  symbol="ICMARKETS:XAUUSD"
                  autosize="true"
                />
              </div>
            )}
          </div>

          {/* 3. Active Positions */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Active Positions</h2>
              <span className="text-xs text-gray-400 font-mono">Real-time Exposure</span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-gray-400 text-sm border-b border-white/10">
                  <th className="pb-3 font-medium">Symbol</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Volume</th>
                  <th className="pb-3 font-medium">Open Price</th>
                  <th className="pb-3 font-medium">Current Price</th>
                  <th className="pb-3 font-medium">Stop Loss</th>
                  <th className="pb-3 font-medium">Take Profit</th>
                  <th className="pb-3 font-medium text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {openPositions.length > 0 ? (
                  openPositions.map((pos) => (
                    <tr
                      key={pos.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-4 font-medium">{pos.symbol}</td>
                      <td className="py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            pos.type === 'BUY'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {pos.type}
                        </span>
                      </td>
                      <td className="py-4 font-mono">{pos.volume}</td>
                      <td className="py-4 font-mono">
                        {pos.openPrice.toFixed(pos.digits ?? 2)}
                      </td>
                      <td className="py-4 font-mono">
                        {pos.currentPrice.toFixed(pos.digits ?? 2)}
                      </td>
                      <td className="py-4 font-mono text-red-400/80">
                        {pos.sl ? pos.sl.toFixed(pos.digits ?? 2) : '-'}
                      </td>
                      <td className="py-4 font-mono text-emerald-400/80">
                        {pos.tp ? pos.tp.toFixed(pos.digits ?? 2) : '-'}
                      </td>
                      <td
                        className={`py-4 text-right font-bold font-mono ${
                          pos.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-gray-500">
                      No active positions open for this account.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 4. Trade History */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-x-auto">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-300">Trade History</h2>
                <span className="text-xs text-gray-400">
                  {filteredHistory.length > 0
                    ? `แสดงรายการที่ ${(safeHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}–${Math.min(
                        safeHistoryPage * HISTORY_PAGE_SIZE,
                        filteredHistory.length
                      )} จากทั้งหมด ${filteredHistory.length} รายการ (10 รายการ/หน้า)`
                    : 'Showing 0 trades'}
                </span>
              </div>

              {/* Date Range Filter right at the top of Trade History */}
              <div className="flex flex-wrap items-center gap-2 bg-black/25 border border-white/10 rounded-2xl px-3.5 py-2 text-xs">
                <span className="text-gray-400 font-medium">ช่วงวันที่:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-gray-200 focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                />
                <span className="text-gray-500">ถึง</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setHistoryPage(1);
                  }}
                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-gray-200 focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                      setHistoryPage(1);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 font-medium transition-colors"
                  >
                    ล้างวันที่
                  </button>
                )}
              </div>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-gray-400 text-sm border-b border-white/10">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Symbol</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Volume</th>
                  <th className="pb-3 font-medium">Open Price</th>
                  <th className="pb-3 font-medium">Close Price</th>
                  <th className="pb-3 font-medium text-right">Profit / Loss</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredHistory.length > 0 && (
                  <tr className="border-b border-white/10 bg-white/5 font-semibold">
                    <td colSpan="6" className="py-3 text-right text-gray-300">
                      Summary Profit / Loss:
                    </td>
                    <td
                      className={`py-3 text-right text-base font-bold font-mono ${
                        stats.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {stats.netProfit >= 0 ? '+' : ''}$
                      {stats.netProfit.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                )}
                {paginatedHistory.length > 0 ? (
                  paginatedHistory.map((trade) => (
                    <tr
                      key={trade.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors text-gray-300"
                    >
                      <td className="py-4 font-medium">{trade.date}</td>
                      <td className="py-4 font-medium">{trade.symbol}</td>
                      <td className="py-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            trade.type === 'BUY'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-4 font-mono">{trade.volume}</td>
                      <td className="py-4 font-mono">
                        {trade.openPrice.toFixed(trade.digits ?? 5)}
                      </td>
                      <td className="py-4 font-mono">
                        {trade.closePrice.toFixed(trade.digits ?? 5)}
                      </td>
                      <td
                        className={`py-4 text-right font-bold font-mono ${
                          trade.profit >= 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-500">
                      No trades found for the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Bar at bottom of Trade History */}
            {filteredHistory.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
                <span className="text-gray-400">
                  หน้า <strong className="text-white">{safeHistoryPage}</strong> จาก{' '}
                  <strong className="text-white">{totalHistoryPages}</strong> (รวม{' '}
                  {filteredHistory.length} รายการ)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage(1)}
                    disabled={safeHistoryPage <= 1}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    « ล่าสุด
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={safeHistoryPage <= 1}
                    className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 font-medium disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    ‹ ใหม่กว่า
                  </button>
                  <button
                    onClick={() =>
                      setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))
                    }
                    disabled={safeHistoryPage >= totalHistoryPages}
                    className="px-4 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 font-semibold disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    ดูประวัติก่อนหน้า (เก่ากว่า) ›
                  </button>
                  <button
                    onClick={() => setHistoryPage(totalHistoryPages)}
                    disabled={safeHistoryPage >= totalHistoryPages}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  >
                    เก่าสุด »
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. Daily Performance Calendar */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-300">
                  Daily Performance Calendar
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  ข้อมูลกำไร/ขาดทุนรายวันตั้งแต่เริ่มเปิดบัญชี
                  {portfolio.registrationTimestamp > 0
                    ? ` (${new Date(portfolio.registrationTimestamp).toLocaleDateString()})`
                    : ''}{' '}
                  • รวมทั้งหมด {tradeHistory.length} ออเดอร์
                </p>
              </div>
              <div className="flex items-center gap-3 bg-black/20 rounded-xl p-1 border border-white/5">
                <button
                  onClick={handlePrevMonth}
                  className="px-3 py-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                >
                  &lt;
                </button>
                <span className="font-semibold text-sm min-w-[120px] text-center tracking-wide">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="px-3 py-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                >
                  &gt;
                </button>
              </div>
            </div>

            <div className="grid grid-cols-8 gap-2 mb-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
              <div className="text-blue-400">Weekly</div>
            </div>

            <div className="space-y-2">
              {calendarWeeks.map((week) => (
                <div key={`week-${week.weekNum}`} className="grid grid-cols-8 gap-2">
                  {week.days.map((cell) => {
                    if (cell.isEmpty) {
                      return (
                        <div
                          key={cell.key}
                          className="p-2 h-20 sm:h-24 rounded-xl bg-black/15 border border-white/[0.02]"
                        />
                      );
                    }
                    return (
                      <div
                        key={cell.day}
                        className="bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all rounded-xl p-2 h-20 sm:h-24 flex flex-col justify-between group"
                      >
                        <span className="text-xs text-gray-500 font-mono group-hover:text-gray-300">
                          {cell.day}
                        </span>
                        {cell.pnl !== undefined && (
                          <span
                            className={`text-xs sm:text-sm lg:text-base font-bold font-mono text-right ${
                              cell.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {cell.pnl > 0 ? '+' : ''}${cell.pnl.toFixed(2)}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* 8th Column: Weekly Summary Card */}
                  <div
                    className={`rounded-xl p-2 h-20 sm:h-24 flex flex-col justify-between border transition-all ${
                      week.tradedDays === 0
                        ? 'bg-white/[0.03] border-white/10'
                        : week.weekTotal >= 0
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-semibold text-blue-300 font-mono">
                        W{week.weekNum}
                      </span>
                      {week.tradedDays > 0 && (
                        <span className="text-[10px] text-gray-400 font-mono">
                          {week.tradedDays}d
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs sm:text-sm lg:text-base font-bold font-mono text-right ${
                        week.tradedDays === 0
                          ? 'text-gray-500'
                          : week.weekTotal >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {week.tradedDays === 0
                        ? '$0.00'
                        : `${week.weekTotal > 0 ? '+' : ''}$${week.weekTotal.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Row: Monthly Summary Total */}
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-8 gap-2 items-center">
              <div className="sm:col-span-7 flex flex-wrap items-center justify-between gap-3 bg-black/25 border border-white/5 rounded-xl px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-gray-300 font-semibold">
                    สรุปผลประจำเดือน {MONTH_NAMES[currentMonth]} {currentYear}:
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${
                      monthlySummary.tradedDays === 0
                        ? 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                        : monthlySummary.totalPnl >= 0
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-red-500/20 text-red-300 border-red-500/40'
                    }`}
                  >
                    {monthlySummary.tradedDays === 0
                      ? 'NO TRADES'
                      : monthlySummary.totalPnl >= 0
                      ? '🟢 กำไร (PROFIT)'
                      : '🔴 ขาดทุน (LOSS)'}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-gray-400 font-mono">
                  <span>
                    วันกำไร: <strong className="text-emerald-400">{monthlySummary.winDays}</strong>
                  </span>
                  <span>
                    วันขาดทุน: <strong className="text-red-400">{monthlySummary.lossDays}</strong>
                  </span>
                  <span>
                    รวมวันที่เทรด: <strong className="text-white">{monthlySummary.tradedDays}</strong>
                  </span>
                </div>
              </div>

              {/* Bottom-Right Box aligned with Weekly Summary Column */}
              <div
                className={`sm:col-span-1 rounded-xl px-3 py-2.5 border flex flex-col justify-between ${
                  monthlySummary.tradedDays === 0
                    ? 'bg-white/5 border-white/10'
                    : monthlySummary.totalPnl >= 0
                    ? 'bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                    : 'bg-red-500/15 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-300">
                  Monthly Total
                </span>
                <span
                  className={`text-sm lg:text-base font-extrabold font-mono text-right mt-0.5 ${
                    monthlySummary.tradedDays === 0
                      ? 'text-gray-400'
                      : monthlySummary.totalPnl >= 0
                      ? 'text-emerald-400'
                      : 'text-red-400'
                  }`}
                >
                  {monthlySummary.totalPnl > 0 ? '+' : ''}$
                  {monthlySummary.totalPnl.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* 6. LIVE BOT TELEMETRY LOGS */}
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <h2 className="text-sm font-semibold tracking-wide text-gray-300 font-mono">
                  LIVE BOT TELEMETRY LOGS
                </h2>
              </div>
              <span className="text-[11px] text-gray-500 font-mono">Stream Active</span>
            </div>
            <div className="bg-black/80 rounded-xl p-4 font-mono text-xs space-y-2 border border-white/5 max-h-48 overflow-y-auto">
              {logs.map((entry, idx) => (
                <div key={entry.id || idx} className="flex items-start gap-3">
                  <span className="text-gray-500 select-none">[{entry.time}]</span>
                  <span
                    className={`font-bold px-1.5 rounded text-[10px] ${
                      entry.level === 'SIGNAL'
                        ? 'bg-purple-500/20 text-purple-300'
                        : entry.level === 'TRADE'
                        ? 'bg-blue-500/20 text-blue-300'
                        : entry.level === 'RISK'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {entry.level}
                  </span>
                  <span className="text-gray-300">{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
