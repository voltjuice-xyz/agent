---
name: voltjuice-strategy
description: Run a plan the desk already saved. Do not add rules. One wake does one action from that plan.
---

# A saved desk plan

This runs a plan the desk already stored. It does not invent a quant rule. Spot DCA, spot grid, contract grid, and smart position keep the parameters set on the site. Do not add a signal, a filter, or an exit the plan does not contain.

The slow dip-buy shape below is that saved plan: one buy, then extra buys only after the price falls, then one close when the average is up. It is not a grid, and it is not a check every few seconds. Grok's own strategy, with its own signals, is `skills/signals/SKILL.md`. Do not put those signals here.

Run it on the master account. That account shares its balance, position, and liquidation price with a manual order. Two API wallets are two keys for that one balance, not two places to run this. A sub-account is optional, after $100,000 of lifetime volume, when they want the strategy kept apart. Do not cancel or close an order that is not part of this cycle.

A wake is a full run. Use 15, 30, or 60 minutes. A daily buy uses one wake a day. Do not schedule every 5 minutes just to look at the price.

Each wake does this and then stops:

1. Read `voltjuice account` and one mark from `voltjuice markets`.
2. If the account is flat, run `voltjuice strategy tick --mark <mark> --balance <balance> --flat`.
3. Otherwise run `voltjuice strategy tick --mark <mark> --balance <balance>`.
4. `wait` means do nothing. `reason` `box` means the master address is not saved yet. `open` or `add` means one market buy of the printed notional, then `voltjuice strategy note --action open --price <fill>` or `--action add`. `close` means one reduce-only market sell, then `voltjuice strategy note --action close`.

`account` on the tick is where the order belongs. When it is the master, send it with `voltjuice order --from-strategy`. When it is a different address, that order command would land on the master, so do not send it. `voltjuice strategy box master` clears a saved sub-account.

A hand order is not a wake. If `voltjuice next` includes `manual`, follow `skills/risk/SKILL.md` and wait for the user before `--share`.

Set the rule once with `voltjuice strategy set`. The base and each add are at least 11 USDC and inside the cap. Say the reserved total before the first live run: base plus add times the maximum adds.

Grok does not watch the price between wakes. There is no exchange event for a tick, a fill, or an order change. The next schedule is the next chance to tick. A webhook runs that same tick once only when some other program POSTs it. Do not invent that program. Do not say the site will send it. Do not treat a wake as permission to add a rule.

The key stays where it already is. Do not ask for a server to hold it.
