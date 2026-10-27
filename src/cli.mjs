#!/usr/bin/env node
import { Wallet } from "ethers";
import { clampLeverage, decideOrder, isAddress, isPrivateKey, scrub } from "./decide.mjs";
import { forgetKey, keyStoreName, readKey, writeKey } from "./keychain.mjs";
import { readConfig, readPaper, recordPaper, setMaster, setMode } from "./store.mjs";
import { loadAccount, loadMarkets, quoteOrder, sendOrder } from "./trade.mjs";

function help() {
  console.log(`voltjuice

  status
  next
  key set
  key forget
  doctor
  master 0x...
  mode paper
  mode live --cap 100
  markets
  account
  paper
  order --market BTC --side buy --notional 20 [--reduce-only] [--leverage 5]

Practice mode is the default. The API wallet key stays in the keychain and cannot withdraw.`);
}

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function has(name) {
  return process.argv.includes(name);
}

function refuseArgKeys() {
  if (process.argv.some((arg) => isPrivateKey(arg))) {
    console.error("Refusing a private key on the command line. Run: voltjuice key set");
    process.exit(1);
  }
}

function short(address) {
  if (!isAddress(address)) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function printStatus() {
  const config = readConfig();
  let signer = "";
  const key = readKey();
  if (key) signer = short(new Wallet(key).address);
  console.log(
    JSON.stringify({
      mode: config.mode,
      cap: config.cap,
      master: config.master ? short(config.master) : "",
      key: key ? "present" : "absent",
      store: keyStoreName(),
      signer,
    }),
  );
}

async function readStdin() {
  if (process.stdin.isTTY) {
    process.stdout.write("Paste the API wallet key, then press Enter.\n");
  }
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function printNext(config) {
  const key = readKey();
  const report = {
    key: key ? "present" : "absent",
    master: config.master ? short(config.master) : "",
    mode: config.mode,
    cap: config.cap,
    accountValue: "",
    next: "key",
  };
  if (!key) {
    console.log(JSON.stringify(report));
    return;
  }
  if (!config.master) {
    report.next = "master";
    console.log(JSON.stringify(report));
    return;
  }
  const ready = config.mode === "live" && config.cap >= 10;
  if (process.env.VOLTJUICE_OFFLINE === "1") {
    report.next = ready ? "trade" : "cap";
    console.log(JSON.stringify(report));
    return;
  }
  try {
    const account = await loadAccount(config.master);
    report.accountValue = account.accountValue;
    if (!(Number(account.accountValue) > 0)) report.next = "funds";
    else report.next = ready ? "trade" : "cap";
  } catch (error) {
    report.next = "account";
    report.accountValue = scrub(error instanceof Error ? error.message : "unavailable");
  }
  console.log(JSON.stringify(report));
}

async function place(config) {
  const market = flag("--market");
  const side = flag("--side");
  if (side !== "buy" && side !== "sell") {
    console.error("Pass --side buy or --side sell.");
    process.exit(1);
  }
  const leverage = flag("--leverage") ? clampLeverage(flag("--leverage")) : null;
  if (flag("--leverage") && !leverage) {
    console.error("Leverage must be from 1 to 20.");
    process.exit(1);
  }
  const reduceOnly = has("--reduce-only");
  let notional = Number(flag("--notional"));
  if (reduceOnly && !flag("--notional")) {
    if (!config.master) {
      console.error("Set the master address before a full close.");
      process.exit(1);
    }
    const account = await loadAccount(config.master);
    const position = account.positions.find((row) => row.coin.toUpperCase() === market.toUpperCase());
    if (!position) {
      console.error("No open position in that market.");
      process.exit(1);
    }
    const size = Number(position.size);
    const closingSide = size > 0 ? "sell" : "buy";
    if (side !== closingSide) {
      console.error(`This position closes with --side ${closingSide}.`);
      process.exit(1);
    }
    notional = Math.abs(position.value);
  }
  const decision = decideOrder({ mode: config.mode, cap: config.cap, notional });
  if (!decision.ok) {
    const message = {
      small: "The smallest order is 10 USDC.",
      cap: "Set a live cap from 10 to 100000 before a live order.",
      "over-cap": "That order is above the cap.",
    }[decision.reason];
    console.error(message);
    process.exit(1);
  }
  if (process.env.VOLTJUICE_OFFLINE === "1") {
    recordPaper({ at: new Date().toISOString(), market, side, notional, reduceOnly, offline: true });
    console.log(JSON.stringify({ ok: true, route: "paper", market, side, notional }));
    return;
  }
  const markets = await loadMarkets();
  const quote = quoteOrder(markets, { market, side, notional, reduceOnly });
  if (!quote.ok) {
    console.error(quote.reason === "market" ? "Unknown market." : "The size is too small.");
    process.exit(1);
  }
  if (decision.route === "paper") {
    recordPaper({ at: new Date().toISOString(), ...quote });
    console.log(JSON.stringify({ ok: true, route: "paper", market: quote.market, side, size: quote.size, price: quote.price }));
    return;
  }
  const key = readKey();
  if (!key) {
    console.error("No API wallet key in the keychain. Run: voltjuice key set");
    process.exit(1);
  }
  const sent = await sendOrder(key, quote, leverage);
  if (!sent.ok) {
    console.error(sent.reason || "Order was not accepted.");
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, route: "live", market: quote.market, side, size: quote.size, price: quote.price }));
}

async function main() {
  refuseArgKeys();
  const command = process.argv[2] ?? "help";
  const config = readConfig();
  if (command === "help" || command === "--help") return help();
  if (command === "status") return printStatus();
  if (command === "next") return printNext(config);
  if (command === "key" && process.argv[3] === "set") {
    if (!process.stdin.isTTY && process.env.VOLTJUICE_TEST !== "1") {
      console.error("Type the API wallet key in this computer's terminal. Do not paste it into the chat.");
      process.exit(1);
    }
    const saved = writeKey(await readStdin());
    console.log(saved ? "Key stored." : "That is not an API wallet key.");
    if (!saved) process.exit(1);
    return;
  }
  if (command === "key" && process.argv[3] === "forget") {
    forgetKey();
    console.log("Key removed.");
    return;
  }
  if (command === "master") {
    const next = setMaster(process.argv[3] ?? "");
    if (!next) {
      console.error("Pass the master address.");
      process.exit(1);
    }
    console.log("Master saved.");
    return;
  }
  if (command === "mode" && process.argv[3] === "paper") {
    setMode("paper");
    console.log("Practice mode.");
    return;
  }
  if (command === "mode" && process.argv[3] === "live") {
    const next = setMode("live", flag("--cap"));
    if (!next) {
      console.error("Pass --cap from 10 to 100000.");
      process.exit(1);
    }
    console.log(`Live mode. Per-order cap ${next.cap} USDC.`);
    return;
  }
  if (command === "doctor") {
    const key = readKey();
    const report = {
      platform: process.platform,
      store: keyStoreName(),
      mode: config.mode,
      cap: config.cap,
      key: key ? "present" : "absent",
      signer: key ? short(new Wallet(key).address) : "",
    };
    if (process.env.VOLTJUICE_OFFLINE === "1") {
      console.log(JSON.stringify({ ...report, markets: "skipped" }));
      return;
    }
    try {
      const rows = await loadMarkets();
      console.log(JSON.stringify({ ...report, markets: rows.length }));
    } catch (error) {
      console.log(JSON.stringify({ ...report, markets: scrub(error instanceof Error ? error.message : "unavailable") }));
    }
    return;
  }
  if (command === "markets") {
    const rows = await loadMarkets();
    for (const row of rows.slice(0, 20)) console.log(`${row.name} ${row.markPx}`);
    return;
  }
  if (command === "account") {
    if (!config.master) {
      console.error("Set the master address first.");
      process.exit(1);
    }
    const account = await loadAccount(config.master);
    console.log(JSON.stringify({ accountValue: account.accountValue, positions: account.positions }));
    return;
  }
  if (command === "paper") {
    for (const row of readPaper()) console.log(JSON.stringify(row));
    return;
  }
  if (command === "order") return place(config);
  help();
  process.exit(1);
}

main().catch((error) => {
  console.error(scrub(error instanceof Error ? error.message : "failed"));
  process.exit(1);
});
