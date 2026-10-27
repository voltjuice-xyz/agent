---
name: voltjuice-routine
description: Keep a VoltJuice strategy running on this Bot's cloud computer after the phone is closed. Use when the user wants scheduled or 24/7 auto trading.
---

# Scheduled trading

This Bot's computer keeps running when the phone is closed. A routine on this Bot is what runs the strategy. Do not ask VoltJuice to host the key or the loop.

## Before the first run

1. Connect one API wallet with the connect steps. The key stays on this computer.
2. The user names a per-order cap. Then run `voltjuice mode live --cap 100`, using their number.
3. The account must already have traded once on https://app.voltjuice.xyz so live orders are accepted.

## Routine

Save a routine whose instruction uses only `voltjuice` commands: read `voltjuice account`, then place orders at or under the cap. Do not put the private key in the routine text.

Each run stays inside the cap. An order above the cap is refused and must not be retried with a higher cap. Close with the opposite side and `--reduce-only`.

Pause by telling the user you will run `voltjuice mode paper`, or by turning the routine off. Practice mode keeps the key on this computer.
