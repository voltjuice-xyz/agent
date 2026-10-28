---
name: voltjuice-connect
description: Connect one VoltJuice API wallet. Use only as part of the start path. Do not wait for a separate connect prompt.
---

# Connect

Follow `skills/start/SKILL.md`. Do not stop after install and ask what to do next.

The user signs once on their phone at https://app.voltjuice.xyz/API. The key goes into a secret card named VOLTJUICE_API_KEY, never into the chat or a terminal. Then run `voltjuice key set` with no arguments and save the account address with `voltjuice master`.

That key signs for one account. A second API wallet is a second key for the same balance, not a second account. A strategy can run on that master account.
