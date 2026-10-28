import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_CAP, MIN_NOTIONAL } from "./decide.mjs";
import { homeDir } from "./store.mjs";

export function emptyStrategy() {
  return {
    market: "BTC",
    base: MIN_NOTIONAL,
    add: MIN_NOTIONAL,
    maxAdds: 3,
    stepPct: 1,
    tpPct: 1.5,
    open: false,
    adds: 0,
    last: 0,
    avg: 0,
    spent: 0,
  };
}

function strategyPath() {
  return join(homeDir(), "strategy.json");
}

export function readStrategy() {
  try {
    const raw = JSON.parse(readFileSync(strategyPath(), "utf8"));
    const base = emptyStrategy();
    return {
      market: String(raw.market || base.market).toUpperCase(),
      base: Number(raw.base) || base.base,
      add: Number(raw.add) || base.add,
      maxAdds: Math.floor(Number(raw.maxAdds) || base.maxAdds),
      stepPct: Number(raw.stepPct) || base.stepPct,
      tpPct: Number(raw.tpPct) || base.tpPct,
      open: raw.open === true,
      adds: Math.floor(Number(raw.adds) || 0),
      last: Number(raw.last) || 0,
      avg: Number(raw.avg) || 0,
      spent: Number(raw.spent) || 0,
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
