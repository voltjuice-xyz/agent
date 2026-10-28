import assert from "node:assert/strict";
import test from "node:test";
import { applyFill, emptyStrategy, gridQuote, manualShare, planDcaTick, planGridTick, planHoldTick, planStrategyTick, strategyFromPlan } from "./strategy.mjs";

const rule = { base: 11, add: 11, maxAdds: 3, stepPct: 1, tpPct: 1.5, cap: 11, balance: 40 };

test("a flat account opens one base order", () => {
  const plan = planDcaTick({ ...rule, mark: 80000, open: false, adds: 0, last: 0, avg: 0 });
  assert.deepEqual(plan, { action: "open", side: "buy", notional: 11, reduceOnly: false });
});

test("a dip adds one order and a bounce back to the average does not", () => {
  const hold = planDcaTick({ ...rule, mark: 79900, open: true, adds: 0, last: 80000, avg: 80000 });
  assert.equal(hold.action, "wait");
  const add = planDcaTick({ ...rule, mark: 79200, open: true, adds: 0, last: 80000, avg: 80000 });
  assert.equal(add.action, "add");
  assert.equal(add.notional, 11);
});

test("reaching the take-profit closes and does not add", () => {
  const plan = planDcaTick({ ...rule, mark: 81200, open: true, adds: 1, last: 79000, avg: 80000 });
  assert.deepEqual(plan, { action: "close", side: "sell", reduceOnly: true });
});

test("the add count and the balance stop the loop", () => {
  const full = planDcaTick({ ...rule, mark: 76000, open: true, adds: 3, last: 77000, avg: 79000 });
  assert.equal(full.reason, "hold");
  const poor = planDcaTick({ ...rule, balance: 10, mark: 76000, open: true, adds: 0, last: 80000, avg: 80000 });
  assert.equal(poor.reason, "funds");
});

test("fills move the average and a close resets it", () => {
  let book = emptyStrategy();
  book = applyFill(book, "open", 80000);
  book = applyFill(book, "add", 79200);
  assert.equal(book.open, true);
  assert.equal(book.adds, 1);
  assert.equal(book.avg, 79600);
  book = applyFill(book, "close", 81000);
  assert.equal(book.open, false);
  assert.equal(book.spent, 0);
});

test("a long grid waits for the start price, then buys one level", () => {
  const waiting = planGridTick({
    kind: "perp", direction: "long", mark: 80000, lower: 76000, upper: 84000, levels: 5, each: 11,
    cap: 20, balance: 40, trigger: 79000, triggerOn: true, triggerAbove: false, open: false,
  });
  assert.equal(waiting.reason, "trigger");
  const plan = planGridTick({
    kind: "perp", direction: "long", mark: 78000, lower: 76000, upper: 84000, levels: 5, each: 11,
    cap: 20, balance: 40, trigger: 79000, triggerOn: true, triggerAbove: false, open: false,
  });
  assert.equal(plan.action, "grid");
  assert.equal(plan.side, "buy");
  assert.equal(plan.notional, 11);
  assert.ok(plan.price <= 78000);
});

test("a stopped plan does nothing and a drifted holding rebalances one coin", () => {
  const stopped = planStrategyTick({ status: "stopped", kind: "dca", mark: 80000, cap: 11, balance: 40, ...rule });
  assert.equal(stopped.reason, "stopped");
  const calm = planHoldTick({
    invest: 40, band: 10, cap: 20, balance: 40, holdMode: "ratio",
    weights: [{ coin: "BTC", pct: 50 }, { coin: "ETH", pct: 50 }],
    holdings: [{ coin: "BTC", value: 20 }, { coin: "ETH", value: 20 }],
  });
  assert.equal(calm.reason, "hold");
  const drifted = planHoldTick({
    invest: 40, band: 10, cap: 20, balance: 40, holdMode: "ratio",
    weights: [{ coin: "BTC", pct: 50 }, { coin: "ETH", pct: 50 }],
    holdings: [{ coin: "BTC", value: 32 }, { coin: "ETH", value: 8 }],
  });
  assert.equal(drifted.action, "rebalance");
  assert.equal(drifted.market, "BTC");
  assert.equal(drifted.side, "sell");
});

test("importing a desk plan keeps the sub-account", () => {
  const plan = strategyFromPlan({
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    kind: "grid",
    status: "saved",
    coin: "ETH",
    draft: { lower: "100", upper: "110", levels: "4", each: "11", gridMode: "arithmetic", mark: "105", triggerPx: "90", triggerOn: true },
  }, { ...emptyStrategy(), box: "0x1111111111111111111111111111111111111111" });
  assert.equal(plan.kind, "grid");
  assert.equal(plan.market, "ETH");
  assert.equal(plan.box, "0x1111111111111111111111111111111111111111");
  assert.equal(plan.triggerAbove, false);
  assert.equal(plan.open, false);
});

test("a manual order is warned only while the strategy runs on the master", () => {
  const master = "0x1111111111111111111111111111111111111111";
  const running = { ...emptyStrategy(), status: "saved" };
  assert.equal(manualShare(running, master).warn, "shared");
  assert.equal(manualShare({ ...running, status: "stopped" }, master), null);
  assert.equal(manualShare({ ...running, box: "0x2222222222222222222222222222222222222222" }, master), null);
  assert.equal(planStrategyTick({ ...emptyStrategy(), status: "idle", mark: 80000, cap: 11, balance: 40 }).reason, "idle");
});

test("a grid quote subtracts the maker fee from both sides", () => {
  const quote = gridQuote({ lower: 100, upper: 110, levels: 2, mode: "arithmetic", book: "perp" });
  assert.equal(quote.ok, true);
  assert.ok(quote.profitPct.max < 10);
  assert.ok(quote.profitPct.max > 0);
});
