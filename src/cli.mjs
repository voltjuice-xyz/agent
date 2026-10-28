#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Wallet } from "ethers";
import { decideOrder, isAddress, isPrivateKey, MAX_CAP, MIN_NOTIONAL, nextFromBalance, planOrder, scrub } from "./decide.mjs";
import { applyFill, gridQuote, holdForBox, manualShare, planStrategyTick, readStrategy, strategyFromPlan, writeStrategy } from "./strategy.mjs";
import { forgetKey, keyStoreName, readKey, writeKey } from "./keychain.mjs";
import { readConfig, readPaper, recordPaper, setMaster, setMode } from "./store.mjs";
import { cancelOrder, listOrders, loadAccount, loadMarkets, loadSpotMarkets, sendOrder } from "./trade.mjs";

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
  order --market BTC --side buy --notional 20 [--book perp|spot] [--type market|limit|stop-market|stop-limit|tp-market|tp-limit|scale|twap] [--price 80000] [--trigger 81000] [--scale-from 78000 --scale-to 76000 --scale-count 5] [--minutes 30] [--margin cross|isolated] [--leverage 5] [--tp 90000] [--sl 70000] [--reduce-only] [--share] [--from-strategy]
  orders
  cancel --market BTC --oid 123
  strategy set|show|box|tick|note|quote|import|pull

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

function secretKey() {
  const fromEnv = String(process.env.VOLTJUICE_API_KEY ?? "").trim();
  if (isPrivateKey(fromEnv)) return fromEnv;
  const paths = [
    process.env.GROK_BOX_SECRETS,
    join(homedir(), "box-secrets.json"),
    join(homedir(), ".grok", "box-secrets.json"),
  ].filter(Boolean);
  for (const path of paths) {
    try {
      if (!existsSync(path)) continue;
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      const card = parsed?.card ?? parsed?.secrets ?? parsed;
      const value = String(card?.VOLTJUICE_API_KEY ?? "").trim();
      if (isPrivateKey(value)) return value;
    } catch {
      undefined;
    }
  }
  return "";
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
  const signer = key ? new Wallet(key).address.toLowerCase() : "";
  if (signer && config.master === signer) {
    report.next = "master";
    report.reason = "key-address";
    report.note = "That address is the API wallet. It holds no funds. Save the Master address from the API page.";
    console.log(JSON.stringify(report));
    return;
  }
  const ready = config.mode === "live" && config.cap >= MIN_NOTIONAL;
  if (process.env.VOLTJUICE_OFFLINE === "1") {
    report.next = ready ? "trade" : "cap";
    const share = manualShare(readStrategy(), config.master);
    if (share) report.manual = share.detail;
    console.log(JSON.stringify(report));
    return;
  }
  try {
    const account = await loadAccount(config.master);
    report.balance = account.balance;
    report.spotUsdc = account.spotUsdc;
    report.contractEquity = account.contractEquity;
    report.accountMode = account.mode;
    report.canTrade = account.canTrade;
    report.transfer = account.transfer;
    report.accountValue = account.balance;
    const step = nextFromBalance(account, config);
    report.next = step.next;
    report.note = step.note;
    const share = manualShare(readStrategy(), config.master);
    if (share) report.manual = share.detail;
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
  const reduceOnly = has("--reduce-only");
  const book = flag("--book") === "spot" ? "spot" : "perp";
  const orderType = flag("--type") || "market";
  const margin = flag("--margin") === "isolated" ? "isolated" : "cross";
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
  const decision = decideOrder({ mode: config.mode, cap: config.cap, notional, reduceOnly });
  if (!decision.ok) {
    const message = {
      small: "The smallest order is 11 USDC.",
      cap: "Set a live cap from 11 to 100000 before a live order.",
      "over-cap": "That order is above the cap.",
    }[decision.reason];
    console.error(message);
    process.exit(1);
  }
  const share = manualShare(readStrategy(), config.master);
  const hand = Boolean(share) && !has("--from-strategy");
  if (hand && decision.route === "live" && !has("--share")) {
    console.error(share.detail);
    console.error("Ask the user before this manual order. After they accept, repeat it with --share. A strategy wake uses --from-strategy.");
    process.exit(2);
  }
  const shared = hand ? { warn: "shared", account: "master" } : {};
  if (process.env.VOLTJUICE_OFFLINE === "1") {
    recordPaper({ at: new Date().toISOString(), market, side, notional, reduceOnly, offline: true });
    console.log(JSON.stringify({ ok: true, route: "paper", market, side, notional, ...shared }));
    return;
  }
  const markets = book === "spot" ? await loadSpotMarkets() : await loadMarkets();
  const listed = markets.find((row) => String(row.name).toUpperCase() === market.toUpperCase());
  if (!listed) {
    console.error("Unknown market.");
    process.exit(1);
  }
  const plan = planOrder({
    book,
    side,
    type: orderType,
    mark: listed.markPx,
    szDecimals: listed.szDecimals,
    maxLeverage: listed.maxLeverage,
    price: flag("--price"),
    trigger: flag("--trigger"),
    scaleFrom: flag("--scale-from"),
    scaleTo: flag("--scale-to"),
    scaleCount: flag("--scale-count"),
    minutes: flag("--minutes"),
    margin,
    leverage: flag("--leverage"),
    tp: flag("--tp"),
    sl: flag("--sl"),
    notional,
  });
  if (!plan.ok) {
    const message = {
      side: "Pass --side buy or --side sell.",
      "spot-plain": "Spot orders are market or limit only.",
      leverage: "Leverage must be from 1 to 20 and within that market.",
      type: "Unknown order type.",
      limit: "That order needs --price.",
      trigger: "The trigger is missing or on the wrong side of the mark.",
      scale: "A scale needs --scale-from, --scale-to, and --scale-count from 2 to 20.",
      twap: "A TWAP order needs at least 100 USDC.",
      tp: "Take-profit is on the wrong side of the mark.",
      sl: "Stop-loss is on the wrong side of the mark.",
      size: "The size is too small.",
      price: "No price for that market.",
    }[plan.reason];
    console.error(message || "Order was not accepted.");
    process.exit(1);
  }
  const quote = { ...plan, market: listed.name, asset: listed.asset ?? listed.index, notional, reduceOnly };
  if (decision.route === "paper") {
    recordPaper({ at: new Date().toISOString(), ...quote });
    console.log(JSON.stringify({ ok: true, route: "paper", market: quote.market, side, size: quote.size, price: quote.price, ...shared }));
    return;
  }
  const key = readKey();
  if (!key) {
    console.error("No API wallet key in the keychain. Run: voltjuice key set");
    process.exit(1);
  }
  const sent = await sendOrder(key, quote);
  if (!sent.ok) {
    console.error(sent.reason || "Order was not accepted.");
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, route: "live", market: quote.market, side, size: quote.size, price: quote.price, ...shared }));
}

function tickHoldings() {
  const raw = flag("--holdings");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function pullDeskStrategy(config) {
  const user = String(flag("--user") || config.master || "").trim().toLowerCase();
  if (!isAddress(user)) {
    console.error("Set the master address first.");
    process.exit(1);
  }
  const site = String(flag("--site") || "https://app.voltjuice.xyz").replace(/\/$/, "");
  const url = new URL("/api/bots", site);
  url.searchParams.set("user", user);
  const res = await fetch(url, { headers: { origin: site, accept: "application/json" } });
  if (!res.ok) {
    console.error("The desk did not return a strategy.");
    process.exit(1);
  }
  const body = await res.json();
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const live = rows.find((row) => row && row.status === "saved") ?? rows[0];
  if (!live) {
    console.error("No strategy on the desk for that address.");
    process.exit(1);
  }
  console.log(JSON.stringify(writeStrategy(strategyFromPlan(live, readStrategy()))));
}

async function runStrategy(config) {
  const sub = process.argv[3] ?? "";
  if (sub === "show") {
    console.log(JSON.stringify(readStrategy()));
    return;
  }
  if (sub === "set") {
    const current = readStrategy();
    const next = writeStrategy({
      ...current,
      market: (flag("--market") || current.market).toUpperCase(),
      base: Number(flag("--base") || current.base),
      add: Number(flag("--add") || current.add),
      maxAdds: Math.floor(Number(flag("--max-adds") || current.maxAdds)),
      stepPct: Number(flag("--step") || current.stepPct),
      tpPct: Number(flag("--tp") || current.tpPct),
      status: "saved",
    });
    console.log(JSON.stringify(next));
    return;
  }
  if (sub === "tick") {
    const saved = readStrategy();
    const book = has("--flat") ? { ...saved, open: false, adds: 0, last: 0, avg: 0, spent: 0 } : saved;
    if (has("--flat") && saved.open) writeStrategy(book);
    const cap = config.mode === "live" ? config.cap : MAX_CAP;
    const pnl = flag("--pnl");
    const roi = flag("--roi");
    console.log(JSON.stringify(holdForBox(
      planStrategyTick({
        ...book,
        mark: flag("--mark"),
        cap,
        balance: flag("--balance"),
        holdings: tickHoldings(),
        pnl: pnl === "" ? undefined : Number(pnl),
        roi: roi === "" ? undefined : Number(roi),
      }),
      book.box,
      config.master,
    )));
    return;
  }
  if (sub === "box") {
    const address = String(process.argv[4] ?? flag("--address")).trim().toLowerCase();
    const master = String(config.master ?? "").trim().toLowerCase();
    if (address === "master" || address === "clear" || (master && address === master)) {
      console.log(JSON.stringify(writeStrategy({ ...readStrategy(), box: "" })));
      return;
    }
    if (!isAddress(address)) {
      console.error("Pass a sub-account address, or master to use the master account.");
      process.exit(1);
    }
    console.log(JSON.stringify(writeStrategy({ ...readStrategy(), box: address })));
    return;
  }
  if (sub === "note") {
    const next = applyFill(readStrategy(), flag("--action"), flag("--price"));
    if (!next) {
      console.error("Pass --action open, add, close, grid, or rebalance. Open, add, grid, and rebalance also need --price.");
      process.exit(1);
    }
    console.log(JSON.stringify(writeStrategy(next)));
    return;
  }
  if (sub === "quote") {
    console.log(JSON.stringify(gridQuote({
      lower: flag("--lower"),
      upper: flag("--upper"),
      levels: flag("--levels"),
      mode: flag("--mode") || "arithmetic",
      book: flag("--book") || "perp",
    })));
    return;
  }
  if (sub === "import") {
    const file = flag("--file");
    if (!file) {
      console.error("Pass --file.");
      process.exit(1);
    }
    const plan = JSON.parse(readFileSync(file, "utf8"));
    console.log(JSON.stringify(writeStrategy(strategyFromPlan(plan, readStrategy()))));
    return;
  }
  if (sub === "pull") return pullDeskStrategy(config);
  console.error("Use strategy show, set, box, tick, note, quote, import, or pull.");
  process.exit(1);
}

async function main() {
  refuseArgKeys();
  const command = process.argv[2] ?? "help";
  const config = readConfig();
  if (command === "help" || command === "--help") return help();
  if (command === "status") return printStatus();
  if (command === "next") return printNext(config);
  if (command === "key" && process.argv[3] === "set") {
    const secret = secretKey();
    if (secret) {
      const saved = writeKey(secret);
      console.log(saved ? "Key stored." : "That is not an API wallet key.");
      if (!saved) process.exit(1);
      return;
    }
    if (!process.stdin.isTTY && process.env.VOLTJUICE_TEST !== "1") {
      console.error("Ask for the API wallet key with a secret card named VOLTJUICE_API_KEY. Do not paste it into the chat.");
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
      console.error("Pass --cap from 11 to 100000.");
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
    console.log(JSON.stringify({
      balance: account.balance,
      spotUsdc: account.spotUsdc,
      contractEquity: account.contractEquity,
      accountMode: account.mode,
      canTrade: account.canTrade,
      transfer: account.transfer,
      positions: account.positions,
      note: "The balance field is what the user can trade. Contract equity 0 does not mean the balance is 0.",
    }));
    return;
  }
  if (command === "paper") {
    for (const row of readPaper()) console.log(JSON.stringify(row));
    return;
  }
  if (command === "orders") {
    if (!config.master) {
      console.error("Set the master address first.");
      process.exit(1);
    }
    const rows = await listOrders(config.master);
    if (!rows.length) console.log(JSON.stringify({ orders: 0 }));
    for (const row of rows) console.log(JSON.stringify(row));
    return;
  }
  if (command === "cancel") {
    const key = readKey();
    if (!key) {
      console.error("No API wallet key in the keychain. Run: voltjuice key set");
      process.exit(1);
    }
    const oid = Number(flag("--oid"));
    const market = flag("--market");
    if (!market || !(oid > 0)) {
      console.error("Pass --market and --oid.");
      process.exit(1);
    }
    const markets = await loadMarkets();
    const spot = await loadSpotMarkets();
    const listed = [...markets, ...spot].find((row) => String(row.name).toUpperCase() === market.toUpperCase());
    if (!listed) {
      console.error("Unknown market.");
      process.exit(1);
    }
    await cancelOrder(key, listed.asset ?? listed.index, oid);
    console.log(JSON.stringify({ ok: true, oid }));
    return;
  }
  if (command === "strategy") return runStrategy(config);
  if (command === "order") return place(config);
  help();
  process.exit(1);
}

main().catch((error) => {
  console.error(scrub(error instanceof Error ? error.message : "failed"));
  process.exit(1);
});
