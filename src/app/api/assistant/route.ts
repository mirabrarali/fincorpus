type Context = {
  netWorth?: number;
  invested?: number;
  goalAmount?: number;
  goalMonths?: number;
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
    horizon: String(input.horizon ?? "unspecified").slice(0, 50),
    risk: String(input.risk ?? "unspecified").slice(0, 20),
    holdings,
  };
}

function fallbackAssistantAnswer(task: "plan" | "chat", context: Context, question?: string) {
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

  if (task === "plan") {
    const status = goalAmount > 0 && netWorth > 0 ? `Your target is ${goalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })} over ${goalMonths} months.` : "Your target is still being defined.";
    return `${status} For an educational starting point, ${allocation} Aim for a mix that prioritizes liquidity, inflation protection, and gradual compounding. Use your current tracked investments of ${invested.toLocaleString("en-IN", { maximumFractionDigits: 0 })} alongside your net worth of ${netWorth.toLocaleString("en-IN", { maximumFractionDigits: 0 })}. This is a general planning guide, not a guarantee of returns. Keep the time horizon in mind: ${horizon}. If the target assumes unusually high growth, it may need a larger monthly contribution or a longer timeline.`;
  }

  const prompt = question ? question.trim() : "How should I think about this plan?";
  return `Here is a general educational answer to: “${prompt}” For a balanced approach, align your risk comfort to the time horizon and your likely cash-flow needs. Keep emergency savings separate, build around diversification instead of chasing one hot idea, and review your allocation regularly. Since this is general guidance only, it should not replace a qualified professional adviser for major financial decisions.`;
}

export async function POST(request: Request) {
  let body: { task?: unknown; question?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (body.task !== "plan" && body.task !== "chat") {
    return Response.json({ error: "Choose a supported assistant task." }, { status: 400 });
  }

  const question = String(body.question ?? "").trim().slice(0, 1200);
  if (body.task === "chat" && !question) {
    return Response.json({ error: "Enter a question to continue." }, { status: 400 });
  }

  const context = safeContext(body.context);
  const taskPrompt = body.task === "plan"
    ? "Create a concise educational investment-planning outline from the supplied goals and self-reported risk comfort. Explain that allocations and return assumptions are illustrative, never guarantee returns, mention liquidity and inflation tradeoffs, and do not name specific securities or provide personalized regulated financial advice. Highlight when the stated goal may require unrealistic returns."
    : `Answer the user's question in clear, concise language using the provided financial context only where relevant. Give general educational information, do not promise returns or recommend specific securities, and suggest qualified professional advice for consequential decisions. User question: ${question}`;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question) }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: "system", content: "You are Fincorpus AI, an educational personal-finance explainer. Be careful, transparent about uncertainty, and never claim to be a licensed advisor. Do not ask for identifying information." },
          { role: "user", content: `${taskPrompt}\n\nLocal portfolio context (provided for this request only): ${JSON.stringify(context)}` },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const result = await upstream.json();
    if (!upstream.ok) {
      return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question) }, { headers: { "Cache-Control": "no-store" } });
    }
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question) }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ answer: answer.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ answer: fallbackAssistantAnswer(body.task, context, question) }, { headers: { "Cache-Control": "no-store" } });
  }
}