import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Wallet } from "ethers";
import { findMarket, floorSize, limitPrice, MIN_NOTIONAL, scrub, tradableUsd } from "./decide.mjs";

const DESK_FEE_ADDRESS = "0xa9F943F44a8068273B0D4a2b6eaB529e2e2Ee483";
const DESK_FEE_TENTHS_BPS = 15;

function info() {
  return new InfoClient({ transport: new HttpTransport({ isTestnet: false, timeout: 15_000 }) });
}

export async function loadMarkets() {
  const [meta, ctx] = await info().metaAndAssetCtxs();
  return meta.universe
    .map((asset, index) => ({
      name: asset.name,
      index,
      markPx: ctx[index]?.markPx ?? "0",
      szDecimals: asset.szDecimals,
      maxLeverage: asset.maxLeverage,
    }))
    .filter((row) => Number(row.markPx) > 0 && !row.name.includes(":"));
}

export async function loadAccount(address) {
  const client = info();
  const [state, spot, mode] = await Promise.all([
    client.clearinghouseState({ user: address }),
    client.spotClearinghouseState({ user: address }),
    client.userAbstraction({ user: address }).catch(() => ""),
  ]);
  const usdc = (spot.balances ?? []).find((row) => row.coin === "USDC");
  const spotUsdc = usdc?.total ?? "0";
  const accountValue = state.marginSummary?.accountValue ?? "0";
  const withdrawable = state.withdrawable ?? "0";
  const positions = (state.assetPositions ?? [])
    .map((row) => ({
      coin: row.position.coin,
      size: row.position.szi,
      value: Number(row.position.positionValue ?? 0),
    }))
    .filter((row) => Number(row.size) !== 0);
  const modeName = typeof mode === "string" ? mode : "";
  const tradable = tradableUsd({ mode: modeName, accountValue, withdrawable, spotUsdc });
  return {
    accountValue: String(tradable),
    balance: String(tradable),
    spotUsdc,
    contractEquity: String(accountValue),
    mode: modeName,
    canTrade: tradable >= MIN_NOTIONAL,
    transfer: modeName === "unifiedAccount" || modeName === "portfolioMargin" ? "never" : "split-only",
    positions,
  };
}

export function quoteOrder(markets, input) {
  const market = findMarket(markets, input.market);
  if (!market) return { ok: false, reason: "market" };
  const price = limitPrice(market.markPx, input.side);
  if (!price) return { ok: false, reason: "price" };
  const size = floorSize(Number(input.notional) / Number(market.markPx), market.szDecimals);
  if (!size) return { ok: false, reason: "size" };
  return {
    ok: true,
    market: market.name,
    asset: market.index,
    side: input.side,
    price,
    size,
    notional: Number(input.notional),
    reduceOnly: Boolean(input.reduceOnly),
  };
}

export async function sendOrder(privateKey, order, leverage) {
  const client = new ExchangeClient({
    transport: new HttpTransport({ isTestnet: false, timeout: 15_000 }),
    wallet: new Wallet(privateKey),
  });
  if (leverage) {
    await client.updateLeverage({ asset: order.asset, isCross: true, leverage });
  }
  const result = await client.order({
    orders: [
      {
        a: order.asset,
        b: order.side === "buy",
        p: order.price,
        s: order.size,
        r: order.reduceOnly,
        t: { limit: { tif: "Ioc" } },
      },
    ],
    grouping: "na",
    builder: { b: DESK_FEE_ADDRESS, f: DESK_FEE_TENTHS_BPS },
  });
  const statuses = result?.response?.data?.statuses ?? [];
  const error = statuses.find((row) => row?.error)?.error;
  if (error) return { ok: false, reason: scrub(error) };
  return { ok: true };
}
