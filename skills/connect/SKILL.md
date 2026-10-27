---
name: voltjuice-connect
description: Connect one VoltJuice API wallet on this Bot's computer. Use when the user wants to install VoltJuice, store a trading key, or check whether practice or live mode is on.
---

# Connect VoltJuice

Run these commands on this Bot's computer. The phone does not need to stay open. VoltJuice servers never receive the key.

## Steps

1. The user creates or authorizes one API wallet at https://app.voltjuice.xyz/API. The master wallet signs once. Use the main account or one sub-account, not both. The page shows the private key once.
2. Hand this computer's terminal to the user and ask them to type the key there. Do not ask them to paste it into the chat.

   ```bash
   voltjuice key set
   ```

3. Save the address of that same account:

   ```bash
   voltjuice master 0x...
   voltjuice doctor
   ```

`doctor` may say the key is present. It must not print the key. If a key appears in the chat, tell the user to revoke it on the API page and create a new one.
