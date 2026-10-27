# VoltJuice agent

Local trading assistant for [VoltJuice](https://voltjuice.xyz). It installs in Cursor and on a Grok Bot cloud computer. The API wallet key stays on that computer. VoltJuice does not receive the key, and the key cannot withdraw.

Practice mode is the default. A practice order is saved on this computer and is not sent. Live orders are sent only after you set a per-order cap, and only up to that cap.

## Install

```bash
git clone https://github.com/voltjuice-xyz/agent.git ~/voltjuice-agent
cd ~/voltjuice-agent
npm install
npm link
```

In Cursor, link the plugin and reload the window:

```bash
mkdir -p ~/.cursor/plugins/local
ln -s ~/voltjuice-agent ~/.cursor/plugins/local/voltjuice
```

## Connect

1. Open [the API wallet page](https://app.voltjuice.xyz/API) and create an API wallet. The master wallet signs once. The page shows the private key once.
2. On a Mac the key goes into the keychain. On a Grok Bot computer it goes into a locked file on that computer. Type it into that computer's terminal, not into a chat:

   ```bash
   voltjuice key set
   ```

3. Save the master address shown on the trading site:

   ```bash
   voltjuice master 0x...
   voltjuice status
   voltjuice account
   ```

## Trade

```bash
voltjuice markets
voltjuice order --market BTC --side buy --notional 20
voltjuice paper
```

The smallest order is 10 USDC. Switch to live only when you want real orders:

```bash
voltjuice mode live --cap 100
voltjuice order --market BTC --side sell --reduce-only
voltjuice mode paper
```

`--leverage` is optional and limited to 1–20. It changes the whole position. A reduce-only order with no notional closes the position only when that position's value is within the cap.

## Limits

- The command line refuses a private key argument.
- There is no withdraw, transfer, or margin-move command.
- The desk fee is always attached. Fills stay on your VoltJuice account.
- This package has no platform credentials.

## 繁體中文

這是 VoltJuice 的交易助手。API 錢包私鑰放在 Grok Bot 的雲端電腦，網站不會收到這把鑰匙，它也不能提款。手機關掉之後，由 Bot 的排程繼續執行。

預設是模擬。模擬單只記在這台電腦。要下真單，先設定單筆上限，例如 `voltjuice mode live --cap 100`。超過上限的單會被拒絕。

私鑰請在自己的終端機執行 `voltjuice key set` 後貼上，不要貼進對話。
