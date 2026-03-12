import CryptoJS from 'crypto-js';

// Types
interface Trade {
  id?: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  timestamp: number;
  status: string;
}

interface Log {
  id?: number;
  type: 'info' | 'success' | 'error';
  message: string;
  timestamp: number;
}

// Storage Helpers
const getStorage = async (key: string, defaultValue: any) => {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? defaultValue;
};

const setStorage = async (key: string, value: any) => {
  await chrome.storage.local.set({ [key]: value });
};

const log = async (type: 'info' | 'success' | 'error', message: string) => {
  const logs = await getStorage('logs', []);
  const newLog = { type, message, timestamp: Date.now() };
  logs.unshift(newLog);
  if (logs.length > 100) logs.pop();
  await setStorage('logs', logs);
  console.log(`[${type.toUpperCase()}] ${message}`);
};

// Bybit API Helpers
async function fetchBybitOHLCV(symbol: string, interval: string, limit: number, useTestnet: boolean) {
  const baseUrl = useTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  // Bybit uses different symbol format (BTCUSDT instead of BTC/USDT)
  const bybitSymbol = symbol.replace('/', '');
  const url = `${baseUrl}/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=${interval}&limit=${limit}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit OHLCV Error: ${data.retMsg}`);
  }
  
  // Convert to CCXT format: [timestamp, open, high, low, close, volume]
  return data.result.list.map((item: any) => [
    parseInt(item[0]),
    parseFloat(item[1]),
    parseFloat(item[2]),
    parseFloat(item[3]),
    parseFloat(item[4]),
    parseFloat(item[5])
  ]).reverse(); // Bybit returns newest first
}

async function createBybitOrder(symbol: string, side: string, amount: number, apiKey: string, apiSecret: string, useTestnet: boolean) {
  const baseUrl = useTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
  const bybitSymbol = symbol.replace('/', '');
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const payload = JSON.stringify({
    category: 'spot',
    symbol: bybitSymbol,
    side: side.charAt(0).toUpperCase() + side.slice(1).toLowerCase(),
    orderType: 'Market',
    qty: amount.toString(),
  });

  const paramStr = timestamp + apiKey + recvWindow + payload;
  const signature = CryptoJS.HmacSHA256(paramStr, apiSecret).toString();

  const response = await fetch(`${baseUrl}/v5/order/create`, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-SIGN': signature,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json',
    },
    body: payload,
  });

  const data = await response.json();
  if (data.retCode !== 0) {
    throw new Error(`Bybit Order Error: ${data.retMsg}`);
  }
  return data.result;
}

// SuperTrend Calculation
function calculateSuperTrend(ohlcv: any[], atrPeriod: number, multiplier: number) {
  const prices = ohlcv.map(d => ({ h: d[2], l: d[3], c: d[4] }));
  
  let trs: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const h = prices[i].h;
    const l = prices[i].l;
    const cp = prices[i-1].c;
    trs.push(Math.max(h - l, Math.abs(h - cp), Math.abs(l - cp)));
  }
  
  const calculateATR = (index: number) => {
    if (index < atrPeriod) return trs.slice(0, index + 1).reduce((a, b) => a + b, 0) / (index + 1);
    return trs.slice(index - atrPeriod + 1, index + 1).reduce((a, b) => a + b, 0) / atrPeriod;
  };

  let finalUpperBand = 0;
  let finalLowerBand = 0;
  let currentTrend: 'BUY' | 'SELL' = 'SELL';
  let history: any[] = [];

  for (let i = 1; i < prices.length; i++) {
    const atr = calculateATR(i - 1);
    const hl2 = (prices[i].h + prices[i].l) / 2;
    const basicUpperBand = hl2 + multiplier * atr;
    const basicLowerBand = hl2 - multiplier * atr;

    const prevFinalUpperBand = finalUpperBand;
    const prevFinalLowerBand = finalLowerBand;
    const prevClose = prices[i-1].c;

    if (basicUpperBand < prevFinalUpperBand || prevClose > prevFinalUpperBand) {
      finalUpperBand = basicUpperBand;
    } else {
      finalUpperBand = prevFinalUpperBand;
    }

    if (basicLowerBand > prevFinalLowerBand || prevClose < prevFinalLowerBand) {
      finalLowerBand = basicLowerBand;
    } else {
      finalLowerBand = prevFinalLowerBand;
    }

    if (prices[i].c > finalUpperBand) {
      currentTrend = 'BUY';
    } else if (prices[i].c < finalLowerBand) {
      currentTrend = 'SELL';
    }

    history.push({
      time: new Date(ohlcv[i][0]).toLocaleTimeString(),
      price: prices[i].c,
      upper: finalUpperBand,
      lower: finalLowerBand,
      trend: currentTrend
    });
  }
  
  return { trend: currentTrend, price: prices[prices.length - 1].c, history };
}

// Bot Step
async function runBotStep() {
  const isRunning = await getStorage('isRunning', false);
  if (!isRunning) return;

  try {
    const settings = await getStorage('settings', {
      symbol: 'BTC/USDT',
      atrPeriod: 10,
      multiplier: 3.0,
      amount: 10,
      apiKey: '',
      apiSecret: '',
      useTestnet: true
    });

    const { symbol, atrPeriod, multiplier, amount, apiKey, apiSecret, useTestnet } = settings;
    const lastSignal = await getStorage('lastSignal', null);

    let currentPrice: number;
    let isDemo = !apiKey || !apiSecret;
    let ohlcv: any[];

    if (isDemo) {
      // Demo mode logic
      let demoOHLCV = await getStorage('demoOHLCV', []);
      if (demoOHLCV.length === 0) {
        // Init demo data
        for (let i = 0; i < 100; i++) {
          const open = 65000 + (Math.random() - 0.5) * 500;
          const high = open + Math.random() * 200;
          const low = open - Math.random() * 200;
          const close = low + Math.random() * (high - low);
          demoOHLCV.push([Date.now() - (100 - i) * 60000, open, high, low, close]);
        }
      }

      const lastCandle = demoOHLCV[demoOHLCV.length - 1];
      const open = lastCandle[4];
      const high = open + Math.random() * 200;
      const low = open - Math.random() * 200;
      const close = low + Math.random() * (high - low);
      demoOHLCV.push([Date.now(), open, high, low, close]);
      if (demoOHLCV.length > 200) demoOHLCV.shift();
      await setStorage('demoOHLCV', demoOHLCV);

      const { trend, price, history } = calculateSuperTrend(demoOHLCV, atrPeriod, multiplier);
      currentPrice = price;
      await setStorage('superTrendHistory', history);

      if (trend !== lastSignal) {
        await log('success', `[DEMO] Signal: ${trend} at ${currentPrice.toFixed(2)}`);
        const trades = await getStorage('trades', []);
        trades.unshift({ symbol, side: trend, price: currentPrice, amount, timestamp: Date.now(), status: 'completed (demo)' });
        await setStorage('trades', trades);
        await setStorage('lastSignal', trend);
      }
      return;
    }

    // Real Mode
    ohlcv = await fetchBybitOHLCV(symbol, '60', 100, useTestnet); // '60' for 1h
    const { trend, price, history } = calculateSuperTrend(ohlcv, atrPeriod, multiplier);
    currentPrice = price;
    await setStorage('superTrendHistory', history);

    if (trend !== lastSignal) {
      await log('info', `Trend changed to ${trend} at ${currentPrice}`);
      try {
        await createBybitOrder(symbol, trend, amount, apiKey, apiSecret, useTestnet);
        const trades = await getStorage('trades', []);
        trades.unshift({ symbol, side: trend, price: currentPrice, amount, timestamp: Date.now(), status: 'completed' });
        await setStorage('trades', trades);
        await log('success', `Executed ${trend} order for ${amount} ${symbol}`);
      } catch (e: any) {
        await log('error', `Trade failed: ${e.message}`);
      }
      await setStorage('lastSignal', trend);
    }

  } catch (error: any) {
    await log('error', `Bot Error: ${error.message}`);
  }
}

// Alarms & Events
chrome.alarms.create('botStep', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'botStep') {
    runBotStep();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_BOT') {
    setStorage('isRunning', true).then(() => {
      log('info', 'Bot started');
      runBotStep();
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === 'STOP_BOT') {
    setStorage('isRunning', false).then(() => {
      log('info', 'Bot stopped');
      sendResponse({ success: true });
    });
    return true;
  }
});
