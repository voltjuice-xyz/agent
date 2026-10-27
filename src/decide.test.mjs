import assert from "node:assert/strict";
import test from "node:test";
import {
  clampLeverage,
  decideOrder,
  nextFromBalance,
  planOrder,
  findMarket,
  floorSize,
  isPrivateKey,
  tradableUsd,
  limitPrice,
  scrub,
} from "./decide.mjs";

test("practice is the default route", () => {
  assert.deepEqual(decideOrder({ mode: "paper", cap: 0, notional: 20 }), { ok: true, route: "paper" });
});

test("live stays inside the user cap", () => {
  assert.equal(decideOrder({ mode: "live", cap: 100, notional: 20 }).route, "live");
  assert.equal(decideOrder({ mode: "live", cap: 100, notional: 150 }).reason, "over-cap");
  assert.equal(decideOrder({ mode: "live", cap: 0, notional: 20 }).reason, "cap");
  assert.equal(decideOrder({ mode: "live", cap: 5, notional: 20 }).reason, "cap");
});

test("shared accounts count spot USDC when contract equity is zero", () => {
  assert.equal(tradableUsd({ mode: "unifiedAccount", accountValue: "0", withdrawable: "0", spotUsdc: "17.94" }), 17.94);
  assert.equal(tradableUsd({ mode: "default", accountValue: "0", withdrawable: "0", spotUsdc: "17.94" }), 0);
});

test("a strategy order keeps book, margin, limit, and protection", () => {
  const market = planOrder({ book: "perp", side: "buy", type: "market", mark: 80000, szDecimals: 5, notional: 20, maxLeverage: 40, leverage: 5, margin: "isolated", tp: 90000, sl: 70000 });
  assert.equal(market.ok, true);
  assert.equal(market.tif, "Ioc");
  assert.equal(market.isCross, false);
  assert.equal(market.leverage, 5);
  const badTp = planOrder({ book: "perp", side: "buy", type: "limit", mark: 80000, price: 79000, szDecimals: 5, notional: 20, tp: 70000 });
  assert.equal(badTp.reason, "tp");
  const spot = planOrder({ book: "spot", side: "buy", type: "market", mark: 80000, szDecimals: 5, notional: 20, leverage: 3 });
  assert.equal(spot.reason, "spot-plain");
});

test("split accounts with spot cash need a move, shared accounts do not", () => {
  const split = nextFromBalance({ balance: "0", spotUsdc: "17.94", transfer: "split-only" }, { mode: "paper", cap: 0 });
  assert.equal(split.next, "move");
  const shared = nextFromBalance({ balance: "17.94", spotUsdc: "17.94", transfer: "never" }, { mode: "paper", cap: 0 });
  assert.equal(shared.next, "cap");
});

test("orders below 11 are refused", () => {
  assert.equal(decideOrder({ mode: "paper", cap: 0, notional: 10 }).reason, "small");
  assert.equal(decideOrder({ mode: "paper", cap: 0, notional: 11 }).ok, true);
});

test("public text hides keys and venue names", () => {
  const key = `0x${"ab".repeat(32)}`;
  const out = scrub(`fail ${key} via Hyperliquid`);
  assert.equal(out.includes(key), false);
  assert.equal(/hyperliquid/i.test(out), false);
});

test("size floors to the lot and price stays on the right side of the mark", () => {
  assert.equal(floorSize(0.0199, 3), "0.019");
  assert.equal(Number(limitPrice(100, "buy", 50)) > 100, true);
  assert.equal(Number(limitPrice(100, "sell", 50)) < 100, true);
  assert.equal(clampLeverage(21), null);
  assert.equal(clampLeverage(5), 5);
});

test("a private key is recognized and a market name does not match a prefixed copy", () => {
  assert.equal(isPrivateKey(`0x${"11".repeat(32)}`), true);
  assert.equal(isPrivateKey("0x1234"), false);
  const row = findMarket(
    [
      { name: "xyz:BTC", markPx: "1" },
      { name: "BTC", markPx: "2" },
    ],
    "btc",
  );
  assert.equal(row?.name, "BTC");
});
