type Context = {
  netWorth?: number;
  invested?: number;
  goalAmount?: number;
  goalMonths?: number;
  monthlySalary?: number;
  monthlyInvestment?: number;
  retirementYears?: number;
  payoutYears?: number;
  horizon?: string;
  risk?: string;
  holdings?: Array<{ name: string; type: string; amount: number; date: string }>;
};

function amount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(value, 1_000_000_000_000)) : 0;
}

function safeContext(value: unknown): Context {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const holdings = Array.isArray(input.holdings) ? input.holdings.slice(0, 30).map((item) => {
    const holding = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      name: String(holding.name ?? "Investment").slice(0, 60),
      type: String(holding.type ?? "Other").slice(0, 30),
      amount: amount(holding.amount),
      date: String(holding.date ?? "").slice(0, 10),
    };
  }) : [];

  return {
    netWorth: amount(input.netWorth),
    invested: amount(input.invested),
    goalAmount: amount(input.goalAmount),
    goalMonths: Math.max(1, Math.min(600, Math.floor(amount(input.goalMonths) || 1))),
    monthlySalary: amount(input.monthlySalary),
    monthlyInvestment: amount(input.monthlyInvestment),
    retirementYears: Math.max(0, Math.min(60, Math.floor(amount(input.retirementYears)))),
    payoutYears: Math.max(1, Math.min(60, Math.floor(amount(input.payoutYears) || 25))),
    horizon: String(input.horizon ?? "unspecified").slice(0, 50),
    risk: String(input.risk ?? "unspecified").slice(0, 20),
    holdings,
  };
}

type AssistantTask = "plan" | "chat" | "search" | "report";

type ConversationTurn = { role: "assistant" | "user"; content: string };

function safeHistory(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const turn = item as Record<string, unknown>;
    if (turn.role !== "assistant" && turn.role !== "user") return [];
    const content = String(turn.content ?? "").trim().slice(0, 1200);
    return content ? [{ role: turn.role, content }] : [];
  });
}

function fallbackAssistantAnswer(task: AssistantTask, context: Context, question?: string) {
  const netWorth = Math.max(0, context.netWorth ?? 0);
  const invested = Math.max(0, context.invested ?? 0);
  const goalAmount = Math.max(0, context.goalAmount ?? 0);
  const goalMonths = Math.max(1, context.goalMonths ?? 12);
  const risk = context.risk || "Moderate";
  const horizon = context.horizon || "Long term · 5+ years";
  const allocation = risk.toLowerCase() === "low"
    ? "Keep a larger share in stable assets such as fixed deposits, short-duration debt, and gold, while limiting equity exposure."
    : risk.toLowerCase() === "high"
      ? "Lean toward equity-heavy diversification, but keep a meaningful emergency reserve and rebalance as markets move."
      : "Blend growth-oriented assets with stability so you can benefit from compounding while keeping drawdown under control.";

  if (task === "search") {
    return "Live web search is unavailable right now, so I can't verify today's FD rates, mutual fund figures, or other current financial data. Try a live stock or gold quote in the market search, or check the product provider's official rate page. I won't guess current rates.";
  }

  if (task === "report") {
    return `${question || "Portfolio snapshot"}: net worth ${netWorth.toLocaleString("en-IN", { maximumFractionDigits: 0 })}; tracked investments ${invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}; risk preference ${risk}; horizon ${horizon}. ${allocation} This report uses only the figures entered in this browser and does not include verified bank/product rates or guaranteed future returns.`;
  }

  if (task === "plan") {
    const status = goalAmount > 0 && netWorth > 0 ? `Your target is ${goalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })} over ${goalMonths} months.` : "Your target is still being defined.";
    return `${status} For an educational starting point, ${allocation} Aim for a mix that prioritizes liquidity, inflation protection, and gradual compounding. Use your current tracked investments of ${invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })} alongside your net worth of ${netWorth.toLocaleString("en-IN", { maximumFractionDigits: 0 })}. This is a general planning guide, not a guarantee of returns. Keep the time horizon in mind: ${horizon}. If the target assumes unusually high growth, it may need a larger monthly contribution or a longer timeline.`;
  }

  const prompt = question ? question.trim() : "How should I think about this plan?";
  if (/retir(e|ement)/i.test(prompt) && (!context.monthlySalary || !context.monthlyInvestment || !context.retirementYears)) {
    return "I can help estimate a retirement scenario. What is your current monthly take-home salary, how much can you invest each month, how many years until retirement, and what monthly payout would you like after retiring? You can use rounded estimates; this stays in your browser unless you submit the chat, which sends the context to Groq.";
  }
  if (/retir(e|ement)/i.test(prompt)) {
    const monthlyRate = 0.08 / 12;
    const months = context.retirementYears! * 12;
    const factor = (1 + monthlyRate) ** months;
    const corpus = (context.netWorth ?? 0) * factor + context.monthlyInvestment! * ((factor - 1) / monthlyRate);
    const payoutMonths = context.payoutYears! * 12;
    const payoutFactor = (1 + monthlyRate) ** payoutMonths;
    const monthlyPayout = corpus * monthlyRate * payoutFactor / (payoutFactor - 1);
    return `Using your salary of ${context.monthlySalary!.toLocaleString("en-IN")}/month and investment of ${context.monthlyInvestment!.toLocaleString("en-IN")}/month, an illustrative 8% nominal return could build roughly ${corpus.toLocaleString("en-IN", { maximumFractionDigits: 0 })} in ${context.retirementYears} years. A level payout over ${context.payoutYears} years would be about ${monthlyPayout.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/month before tax, assuming the same 8% return continues during withdrawals. This is not guaranteed; inflation, fees, taxes, sequence-of-returns risk, and changing contributions can materially alter the result.`;
  }
  return `Here is a general educational answer to: “${prompt}” For a balanced approach, align your risk comfort to the time horizon and your likely cash-flow needs. Keep emergency savings separate, build around diversification instead of chasing one hot idea, and review your allocation regularly. Since this is general guidance only, it should not replace a qualified professional adviser for major financial decisions.`;
}

export async function POST(request: Request) {
  let body: { task?: unknown; question?: unknown; context?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (body.task !== "plan" && body.task !== "chat" && body.task !== "search" && body.task !== "report") {
    return Response.json({ error: "Choose a supported assistant task." }, { status: 400 });
  }

  const question = String(body.question ?? "").trim().slice(0, 1200);
  if ((body.task === "chat" || body.task === "search") && !question) {
    return Response.json({ error: "Enter a question to continue." }, { status: 400 });
  }

  const context = safeContext(body.context);
  const history = body.task === "chat" ? safeHistory(body.history) : [];
  const taskPrompt = body.task === "plan"
    ? "Create a concise educational investment-planning outline from the supplied goals and self-reported risk comfort. Explain that allocations and return assumptions are illustrative, never guarantee returns, mention liquidity and inflation tradeoffs, and do not name specific securities or provide personalized regulated financial advice. Highlight when the stated goal may require unrealistic returns."
    : body.task === "search"
      ? `Search the web for current, verifiable information relevant to this query: ${question}. Prioritize official bank, AMC, regulator, and exchange sources. For rates and returns, state the source and date, distinguish guaranteed deposit interest from non-guaranteed mutual fund historical performance, and include source URLs. If no reliable current source is found, say so without estimating or inventing figures. Do not give personalized buy/sell advice.`
      : body.task === "report"
        ? "Write a structured personal finance report using only the supplied local context. Include snapshot, allocation observations, goal/timeline observations, risks and missing data. Do not invent holdings, market prices, expected ROI, or guarantee results. Clearly label assumptions and end with a general-information disclaimer."
        : `Answer the user's question in clear, concise language using the provided financial context only where relevant. For retirement questions, ask for monthly take-home salary, monthly investable amount, years until retirement, and desired monthly payout if any of these are missing. When enough values are supplied, provide illustrative scenarios and state assumed annual return, inflation, and payout duration. Give general educational information, do not promise returns or recommend specific securities, and suggest qualified professional advice for consequential decisions. User question: ${question}`;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question) }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const configuredModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const model = configuredModel === "llama-3.3-70b-versatile" ? "openai/gpt-oss-120b" : configuredModel;
    const canSearchWeb = model.startsWith("openai/gpt-oss-");
    if (body.task === "search" && !canSearchWeb) {
      return Response.json({ answer: fallbackAssistantAnswer("search", context, question), liveSearch: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: "You are Fincorpus AI, an educational personal-finance explainer. Be careful, transparent about uncertainty, and never claim to be a licensed advisor. Do not ask for identifying information." },
          ...history,
          { role: "user", content: `${taskPrompt}\n\nAs-of date: ${new Date().toISOString().slice(0, 10)}. Local portfolio context (provided for this request only): ${JSON.stringify(context)}` },
        ],
        ...(body.task === "search" && model.startsWith("openai/gpt-oss-") ? { tools: [{ type: "browser_search" }], tool_choice: "auto" } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question), liveSearch: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const message = result?.choices?.[0]?.message;
    const answer = message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question), liveSearch: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const sources = Array.isArray(message?.annotations)
      ? message.annotations.flatMap((annotation: { url_citation?: { url?: string; title?: string } }) => {
          const citation = annotation.url_citation;
          return citation?.url ? [{ url: citation.url, title: citation.title || citation.url }] : [];
        }).slice(0, 8)
      : [];
    return Response.json({ answer: answer.trim(), liveSearch: body.task === "search", sources }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question), liveSearch: false }, { headers: { "Cache-Control": "no-store" } });
  }
}

export const maxDuration = 30;