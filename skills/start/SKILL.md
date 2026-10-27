---
name: voltjuice-start
description: Lead a non-technical user from nothing to one live VoltJuice order. Use on the first message about VoltJuice, trading, install, an API wallet, or auto trading, even if they only say they want to trade. Do not wait for them to name commands or write a prompt.
---

# Lead the user

The user only chats. You install, open pages, and run commands. They never type a command and never write a prompt for you. Speak their language. If they write Chinese, use the lines below.

Run `voltjuice next` after every step. Do the computer work for that step, then run it again. Stop only for the human actions in that step.

## Install, once

```bash
git clone https://github.com/voltjuice-xyz/agent.git ~/voltjuice-agent
cd ~/voltjuice-agent
npm install
npm link
voltjuice doctor
voltjuice markets
```

If `voltjuice` is missing after `npm link`, call `node ~/voltjuice-agent/src/cli.mjs` instead. Show market names and prices from the command. Do not invent them.

## Steps from `voltjuice next`

`next` is `key`. Open https://app.voltjuice.xyz/API. Hand them the screen once:

「我開咗 API 錢包頁。你登入，建立一個 API 錢包，簽一次名。私鑰出嚟之後唔好貼去對話。貼落我開嘅終端機，然後按 Enter。搞掂話我知。」

On this computer, run `voltjuice key set` in a terminal they can see. They type the key there. Take the screen back when they say they are done. If a key appears in the chat, tell them to revoke that wallet on the API page and start this step again. Do not repeat the key.

`next` is `master`. Read the logged-in account address from the page. Save it with `voltjuice master 0x...`. Do not ask them to copy it.

`next` is `funds`. Open the deposit page on the trading site. Say:

「帳戶未見餘額。我開咗存款頁，你存入之後話我知。網路費由你付。」

Wait. Then run `voltjuice next` again.

`next` is `account`. The address did not load. Re-read it from the page and save it again. Do not ask them to debug.

`next` is `cap`. One question, nothing else:

「每筆真單最多幾多 USDC？最少 10。你講一個數字就得。」

When they name a number from 10 to 100000, run `voltjuice mode live --cap` with that number. Do not pick a cap yourself.

`next` is `trade`. If they already named a market, side, and size, place that order. Otherwise one question:

「第一張真單：邊個市場、買定賣、幾多 USDC？例如 BTC 買 20。」

Then:

```bash
voltjuice account
voltjuice order --market BTC --side buy --notional 20
```

Use their market, side, and size. The smallest order is 10 USDC. An order above the cap is refused. Do not raise the cap. Tell them the result in one sentence: sent, or not sent and why.

If the order is not accepted, open https://app.voltjuice.xyz/trade and say:

「張單未送出。你喺呢頁用市價落一張細單，簽一次，然後話我知。我再幫你送同一張。」

Retry the same order once. Do not ask them to read an error.

## After the first live order

One offer, not a setup quiz:

「手機閂咗我都可以照跑。要的話我幫你設一個排程，每筆仍然唔超過你個上限。」

If they agree, save a routine that only runs `voltjuice account` and `voltjuice order` at or under the cap. The routine text must not contain the key. Pause by running `voltjuice mode paper` or by turning the routine off.
