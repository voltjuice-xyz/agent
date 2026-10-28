---
name: voltjuice-risk
description: Keep a VoltJuice live order inside the user's cap, and close positions only when they ask. Use before a live order, before a 24-hour routine, and when they say stop or flatten.
---

# Risk

The API wallet cannot withdraw, transfer, or move margin. Do not look for a way around that.

## Before a live order

1. `voltjuice next` says `trade`, and `canTrade` is true.
2. The size is at least 11 USDC and not above the cap.
3. Say the order back in one sentence.
4. If `voltjuice next` includes `manual`, this is a hand order on an account that already has a strategy. Say that warning in the user's language and wait for a yes. Only then repeat the order with `--share`. Do not add `--share` yourself. A wake that is carrying out `strategy tick` uses `--from-strategy` and does not ask again.

5. Default is perp, cross margin, and no leverage change. Isolated margin, leverage, stops, scale, and TWAP come from `skills/orders/SKILL.md` only when the user's words need them.

A 24-hour routine uses the size and cap checks on every run, and sends with `--from-strategy`. It does not ask about the shared account again. If `balance` cannot cover the order, skip the run and tell them. Do not shrink the cap and do not borrow size from somewhere else.

## When they say stop

Pause new orders with `voltjuice mode paper`. Leave the position and the resting orders unless they also asked to close.

## When they say close everything

Confirm once, unless their message already said to close now. Then:

1. `voltjuice orders`. Cancel each resting order with `voltjuice cancel --market ... --oid ...`. Tell them how many you cancelled.
2. `voltjuice account`. For each open position, send the opposite side with `--reduce-only` and `--type market`. Do not pass a notional; the command closes that position.
3. Run `voltjuice account` again. Report `balance` and any position that is still open.

Do not cancel or close because a single order failed. That path is `skills/errors/SKILL.md`.

If they named a loss limit and the account is past it, pause with `voltjuice mode paper` and ask before closing. Do not invent a loss number.

Speak the user's language.
