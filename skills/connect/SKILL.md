---
name: voltjuice-connect
description: Connect one VoltJuice API wallet for a non-technical user. Use when the user wants VoltJuice installed, signed in, or ready to trade. Do the computer work yourself.
---

# Connect VoltJuice

The user only uses chat. You do the install, browser, and commands on this computer. VoltJuice servers never receive the key. The phone does not need to stay open.

## Do this yourself

1. Clone https://github.com/voltjuice-xyz/agent.git into ~/voltjuice-agent, then `npm install` and `npm link`.
2. Run `voltjuice doctor` and `voltjuice markets`. Show the user the result in plain language. Do not invent prices.
3. Open https://app.voltjuice.xyz/API in this computer's browser.

## Hand the screen over once

Tell the user, in their language, that you are handing them the screen to log in and approve one API wallet. They sign once with their own wallet. One account only: the main account or one sub-account.

When the page shows the private key, do not ask them to paste it into the chat. On this computer, run `voltjuice key set` and tell them to type or paste the key into that terminal on the screen, then press Enter. Take the screen back after they say they are done.

If a key appears in the chat, tell them to revoke it on the API page and start again. Do not repeat the key.

## Finish without the key

Read the account address from the logged-in page and save it with `voltjuice master`. Run `voltjuice status` and `voltjuice doctor`. Confirm the key is present. Never print the key.
