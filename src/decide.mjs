export const MIN_NOTIONAL = 11;
export const MAX_CAP = 100_000;
export const MAX_LEVERAGE = 20;

export function scrub(text) {
  return String(text ?? "")
    .replace(/0x[a-fA-F0-9]{64}/g, "[redacted]")
    .replace(/hyperliquid/gi, "the desk");
}

export function isPrivateKey(value) {
  return /^0x[a-fA-F0-9]{64}$/.test(String(value ?? "").trim());
}

export function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value ?? "").trim());
}

export function floorSize(size, szDecimals) {
  const decimals = Number.isInteger(szDecimals) && szDecimals >= 0 && szDecimals <= 8 ? szDecimals : 0;
  const qty = Number(size);
  if (!Number.isFinite(qty) || !(qty > 0)) return null;
  const factor = 10 ** decimals;
  const floored = Math.floor(qty * factor + 1e-9) / factor;
  if (!(floored > 0)) return null;
  return floored.toFixed(decimals);
}

export function toSignificantDigits(num, sigDigits = 5) {
  if (num === 0) return "0";
  const sign = Math.sign(num);
  const absNum = Math.abs(num);
  const magnitude = Math.floor(Math.log10(absNum));
  const decimalPlaces = sigDigits - magnitude - 1;
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round(absNum * factor) / factor;
  return (sign * rounded).toFixed(Math.max(0, decimalPlaces));
}

export function limitPrice(mark, side, slippageBps = 50) {
  const px = Number(mark);
  const bps = Number(slippageBps);
  if (!(px > 0) || !Number.isFinite(bps) || bps < 10 || bps > 200) return null;
  const slip = bps / 10_000;
  const raw = side === "buy" ? px * (1 + slip) : px * (1 - slip);
  return toSignificantDigits(raw);
}

/** Shared accounts can trade the spot USDC when the contract equity is still 0. */
export function tradableUsd(input) {
  const perp = Number(input.accountValue);
  const spot = Number(input.spotUsdc);
  const free = Number(input.withdrawable);
  const equity = Number.isFinite(perp) && perp > 0 ? perp : 0;
  const spotUsd = Number.isFinite(spot) && spot > 0 ? spot : 0;
  const withdrawable = Number.isFinite(free) && free > 0 ? free : 0;
  if (input.mode === "unifiedAccount" || input.mode === "portfolioMargin") {
    return withdrawable > 0 ? withdrawable : spotUsd;
  }
  return withdrawable > 0 ? withdrawable : equity;
}

/** What `voltjuice next` should do after a balance read. */
export function nextFromBalance(account, config) {
  const ready = config.mode === "live" && Number(config.cap) >= MIN_NOTIONAL;
  const note = "Tell the user the balance field. Contract equity 0 is normal on a shared account. Do not transfer and do not say the balance is 0.";
  if (!(Number(account.balance) > 0)) {
    if (account.transfer === "split-only" && Number(account.spotUsdc) > 0) {
      return {
        next: "move",
        note: "Spot and contract balances are separate. Ask the user to move USDC into the contract balance on the site. Do not send it to the API wallet.",
      };
    }
    return {
      next: "funds",
      note: "Tradable balance is 0. Ask for a deposit. Do not move funds to the API wallet address.",
    };
  }
  return { next: ready ? "trade" : "cap", note };
}

/** Entry plus optional protection. Spot stays a plain order. */
export function planOrder(input) {
  const book = input.book === "spot" ? "spot" : "perp";
  const side = input.side === "sell" ? "sell" : input.side === "buy" ? "buy" : "";
  if (!side) return { ok: false, reason: "side" };
  const type = input.type === "limit" ? "limit" : "market";
  const mark = Number(input.mark);
  if (!(mark > 0)) return { ok: false, reason: "price" };
  const hasProtect = Boolean(input.tp || input.sl || input.leverage || input.margin === "isolated");
  if (book === "spot" && hasProtect) return { ok: false, reason: "spot-plain" };
  let leverage = null;
  let isCross = true;
  if (book === "perp") {
    isCross = input.margin !== "isolated";
    if (input.leverage) {
      leverage = clampLeverage(input.leverage);
      const max = Number(input.maxLeverage);
      if (!leverage || (Number.isFinite(max) && max > 0 && leverage > max)) return { ok: false, reason: "leverage" };
    }
  }
  let price = null;
  const tif = type === "limit" ? "Gtc" : "Ioc";
  if (type === "limit") {
    if (!(Number(input.price) > 0)) return { ok: false, reason: "limit" };
    price = toSignificantDigits(Number(input.price));
  } else {
    price = limitPrice(mark, side);
  }
  if (!price) return { ok: false, reason: "price" };
  const size = floorSize(Number(input.notional) / mark, input.szDecimals);
  if (!size) return { ok: false, reason: "size" };
  const tp = Number(input.tp);
  const sl = Number(input.sl);
  if (tp > 0 && (side === "buy" ? !(tp > mark) : !(tp < mark))) return { ok: false, reason: "tp" };
  if (sl > 0 && (side === "buy" ? !(sl < mark) : !(sl > mark))) return { ok: false, reason: "sl" };
  return {
    ok: true,
    book,
    side,
    type,
    tif,
    price,
    size,
    isCross,
    leverage,
    tp: tp > 0 ? toSignificantDigits(tp) : "",
    sl: sl > 0 ? toSignificantDigits(sl) : "",
  };
}

/** Practice is the default. Live requires a user cap and stays inside it. */
export function decideOrder(input) {
  const notional = Number(input.notional);
  if (!Number.isFinite(notional) || notional <= 0) return { ok: false, reason: "small" };
  if (!input.reduceOnly && notional < MIN_NOTIONAL) return { ok: false, reason: "small" };
  if (input.mode !== "live") return { ok: true, route: "paper" };
  const cap = Number(input.cap);
  if (!Number.isFinite(cap) || cap < MIN_NOTIONAL || cap > MAX_CAP) return { ok: false, reason: "cap" };
  if (notional > cap + 1e-9) return { ok: false, reason: "over-cap" };
  return { ok: true, route: "live" };
}

export function clampLeverage(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > MAX_LEVERAGE) return null;
  return n;
}

export function findMarket(rows, symbol) {
  const key = String(symbol ?? "").trim().toUpperCase();
  if (!key) return null;
  return rows.find((row) => String(row.name).toUpperCase() === key && !String(row.name).includes(":")) ?? null;
}
