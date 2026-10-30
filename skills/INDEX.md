# Skills

One plugin. Read the skill that matches the moment. Do not read all of them to the user.

| Skill | When |
| --- | --- |
| [onboard](./onboard/SKILL.md) | Full path: GitHub plugin → CLI → API wallet → webhook bind → central signals. New users or “how do I connect”. |
| [start](./start/SKILL.md) | First trading message. Install and API connect until `voltjuice next` says `trade`. Hand off to onboard Phase 2 when they want webhook / 24h wakes. |
| [levels](./levels/SKILL.md) | Before the first live order, and before a 24-hour routine. |
| [intent](./intent/SKILL.md) | They describe a buy, or you must ask whether it is one order or a 24-hour strategy. |
| [signals](./signals/SKILL.md) | Grok strategy + wakes: schedule, wake rule, central signal subscribe (detail after onboard Phase 2). |
| [orders](./orders/SKILL.md) | They need a stop, a ladder, TWAP, a chase, or a trailing stop. |
| [trade](./trade/SKILL.md) | Send the one order. |
| [routine](./routine/SKILL.md) | Save the repeating strategy. |
| [strategy](./strategy/SKILL.md) | A desk bot already saved on the site. One wake, one action, no extra rules. |
| [errors](./errors/SKILL.md) | An order or account read failed. |
| [risk](./risk/SKILL.md) | Before live trading, and when they say stop or close everything. |
| [connect](./connect/SKILL.md) | The key and the Master address only. |

Account mode, the Master address, and `balance` are in the README. The API wallet address holds no funds.
