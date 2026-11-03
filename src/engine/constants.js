// Fixed research inputs from the build specification (v1.1).
// These are read-only in the UI. Percentages are stored as fractions.

export const SCHEMA_VERSION = 1;

export const TABS = Object.freeze({
  myacn: { key: 'myacn', label: 'My ACN', capital: 800000, draw: 0, placeholder: true },
  low: { key: 'low', label: 'Low', capital: 31982606, draw: 500000, placeholder: false },
  central: { key: 'central', label: 'Central', capital: 46319141, draw: 500000, placeholder: false },
  high: { key: 'high', label: 'High', capital: 63230106, draw: 500000, placeholder: false },
});
export const TAB_ORDER = ['myacn', 'low', 'central', 'high'];
export const PROCEEDS_TABS = ['low', 'central', 'high'];

export const MY_ACN_VIEWS = Object.freeze({
  acn: { key: 'acn', label: '100% ACN', p: 1 },
  diversified: { key: 'diversified', label: '100% Diversified', p: 0 },
  custom: { key: 'custom', label: 'Custom Split', p: null },
});
export const VIEW_ORDER = ['acn', 'diversified', 'custom'];
export const SECTIONS = ['today', 'projections', 'downside'];
export const SECTION_LABELS = { today: 'Today', projections: 'Projections', downside: 'Downside' };

export const SLEEVES = ['innovation', 'core', 'bills'];
export const SLEEVE_LABELS = { acn: 'Direct ACN', innovation: 'Innovation', core: 'Core', bills: 'Extra short T-bills' };

// Weights of the diversified portion.
export const MIXES = Object.freeze({
  m10: { key: 'm10', label: '10%', innovation: 0.10, core: 0.30, bills: 0.60, reference: false },
  m20: { key: 'm20', label: '20%', innovation: 0.20, core: 0.50, bills: 0.30, reference: false },
  m30: { key: 'm30', label: '30%', innovation: 0.30, core: 0.70, bills: 0.00, reference: false },
  m60: { key: 'm60', label: '60% reference', innovation: 0.60, core: 0.40, bills: 0.00, reference: true },
});
export const MAIN_MIXES = ['m10', 'm20', 'm30'];
export const DEFAULT_MIX = 'm20';

export const INSTRUMENTS = Object.freeze({
  ACN: { symbol: 'ACN', name: 'Accenture plc', venue: 'NYSE', kind: 'equity', currency: 'USD' },
  'BTC/USD': { symbol: 'BTC/USD', name: 'Bitcoin', venue: 'Crypto (24/7)', kind: 'crypto', currency: 'USD' },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  AMZN: { symbol: 'AMZN', name: 'Amazon', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Class A', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  AVGO: { symbol: 'AVGO', name: 'Broadcom', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  TSLA: { symbol: 'TSLA', name: 'Tesla', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  COIN: { symbol: 'COIN', name: 'Coinbase', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  XYZ: { symbol: 'XYZ', name: 'Block', venue: 'NYSE', kind: 'equity', currency: 'USD' },
  ISRG: { symbol: 'ISRG', name: 'Intuitive Surgical', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  ROK: { symbol: 'ROK', name: 'Rockwell Automation', venue: 'NYSE', kind: 'equity', currency: 'USD' },
  ADSK: { symbol: 'ADSK', name: 'Autodesk', venue: 'NASDAQ', kind: 'equity', currency: 'USD' },
  VTI: { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', venue: 'NYSE Arca', kind: 'etf', currency: 'USD', proxyFor: 'U.S. broad equity' },
  VXUS: { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', venue: 'NASDAQ', kind: 'etf', currency: 'USD', proxyFor: 'International equity' },
  BND: { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', venue: 'NASDAQ', kind: 'etf', currency: 'USD', proxyFor: 'Investment-grade bonds' },
  VTIP: { symbol: 'VTIP', name: 'Vanguard Short-Term Inflation-Protected Securities ETF', venue: 'NASDAQ', kind: 'etf', currency: 'USD', proxyFor: 'TIPS / short Treasuries (short TIPS)' },
  VIG: { symbol: 'VIG', name: 'Vanguard Dividend Appreciation ETF', venue: 'NYSE Arca', kind: 'etf', currency: 'USD', proxyFor: 'Dividend / quality equity (dividend growers)' },
  SGOV: { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', venue: 'NYSE Arca', kind: 'etf', currency: 'USD', proxyFor: 'Cash / Treasury bills (short Treasury ETF; share price fluctuates)' },
});
export const ALL_SYMBOLS = Object.keys(INSTRUMENTS);

// Constituents inside each sleeve (within-sleeve weights, sum to 1).
export const SLEEVE_CONSTITUENTS = Object.freeze({
  innovation: [
    { symbol: 'BTC/USD', w: 0.20 }, { symbol: 'NVDA', w: 0.18 }, { symbol: 'AMZN', w: 0.14 },
    { symbol: 'GOOGL', w: 0.12 }, { symbol: 'AVGO', w: 0.10 }, { symbol: 'TSLA', w: 0.08 },
    { symbol: 'COIN', w: 0.05 }, { symbol: 'XYZ', w: 0.04 }, { symbol: 'ISRG', w: 0.04 },
    { symbol: 'ROK', w: 0.03 }, { symbol: 'ADSK', w: 0.02 },
  ],
  core: [
    { symbol: 'VTI', w: 0.35, category: 'U.S. broad equity' },
    { symbol: 'VXUS', w: 0.15, category: 'International equity' },
    { symbol: 'BND', w: 0.25, category: 'Investment-grade bonds' },
    { symbol: 'VTIP', w: 0.10, category: 'TIPS / short Treasuries' },
    { symbol: 'VIG', w: 0.10, category: 'Dividend / quality equity' },
    { symbol: 'SGOV', w: 0.05, category: 'Cash / Treasury bills' },
  ],
  bills: [{ symbol: 'SGOV', w: 1.0, category: 'Extra short T-bills' }],
});

export const MARKET_PATHS = Object.freeze({
  conservative: { key: 'conservative', label: 'Conservative', innovation: 0.07, core: 0.045, bills: 0.03 },
  base: { key: 'base', label: 'Base', innovation: 0.10, core: 0.065, bills: 0.03 },
  aggressive: { key: 'aggressive', label: 'Aggressive', innovation: 0.13, core: 0.08, bills: 0.03 },
});
export const PATH_ORDER = ['conservative', 'base', 'aggressive'];

export const SHOCKS = Object.freeze({
  innovationBear: { key: 'innovationBear', label: 'Innovation bear', innovation: -0.45, core: -0.10, bills: 0 },
  recession: { key: 'recession', label: 'Broad recession', innovation: -0.25, core: -0.15, bills: 0 },
  valuationReset: { key: 'valuationReset', label: 'Valuation reset', innovation: -0.30, core: -0.08, bills: 0 },
});
export const SHOCK_ORDER = ['innovationBear', 'recession', 'valuationReset'];

export const DEFAULTS = Object.freeze({
  inflation: 0.025,
  fee: 0,
  acnReturn: 0, // "Flat illustration"
  acnShock: -0.30,
  customRetain: 0.40,
  horizon: 20,
  path: 'base',
  mix: DEFAULT_MIX,
  shock: 'innovationBear',
});

export const HORIZON_MARKERS = [1, 5, 10, 20];
export const MAX_YEARS = 20;
export const DISPLAY_TZ = 'America/New_York';
