---
name: voltjuice-routine
description: After the first live VoltJuice order, offer one schedule that keeps running when the phone is closed. Do not ask the user to design the schedule.
---

# Scheduled trading

Offer this only after one live order has been sent. If they agree, save a routine on this computer. The instruction uses only `voltjuice account` and `voltjuice order` at or under the cap. Do not put the key in the routine text.

Each run stays inside the cap. An order above the cap is refused and must not be retried with a higher cap. Close with the opposite side and `--reduce-only`.

Pause by running `voltjuice mode paper` or by turning the routine off. Practice mode keeps the key on this computer.
