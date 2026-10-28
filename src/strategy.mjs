import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isAddress, MAX_CAP, MIN_NOTIONAL } from "./decide.mjs";
import { homeDir } from "./store.mjs";

export function emptyStrategy() {
  return {
    kind: "dca",
    id: "",
    status: "idle",
    market: "BTC",
    base: MIN_NOTIONAL,
    add: MIN_NOTIONAL,
    maxAdds: 3,
    stepPct: 1,
    tpPct: 1.5,
    lower: 0,
    upper: 0,
    levels: 0,
    each: 0,
    mode: "arithmetic",
    direction: "neutral",
    leverage: 1,
    trigger: 0,
    triggerOn: false,
    triggerAbove: false,
    exitOn: false,
    exitMode: "price",
    tpValue: 0,
    slValue: 0,
    invest: 0,
    band: 10,
    holdMode: "ratio",
    weights: [],
    open: false,
    adds: 0,
    last: 0,
    avg: 0,
    spent: 0,
    box: "",
  };
}

function strategyPath() {
  return join(homeDir(), "strategy.json");
}

export function readStrategy() {
  try {
    const raw = JSON.parse(readFileSync(strategyPath(), "utf8"));
    const base = emptyStrategy();
    const kind = ["dca", "grid", "perp", "hold"].includes(raw.kind) ? raw.kind : "dca";
    const weights = Array.isArray(raw.weights)
      ? raw.weights.slice(0, 10).map((row) => ({
        coin: String(row?.coin || "").toUpperCase(),
        pct: Number(row?.pct) || 0,
      })).filter((row) => row.coin)
      : [];
    return {
      kind,
      id: String(raw.id || ""),
      status: raw.status === "stopped" ? "stopped" : raw.status === "saved" ? "saved" : "idle",
      market: String(raw.market || base.market).toUpperCase(),
      base: Number(raw.base) || base.base,
      add: Number(raw.add) || base.add,
      maxAdds: Math.floor(Number(raw.maxAdds) || base.maxAdds),
      stepPct: Number(raw.stepPct) || base.stepPct,
      tpPct: Number(raw.tpPct) || base.tpPct,
      lower: Number(raw.lower) || 0,
      upper: Number(raw.upper) || 0,
      levels: Math.floor(Number(raw.levels) || 0),
      each: Number(raw.each) || 0,
      mode: raw.mode === "geometric" ? "geometric" : "arithmetic",
      direction: raw.direction === "long" || raw.direction === "short" ? raw.direction : "neutral",
      leverage: Math.min(20, Math.max(1, Math.floor(Number(raw.leverage) || 1))),
      trigger: Number(raw.trigger) || 0,
      triggerOn: raw.triggerOn === true,
      triggerAbove: raw.triggerAbove === true,
      exitOn: raw.exitOn === true,
      exitMode: raw.exitMode === "pnl" || raw.exitMode === "roi" ? raw.exitMode : "price",
      tpValue: Number(raw.tpValue) || 0,
      slValue: Number(raw.slValue) || 0,
      invest: Number(raw.invest) || 0,
      band: Number(raw.band) || base.band,
      holdMode: raw.holdMode === "time" || raw.holdMode === "off" ? raw.holdMode : "ratio",
      weights,
      open: raw.open === true,
      adds: Math.floor(Number(raw.adds) || 0),
      last: Number(raw.last) || 0,
      avg: Number(raw.avg) || 0,
      spent: Number(raw.spent) || 0,
      box: isAddress(raw.box) ? String(raw.box).toLowerCase() : "",
    };
  } catch {
    return emptyStrategy();
  }
}

export function writeStrategy(next) {
  mkdirSync(homeDir(), { recursive: true, mode: 0o700 });
  writeFileSync(strategyPath(), `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return readStrategy();
}

/** Empty box means the master account. A box is optional, and it may be the master. */
export function boxReady(box, master) {
  const next = String(box ?? "").trim().toLowerCase();
  const home = String(master ?? "").trim().toLowerCase();
  if (!isAddress(home)) return false;
  if (!next) return true;
  return isAddress(next);
}

export function holdForBox(plan, box, master) {
  const home = String(master ?? "").trim().toLowerCase();
  const next = String(box ?? "").trim().toLowerCase();
  if (!boxReady(box, master)) return { action: "wait", reason: "box", planned: plan.action ?? "wait" };
  return { ...plan, account: next && next !== home ? next : home };
}

/** A saved strategy with no separate sub-account shares the master with a manual order. */
export function manualShare(strategy, master) {
  if (!strategy || strategy.status !== "saved") return null;
  const home = String(master ?? "").trim().toLowerCase();
  const box = String(strategy.box ?? "").trim().toLowerCase();
  if (box && (!home || box !== home)) return null;
  return {
    warn: "shared",
    account: "master",
    detail: "A strategy is running on this account. A manual order shares its balance, position, and liquidation price. The strategy can reduce or close a position opened by hand, and a new manual order changes the strategy's size, average, and liquidation price.",
  };
}

/** One wake, one action. The caller sends the order. This function never does. */
export function planDcaTick(input) {
  const mark = Number(input.mark);
  const cap = Number(input.cap);
  const balance = Number(input.balance);
  const base = Number(input.base);
  const add = Number(input.add);
  const maxAdds = Math.floor(Number(input.maxAdds));
  const stepPct = Number(input.stepPct);
  const tpPct = Number(input.tpPct);
  const open = input.open === true;
  const adds = Math.floor(Number(input.adds) || 0);
  const last = Number(input.last) || 0;
  const avg = Number(input.avg) || 0;

  if (!(mark > 0)) return { action: "wait", reason: "mark" };
  if (!(stepPct >= 0.1 && stepPct <= 15) || !(tpPct >= 0.1 && tpPct <= 50)) return { action: "wait", reason: "rule" };
  if (!(cap >= MIN_NOTIONAL && cap <= MAX_CAP)) return { action: "wait", reason: "cap" };

  if (!open) {
    if (!(base >= MIN_NOTIONAL)) return { action: "wait", reason: "small" };
    if (base > cap + 1e-9) return { action: "wait", reason: "cap" };
    if (!(balance >= base)) return { action: "wait", reason: "funds" };
    return { action: "open", side: "buy", notional: base, reduceOnly: false };
  }

  if (avg > 0 && mark >= avg * (1 + tpPct / 100)) {
    return { action: "close", side: "sell", reduceOnly: true };
  }

  const dipped = last > 0 && mark <= last * (1 - stepPct / 100);
  if (dipped && adds < maxAdds) {
    if (!(add >= MIN_NOTIONAL)) return { action: "wait", reason: "small" };
    if (add > cap + 1e-9) return { action: "wait", reason: "cap" };
    if (!(balance >= add)) return { action: "wait", reason: "funds" };
    return { action: "add", side: "buy", notional: add, reduceOnly: false };
  }

  return { action: "wait", reason: "hold" };
}

/** Quote only. Does not send an order. Maker fee is charged on both the buy and the sell. */
export function gridQuote(input) {
  const lower = Number(input.lower);
  const upper = Number(input.upper);
  const levels = Math.floor(Number(input.levels));
  const gaps = levels - 1;
  const maker = input.book === "spot" ? 0.0004 : 0.00015;
  if (!(upper > lower) || !(lower > 0) || gaps < 1) return { ok: false, reason: "rule" };
  const net = (sell, buy) => ((sell * (1 - maker)) / (buy * (1 + maker)) - 1) * 100;
  if (input.mode === "geometric") {
    const ratio = (upper / lower) ** (1 / gaps);
    return { ok: true, gapPct: (ratio - 1) * 100, profitPct: net(ratio, 1), maker };
  }
  const step = (upper - lower) / gaps;
  const at = (price) => net(price + step, price);
  const low = at(lower);
  const high = at(Math.max(lower, upper - step));
  return {
    ok: true,
    gapPct: { min: Math.min((step / lower) * 100, (step / (upper - step)) * 100), max: Math.max((step / lower) * 100, (step / (upper - step)) * 100) },
    profitPct: { min: Math.min(low, high), max: Math.max(low, high) },
    maker,
  };
}

export function applyFill(ledger, action, price) {
  const next = { ...ledger };
  if (action === "close") {
    next.open = false;
    next.adds = 0;
    next.last = 0;
    next.avg = 0;
    next.spent = 0;
    return next;
  }
  const px = Number(price);
  if (!(px > 0)) return null;
  if (action === "open") {
    next.open = true;
    next.adds = 0;
    next.last = px;
    next.avg = px;
    next.spent = Number(ledger.base);
    return next;
  }
  if ((action === "grid" || action === "rebalance") && px > 0) {
    next.open = true;
    next.last = px;
    return next;
  }
  if (action === "add" && ledger.open === true) {
    const spent = Number(ledger.spent);
    const add = Number(ledger.add);
    next.avg = (Number(ledger.avg) * spent + px * add) / (spent + add);
    next.spent = spent + add;
    next.last = px;
    next.adds = Math.floor(Number(ledger.adds) || 0) + 1;
    return next;
  }
  return null;
}

function gridPrices(lower, upper, levels, mode) {
  const gaps = levels - 1;
  const prices = [];
  for (let i = 0; i < levels; i += 1) {
    if (mode === "geometric") prices.push(lower * ((upper / lower) ** (i / gaps)));
    else prices.push(lower + ((upper - lower) * i) / gaps);
  }
  return prices;
}

function closePlan(side) {
  return { action: "close", side, reduceOnly: true };
}

/** One wake, one grid order. The caller sends it. */
export function planGridTick(input) {
  const mark = Number(input.mark);
  const lower = Number(input.lower);
  const upper = Number(input.upper);
  const levels = Math.floor(Number(input.levels));
  const each = Number(input.each);
  const cap = Number(input.cap);
  const balance = Number(input.balance);
  const direction = input.direction === "short" || input.direction === "long" ? input.direction : "neutral";
  if (!(mark > 0) || !(upper > lower) || !(lower > 0) || levels < 2 || levels > 40) return { action: "wait", reason: "rule" };
  if (!(cap >= MIN_NOTIONAL && cap <= MAX_CAP)) return { action: "wait", reason: "cap" };
  const trigger = Number(input.trigger);
  if (input.open !== true && input.triggerOn === true && trigger > 0) {
    const reached = input.triggerAbove === true ? mark >= trigger : mark <= trigger;
    if (!reached) return { action: "wait", reason: "trigger" };
  }
  if (input.exitOn === true && input.open === true && direction !== "neutral") {
    const closeSide = direction === "short" ? "buy" : "sell";
    const tp = Number(input.tpValue);
    const sl = Number(input.slValue);
    if (input.exitMode === "pnl" && Number.isFinite(Number(input.pnl))) {
      const pnl = Number(input.pnl);
      if (tp > 0 && pnl >= tp) return closePlan(closeSide);
      if (sl > 0 && pnl <= -Math.abs(sl)) return closePlan(closeSide);
    } else if (input.exitMode === "roi" && Number.isFinite(Number(input.roi))) {
      const roi = Number(input.roi);
      if (tp > 0 && roi >= tp) return closePlan(closeSide);
      if (sl > 0 && roi <= -Math.abs(sl)) return closePlan(closeSide);
    } else if (input.exitMode === "price" || !input.exitMode) {
      if (tp > 0 && (direction === "short" ? mark <= tp : mark >= tp)) return closePlan(closeSide);
      if (sl > 0 && (direction === "short" ? mark >= sl : mark <= sl)) return closePlan(closeSide);
    }
  }
  if (mark < lower || mark > upper) return { action: "wait", reason: "range" };
  if (!(each >= MIN_NOTIONAL) || each > cap + 1e-9) return { action: "wait", reason: "small" };
  if (!(balance >= each)) return { action: "wait", reason: "funds" };
  const prices = gridPrices(lower, upper, levels, input.mode === "geometric" ? "geometric" : "arithmetic");
  let side = "buy";
  let price = prices[0];
  if (direction === "short") {
    side = "sell";
    price = prices.find((px) => px >= mark) ?? prices[prices.length - 1];
  } else if (direction === "long" || mark < (lower + upper) / 2) {
    side = "buy";
    const below = prices.filter((px) => px <= mark);
    price = below.length ? below[below.length - 1] : prices[0];
  } else {
    side = "sell";
    price = prices.find((px) => px >= mark) ?? prices[prices.length - 1];
  }
  const last = Number(input.last) || 0;
  if (last > 0 && input.open === true && Math.abs(price - last) / last < 0.0005) {
    return { action: "wait", reason: "hold" };
  }
  return { action: "grid", side, notional: each, price, reduceOnly: false };
}

/** One wake, one coin. Holdings are values in USDC. */
export function planHoldTick(input) {
  const invest = Number(input.invest);
  const band = Number(input.band ?? 10);
  const cap = Number(input.cap);
  const balance = Number(input.balance);
  const weights = Array.isArray(input.weights) ? input.weights : [];
  const holdings = Array.isArray(input.holdings) ? input.holdings : [];
  if (input.holdMode === "off") return { action: "wait", reason: "hold" };
  if (!(invest >= MIN_NOTIONAL) || weights.length < 2) return { action: "wait", reason: "rule" };
  if (!(cap >= MIN_NOTIONAL && cap <= MAX_CAP)) return { action: "wait", reason: "cap" };
  if (!holdings.length) return { action: "wait", reason: "prices" };
  const total = holdings.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  if (!(total > 0)) return { action: "wait", reason: "prices" };
  let pick = null;
  for (const weight of weights) {
    const pct = Number(weight.pct);
    const coin = String(weight.coin || "").toUpperCase();
    if (!coin || !(pct > 0)) continue;
    const have = holdings.find((row) => String(row.coin || "").toUpperCase() === coin);
    const gap = (Number(have?.value) || 0) - (total * pct) / 100;
    if (!pick || Math.abs(gap) > Math.abs(pick.gap)) pick = { coin, gap };
  }
  if (!pick || Math.abs(pick.gap) < total * (band / 100)) return { action: "wait", reason: "hold" };
  const notional = Math.min(Math.abs(pick.gap), cap);
  if (notional < MIN_NOTIONAL) return { action: "wait", reason: "small" };
  const side = pick.gap > 0 ? "sell" : "buy";
  if (side === "buy" && !(balance >= notional)) return { action: "wait", reason: "funds" };
  return { action: "rebalance", side, market: pick.coin, notional, reduceOnly: side === "sell" };
}

export function planStrategyTick(input) {
  if (input.status === "stopped") return { action: "wait", reason: "stopped" };
  if (input.status === "idle") return { action: "wait", reason: "idle" };
  const kind = input.kind || "dca";
  if (kind === "grid" || kind === "perp") return planGridTick(input);
  if (kind === "hold") return planHoldTick(input);
  if (kind === "dca") return planDcaTick(input);
  return { action: "wait", reason: "kind" };
}

/** Copy a desk plan into the local runner. The sub-account box is kept. */
export function strategyFromPlan(plan, previous = emptyStrategy()) {
  const draft = plan?.draft && typeof plan.draft === "object" ? plan.draft : {};
  const kind = ["dca", "grid", "perp", "hold"].includes(plan?.kind) ? plan.kind : "dca";
  const weights = Array.isArray(draft.weights)
    ? draft.weights.slice(0, 10).map((row) => ({
      coin: String(row?.coin || "").toUpperCase(),
      pct: Number(row?.pct) || 0,
    })).filter((row) => row.coin)
    : [];
  const market = String((kind === "hold" ? weights[0]?.coin : plan?.coin) || "BTC").split(",")[0].toUpperCase();
  const same = previous.id && previous.id === plan?.id;
  const base = emptyStrategy();
  return {
    ...base,
    kind,
    id: String(plan?.id || ""),
    status: plan?.status === "stopped" ? "stopped" : "saved",
    market,
    base: Number(draft.base) || base.base,
    add: Number(draft.add) || base.add,
    maxAdds: Math.floor(Number(draft.maxAdds) || base.maxAdds),
    stepPct: Number(draft.step) || base.stepPct,
    tpPct: Number(draft.tp) || base.tpPct,
    lower: Number(draft.lower) || 0,
    upper: Number(draft.upper) || 0,
    levels: Math.floor(Number(draft.levels) || 0),
    each: Number(draft.each) || 0,
    mode: draft.gridMode === "geometric" ? "geometric" : "arithmetic",
    direction: draft.direction === "long" || draft.direction === "short" ? draft.direction : "neutral",
    leverage: Math.min(20, Math.max(1, Math.floor(Number(draft.leverage) || 1))),
    trigger: Number(draft.triggerPx) || 0,
    triggerOn: draft.triggerOn === true,
    triggerAbove: Number(draft.triggerPx) > Number(draft.mark),
    exitOn: draft.exitOn === true,
    exitMode: draft.exitMode === "pnl" || draft.exitMode === "roi" ? draft.exitMode : "price",
    tpValue: Number(draft.tpValue) || 0,
    slValue: Number(draft.slValue) || 0,
    invest: Number(draft.invest) || 0,
    band: Number(draft.ratioBand) || 10,
    holdMode: draft.holdMode === "time" || draft.holdMode === "off" ? draft.holdMode : "ratio",
    weights,
    box: previous.box || "",
    open: same ? previous.open === true : false,
    adds: same ? Math.floor(Number(previous.adds) || 0) : 0,
    last: same ? Number(previous.last) || 0 : 0,
    avg: same ? Number(previous.avg) || 0 : 0,
    spent: same ? Number(previous.spent) || 0 : 0,
  };
}
