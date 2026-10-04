"use client";

import {
  ArrowUpRight,
  BadgeIndianRupee,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Coins,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { FormEvent, startTransition, useEffect, useMemo, useState } from "react";

type LocalProfile = {
  name: string;
  email: string;
  salt: string;
  verifier: string;
  netWorth: number;
};

type Holding = {
  id: string;
  name: string;
  type: "SIP" | "FD" | "Stock" | "Mutual fund" | "Other";
  amount: number;
  date: string;
};

type ChatMessage = { role: "assistant" | "user"; content: string };
type Quote = { symbol: string; price: number; currency: string; changePercent?: number; annualizedVolatility?: number | null; riskBand?: string | null; riskSamples?: number; updatedAt?: string };

const PROFILE_KEY = "fincorpus.profile.v1";
const HOLDINGS_KEY = "fincorpus.holdings.v1";
const CHAT_KEY = "fincorpus.chat.v1";
const NET_WORTH_KEY = "fincorpus.networth.v1";
const categories = ["Stocks", "SIP funds", "Fixed deposits", "Gold"] as const;
const riskMix: Record<string, number[]> = {
  Low: [20, 25, 45, 10],
  Moderate: [40, 30, 20, 10],
  High: [55, 25, 10, 10],
};

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordVerifier(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return bytesToHex(bits);
}

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function elapsedLabel(date: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000));
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"}`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "month" : "months"}`;
}

export default function Home() {
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [localNetWorth, setLocalNetWorth] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({ GOLD: null, RELIANCE: null, TCS: null });
  const [quoteState, setQuoteState] = useState("Loading market feeds");
  const [modal, setModal] = useState<"signup" | "login" | "networth" | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [authError, setAuthError] = useState("");
  const [risk, setRisk] = useState("Moderate");
  const [horizon, setHorizon] = useState("Long term · 5+ years");
  const [goalAmount, setGoalAmount] = useState(2500000);
  const [goalMonths, setGoalMonths] = useState(60);
  const [planAnswer, setPlanAnswer] = useState("");
  const [planLoading, setPlanLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [holdingError, setHoldingError] = useState("");

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      const savedHoldings = localStorage.getItem(HOLDINGS_KEY);
      const savedChat = localStorage.getItem(CHAT_KEY);
      const savedNetWorth = localStorage.getItem(NET_WORTH_KEY);
      startTransition(() => {
        if (savedProfile) setProfile(JSON.parse(savedProfile) as LocalProfile);
        if (savedHoldings) setHoldings(JSON.parse(savedHoldings) as Holding[]);
        if (savedChat) setMessages(JSON.parse(savedChat) as ChatMessage[]);
        if (savedNetWorth) setLocalNetWorth(Math.max(0, Number(savedNetWorth)));
        setAuthenticated(sessionStorage.getItem("fincorpus.session") === "1");
        setHydrated(true);
      });
    } catch {
      startTransition(() => {
        setAuthError("Local data could not be read. Your browser storage may be unavailable.");
        setHydrated(true);
      });
    }

    Promise.all([
      fetch("/api/markets?type=gold").then((response) => response.ok ? response.json() : null),
      fetch("/api/markets?type=stock&symbol=RELIANCE").then((response) => response.ok ? response.json() : null),
      fetch("/api/markets?type=stock&symbol=TCS").then((response) => response.ok ? response.json() : null),
    ])
      .then(([gold, reliance, tcs]) => {
        setQuotes({ GOLD: gold, RELIANCE: reliance, TCS: tcs });
        setQuoteState(gold || reliance || tcs ? "Market data refreshed" : "Market feeds need setup");
      })
      .catch(() => setQuoteState("Market feeds unavailable"));
  }, []);

  useEffect(() => {
    if (hydrated && profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [hydrated, profile]);

  useEffect(() => {
    if (hydrated && !profile) localStorage.setItem(NET_WORTH_KEY, String(localNetWorth));
  }, [hydrated, localNetWorth, profile]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
  }, [hydrated, holdings]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CHAT_KEY, JSON.stringify(messages));
  }, [hydrated, messages]);

  const allocation = riskMix[risk] ?? riskMix.Moderate;
  const invested = useMemo(() => holdings.reduce((total, holding) => total + holding.amount, 0), [holdings]);
  const totalValue = profile?.netWorth ?? localNetWorth;
  const initials = profile?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "FC";

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (password.length < 8) {
      setAuthError("Use a password with at least 8 characters.");
      return;
    }

    if (modal === "signup") {
      if (!name) {
        setAuthError("Add your name for a personalized workspace.");
        return;
      }
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
      const verifier = await passwordVerifier(password, salt);
      const enteredNetWorth = String(form.get("netWorth") ?? "").trim();
      const netWorth = Math.max(0, Number(enteredNetWorth || localNetWorth));
      const nextProfile = { name, email, salt, verifier, netWorth };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
    } else {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (!saved) {
        setAuthError("No local profile exists on this device yet. Create one to get started.");
        return;
      }
      const existing = JSON.parse(saved) as LocalProfile;
      const verifier = await passwordVerifier(password, existing.salt);
      if (email !== existing.email || verifier !== existing.verifier) {
        setAuthError("Email or password does not match the profile saved on this device.");
        return;
      }
      setProfile(existing);
    }
    sessionStorage.setItem("fincorpus.session", "1");
    setAuthenticated(true);
    setModal(null);
  }

  function handleNetWorth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const enteredNetWorth = String(form.get("netWorth") ?? "").trim();
    const netWorth = Math.max(0, Number(enteredNetWorth || profile?.netWorth || localNetWorth));
    if (profile) setProfile({ ...profile, netWorth });
    else setLocalNetWorth(netWorth);
    setModal(null);
  }

  async function buildPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlanLoading(true);
    setPlanAnswer("");
    const context = {
      netWorth: totalValue,
      invested,
      goalAmount: Number(goalAmount),
      goalMonths: Number(goalMonths),
      horizon,
      risk,
      holdings: holdings.map(({ name, type, amount, date }) => ({ name, type, amount, date })),
    };
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "plan", context }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI service is not configured yet.");
      setPlanAnswer(data.answer);
    } catch (error) {
      setPlanAnswer(error instanceof Error ? error.message : "Could not reach the AI service. Check your connection and Groq setup.");
    } finally {
      setPlanLoading(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || chatLoading) return;
    const nextMessages = [...messages, { role: "user" as const, content: question }];
    setMessages(nextMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const context = {
        netWorth: totalValue,
        invested,
        risk,
        horizon,
        goalAmount,
        goalMonths,
        holdings: holdings.map(({ name, type, amount, date }) => ({ name, type, amount, date })),
      };
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "chat", question, context }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "AI service is not configured yet.");
      setMessages([...nextMessages, { role: "assistant", content: data.answer }]);
    } catch (error) {
      setMessages([...nextMessages, { role: "assistant", content: error instanceof Error ? error.message : "The AI assistant is unavailable." }]);
    } finally {
      setChatLoading(false);
    }
  }

  function addHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("holdingName") ?? "").trim();
    const amount = Number(form.get("amount"));
    const date = String(form.get("date") ?? "");
    if (!name || !Number.isFinite(amount) || amount <= 0 || !date) {
      setHoldingError("Add an investment name, a positive amount, and a date.");
      return;
    }
    const type = String(form.get("type") ?? "Other") as Holding["type"];
    setHoldings([{ id: crypto.randomUUID(), name, amount, date, type }, ...holdings]);
    setHoldingError("");
    event.currentTarget.reset();
  }

  function signOut() {
    sessionStorage.removeItem("fincorpus.session");
    setAuthenticated(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a className="brand" href="#overview" aria-label="Fincorpus Investments home">
          <span className="brand-mark"><Landmark size={19} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>fincorpus</strong><small>INVESTMENTS</small></span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#overview" title="Overview" onClick={() => setMobileNav(false)}><LayoutDashboard size={17} /> Overview</a>
          <a className="nav-link" href="#plan" title="Plan and goals" onClick={() => setMobileNav(false)}><Target size={17} /> Plan & goals</a>
          <a className="nav-link" href="#holdings" title="Investments" onClick={() => setMobileNav(false)}><BriefcaseBusiness size={17} /> Investments</a>
          <a className="nav-link" href="#assistant" title="AI assistant" onClick={() => setMobileNav(false)}><MessageCircle size={17} /> AI assistant</a>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={17} /><span><strong>Private by design</strong><small>Your portfolio stays on this device.</small></span></div>
          <button className="sidebar-help" type="button" onClick={() => document.getElementById("disclaimer")?.scrollIntoView({ behavior: "smooth" })}><CircleHelp size={16} /> About this guidance</button>
          <div className="sidebar-user">
            <span className="avatar">{initials}</span>
            <span className="user-copy"><strong>{profile?.name || "Your local profile"}</strong><small>{authenticated ? "On this device" : "Not signed in"}</small></span>
            {authenticated ? <button className="icon-button sidebar-logout" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={16} /></button> : <button className="icon-button sidebar-logout" title="Sign in" aria-label="Sign in" onClick={() => setModal(profile ? "login" : "signup")}><ChevronDown size={16} /></button>}
          </div>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(!mobileNav)}><Menu size={20} /></button>
          <div className="crumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div>
          <div className="top-actions">
            <span className="market-status"><i className={quoteState === "Market data refreshed" ? "status-dot live" : "status-dot"} />{quoteState}</span>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /></button>
            {authenticated ? <button className="avatar avatar-button" aria-label="Sign out" title="Sign out" onClick={signOut}>{initials}</button> : <button className="button button-small button-outline" onClick={() => setModal(profile ? "login" : "signup")}>{profile ? "Sign in" : "Create profile"}</button>}
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" />PERSONAL FINANCE, WITH A PLAN</p>
              <h1>{profile?.name ? `Good to see you, ${profile.name.split(" ")[0]}.` : "Make your money move with purpose."}</h1>
              <p className="welcome-subtitle">A clear view of what you have, where it could go, and what matters next.</p>
            </div>
            <div className="date-chip"><CalendarDays size={15} /><span>{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span></div>
          </section>

          <section className="hero-grid" aria-label="Portfolio overview">
            <div className="networth-panel">
              <div className="panel-kicker"><span className="panel-icon"><Wallet size={17} /></span> TOTAL NET WORTH <button className="text-action" onClick={() => setModal("networth")}>Edit <ArrowUpRight size={13} /></button></div>
              <div className="networth-value">{money(totalValue)}</div>
              <div className="networth-note"><span className="neutral-tag"><span className="neutral-dot" />LOCAL SNAPSHOT</span><span>Updated on this device</span></div>
              <div className="networth-visual" aria-hidden="true">
                <div className="visual-caption"><span>Allocation view</span><span>{totalValue > 0 ? "Suggested mix" : "Add your first figure"}</span></div>
                <div className="allocation-bar">
                  {allocation.map((weight, index) => <span key={categories[index]} style={{ width: `${weight}%` }} className={`allocation-segment segment-${index}`} />)}
                </div>
                <div className="allocation-legend">{categories.map((category, index) => <span key={category}><i className={`legend-dot segment-${index}`} />{category}<b>{allocation[index]}%</b></span>)}</div>
              </div>
              <button className="networth-edit" onClick={() => setModal("networth")}><Plus size={16} /> Update net worth</button>
            </div>

            <div className="market-panel">
              <div className="section-heading market-heading"><div><p className="eyebrow small-eyebrow">MARKET PULSE</p><h2>Prices worth watching</h2></div><button className="icon-button refresh-button" title="Refresh prices" aria-label="Refresh prices" onClick={() => window.location.reload()}><TrendingUp size={17} /></button></div>
              <div className="quote-row"><span className="quote-symbol gold-symbol"><Coins size={17} /></span><span className="quote-name"><strong>Gold · 24K</strong><small>Spot · INR per 10g</small></span><span className="quote-price">{quotes.GOLD ? money(quotes.GOLD.price) : "—"}<small>{quotes.GOLD ? "provider quote" : "feed unavailable"}</small></span></div>
              <div className="quote-row"><span className="quote-symbol"><span>R</span></span><span className="quote-name"><strong>Reliance</strong><small>NSE · INR</small></span><span className="quote-price">{quotes.RELIANCE ? money(quotes.RELIANCE.price) : "—"}<small>{quotes.RELIANCE?.changePercent != null ? `${quotes.RELIANCE.changePercent >= 0 ? "+" : ""}${quotes.RELIANCE.changePercent.toFixed(2)}% today` : "quote unavailable"}</small></span></div>
              <div className="quote-row"><span className="quote-symbol"><span>T</span></span><span className="quote-name"><strong>TCS</strong><small>NSE · INR</small></span><span className="quote-price">{quotes.TCS ? money(quotes.TCS.price) : "—"}<small>{quotes.TCS?.changePercent != null ? `${quotes.TCS.changePercent >= 0 ? "+" : ""}${quotes.TCS.changePercent.toFixed(2)}% today` : "quote unavailable"}</small></span></div>
              <div className="stock-risk"><div className="stock-risk-heading"><strong>30-day stock risk behavior</strong><span>Annualized volatility</span></div>{(["RELIANCE", "TCS"] as const).map((symbol) => { const quote = quotes[symbol]; return <div className="stock-risk-row" key={symbol}><span>{symbol}</span><div className="stock-risk-track"><i style={{ width: `${Math.min(quote?.annualizedVolatility ?? 0, 80) / 80 * 100}%` }} /></div><strong>{quote?.annualizedVolatility != null ? `${quote.annualizedVolatility.toFixed(1)}% · ${quote.riskBand} · ${quote.riskSamples} sessions` : "History unavailable"}</strong></div>; })}</div>
              <p className="market-footnote">Gold is converted global spot, excluding local premiums and taxes. Stock volatility uses recent closes and is not a forecast.</p>
            </div>
          </section>

          <section className="metrics-row" aria-label="Portfolio indicators">
            <article className="metric-card"><div className="metric-label"><span>INVESTED TRACKED</span><span className="metric-icon mint"><BadgeIndianRupee size={16} /></span></div><strong>{money(invested)}</strong><small>Across {holdings.length} recorded {holdings.length === 1 ? "investment" : "investments"}</small></article>
            <article className="metric-card"><div className="metric-label"><span>YOUR TIME HORIZON</span><span className="metric-icon blue"><Clock3 size={16} /></span></div><strong className="metric-word">{horizon.startsWith("Long") ? "Long term" : horizon.startsWith("Medium") ? "Medium term" : "Short term"}</strong><small>Set in your plan preferences</small></article>
            <article className="metric-card"><div className="metric-label"><span>RISK COMFORT</span><span className="metric-icon amber"><BarChart3 size={16} /></span></div><strong className="metric-word">{risk}</strong><small>Self-reported · not a score</small></article>
          </section>

          <div className="section-title-row" id="plan"><div><p className="eyebrow small-eyebrow">YOUR NEXT MOVE</p><h2>Build a plan around your life</h2></div><span className="local-tag"><LockKeyhole size={13} /> Your figures stay local</span></div>
          <section className="planning-grid">
            <form className="plan-form surface" onSubmit={buildPlan}>
              <div className="surface-title"><span className="surface-icon violet"><Sparkles size={17} /></span><div><h3>Goal & risk profile</h3><p>Shape an allocation to explore, not a promise.</p></div></div>
              <div className="form-grid">
                <label className="field"><span>Investment horizon</span><select value={horizon} onChange={(event) => setHorizon(event.target.value)}><option>Short term · under 2 years</option><option>Medium term · 2–5 years</option><option>Long term · 5+ years</option></select></label>
                <label className="field"><span>Risk comfort</span><select value={risk} onChange={(event) => setRisk(event.target.value)}><option>Low</option><option>Moderate</option><option>High</option></select></label>
                <label className="field"><span>Target amount <small>INR</small></span><input type="number" min="0" step="1000" value={goalAmount} onChange={(event) => setGoalAmount(Number(event.target.value))} /></label>
                <label className="field"><span>Time to goal <small>months</small></span><input type="number" min="1" max="600" value={goalMonths} onChange={(event) => setGoalMonths(Number(event.target.value))} /></label>
              </div>
              <div className="risk-meter"><div><span>Risk range</span><strong>{risk === "Low" ? "Capital-first" : risk === "High" ? "Growth-seeking" : "Balanced"}</strong></div><div className={`risk-track risk-${risk.toLowerCase()}`}><i /></div><div className="risk-labels"><span>Lower volatility</span><span>Higher volatility</span></div></div>
              <button className="button button-primary plan-button" type="submit" disabled={planLoading}><Sparkles size={16} />{planLoading ? "Building your plan..." : "Generate AI allocation"}<ArrowUpRight size={15} /></button>
              {planAnswer && <div className="plan-result" aria-live="polite"><div className="result-title"><Sparkles size={15} /> Planning notes</div><p>{planAnswer}</p></div>}
            </form>

            <aside className="basket-card">
              <div className="basket-top"><span className="basket-mark"><Target size={18} /></span><span className="basket-overline">STARTER BASKET</span><span className="basket-pill">{risk.toUpperCase()} RISK</span></div>
              <h3>A balanced mix, made personal.</h3>
              <p className="basket-copy">A starting framework across growth, stability, and diversification.</p>
              <div className="basket-lines">{categories.map((category, index) => <div className="basket-line" key={category}><span className={`basket-dot segment-${index}`} /><span>{category}</span><strong>{allocation[index]}%</strong></div>)}</div>
              <div className="basket-footer"><span>Illustrative allocation</span><span>Not a recommendation</span></div>
            </aside>
          </section>

          <section className="holdings-section" id="holdings">
            <div className="section-title-row holdings-title"><div><p className="eyebrow small-eyebrow">KEEP THE DETAILS TOGETHER</p><h2>Investment tracker</h2></div><span className="local-tag"><LockKeyhole size={13} /> Saved on this device</span></div>
            <div className="holdings-grid">
              <form className="add-investment surface" onSubmit={addHolding}>
                <div className="surface-title"><span className="surface-icon green"><Plus size={17} /></span><div><h3>Add an investment</h3><p>Track SIPs, FDs, stocks, or anything else.</p></div></div>
                <label className="field"><span>Investment name</span><input name="holdingName" placeholder="e.g. Monthly index SIP" maxLength={60} /></label>
                <div className="form-grid holding-form-grid">
                  <label className="field"><span>Investment type</span><select name="type"><option>SIP</option><option>FD</option><option>Stock</option><option>Mutual fund</option><option>Other</option></select></label>
                  <label className="field"><span>Amount <small>INR</small></span><input name="amount" type="number" min="1" step="100" placeholder="25,000" /></label>
                  <label className="field field-full"><span>Investment date</span><input name="date" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                </div>
                {holdingError && <p className="form-error">{holdingError}</p>}
                <button className="button button-dark add-button" type="submit"><Plus size={16} /> Add to tracker</button>
              </form>

              <div className="holdings-list surface">
                <div className="holdings-list-heading"><div><h3>Your investments</h3><p>{holdings.length ? `${holdings.length} entries · ${money(invested)} tracked` : "Your entries appear here"}</p></div><span className="count-badge">{holdings.length.toString().padStart(2, "0")}</span></div>
                {holdings.length === 0 ? <div className="empty-state"><span className="empty-icon"><BriefcaseBusiness size={21} /></span><strong>Nothing tracked yet</strong><p>Add a SIP, FD, or holding to keep your timeline in one place.</p></div> : <div className="holding-rows">{holdings.map((holding) => <div className="holding-row" key={holding.id}><span className={`holding-type holding-${holding.type.toLowerCase().replace(" ", "-")}`}>{holding.type === "FD" ? <Landmark size={16} /> : holding.type === "Stock" ? <TrendingUp size={16} /> : holding.type === "SIP" ? <Coins size={16} /> : <Wallet size={16} />}</span><span className="holding-name"><strong>{holding.name}</strong><small>{holding.type} · {dateLabel(holding.date)} · {elapsedLabel(holding.date)}</small></span><strong className="holding-amount">{money(holding.amount)}</strong><button className="icon-button delete-button" title={`Remove ${holding.name}`} aria-label={`Remove ${holding.name}`} onClick={() => setHoldings(holdings.filter((item) => item.id !== holding.id))}><Trash2 size={15} /></button></div>)}</div>}
              </div>
            </div>
          </section>

          <section className="assistant-section" id="assistant">
            <div className="section-title-row"><div><p className="eyebrow small-eyebrow">ASK IT YOUR WAY</p><h2>Your money, in context</h2></div><span className="local-tag"><LockKeyhole size={13} /> No server-side history</span></div>
            <div className="assistant-card surface">
              <div className="assistant-intro"><div className="assistant-avatar"><Sparkles size={20} /></div><div><h3>Fincorpus AI</h3><p>Ask about your goals, recorded holdings, or investment basics.</p></div><span className="ai-badge">GROQ AI</span></div>
              <div className="chat-window" aria-live="polite">
                {messages.length === 0 ? <div className="chat-empty"><span>“</span><p>How should I think about balancing my goal timeline and risk comfort?</p><button onClick={() => setChatInput("How should I think about balancing my goal timeline and risk comfort?")}>Ask this <ArrowUpRight size={13} /></button></div> : messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="message-label">{message.role === "user" ? "YOU" : "FINCORPUS AI"}</span><p>{message.content}</p></div>)}
                {chatLoading && <div className="chat-message assistant"><span className="message-label">FINCORPUS AI</span><p className="thinking">Putting the context together...</p></div>}
              </div>
              <form className="chat-form" onSubmit={sendMessage}><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask a question about your plan..." maxLength={1200} aria-label="Ask Fincorpus AI" /><button className="send-button" type="submit" disabled={chatLoading || !chatInput.trim()} aria-label="Send question"><Send size={17} /></button></form>
              <p className="chat-privacy">When you ask, portfolio amounts, holdings, risk comfort, and goal details are sent to Groq for that request. Chat history is stored only in this browser.</p>
            </div>
          </section>

          <footer className="disclaimer" id="disclaimer"><div className="disclaimer-icon"><ShieldCheck size={17} /></div><div><strong>Important information</strong><p>This content is AI-generated and may contain mistakes. It is for general information only, not financial, tax, or investment advice. Investments can lose value; returns are not guaranteed. Verify market data and consult a qualified professional before acting.</p></div><span>FINCORPUS · 2026</span></footer>
        </div>
      </main>

      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button className="icon-button dialog-close" aria-label="Close" onClick={() => { setModal(null); setAuthError(""); }}><X size={18} /></button>
        {modal === "networth" ? <><span className="dialog-icon"><Wallet size={19} /></span><p className="eyebrow small-eyebrow">PORTFOLIO SNAPSHOT</p><h2 id="dialog-title">Update your net worth</h2><p className="dialog-copy">This figure is saved only in this browser and can be changed any time.</p><form onSubmit={handleNetWorth}><label className="field"><span>Total net worth <small>INR</small></span><input name="netWorth" type="number" min="0" step="1000" defaultValue={profile?.netWorth ?? 0} autoFocus /></label><button className="button button-primary dialog-submit" type="submit"><Check size={16} /> Save on this device</button></form></> : <><span className="dialog-icon"><LockKeyhole size={19} /></span><p className="eyebrow small-eyebrow">DEVICE-ONLY PROFILE</p><h2 id="dialog-title">{modal === "signup" ? "Make this space yours." : "Welcome back."}</h2><p className="dialog-copy">Email and password only. No phone number, OTP, or online account.</p><form onSubmit={handleAuth}>
          {modal === "signup" && <label className="field"><span>Your name</span><input name="name" placeholder="Aarav Mehta" autoComplete="name" required /></label>}
          <label className="field"><span>Email address</span><input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label className="field"><span>Password <small>8+ characters</small></span><input name="password" type="password" minLength={8} autoComplete={modal === "signup" ? "new-password" : "current-password"} required /></label>
          {modal === "signup" && <label className="field"><span>Current net worth <small>INR · optional</small></span><input name="netWorth" type="number" min="0" step="1000" placeholder="0" defaultValue={localNetWorth || ""} /></label>}
          {authError && <p className="form-error">{authError}</p>}
          <button className="button button-primary dialog-submit" type="submit">{modal === "signup" ? "Create local profile" : "Sign in on this device"}<ArrowUpRight size={15} /></button>
          <p className="local-auth-note"><LockKeyhole size={13} /> The password verifier is stored in this browser. This is not secure cloud authentication; clearing browser data removes the profile.</p>
          <button className="switch-auth" type="button" onClick={() => { setAuthError(""); setModal(modal === "signup" ? "login" : "signup"); }}>{modal === "signup" ? "Already set up here? Sign in" : "New to this device? Create a profile"}</button>
        </form></>}
      </section></div>}
    </div>
  );
}
