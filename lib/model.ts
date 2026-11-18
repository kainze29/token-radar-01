// Token launch radar: value model + farm plans, computed from the snapshot itself.
// MODEL_VERSION radar-2: category-calibrated implied value. Every number below is
// derived from the frozen snapshot at run time; no protocol name is hardcoded.
export const MODEL_VERSION = 'radar-2';

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  parentProtocol?: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  chains: string[];
  category: string | null;
  multiple: number;
  growth_mult: number;
  maturity_mult: number;
  age_days: number | null;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
  change_7d: number | null;
}

export interface Board {
  asOf: string;
  floorUsd: number;
  watchlist: string[];
  modelVersion: string;
  rows: Row[];
  liveRows: LiveRow[];
  multiples: Record<string, number>;
  multiplesMeta: Record<string, { n: number; topLive: string; topRatio: number }>;
  globalMultiple: number;
  excludedCount: number;
  impliedSum: number;
}

// A protocol is pre-token when the snapshot records no token at all.
export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const NON_FARMABLE_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;

// Farmable = could plausibly launch a token worth farming. This is the
// competition's own watchlist eligibility rule (input/README.md) applied to
// every protocol, so the ranked board is exactly the farmable set. A wrapped
// asset, a chain bridge, a staked derivative or a CEX product will never
// launch a farmable token, so it is not ranked as an airdrop candidate.
export function isFarmable(p: Protocol): boolean {
  if (p.parentProtocol) return false;
  if (p.category !== null && NON_FARMABLE_CATEGORIES.has(p.category)) return false;
  if (WRAPPED_RE.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return false;
  }
  if (VERSION_RE.test(p.name)) return false;
  return true;
}

export function ageDays(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(p.listed_at + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.floor((a - b) / 86400000));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

// Calibrate each category's FDV/TVL multiple from the snapshot's own live
// protocols. A category needs at least 3 live comparables; thinner categories
// fall back to the global median. Risk Curators, the largest watchlist
// category, has only 1 live comparable (2.97x), so it uses the global median.
export function categoryMultiples(protocols: Protocol[]): {
  multiples: Record<string, number>;
  meta: Record<string, { n: number; topLive: string; topRatio: number }>;
  global: number;
} {
  const byCategory = new Map<string, { ratio: number; name: string }[]>();
  const allRatios: number[] = [];
  for (const p of protocols) {
    // A market cap of 0 is a snapshot artifact (the token exists but no
    // market cap was recorded); a 0 ratio would poison the calibration.
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0 || p.category === null) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    allRatios.push(ratio);
    const list = byCategory.get(p.category) ?? [];
    list.push({ ratio, name: p.name });
    byCategory.set(p.category, list);
  }
  allRatios.sort((a, b) => a - b);
  const global = round4(clamp(median(allRatios), 0.05, 1.0));
  const multiples: Record<string, number> = {};
  const meta: Record<string, { n: number; topLive: string; topRatio: number }> = {};
  for (const [category, list] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (list.length < 3) continue;
    const ratios = list.map((x) => x.ratio).sort((a, b) => a - b);
    multiples[category] = round4(clamp(median(ratios), 0.05, 1.0));
    const top = [...list].sort((a, b) => b.ratio - a.ratio)[0];
    meta[category] = { n: list.length, topLive: top.name, topRatio: round4(top.ratio) };
  }
  return { multiples, meta, global };
}

export function impliedValue(
  p: Protocol,
  multiples: Record<string, number>,
  global: number,
  asOf: string,
): { value: number; multiple: number; growth: number; maturity: number; age: number | null } {
  const multiple = p.category !== null && multiples[p.category] !== undefined
    ? multiples[p.category]
    : global;
  const growth = round4(1 + (clamp(p.change_7d ?? 0, -60, 120) / 100) * 0.5);
  const age = ageDays(p, asOf);
  const ageForModel = age === null ? 365 : age;
  const maturity = round4(0.6 + (Math.min(ageForModel, 1095) / 1095) * 0.4);
  const value = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity));
  return { value, multiple, growth, maturity, age };
}

function capitalTier(tvl: number): number {
  if (tvl >= 1_000_000_000) return 250;
  if (tvl >= 250_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

function holdDays(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function gasNote(chain: string): string {
  switch (chain) {
    case 'Ethereum': return '$3-8 per transaction';
    case 'Solana': return 'about $0.01 per transaction';
    case 'Binance': return '$0.05-0.30 per transaction';
    case 'Avalanche': return '$0.10-0.50 per transaction';
    case 'Bitcoin': return 'the app chain fee, usually under $1';
    case 'Tron': return '$1-3 per transaction';
    case 'Stellar': return 'under $0.01 per transaction';
    default: return '$0.10-1 per transaction';
  }
}

const CATEGORY_ACTIONS: Record<string, string> = {
  'Risk Curators': 'Deposit {capital} into a curator vault and hold the vault position',
  'RWA': 'Mint or buy {capital} of the yield-bearing real-world asset',
  'Onchain Capital Allocator': 'Allocate {capital} to a strategy vault and keep it deployed',
  'Basis Trading': 'Deposit {capital} into the basis-trading vault',
  'Lending': 'Supply {capital}, then borrow a small amount against it to show both sides',
  'Dexs': 'Provide {capital} of liquidity to a top pool and swap through the DEX',
  'Yield': 'Deposit {capital} into the yield vault and let it compound',
  'Yield Aggregator': 'Deposit {capital} into the top auto-compounding vault',
  'CDP': 'Open a vault, lock {capital} of collateral and mint the stablecoin',
  'CDP Manager': 'Open a managed CDP position with {capital}',
  'Chain': 'Bridge {capital} to the chain and use two native apps, a swap and a lend',
  'Restaking': 'Restake {capital} of the liquid staking token',
  'Derivatives': 'Open and close a small perpetuals position with {capital} of margin',
  'Prediction Market': 'Place {capital} of trades across at least three different markets',
  'Insurance': 'Buy cover for {capital} of deposits and keep the policy active',
  'Payments': 'Route {capital} of real payments through the protocol each month',
  'CeDeFi': 'Deposit {capital} into the CeDeFi vault and keep it for the full season',
  'Collateral Markets': 'Supply {capital} of collateral and borrow against it once',
  'Cross Chain Bridge': 'Bridge {capital} between two chains through the protocol each week',
  'Governance Incentives': 'Lock {capital} of the governance asset and vote on at least one proposal',
  'Indexes': 'Buy {capital} of the index token and hold it',
  'Interest Rate Derivatives': 'Buy {capital} of the fixed-yield token',
  'Leveraged Farming': 'Open a leveraged farm with {capital} at 2x leverage or less',
  'Liquidity Manager': 'Deposit {capital} into a managed liquidity position',
  'OTC Marketplace': 'Complete one OTC trade of {capital}',
  'Staking Pool': 'Stake {capital} in the pool and keep it staked',
  'Uncollateralized Lending': 'Open a credit line with {capital} and repay it on time',
  'Farm': 'Farm {capital} in the top pool and harvest weekly',
  'Anchor BTC': 'Deposit {capital} of BTC-backed collateral',
  'Decentralized BTC': 'Mint {capital} of the decentralized BTC asset',
  'Dual-Token Stablecoin': 'Mint {capital} of the stablecoin pair',
  'Crypto Card Issuer': 'Order the card and spend {capital} through it',
  'Stablecoin Wrapper': 'Wrap {capital} into the protocol stablecoin',
};

function categoryAction(category: string | null, capital: number, chain: string): string {
  const template = (category !== null && CATEGORY_ACTIONS[category] !== undefined)
    ? CATEGORY_ACTIONS[category]
    : 'Use the protocol with {capital} and repeat the core action weekly';
  return template.replace('{capital}', '$' + String(capital)) + ' on ' + chain;
}

// Six concrete farm steps per protocol. Each step states what to do, what it
// costs, and how long it takes. Capital scales with TVL tier, gas with the
// protocol's main chain, hold time with how long it has run with no token.
export function farmSteps(p: Protocol, age: number | null): string[] {
  const capital = capitalTier(p.tvl_usd);
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = gasNote(chain);
  const hold = holdDays(age);
  const core = categoryAction(p.category, capital, chain);
  return [
    'Create a fresh wallet for ' + p.name + ' farming and fund it with $' + capital + ' in ' + chain + ' assets. Cost: gas ' + gas + '. Time: 10 minutes.',
    core + '. Cost: $' + capital + ' deployed plus gas ' + gas + '. Time: 15 minutes.',
    'Repeat the core action once a week for ' + hold + ' days: add a small deposit or swap so the wallet stays active. Cost: gas ' + gas + ' per week. Time: 10 minutes a week.',
    'Hold the position for at least ' + hold + ' days and do not withdraw early; early exits usually reset airdrop eligibility. Cost: none. Time: ' + hold + ' days of holding.',
    'Check the ' + p.name + ' points or leaderboard page before withdrawing anything, and keep a screenshot of your position. Cost: none. Time: 5 minutes.',
    'Keep a farm log: wallet address, dates, amounts, and transaction hashes for ' + p.name + ', so you can prove activity if a claim needs it. Cost: none. Time: 5 minutes.',
  ];
}

export function buildBoard(snapshot: Snapshot): Board {
  const { multiples, meta, global } = categoryMultiples(snapshot.protocols);
  const ranked: { p: Protocol; value: number; multiple: number; growth: number; maturity: number; age: number | null }[] = [];
  let excludedCount = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    if (!isFarmable(p)) {
      excludedCount += 1;
      continue;
    }
    const iv = impliedValue(p, multiples, global, snapshot.as_of);
    ranked.push({ p, value: iv.value, multiple: iv.multiple, growth: iv.growth, maturity: iv.maturity, age: iv.age });
  }
  ranked.sort((a, b) => (b.value - a.value) || a.p.slug.localeCompare(b.p.slug));
  const rows: Row[] = ranked.map((r, i) => ({
    slug: r.p.slug,
    name: r.p.name,
    rank: i + 1,
    implied_value_usd: r.value,
    tvl_usd: r.p.tvl_usd,
    change_7d: r.p.change_7d,
    listed_at: r.p.listed_at,
    chains: r.p.chains,
    category: r.p.category,
    multiple: r.multiple,
    growth_mult: r.growth,
    maturity_mult: r.maturity,
    age_days: r.age,
    farm_steps: farmSteps(r.p, r.age),
  }));
  const liveRows: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      ratio: round4((p.mcap_usd as number) / p.tvl_usd),
      change_7d: p.change_7d,
    }));
  return {
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    watchlist: snapshot.watchlist,
    modelVersion: MODEL_VERSION,
    rows,
    liveRows,
    multiples,
    multiplesMeta: meta,
    globalMultiple: global,
    excludedCount,
    impliedSum: rows.reduce((sum, r) => sum + r.implied_value_usd, 0),
  };
}
