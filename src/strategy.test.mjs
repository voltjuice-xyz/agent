import assert from "node:assert/strict";
import test from "node:test";
import { applyFill, emptyStrategy, planDcaTick } from "./strategy.mjs";

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
