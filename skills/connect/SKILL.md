---
name: voltjuice-connect
description: Connect a local VoltJuice API wallet for an agent. Use when the user wants to install VoltJuice, store a trading key, or check whether practice or live mode is on.
---

# Connect VoltJuice

The trading key stays on this computer. VoltJuice servers never receive it.

## Steps

1. The user creates or authorizes an API wallet at https://app.voltjuice.xyz/API while logged in. The master wallet signs once. The page shows the private key once.
2. Tell the user to run this in their own terminal and paste the key there:

   ```bash
   voltjuice key set
   ```

3. Ask for the master account address (the address shown on the trading site, not the API wallet address) and save it:

   ```bash
   voltjuice master 0x...
   ```

4. Check the connection:

   ```bash
   voltjuice status
   voltjuice account
   ```

`status` may say the key is present. It must not print the key.
