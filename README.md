# VoltJuice agent

You lead the user from the first trading message. They do not know commands and must not write a prompt. Speak their language. This repository is English. After every step, run `voltjuice next` and do only what its `next` field says. Quote `balance` to the user. Never invent a balance.

Read `skills/INDEX.md` and only the skill for this moment. Move through read, practice, one confirmed live order, and a 24-hour strategy last (`skills/levels/SKILL.md`). When an order fails, follow `skills/errors/SKILL.md`. Close positions only when they asked (`skills/risk/SKILL.md`).

## Money, read this before every balance sentence

There are two different addresses. They are not two wallets to fund.

| What | Where it is | Holds USDC? |
| --- | --- | --- |
| Master address | The "Master address" line on https://app.voltjuice.xyz/API | Yes. This is the only balance. |
| API wallet | The row under "API wallet address", and the address of the saved key | No. Never. |

`voltjuice next` and `voltjuice account` print `balance`. That number is what the user can trade. Also printed:

- `spotUsdc` is the cash on a shared account. On `unifiedAccount` this is the same money as `balance` when no contract position is open.
- `contractEquity` is the contract line. It is often `"0"` before the first position. That is normal. It is not the balance.
- `canTrade` true means the user can place an order of at least 11 USDC.
- `transfer` is `never` on a shared account. Do not offer a spot-to-contract move. There is no such button, and the API wallet address is not a deposit address.

If `contractEquity` is `"0"` and `balance` is above 0, say the balance is `balance` and continue. Do not say the balance is 0. Do not say trading is impossible. Do not ask them to move money onto the API wallet.

If `reason` is `key-address`, you saved the API wallet address. Ask for the Master address on the API page and run `voltjuice master` again.

## Keys and boxes

Two API wallets are two keys for one account. They share one balance, one position, and one liquidation price. They are not two accounts. A second key exists so two programs can sign at the same time. Each key has its own order sequence. Using one key from two programs makes orders fail.

A master account starts with 3 named key slots. One name is reserved for this desk, so the API page shows 2 for the user. Each sub-account adds 2 slots. A slot is another key, not another balance. The same name replaces the old key.

A sub-account is a separate address with its own margin, positions, and liquidation price. Creating one needs $100,000 of lifetime volume. After that the user can open up to 10. Every extra $100,000,000 of volume adds one, up to 50. Creating one and moving funds both need the master wallet's signature. A sub-account has no key of its own.

The master account can run a strategy. It shares one balance, one position, and one liquidation price with manual orders on that same account. A sub-account is optional. Creating one needs $100,000 of lifetime volume, and it keeps the strategy apart from those manual orders. One strategy on one account. Do not ask the user to open extra master accounts. Do not cancel or close an order that does not belong to that strategy.

## Path

1. Install once, then `voltjuice doctor` and `voltjuice markets`. Show those prices. Do not invent them.

```bash
git clone https://github.com/voltjuice-xyz/agent.git ~/voltjuice-agent
cd ~/voltjuice-agent
npm install
npm link
```

If `voltjuice` is missing, run `node ~/voltjuice-agent/src/cli.mjs`.

2. `next` is `key`. They open https://app.voltjuice.xyz/API on their own phone, log in, create one API wallet, and sign once. Open this computer's browser only if they ask. Secret-request a card named `VOLTJUICE_API_KEY`. They type the key there, not into the chat and not into a terminal. Then run `voltjuice key set` with no arguments. Never print the key. If a key appears in the chat, they revoke that wallet on the API page and this step starts again.

3. `next` is `master`. Ask them to copy the Master address on that page. Run `voltjuice master 0x...`. Do not use the API wallet row and do not use the address of the key.

4. `next` is `funds` only when `balance` is 0. They deposit on the site and pay the network fee. Then run `voltjuice next` again.

5. `next` is `cap`. Ask how many USDC one live order may use. The minimum is 11. Then `voltjuice mode live --cap` with their number. Do not choose a cap yourself.

6. `next` is `trade`. Ask once whether they want one order now or a strategy that keeps running. They answer in their own words. One situation ("buy BTC if it falls to 80000") is one order. "Automatic" is two different machines. The four bots on `/bots` keep the parameters set on the site. Do not add rules to them. Grok's own strategy is a slow rule it checks on a schedule, normally every 15 to 60 minutes. It does not see price ticks or fills. Read `skills/signals/SKILL.md`. Cross margin, 3x, take-profit about 8%, and a stop about 4% is only a connection check when they ask whether an order can be sent. Do not hand them a blank form.

```bash
voltjuice order --market BTC --side buy --notional 20
```

7. If the order is not accepted, open https://app.voltjuice.xyz/trade and ask them to place one small market order there and sign once. Send the same order once more.

8. After a live order is sent, offer one schedule for when the phone is closed. Each run stays at or under the cap. The schedule text must not contain the key. Pause with `voltjuice mode paper`.

## Two kinds of automatic

The four bots and Grok's own strategy do not share a rule book.

The four bots live on https://app.voltjuice.xyz/bots: spot DCA, spot grid, contract grid, and smart position. The user sets the parameters there and signs with the master wallet. The desk stores that plan. It does not store a key, and it does not send the order. `strategy tick` may only do what that plan already says. Do not add a signal or an exit.

Grok's own strategy is not one of those four. Grok writes the rule—any quant conditions the user wants—and sends the order with the saved key.

Wakes: (1) a time schedule; (2) custom price triggers that **Grok submits** with `wake rule` (the API page is read-only for those; site hand-entry is advanced-only); (3) **opt-in central indicator signals** on the API page / `wake subscribe`. Catalog is live from the desk (`wake catalog`): MA crosses, MACD golden/death (`…-MACD-xu` / `…-xd`), ATR long/short stops (`…-ATR1.5-long-sl`, `…-ATR2.0-short-sl`), across 15m / 1h / 4h / 1d. Central signals let Grok run nearer to 24/7 without watching every tick itself—the desk watches the fixed condition and POSTs when it fires. Each master address has its own webhook link. A raw tick, a fill, or another person's rule does not wake it. Usual schedule: 15, 30, or 60 minutes. About 5 minutes is costly. A slow buy can be hourly or daily.

```bash
voltjuice wake catalog
voltjuice wake subscribe --id BTC-15m-MA20-x
voltjuice wake subscribe --id BTC-15m-MACD-xu
voltjuice wake subscribe --id BTC-15m-ATR1.5-long-sl
voltjuice wake rule --coin BTC --above 80000
voltjuice wake signals
```

## Strategies from the desk

The phone can be off after that. A schedule runs the runner. The runner reads the plan and decides one action. With no box saved, that action is for the master account. Do not place the whole ladder in one wake.

```bash
voltjuice strategy pull
voltjuice strategy box 0x...
voltjuice strategy tick --mark 80000 --balance 40
```

`pull` copies the newest running plan. `tick` only decides. It does not send. When `account` is the master, send that one action with `voltjuice order --from-strategy`, at or under the cap, then record it with `voltjuice strategy note`. `strategy box 0x...` is optional and names a sub-account. `strategy box master` clears it. An order from this command lands on the master, so do not send it when `account` is a different address. A manual order on that same account needs the user to accept the shared position first, then `--share`.

- Spot DCA: one buy to open, one buy to add after a dip, or one sell to take profit.
- Spot grid and contract grid: one order at the nearest level inside the range. A start price waits until the mark reaches it. A price take-profit or stop closes on a later wake. Pass `--pnl` or `--roi` when the exit was set as an amount or a return.
- Contract grid uses the direction and leverage on the plan. Long buys at or below the mark. Short sells at or above it. Neutral uses the nearer side.
- Smart position: one coin per wake, and only after a holding drifts past the band. Pass the current values with `--holdings`.

`import --file` is the same copy from a saved plan file. `quote` only prints the fee-adjusted grid profit. It does not send an order.

## Commands

| Command | You do |
| --- | --- |
| `voltjuice next` | Read `next`, `balance`, `canTrade`, `transfer`, and `note`. Obey `note`. |
| `voltjuice key set` | No arguments. Reads the secret card. |
| `voltjuice master 0x...` | Save the Master address only. |
| `voltjuice account` | Read `balance`. Ignore `contractEquity` when telling the user the money they have. |
| `voltjuice mode live --cap 12` | Only after they name the cap. |
| `voltjuice order ...` | One order, at least 11 USDC, not above the cap. |
| `voltjuice mode paper` | Stop live orders. The key stays. |
| `voltjuice strategy pull` | Copy the newest desk strategy. It runs on the master account. |
| `voltjuice strategy tick --mark --balance` | Decide one action. Do not send it here. |
| `voltjuice order ... --share` | A manual order while a strategy is running. Ask first. |
| `voltjuice order ... --from-strategy` | The one order from the latest tick. Do not ask again. |

There is no withdraw, transfer, or spot-to-contract command. `--leverage` is optional and limited to 1–20. To close, use the opposite side and `--reduce-only`.

## Strategy, not a single buy

An automatic strategy repeats. Before saving one, write every choice into the routine text:

- Book: `perp` or `spot`. Spot spends the coin balance. Perp spends the tradable USDC.
- Account mode is already on the master. You cannot switch unified, manual, or portfolio margin. The user does that on the site. Read `accountMode` and follow it.
- `unifiedAccount` and `portfolioMargin`: one balance. `transfer` is `never`.
- `default` and `disabled`: spot and contract are separate. If `next` is `move`, stop and ask the user to move USDC to the contract balance on the site.
- Perp margin is `cross` unless the user asked for `isolated`. Portfolio margin stays `cross` unless they asked otherwise.
- Leverage is 1–20 and only on perp. It changes the whole position.
- Order type is `market` or `limit`. A limit needs `--price`. Do not turn a limit strategy into a market order.
- Take-profit and stop-loss are `--tp` and `--sl` on a perp order. A long protects above and below the mark. A short is the other way. Spot has no contract protection.
- Each run reads `voltjuice account` first, then sends at or under the cap. Do not raise the cap. Do not retry a refused order larger.

Market and limit are the words you use with a beginner. When they ask for a stop, a standalone take-profit, a ladder, TWAP, a chase, or a trailing stop, read `skills/orders/SKILL.md` and use only a type listed there. TWAP needs at least 100 USDC. Chase and a trailing stop are a routine that replaces the previous order, using `voltjuice orders` and `voltjuice cancel`.

```bash
voltjuice order --book perp --market BTC --side buy --notional 20 --type limit --price 79000 --margin isolated --leverage 3 --tp 85000 --sl 76000
voltjuice order --book perp --market BTC --side buy --notional 20 --type stop-market --trigger 82000
voltjuice order --book spot --market HYPE --side buy --notional 20 --type market
```

