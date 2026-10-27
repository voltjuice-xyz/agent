import assert from "node:assert/strict";
import test from "node:test";
import {
  clampLeverage,
  decideOrder,
  findMarket,
  floorSize,
  isPrivateKey,
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
