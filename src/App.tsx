import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Settings, 
  History, 
  Activity, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Terminal,
  RefreshCw,
  Wallet,
  TrendingDown,
  DollarSign,
  BarChart3,
  ShieldAlert
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  ComposedChart
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface Log {
  id: number;
  timestamp: string;
  level: string;
  message: string;
}

interface Trade {
  id: number;
  timestamp: string;
  symbol: string;
  side: string;
  price: number;
  amount: number;
  status: string;
}

interface PricePoint {
  time: string;
  price: number;
  upper?: number;
  lower?: number;
  trend?: string;
}

interface BotSettings {
  symbol: string;
  atrPeriod: string;
  multiplier: string;
  amount: string;
  apiKey: string;
  apiSecret: string;
  useTestnet: boolean;
}

const App: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [superTrendHistory, setSuperTrendHistory] = useState<PricePoint[]>([]);
  const [settings, setSettings] = useState<BotSettings>({
    symbol: 'BTC/USDT',
    atrPeriod: '10',
    multiplier: '3.0',
    amount: '10',
    apiKey: '',
    apiSecret: '',
    useTestnet: true
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'trades' | 'settings'>('dashboard');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const result = await chrome.storage.local.get([
        'isRunning', 
        'logs', 
        'trades', 
        'superTrendHistory', 
        'settings'
      ]);
      
      setIsRunning(result.isRunning || false);
      setLogs(result.logs || []);
      setTrades(result.trades || []);
      setSuperTrendHistory(result.superTrendHistory || []);
      if (result.settings) {
        setSettings(result.settings);
      }
    } catch (e) {
      console.error("Fetch error", e);
    }
  };

  const toggleBot = async () => {
    setLoading(true);
    const type = isRunning ? 'STOP_BOT' : 'START_BOT';
    chrome.runtime.sendMessage({ type }, (response) => {
      setIsRunning(!isRunning);
      setLoading(false);
    });
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await chrome.storage.local.set({ settings });
    setLoading(false);
    setActiveTab('dashboard');
  };

  const stats = {
    totalTrades: trades.length,
    lastPrice: superTrendHistory[superTrendHistory.length - 1]?.price || 0,
    sessionPL: trades.reduce((acc, t) => {
      const val = t.price * t.amount;
      return t.side === 'BUY' ? acc - val : acc + val;
    }, 0),
    winRate: (() => {
      const completedTrades = [...trades].reverse();
      let wins = 0;
      let pairs = 0;
      for (let i = 0; i < completedTrades.length - 1; i++) {
        if (completedTrades[i].side === 'BUY' && completedTrades[i+1].side === 'SELL') {
          pairs++;
          if (completedTrades[i+1].price > completedTrades[i].price) wins++;
        }
      }
      return pairs > 0 ? `${Math.round((wins / pairs) * 100)}%` : '0%';
    })()
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 font-sans selection:bg-emerald-500/30">
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-20 bg-[#0a0b0d] border-r border-white/5 flex flex-col items-center py-8 gap-8 z-50">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingUp className="text-black w-7 h-7" />
          </div>
          
          <div className="flex flex-col gap-4">
            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Activity />} label="Dashboard" />
            <NavButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<Terminal />} label="Logs" />
            <NavButton active={activeTab === 'trades'} onClick={() => setActiveTab('trades')} icon={<History />} label="Trades" />
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings />} label="Config" />
          </div>

          <div className="mt-auto mb-4">
            <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-[#050505]">
          <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#0a0b0d]/80 backdrop-blur-md sticky top-0 z-40">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Bybit SuperTrend Bot</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">Status: {isRunning ? 'Active & Monitoring' : 'Paused'}</p>
                {isRunning && logs.some(l => l.message.includes('[DEMO]')) && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded border border-amber-500/20 font-bold uppercase tracking-tighter">Demo Mode</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Current Price</span>
                <span className="text-lg font-bold font-mono text-emerald-400">${stats.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <button 
                onClick={toggleBot}
                disabled={loading}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all duration-300 ${
                  isRunning 
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20' 
                  : 'bg-emerald-500 text-[#0a0b0d] hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
                }`}
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isRunning ? 'Stop Bot' : 'Start Bot'}
              </button>
            </div>
          </header>

          <div className="p-8 max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatCard title="Symbol" value={settings.symbol} icon={<Wallet className="text-blue-400" />} />
                    <StatCard title="Win Rate" value={stats.winRate} icon={<TrendingUp className="text-emerald-400" />} />
                    <StatCard title="Session P/L" value={`${stats.sessionPL >= 0 ? '+' : ''}$${stats.sessionPL.toFixed(2)}`} icon={<DollarSign className={stats.sessionPL >= 0 ? 'text-emerald-400' : 'text-red-400'} />} />
                    <StatCard title="Total Trades" value={stats.totalTrades.toString()} icon={<History className="text-purple-400" />} />
                  </div>

                  {/* Chart Section */}
                  <div className="bg-[#0a0b0d] border border-white/5 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-lg font-bold">Price Action</h3>
                        <p className="text-sm text-gray-500">Real-time market tracking for {settings.symbol}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-widest">Live Feed</span>
                      </div>
                    </div>
                    <div className="h-[400px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={superTrendHistory}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                          <XAxis 
                            dataKey="time" 
                            stroke="#ffffff20" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            minTickGap={50}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            stroke="#ffffff20" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            tickFormatter={(val) => `$${val.toLocaleString()}`}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0a0b0d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                            itemStyle={{ color: '#10b981' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="price" 
                            stroke="#10b981" 
                            strokeWidth={1}
                            fillOpacity={1} 
                            fill="url(#colorPrice)" 
                            animationDuration={500}
                          />
                          <Line 
                            type="stepAfter" 
                            dataKey={(d) => d.trend === 'BUY' ? d.lower : d.upper} 
                            name="SuperTrend"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-[#0a0b0d] border border-white/5 rounded-3xl overflow-hidden">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-bold">Recent Trades</h3>
                        <button onClick={() => setActiveTab('trades')} className="text-xs text-emerald-500 font-bold uppercase hover:underline">View All</button>
                      </div>
                      <div className="divide-y divide-white/5">
                        {trades.slice(0, 5).map((trade) => (
                          <div key={trade.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg ${trade.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                {trade.side === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-sm">{trade.side} {trade.symbol}</p>
                                <p className="text-[10px] text-gray-500 font-mono">{new Date(trade.timestamp).toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">${trade.price.toLocaleString()}</p>
                              <p className="text-[10px] text-gray-500 uppercase">{trade.status}</p>
                            </div>
                          </div>
                        ))}
                        {trades.length === 0 && (
                          <div className="p-12 text-center text-gray-500 text-sm italic">No trades executed yet.</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#0a0b0d] border border-white/5 rounded-3xl overflow-hidden">
                      <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-bold">System Logs</h3>
                        <button onClick={() => setActiveTab('logs')} className="text-xs text-emerald-500 font-bold uppercase hover:underline">View All</button>
                      </div>
                      <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto font-mono text-xs">
                        {logs.slice(0, 10).map((log) => (
                          <div key={log.id} className="flex gap-3 border-b border-white/5 pb-2 last:border-0">
                            <span className="text-gray-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span className={
                              log.level === 'error' ? 'text-red-400' : 
                              log.level === 'success' ? 'text-emerald-400' : 
                              'text-blue-400'
                            }>{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'logs' && (
                <motion.div 
                  key="logs"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-[#0a0b0d] rounded-2xl border border-white/5 overflow-hidden"
                >
                  <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-lg font-medium">System Logs</h2>
                    <button onClick={fetchData} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /></button>
                  </div>
                  <div className="p-6 font-mono text-sm space-y-2 max-h-[600px] overflow-y-auto">
                    {logs.map(log => (
                      <div key={log.id} className="flex gap-4 py-1 border-b border-white/5 last:border-0">
                        <span className="text-gray-600 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={`font-bold shrink-0 w-20 ${log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-emerald-500' : 'text-blue-500'}`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="text-gray-300">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'trades' && (
                <motion.div 
                  key="trades"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-[#0a0b0d] rounded-2xl border border-white/5 overflow-hidden"
                >
                  <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-lg font-medium">Trade History</h2>
                    <button onClick={fetchData} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /></button>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-white/5 text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-6 py-4 font-medium">Time</th>
                        <th className="px-6 py-4 font-medium">Symbol</th>
                        <th className="px-6 py-4 font-medium">Side</th>
                        <th className="px-6 py-4 font-medium">Price</th>
                        <th className="px-6 py-4 font-medium">Amount</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {trades.map(trade => (
                        <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 text-sm text-gray-400">{new Date(trade.timestamp).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm font-medium">{trade.symbol}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${trade.side === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                              {trade.side}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-mono">${trade.price.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm font-mono">{trade.amount}</td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center gap-1.5 text-emerald-500">
                              <CheckCircle2 className="w-3.5 h-3.5" /> {trade.status}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div 
                  key="settings"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="max-w-2xl mx-auto space-y-8"
                >
                  <div className="bg-[#0a0b0d] rounded-2xl border border-white/5 p-8">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="p-3 bg-emerald-500/10 rounded-xl">
                        <Settings className="text-emerald-500 w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold">Bot Configuration</h2>
                        <p className="text-sm text-gray-500">Adjust SuperTrend parameters and trading limits.</p>
                      </div>
                    </div>

                    <form onSubmit={saveSettings} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField 
                          label="Trading Symbol" 
                          value={settings.symbol} 
                          onChange={v => setSettings({...settings, symbol: v})} 
                          placeholder="e.g. BTC/USDT"
                        />
                        <InputField 
                          label="ATR Period" 
                          type="number"
                          value={settings.atrPeriod} 
                          onChange={v => setSettings({...settings, atrPeriod: v})} 
                        />
                        <InputField 
                          label="ATR Multiplier" 
                          type="number"
                          step="0.1"
                          value={settings.multiplier} 
                          onChange={v => setSettings({...settings, multiplier: v})} 
                        />
                        <InputField 
                          label="Trade Amount (USDT)" 
                          type="number"
                          value={settings.amount} 
                          onChange={v => setSettings({...settings, amount: v})} 
                        />
                        <InputField 
                          label="Bybit API Key" 
                          value={settings.apiKey} 
                          onChange={v => setSettings({...settings, apiKey: v})} 
                          placeholder="Tu API Key"
                        />
                        <InputField 
                          label="Bybit API Secret" 
                          value={settings.apiSecret} 
                          onChange={v => setSettings({...settings, apiSecret: v})} 
                          placeholder="Tu API Secret"
                          type="password"
                        />
                        <div className="flex items-center gap-3 mt-4">
                          <input 
                            type="checkbox" 
                            id="useTestnet"
                            checked={settings.useTestnet}
                            onChange={e => setSettings({...settings, useTestnet: e.target.checked})}
                            className="w-5 h-5 rounded bg-white/5 border-white/10 text-emerald-500 focus:ring-emerald-500/20"
                          />
                          <label htmlFor="useTestnet" className="text-sm text-gray-400">Usar Testnet de Bybit</label>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/5 flex flex-col gap-4">
                        <div className="flex gap-4">
                          <button 
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-emerald-500 text-[#0a0b0d] py-3 rounded-xl font-bold hover:bg-emerald-400 transition-all disabled:opacity-50"
                          >
                            {loading ? 'Saving...' : 'Save Configuration'}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setActiveTab('dashboard')}
                            className="px-8 py-3 rounded-xl font-bold border border-white/10 hover:bg-white/5 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                        
                        <button 
                          type="button"
                          onClick={async () => {
                            if (confirm('Are you sure you want to clear all trades and logs?')) {
                              setLoading(true);
                              await chrome.storage.local.set({ trades: [], logs: [] });
                              await fetchData();
                              setLoading(false);
                            }
                          }}
                          className="w-full py-3 rounded-xl font-bold text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-all"
                        >
                          Clear Trade & Log History
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 space-y-4">
                    <div className="flex items-center gap-3 text-emerald-500">
                      <ShieldAlert className="w-6 h-6" />
                      <h3 className="font-bold">Bybit Extension Mode</h3>
                    </div>
                    <p className="text-sm text-gray-400">
                      Este bot corre localmente en tu navegador. Si no configuras las llaves API, funcionará en <strong>Modo Demo</strong> con datos simulados.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`group relative p-3 rounded-xl transition-all duration-300 ${active ? 'bg-emerald-500/10 text-emerald-500' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
  >
    {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
    <span className="absolute left-full ml-4 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap uppercase tracking-widest">
      {label}
    </span>
  </button>
);

const StatCard: React.FC<{ title: string, value: string, icon: React.ReactNode }> = ({ title, value, icon }) => (
  <div className="bg-[#0a0b0d] rounded-2xl border border-white/5 p-6 flex items-center gap-4">
    <div className="p-3 bg-white/5 rounded-xl">
      {icon}
    </div>
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">{title}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  </div>
);

const InputField: React.FC<{ label: string, value: string, onChange: (v: string) => void, type?: string, step?: string, placeholder?: string }> = ({ label, value, onChange, type = 'text', step, placeholder }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{label}</label>
    <input 
      type={type}
      step={step}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
    />
  </div>
);

export default App;
