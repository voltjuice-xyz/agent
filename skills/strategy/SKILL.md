---
name: voltjuice-strategy
description: Run one slow dip-buy cycle. Use when the user wants prices to fall before adding, and the whole position sold at a take-profit. One wake does one action.
---

# Slow dip-buy

This is one buy, then extra buys only after the price falls, then one close when the average is up. It is not a grid, and it is not a check every few seconds.

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

Do not send a webhook for every price. A webhook is useful only when an outside program has already seen one level crossed. Then run the same tick once. Do not invent that program.

The key stays where it already is. Do not ask for a server to hold it.
