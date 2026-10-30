---
name: voltjuice-intent
description: Turn a user's plain-language trading idea into one order or a 24-hour strategy. Use when they say what they want to buy, sell, or automate, including vague retail ideas. Do not start with a parameter form.
---

# Listen, then choose one path

The user talks like a person. They may not know leverage, margin, or indicators. Do not quiz them. Do not ask them to name a command.

Finish `voltjuice next` until `next` is `trade` before sending anything. The balance you mention is `balance`.

When the account can trade, ask once, in their language:

"Do you want one order now, or a strategy that keeps running after you close the phone? Describe the trade in your own words."

Skip the question when they already said which one.

## One order

Use this when they describe a situation: a coin, a price, a size, "buy the dip", or "close it". Do not create a schedule.

Map their words onto one `voltjuice order`:

- Coin and buy or sell come from their sentence. If size is missing, use 11 USDC or their cap, whichever is smaller, and tell them the number.
- "At a price" or "if it falls to" is `--type limit --price`. "Now" or no price is `--type market`. A stop, a standalone take-profit, a ladder, TWAP, a chase, or a trailing stop is in `skills/orders/SKILL.md`. Use that file only for those words. Do not offer them first.
- They said a coin spot purchase, or named no leverage: `--book spot` only when they said spot. Otherwise `--book perp`.
- They did not mention margin or leverage: `--margin cross` and no leverage change. Do not ask.
- They named a target or a pain level: `--tp` and `--sl` on a perp order. A long target is above the mark and the pain level is below. A short is the reverse. If the side is wrong, fix it and tell them in one sentence. Do not attach these to a spot order.
- Read `accountMode`. Shared accounts (`unifiedAccount`, `portfolioMargin`) never move funds. Split accounts (`default`, `disabled`) stop on `next` of `move`.

Say the order back in one sentence, then send it if they already asked you to do it. Ask whether to place it only when the sentence was ambiguous. Speak the user's language.

## Always on

Use this when they say automatic, all day, 24 hours, or a strategy. That word is not a strategy. Do not answer it with one fixed plan. Cross margin, 3x, a market entry, take-profit about 8%, and a stop about 4% is only a connection check, and only when they ask to see whether an order can be sent. Say that it is a check. Do not call it their strategy.

There are two machines. Do not mix them. Read `skills/signals/SKILL.md`.

The four bots on the site already have their parameters. If they mean one of those, do not add a rule. They change the parameters on the site. `voltjuice strategy pull` and `voltjuice strategy tick` only carry out that saved plan.

Grok's own strategy is the other machine. Grok writes the rule—including any quant conditions the user named—and sends the order. It wakes on a schedule, normally every 15, 30, or 60 minutes, or once an hour or once a day for a slow buy. It does not see a price tick, a fill, or an order change. A fill between wakes is handled at the next wake. A saved price level on the API page can POST a price webhook when that level is broken; that wake then runs Grok's full saved rule. Opt-in **central** indicator signals (MA / MACD / ATR catalog) can also wake it after the user subscribes on `/API` or via `wake subscribe`. Do not invent freeform Pine conditions on the desk. Do not teach TradingView → Grok webhook as the default path.

If they only said "automatic" and did not say which machine, ask once, in their language: use one of the four bots already on the site, or have Grok keep its own slow rule and check it on a schedule. Then follow that answer. Do not turn their sentence into a desk grid, a DCA, or a basket unless they asked for that bot.

Size is the smaller of their cap and one fifth of `balance`, and at least 11 USDC, unless they named a size. Shared balance stays where it is. The API wallet address receives nothing. Each run reads `voltjuice account` first. If the rule says wait, send nothing. Never add a second position the rule did not name, and never raise the cap.

When they accept, save the routine from the routine skill. Repeat the finished rule in plain language before the first live run. A leverage number from 1 to 20 changes only leverage. Any other answer changes only the piece they named.
