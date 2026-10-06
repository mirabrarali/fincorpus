const allowedExchanges = new Set(["NSE", "BSE"]);
const cacheHeaders = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" };
export const maxDuration = 15;

function unavailable(message: string, status = 503) {
  return Response.json({ error: message, available: false }, { status, headers: { "Cache-Control": "no-store" } });
}

function providerUrl(endpoint: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://api.twelvedata.com/${endpoint}`);
  Object.entries({ ...params, apikey: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  if (type === "gold") {
    try {
      const [goldResponse, exchangeResponse] = await Promise.all([
        fetch("https://api.gold-api.com/price/XAU", { next: { revalidate: 30 }, signal: AbortSignal.timeout(8_000) }),
        fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 300 }, signal: AbortSignal.timeout(8_000) }),
      ]);
      if (!goldResponse.ok || !exchangeResponse.ok) return unavailable("The live gold or currency provider is unavailable.");
      const [gold, exchange] = await Promise.all([goldResponse.json(), exchangeResponse.json()]);
      const usdPerOunce = Number(gold.price);
      const rupeesPerUsd = Number(exchange.rates?.INR);
      if (!Number.isFinite(usdPerOunce) || usdPerOunce <= 0 || !Number.isFinite(rupeesPerUsd) || rupeesPerUsd <= 0) {
        return unavailable("The live providers returned invalid gold or exchange-rate data.");
      }
      return Response.json({
        symbol: "XAU",
        price: Math.round(usdPerOunce * rupeesPerUsd / 31.1034768 * 10),
        currency: "INR",
        unit: "10g",
        updatedAt: gold.updatedAt ?? exchange.time_last_update_utc ?? null,
        source: "Gold-API.com + ExchangeRate-API",
        isLive: true,
      }, { headers: cacheHeaders });
    } catch {
      return unavailable("Could not reach the live gold or currency provider.");
    }
  }

  if (type === "search") {
    const query = (url.searchParams.get("query") ?? "").trim().slice(0, 60);
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) return unavailable("Stock search requires the TWELVE_DATA_API_KEY server environment variable.");
    if (query.length < 2) return Response.json({ results: [] }, { headers: cacheHeaders });

    try {
      const response = await fetch(providerUrl("symbol_search", { symbol: query }, apiKey), {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
      });
      const result = await response.json();
      if (!response.ok || result.status === "error" || !Array.isArray(result.data)) {
        return unavailable("Twelve Data could not search symbols. Check its API key and request limits.");
      }
      const results = result.data
        .filter((item: { exchange?: string; country?: string; symbol?: string }) => {
          const exchange = String(item.exchange ?? "").toUpperCase();
          const country = String(item.country ?? "").toLowerCase();
          return allowedExchanges.has(exchange) || country.includes("india");
        })
        .slice(0, 8)
        .map((item: { symbol?: string; instrument_name?: string; exchange?: string; currency?: string }) => ({
          symbol: String(item.symbol ?? "").toUpperCase(),
          name: String(item.instrument_name ?? item.symbol ?? "").slice(0, 100),
          exchange: String(item.exchange ?? "NSE").toUpperCase(),
          currency: String(item.currency ?? "INR"),
        }))
        .filter((item: { symbol: string }) => /^[A-Z0-9.-]{1,20}$/.test(item.symbol));
      return Response.json({ results, source: "Twelve Data symbol search" }, { headers: cacheHeaders });
    } catch {
      return unavailable("Could not reach Twelve Data symbol search.");
    }
  }

  if (type === "stock") {
    const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
    const exchange = (url.searchParams.get("exchange") ?? "NSE").trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,20}$/.test(symbol)) return Response.json({ error: "Enter a valid stock symbol." }, { status: 400 });
    if (!allowedExchanges.has(exchange)) return Response.json({ error: "Only NSE and BSE symbols are supported." }, { status: 400 });
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) return unavailable("Live stock quotes require the TWELVE_DATA_API_KEY server environment variable.");

    try {
      const [response, historyResponse] = await Promise.all([
        fetch(providerUrl("quote", { symbol, exchange }, apiKey), { next: { revalidate: 30 }, signal: AbortSignal.timeout(8_000) }),
        fetch(providerUrl("time_series", { symbol, exchange, interval: "1day", outputsize: "31" }, apiKey), { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8_000) }),
      ]);
      const [quote, history] = await Promise.all([response.json(), historyResponse.json()]);
      const price = Number(quote.price ?? quote.close);
      if (!response.ok || quote.status === "error" || !Number.isFinite(price) || price <= 0) {
        return unavailable(String(quote.message ?? "Twelve Data has no quote for this symbol or has reached its request limit."));
      }

      const closes = Array.isArray(history.values)
        ? history.values.map((entry: { close?: string }) => Number(entry.close)).filter((close: number) => Number.isFinite(close) && close > 0).reverse()
        : [];
      const returns = closes.slice(1).map((close: number, index: number) => Math.log(close / closes[index]));
      const averageReturn = returns.length ? returns.reduce((total: number, value: number) => total + value, 0) / returns.length : 0;
      const dailyVariance = returns.length > 1
        ? returns.reduce((total: number, value: number) => total + (value - averageReturn) ** 2, 0) / (returns.length - 1)
        : null;
      const annualizedVolatility = dailyVariance == null ? null : Math.sqrt(dailyVariance * 252) * 100;
      const changePercent = Number(quote.percent_change);

      return Response.json({
        symbol,
        exchange,
        price,
        currency: quote.currency ?? "INR",
        changePercent: Number.isFinite(changePercent) ? changePercent : null,
        annualizedVolatility,
        riskBand: annualizedVolatility == null ? null : annualizedVolatility < 15 ? "lower" : annualizedVolatility < 30 ? "moderate" : "higher",
        riskSamples: returns.length,
        updatedAt: quote.datetime ?? null,
        source: "Twelve Data",
        isLive: true,
      }, { headers: cacheHeaders });
    } catch {
      return unavailable("Could not reach Twelve Data for the live stock quote.");
    }
  }

  return Response.json({ error: "Choose type=gold, type=stock, or type=search." }, { status: 400 });
}
