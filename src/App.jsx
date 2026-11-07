import React, { useState } from 'react';

const Dashboard = () => {
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [portfolio] = useState({
    balance: 2038.78,
    equity: 2481.77,
    unrealizedProfit: 442.99,
  });

  const [openPositions] = useState([
    { id: '1001', symbol: 'EURUSD', type: 'BUY', volume: 0.1, openPrice: 1.0850, currentPrice: 1.0865, profit: 15.00 },
    { id: '1002', symbol: 'XAUUSD', type: 'SELL', volume: 0.05, openPrice: 2020.50, currentPrice: 2018.20, profit: -2.30 },
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white p-6 font-sans">
      <header className="max-w-7xl mx-auto mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
          Singularity Trading Bot
        </h1>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-400">Status:</span>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold shadow-lg ${
            isBotRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'
          }`}>
            {isBotRunning ? '🟢 RUNNING' : '🔴 STOPPED'}
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-3 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
          <div className="space-y-6">
            <h2 className="text-gray-400 text-sm uppercase tracking-wider font-semibold">Control Panel</h2>
            <button 
              onClick={() => setIsBotRunning(!isBotRunning)}
              className={`w-full py-3 rounded-xl font-bold transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.3)] ${
                isBotRunning 
                  ? 'bg-red-500/80 hover:bg-red-500 text-white' 
                  : 'bg-emerald-500/80 hover:bg-emerald-500 text-white'
              }`}
            >
              {isBotRunning ? 'STOP BOT' : 'START BOT'}
            </button>
            
            <nav className="flex flex-col space-y-3 pt-6 border-t border-white/10">
              <a href="#" className="px-4 py-2 rounded-lg bg-white/10 text-white font-medium">📊 Dashboard</a>
              <a href="#" className="px-4 py-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors">⚙️ Settings</a>
              <a href="#" className="px-4 py-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors">📝 Logs</a>
            </nav>
          </div>
        </div>

        <div className="md:col-span-9 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
              <p className="text-gray-400 text-sm font-medium">Balance</p>
              <p className="text-3xl font-bold mt-2">${portfolio.balance.toLocaleString()}</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl"></div>
              <p className="text-gray-400 text-sm font-medium">Equity</p>
              <p className="text-3xl font-bold mt-2">${portfolio.equity.toLocaleString()}</p>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
              <p className="text-gray-400 text-sm font-medium">Unrealized Profit</p>
              <p className={`text-3xl font-bold mt-2 ${portfolio.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {portfolio.unrealizedProfit >= 0 ? '+' : ''}${portfolio.unrealizedProfit.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl overflow-x-auto">
            <h2 className="text-lg font-semibold mb-4">Open Positions</h2>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-gray-400 text-sm border-b border-white/10">
                  <th className="pb-3 font-medium">Symbol</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Volume</th>
                  <th className="pb-3 font-medium">Open Price</th>
                  <th className="pb-3 font-medium">Current Price</th>
                  <th className="pb-3 font-medium text-right">Profit</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {openPositions.map((pos) => (
                  <tr key={pos.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-4 font-medium">{pos.symbol}</td>
                    <td className="py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${pos.type === 'BUY' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                        {pos.type}
                      </span>
                    </td>
                    <td className="py-4">{pos.volume}</td>
                    <td className="py-4">{pos.openPrice.toFixed(5)}</td>
                    <td className="py-4">{pos.currentPrice.toFixed(5)}</td>
                    <td className={`py-4 text-right font-bold ${pos.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ${pos.profit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
