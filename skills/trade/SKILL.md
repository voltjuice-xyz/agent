---
name: voltjuice-trade
description: Place VoltJuice practice or live orders from the local CLI. Use when the user asks the agent to trade, check markets, open, reduce, or review a VoltJuice position.
---

# Trade

Run the `voltjuice` command. Do not invent balances. Read them with `voltjuice account`.

## Practice

Practice is the default. Orders are recorded on this computer and are not sent.

```bash
voltjuice markets
voltjuice order --market BTC --side buy --notional 20
voltjuice paper
```

The smallest order is 10 USDC.

## Live

Switch only after the user names a per-order cap:

```bash
voltjuice mode live --cap 100
voltjuice order --market BTC --side buy --notional 20
```

An order above the cap is refused. To close, use the opposite side and `--reduce-only`. A reduce-only order with no notional closes the position only when that position's value is within the cap.

```bash
voltjuice order --market BTC --side sell --reduce-only
```

Optional `--leverage` is limited to 1–20 and changes the whole position.

Return to practice with `voltjuice mode paper`. Practice mode does not erase the key.
