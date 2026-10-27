import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { Wallet } from "ethers";
import { findMarket, floorSize, limitPrice, MIN_NOTIONAL, scrub, toSignificantDigits, tradableUsd } from "./decide.mjs";

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

export async function listOrders(address) {
  const rows = await info().frontendOpenOrders({ user: address });
  return (rows ?? []).map((row) => ({
    oid: row.oid,
    coin: row.coin,
    side: row.side,
    size: row.sz,
    price: row.limitPx,
  }));
}

export async function cancelOrder(privateKey, asset, oid) {
  const client = new ExchangeClient({
    transport: new HttpTransport({ isTestnet: false, timeout: 15_000 }),
    wallet: new Wallet(privateKey),
  });
  await client.cancel({ cancels: [{ a: asset, o: Number(oid) }] });
  return { ok: true };
}

export async function loadSpotMarkets() {
  const [meta, ctx] = await info().spotMetaAndAssetCtxs();
  return meta.universe
    .map((pair, position) => {
      const index = Number.isInteger(pair.index) ? pair.index : position;
      const base = meta.tokens.find((token) => token.index === pair.tokens[0]);
      const quote = meta.tokens.find((token) => token.index === pair.tokens[1]);
      const snap = ctx[position];
      return {
        name: base?.name ?? pair.name,
        quote: quote?.name ?? "",
        asset: 10_000 + index,
        markPx: snap?.markPx ?? "0",
        szDecimals: typeof base?.szDecimals === "number" ? base.szDecimals : 2,
        maxLeverage: 1,
      };
    })
    .filter((row) => row.quote === "USDC" && Number(row.markPx) > 0 && row.asset > 0);
}

function protectLeg(asset, entryBuy, size, trigger, tpsl) {
  const closeBuy = !entryBuy;
  const limit = Number(trigger) * (closeBuy ? 1.005 : 0.995);
  return {
    a: asset,
    b: closeBuy,
    p: toSignificantDigits(limit),
    s: size,
    r: true,
    t: { trigger: { isMarket: true, triggerPx: trigger, tpsl } },
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

export async function sendOrder(privateKey, order) {
  const client = new ExchangeClient({
    transport: new HttpTransport({ isTestnet: false, timeout: 15_000 }),
    wallet: new Wallet(privateKey),
  });
  if (order.book !== "spot" && order.leverage) {
    await client.updateLeverage({
      asset: order.asset,
      isCross: order.isCross !== false,
      leverage: order.leverage,
    });
  }
  if (order.kind === "twap") {
    const result = await client.twapOrder({
      twap: {
        a: order.asset,
        b: order.side === "buy",
        s: order.size,
        r: Boolean(order.reduceOnly),
        m: order.minutes || 30,
        t: false,
      },
    });
    const status = result?.response?.data?.status;
    if (status && typeof status === "object" && status.error) return { ok: false, reason: scrub(status.error) };
    return { ok: true };
  }
  const buy = order.side === "buy";
  const orders = order.kind === "scale"
    ? order.legs.map((leg) => ({
        a: order.asset,
        b: buy,
        p: leg.p,
        s: leg.s,
        r: Boolean(order.reduceOnly),
        t: { limit: { tif: "Gtc" } },
      }))
    : [
        {
          a: order.asset,
          b: buy,
          p: order.price,
          s: order.size,
          r: Boolean(order.reduceOnly),
          t: order.kind === "trigger"
            ? { trigger: { isMarket: order.isMarket !== false, triggerPx: order.trigger, tpsl: order.tpsl } }
            : { limit: { tif: order.tif === "Gtc" ? "Gtc" : "Ioc" } },
        },
      ];
  if (order.kind === "limit" && order.tp) orders.push(protectLeg(order.asset, buy, order.size, order.tp, "tp"));
  if (order.kind === "limit" && order.sl) orders.push(protectLeg(order.asset, buy, order.size, order.sl, "sl"));
  const result = await client.order({
    orders,
    grouping: orders.length > 1 && order.kind === "limit" ? "normalTpsl" : "na",
    builder: { b: DESK_FEE_ADDRESS, f: DESK_FEE_TENTHS_BPS },
  });
  const statuses = result?.response?.data?.statuses ?? [];
  const error = statuses.find((row) => row?.error)?.error;
  if (error) return { ok: false, reason: scrub(error) };
  return { ok: true };
}
