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

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Groq is not configured. Add GROQ_API_KEY to the server environment to enable AI." }, { status: 503 });
  }

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
      return Response.json({ error: "Groq could not complete the request. Check the key, model access, and provider limits." }, { status: upstream.status === 429 ? 429 : 502 });
    }
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      return Response.json({ error: "The AI provider returned an empty answer." }, { status: 502 });
    }
    return Response.json({ answer: answer.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not reach the AI provider. Try again shortly." }, { status: 502 });
  }
}