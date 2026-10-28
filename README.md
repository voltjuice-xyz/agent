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

A repeating strategy runs only in its own sub-account, with one key, and that key is used only with that sub-account address. Do not run it on the master account. Do not read the master's positions as the strategy's positions. Do not cancel or close an order that does not belong to that strategy. If a sub-account cannot be created, show the plan and stop. Several master accounts are the user's own choice. Still keep each strategy in its own sub-account.

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

6. `next` is `trade`. Ask once whether they want one order now or a strategy that keeps running. They answer in their own words. One situation ("buy BTC if it falls to 80000") is one order. "Automatic" or "24 hours" is a strategy: propose cross margin, 3x, a market entry, take-profit about 8% and a stop about 4%, and ask only if they want a different leverage. Do not hand them a blank form.

```bash
voltjuice order --market BTC --side buy --notional 20
```

7. If the order is not accepted, open https://app.voltjuice.xyz/trade and ask them to place one small market order there and sign once. Send the same order once more.

8. After a live order is sent, offer one schedule for when the phone is closed. Each run stays at or under the cap. The schedule text must not contain the key. Pause with `voltjuice mode paper`.

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

