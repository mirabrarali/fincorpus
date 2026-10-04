const stockSymbols: Record<string, string> = {
  RELIANCE: "RELIANCE",
  TCS: "TCS",
};

const cacheHeaders = { "Cache-Control": "public, s-maxage=180, stale-while-revalidate=300" };

function fallbackGoldQuote() {
  return {
    symbol: "XAU",
    price: 7700,
    currency: "INR",
    unit: "10g",
    updatedAt: new Date().toISOString(),
    source: "fallback-estimate",
    isFallback: true,
  };
}

function fallbackStockQuote(symbol: string) {
  const values: Record<string, { price: number; changePercent: number; annualizedVolatility: number; riskBand: string; riskSamples: number }> = {
    RELIANCE: { price: 3035, changePercent: 1.2, annualizedVolatility: 18.4, riskBand: "moderate", riskSamples: 21 },
    TCS: { price: 4018, changePercent: 0.7, annualizedVolatility: 14.8, riskBand: "lower", riskSamples: 21 },
  };
  const fallback = values[symbol] ?? { price: 1000, changePercent: 0.4, annualizedVolatility: 20, riskBand: "moderate", riskSamples: 12 };
  return {
    symbol,
    price: fallback.price,
    currency: "INR",
    changePercent: fallback.changePercent,
    annualizedVolatility: fallback.annualizedVolatility,
    riskBand: fallback.riskBand,
    riskSamples: fallback.riskSamples,
    updatedAt: new Date().toISOString(),
    source: "fallback-estimate",
    isFallback: true,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  if (type === "gold") {
    try {
      const [goldResponse, exchangeResponse] = await Promise.all([
        fetch("https://api.gold-api.com/price/XAU", { next: { revalidate: 180 } }),
        fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 180 } }),
      ]);
      if (!goldResponse.ok || !exchangeResponse.ok) throw new Error("Market provider unavailable");
      const [gold, exchange] = await Promise.all([goldResponse.json(), exchangeResponse.json()]);
      const usdPerOunce = Number(gold.price);
      const rupeesPerUsd = Number(exchange.rates?.INR);
      if (!Number.isFinite(usdPerOunce) || !Number.isFinite(rupeesPerUsd)) throw new Error("Invalid market response");
      const rupeesPer10g = usdPerOunce * rupeesPerUsd / 31.1034768 * 10;
      return Response.json({
        symbol: "XAU",
        price: Math.round(rupeesPer10g),
        currency: "INR",
        unit: "10g",
        updatedAt: gold.updatedAt ?? exchange.time_last_update_utc,
        source: "Gold-API.com + ExchangeRate-API",
      }, { headers: cacheHeaders });
    } catch {
      return Response.json(fallbackGoldQuote(), { headers: cacheHeaders });
    }
  }

  if (type === "stock") {
    const symbol = url.searchParams.get("symbol")?.toUpperCase() ?? "";
    if (!stockSymbols[symbol]) return Response.json({ error: "This stock symbol is not enabled." }, { status: 400 });
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) return Response.json(fallbackStockQuote(symbol), { headers: cacheHeaders });
    try {
      const quoteUrl = new URL("https://api.twelvedata.com/quote");
      quoteUrl.searchParams.set("symbol", stockSymbols[symbol]);
      quoteUrl.searchParams.set("exchange", "NSE");
      quoteUrl.searchParams.set("apikey", apiKey);
      const historyUrl = new URL("https://api.twelvedata.com/time_series");
      historyUrl.searchParams.set("symbol", stockSymbols[symbol]);
      historyUrl.searchParams.set("exchange", "NSE");
      historyUrl.searchParams.set("interval", "1day");
      historyUrl.searchParams.set("outputsize", "31");
      historyUrl.searchParams.set("apikey", apiKey);
      const [response, historyResponse] = await Promise.all([
        fetch(quoteUrl, { next: { revalidate: 180 } }),
        fetch(historyUrl, { next: { revalidate: 180 } }),
      ]);
      const [quote, history] = await Promise.all([response.json(), historyResponse.json()]);
      const price = Number(quote.price ?? quote.close);
      if (!response.ok || quote.status === "error" || !Number.isFinite(price)) {
        return Response.json(fallbackStockQuote(symbol), { headers: cacheHeaders });
      }
      const changePercent = Number(quote.percent_change);
      const closes = Array.isArray(history.values)
        ? history.values.map((entry: { close?: string }) => Number(entry.close)).filter((close: number) => Number.isFinite(close) && close > 0).reverse()
        : [];
      const returns = closes.slice(1).map((close: number, index: number) => Math.log(close / closes[index]));
      const averageReturn = returns.length ? returns.reduce((total: number, value: number) => total + value, 0) / returns.length : 0;
      const dailyVariance = returns.length > 1
        ? returns.reduce((total: number, value: number) => total + (value - averageReturn) ** 2, 0) / (returns.length - 1)
        : null;
      const annualizedVolatility = dailyVariance == null ? null : Math.sqrt(dailyVariance * 252) * 100;
      return Response.json({
        symbol,
        price,
        currency: quote.currency ?? "INR",
        changePercent: Number.isFinite(changePercent) ? changePercent : null,
        annualizedVolatility,
        riskBand: annualizedVolatility == null ? null : annualizedVolatility < 15 ? "lower" : annualizedVolatility < 30 ? "moderate" : "higher",
        riskSamples: returns.length,
        updatedAt: quote.datetime ?? null,
        source: "Twelve Data",
      }, { headers: cacheHeaders });
    } catch {
      return Response.json(fallbackStockQuote(symbol), { headers: cacheHeaders });
    }
  }

  return Response.json({ error: "Choose type=gold or type=stock." }, { status: 400 });
}