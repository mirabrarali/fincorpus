"use client";

import {
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Coins,
  FileText,
  GripVertical,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
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
  type: string;
  amount: number;
  date: string;
};

type ChatMessage = { role: "assistant" | "user"; content: string };
type Quote = { symbol: string; price: number; currency: string; exchange?: string; changePercent?: number | null; annualizedVolatility?: number | null; riskBand?: string | null; riskSamples?: number; updatedAt?: string | null; source?: string; isLive?: boolean };
type SymbolResult = { symbol: string; name: string; exchange: string; currency: string };
type SearchResult = { kind: "quote"; quote: Quote; name: string } | { kind: "answer"; answer: string; liveSearch: boolean; sources?: Array<{ title: string; url: string }> };
type KpiId = "netWorth" | "invested" | "holdings" | "risk" | "horizon" | "goal";

const PROFILE_KEY = "fincorpus.profile.v1";
const HOLDINGS_KEY = "fincorpus.holdings.v1";
const CHAT_KEY = "fincorpus.chat.v1";
const NET_WORTH_KEY = "fincorpus.networth.v1";
const KPI_ORDER_KEY = "fincorpus.kpi-order.v1";
const KPI_VISIBLE_KEY = "fincorpus.kpi-visible.v1";
const RETIREMENT_KEY = "fincorpus.retirement.v1";
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

function futureValue(monthly: number, starting: number, annualRate: number, years: number) {
  const months = Math.max(0, Math.round(years * 12));
  const monthlyRate = annualRate / 12;
  if (!months) return starting;
  if (!monthlyRate) return starting + monthly * months;
  const factor = (1 + monthlyRate) ** months;
  return starting * factor + monthly * ((factor - 1) / monthlyRate);
}

function monthlyPayout(corpus: number, annualRate: number, years: number) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 12;
  if (!monthlyRate) return corpus / months;
  const factor = (1 + monthlyRate) ** months;
  return corpus * monthlyRate * factor / (factor - 1);
}

const kpiLabels: Record<KpiId, string> = {
  netWorth: "Net worth",
  invested: "Invested tracked",
  holdings: "Holdings count",
  risk: "Risk comfort",
  horizon: "Time horizon",
  goal: "Goal target",
};

export default function Home() {
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [localNetWorth, setLocalNetWorth] = useState(0);
  const [authenticated, setAuthenticated] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({ GOLD: null, RELIANCE: null, TCS: null });
  const [quoteState, setQuoteState] = useState("Loading market feeds");
  const [marketQuery, setMarketQuery] = useState("");
  const [marketSearchLoading, setMarketSearchLoading] = useState(false);
  const [marketSearchError, setMarketSearchError] = useState("");
  const [marketResults, setMarketResults] = useState<SearchResult[]>([]);
  const [kpiOrder, setKpiOrder] = useState<KpiId[]>(["netWorth", "invested", "risk", "holdings", "horizon", "goal"]);
  const [visibleKpis, setVisibleKpis] = useState<KpiId[]>(["netWorth", "invested", "risk"]);
  const [kpiToAdd, setKpiToAdd] = useState<KpiId>("holdings");
  const [draggedKpi, setDraggedKpi] = useState<KpiId | null>(null);
  const [reportKind, setReportKind] = useState("Portfolio snapshot");
  const [report, setReport] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [monthlyInvestment, setMonthlyInvestment] = useState(0);
  const [retirementYears, setRetirementYears] = useState(15);
  const [payoutYears, setPayoutYears] = useState(25);
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
      const savedKpiOrder = localStorage.getItem(KPI_ORDER_KEY);
      const savedVisibleKpis = localStorage.getItem(KPI_VISIBLE_KEY);
      const savedRetirement = localStorage.getItem(RETIREMENT_KEY);
      startTransition(() => {
        if (savedProfile) setProfile(JSON.parse(savedProfile) as LocalProfile);
        if (savedHoldings) setHoldings(JSON.parse(savedHoldings) as Holding[]);
        if (savedChat) setMessages(JSON.parse(savedChat) as ChatMessage[]);
        if (savedNetWorth) setLocalNetWorth(Math.max(0, Number(savedNetWorth)));
        if (savedKpiOrder) setKpiOrder(JSON.parse(savedKpiOrder) as KpiId[]);
        if (savedVisibleKpis) setVisibleKpis(JSON.parse(savedVisibleKpis) as KpiId[]);
        if (savedRetirement) {
          const retirement = JSON.parse(savedRetirement) as { monthlySalary?: number; monthlyInvestment?: number; retirementYears?: number; payoutYears?: number };
          setMonthlySalary(Math.max(0, retirement.monthlySalary ?? 0));
          setMonthlyInvestment(Math.max(0, retirement.monthlyInvestment ?? 0));
          setRetirementYears(Math.max(1, retirement.retirementYears ?? 15));
          setPayoutYears(Math.max(1, retirement.payoutYears ?? 25));
        }
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
      fetch("/api/markets?type=stock&symbol=RELIANCE&exchange=NSE").then((response) => response.ok ? response.json() : null),
      fetch("/api/markets?type=stock&symbol=TCS&exchange=NSE").then((response) => response.ok ? response.json() : null),
    ])
      .then(([gold, reliance, tcs]) => {
        setQuotes({ GOLD: gold, RELIANCE: reliance, TCS: tcs });
        setQuoteState([gold, reliance, tcs].some((quote) => quote?.isLive) ? "Live provider quotes" : "Live feeds unavailable");
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

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(KPI_ORDER_KEY, JSON.stringify(kpiOrder));
      localStorage.setItem(KPI_VISIBLE_KEY, JSON.stringify(visibleKpis));
      localStorage.setItem(RETIREMENT_KEY, JSON.stringify({ monthlySalary, monthlyInvestment, retirementYears, payoutYears }));
    }
  }, [hydrated, kpiOrder, visibleKpis, monthlySalary, monthlyInvestment, retirementYears, payoutYears]);

  const allocation = riskMix[risk] ?? riskMix.Moderate;
  const invested = useMemo(() => holdings.reduce((total, holding) => total + holding.amount, 0), [holdings]);
  const totalValue = profile?.netWorth ?? localNetWorth;
  const retirementScenarios = [6, 8, 10].map((rate) => {
    const corpus = futureValue(monthlyInvestment, invested, rate / 100, retirementYears);
    const payout = monthlyPayout(corpus, rate / 100, payoutYears);
    const inTodayMoney = payout / (1.05 ** retirementYears);
    return { rate, corpus, payout, inTodayMoney };
  });
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

    const kpiAliases: Record<string, KpiId> = {
      "net worth": "netWorth", portfolio: "netWorth", invested: "invested", investment: "invested",
      holdings: "holdings", risk: "risk", horizon: "horizon", "time horizon": "horizon", goal: "goal",
    };
    const kpiMatch = Object.keys(kpiAliases).find((label) => new RegExp(`\\b${label.replace(" ", "\\s+")}\\b`, "i").test(question));
    if (kpiMatch && /\b(show|add|pin|display|hide|remove)\b/i.test(question) && /\b(dashboard|kpi|tile|card|show|hide|add|pin|display|remove)\b/i.test(question)) {
      const kpi = kpiAliases[kpiMatch];
      const shouldShow = !/\b(hide|remove)\b/i.test(question);
      setVisibleKpis((current) => shouldShow ? current.includes(kpi) ? current : [...current, kpi] : current.filter((item) => item !== kpi));
      setMessages([...nextMessages, { role: "assistant", content: `${shouldShow ? "Added" : "Removed"} ${kpiLabels[kpi]} ${shouldShow ? "to" : "from"} your dashboard. You can drag its tile or use the arrow controls to reorder KPIs.` }]);
      return;
    }

    setChatLoading(true);
    try {
      const context = {
        netWorth: totalValue,
        invested,
        risk,
        horizon,
        goalAmount,
        goalMonths,
        monthlySalary,
        monthlyInvestment,
        retirementYears,
        payoutYears,
        holdings: holdings.map(({ name, type, amount, date }) => ({ name, type, amount, date })),
      };
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "chat", question, context, history: messages.slice(-8) }),
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
    const type = String(form.get("type") ?? "Other").trim().slice(0, 30) || "Other";
    setHoldings([{ id: crypto.randomUUID(), name, amount, date, type }, ...holdings]);
    setHoldingError("");
    event.currentTarget.reset();
  }

  async function searchWithAI(searchText = marketQuery) {
    const question = searchText.trim();
    if (!question) return;
    setMarketSearchLoading(true);
    setMarketSearchError("");
    setMarketResults([]);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: "search", question, context: { asOf: new Date().toISOString(), netWorth: totalValue } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search is unavailable.");
      setMarketResults([{ kind: "answer", answer: data.answer, liveSearch: Boolean(data.liveSearch), sources: data.sources }]);
    } catch (error) {
      setMarketSearchError(error instanceof Error ? error.message : "Search is temporarily unavailable.");
    } finally {
      setMarketSearchLoading(false);
    }
  }

  async function searchMarkets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = marketQuery.trim();
    if (!query || marketSearchLoading) return;
    if (/\b(gold|sona|xau)\b/i.test(query)) {
      setMarketSearchLoading(true);
      setMarketSearchError("");
      setMarketResults([]);
      try {
        const response = await fetch("/api/markets?type=gold");
        const quote = await response.json();
        if (!response.ok) throw new Error(quote.error ?? "Live gold price is unavailable.");
        setMarketResults([{ kind: "quote", quote, name: "Gold spot estimate · INR per 10g" }]);
      } catch (error) {
        setMarketSearchError(error instanceof Error ? error.message : "Live gold price is unavailable.");
      } finally {
        setMarketSearchLoading(false);
      }
      return;
    }

    if (/\b(fd|fixed deposit|mutual fund|sip|interest rate|bank rate|roi|retirement|news|inflation)\b/i.test(query)) {
      await searchWithAI(query);
      return;
    }

    setMarketSearchLoading(true);
    setMarketSearchError("");
    setMarketResults([]);
    try {
      const response = await fetch(`/api/markets?type=search&query=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Symbol search is unavailable.");
      const symbols = (data.results ?? []) as SymbolResult[];
      if (symbols.length === 0) {
        await searchWithAI(query);
        return;
      }
      const quotesForSymbols = await Promise.all(symbols.slice(0, 4).map(async (item) => {
        const quoteResponse = await fetch(`/api/markets?type=stock&symbol=${encodeURIComponent(item.symbol)}&exchange=${encodeURIComponent(item.exchange)}`);
        const quote = await quoteResponse.json();
        return quoteResponse.ok ? { kind: "quote" as const, quote: quote as Quote, name: item.name } : null;
      }));
      const availableQuotes = quotesForSymbols.filter((result): result is { kind: "quote"; quote: Quote; name: string } => result !== null);
      setMarketResults(availableQuotes);
      if (availableQuotes.length === 0) setMarketSearchError("No live quote is available for these matches. Check the ticker, provider permissions, and free-tier limits.");
    } catch (error) {
      setMarketSearchError(error instanceof Error ? error.message : "Live market search is unavailable.");
    } finally {
      setMarketSearchLoading(false);
    }
  }

  async function generateReport() {
    setReportLoading(true);
    setReport("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: "report",
          question: reportKind,
          context: {
            netWorth: totalValue,
            invested,
            goalAmount,
            goalMonths,
            horizon,
            risk,
            monthlySalary,
            monthlyInvestment,
            retirementYears,
            payoutYears,
            holdings: holdings.map(({ name, type, amount, date }) => ({ name, type, amount, date })),
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Report generation is unavailable.");
      setReport(data.answer);
    } catch (error) {
      setReport(error instanceof Error ? error.message : "Could not generate the report.");
    } finally {
      setReportLoading(false);
    }
  }

  function reorderKpi(target: KpiId) {
    if (!draggedKpi || draggedKpi === target) return;
    const nextOrder = [...kpiOrder];
    const fromIndex = nextOrder.indexOf(draggedKpi);
    const targetIndex = nextOrder.indexOf(target);
    nextOrder.splice(fromIndex, 1);
    nextOrder.splice(targetIndex, 0, draggedKpi);
    setKpiOrder(nextOrder);
    setDraggedKpi(null);
  }

  function moveKpi(id: KpiId, direction: -1 | 1) {
    const currentIndex = kpiOrder.indexOf(id);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= kpiOrder.length) return;
    const nextOrder = [...kpiOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    setKpiOrder(nextOrder);
  }

  function kpiValue(id: KpiId) {
    switch (id) {
      case "netWorth": return { value: money(totalValue), detail: "Local net-worth figure" };
      case "invested": return { value: money(invested), detail: `${holdings.length} tracked entries` };
      case "holdings": return { value: String(holdings.length), detail: "Tracked investments" };
      case "risk": return { value: risk, detail: "Self-reported preference" };
      case "horizon": return { value: horizon.split(" · ")[0], detail: horizon };
      case "goal": return { value: money(goalAmount), detail: `Target in ${goalMonths} months` };
    }
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
            <span className="market-status"><i className={quoteState === "Live provider quotes" ? "status-dot live" : "status-dot"} />{quoteState}</span>
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

          <section className="market-search-section" aria-label="Search investments and financial information">
            <form className="market-search-form" onSubmit={searchMarkets}>
              <Search size={18} />
              <input value={marketQuery} onChange={(event) => setMarketQuery(event.target.value)} placeholder="Search a stock, gold, FD rates, funds, or ask AI..." aria-label="Search stocks, gold, rates, funds, or ask AI" maxLength={120} />
              <button className="button button-dark search-button" type="submit" disabled={marketSearchLoading || !marketQuery.trim()}>{marketSearchLoading ? "Searching..." : "Search markets"}</button>
              <button className="button button-primary search-ai-button" type="button" disabled={marketSearchLoading || !marketQuery.trim()} onClick={() => void searchWithAI()}><Sparkles size={15} />Ask AI</button>
            </form>
            <div className="search-hints"><span>Try</span>{["Gold price today", "HDFC FD interest rates", "Mutual fund performance"].map((example) => <button key={example} onClick={() => { setMarketQuery(example); void searchWithAI(example); }}>{example}<ArrowUpRight size={11} /></button>)}</div>
            {(marketSearchError || marketResults.length > 0) && <div className="search-results" aria-live="polite">
              {marketSearchError && <p className="search-error">{marketSearchError}</p>}
              {marketResults.map((result, index) => result.kind === "quote" ? <article className="search-quote-result" key={`${result.quote.symbol}-${index}`}><span className="search-result-icon"><TrendingUp size={16} /></span><span className="search-result-copy"><strong>{result.name}</strong><small>{result.quote.symbol} · {result.quote.exchange || "Spot"} · {result.quote.source}{result.quote.updatedAt ? ` · ${result.quote.updatedAt}` : ""}</small></span><strong className="search-result-price">{money(result.quote.price)}<small>{result.quote.changePercent == null ? result.quote.currency : `${result.quote.changePercent >= 0 ? "+" : ""}${result.quote.changePercent.toFixed(2)}%`}</small></strong></article> : <article className="search-ai-result" key={`answer-${index}`}><div className="result-title"><Sparkles size={15} />{result.liveSearch ? "AI web research · verify source dates" : "AI search status"}</div><p>{result.answer}</p>{result.sources?.length ? <div className="source-links"><strong>Sources</strong>{result.sources.map((source) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={12} /></a>)}</div> : null}</article>)}
            </div>}
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
              <div className="quote-row"><span className="quote-symbol gold-symbol"><Coins size={17} /></span><span className="quote-name"><strong>Gold · 24K</strong><small>Spot conversion · INR per 10g</small></span><span className="quote-price">{quotes.GOLD?.isLive ? money(quotes.GOLD.price) : "—"}<small>{quotes.GOLD?.isLive ? "live provider quote" : "live quote unavailable"}</small></span></div>
              <div className="quote-row"><span className="quote-symbol"><span>R</span></span><span className="quote-name"><strong>Reliance</strong><small>NSE · INR</small></span><span className="quote-price">{quotes.RELIANCE?.isLive ? money(quotes.RELIANCE.price) : "—"}<small>{quotes.RELIANCE?.isLive && quotes.RELIANCE.changePercent != null ? `${quotes.RELIANCE.changePercent >= 0 ? "+" : ""}${quotes.RELIANCE.changePercent.toFixed(2)}% today` : "live quote unavailable"}</small></span></div>
              <div className="quote-row"><span className="quote-symbol"><span>T</span></span><span className="quote-name"><strong>TCS</strong><small>NSE · INR</small></span><span className="quote-price">{quotes.TCS?.isLive ? money(quotes.TCS.price) : "—"}<small>{quotes.TCS?.isLive && quotes.TCS.changePercent != null ? `${quotes.TCS.changePercent >= 0 ? "+" : ""}${quotes.TCS.changePercent.toFixed(2)}% today` : "live quote unavailable"}</small></span></div>
              <div className="stock-risk"><div className="stock-risk-heading"><strong>30-day stock risk behavior</strong><span>Annualized volatility</span></div>{(["RELIANCE", "TCS"] as const).map((symbol) => { const quote = quotes[symbol]; return <div className="stock-risk-row" key={symbol}><span>{symbol}</span><div className="stock-risk-track"><i style={{ width: `${Math.min(quote?.annualizedVolatility ?? 0, 80) / 80 * 100}%` }} /></div><strong>{quote?.annualizedVolatility != null ? `${quote.annualizedVolatility.toFixed(1)}% · ${quote.riskBand} · ${quote.riskSamples} sessions` : "History unavailable"}</strong></div>; })}</div>
              <p className="market-footnote">Gold is converted global spot, excluding local premiums and taxes. Stock volatility uses recent closes and is not a forecast.</p>
            </div>
          </section>

          <section aria-label="Customizable portfolio indicators">
            <div className="kpi-controls"><span className="eyebrow small-eyebrow">YOUR DASHBOARD</span><label className="kpi-add-control"><span className="visually-hidden">Choose a KPI</span><select value={kpiToAdd} onChange={(event) => setKpiToAdd(event.target.value as KpiId)}>{kpiOrder.filter((id) => !visibleKpis.includes(id)).map((id) => <option key={id} value={id}>{kpiLabels[id]}</option>)}</select><button className="button button-small button-outline" onClick={() => setVisibleKpis([...visibleKpis, kpiToAdd])} disabled={visibleKpis.length >= kpiOrder.length || visibleKpis.includes(kpiToAdd)}><Plus size={13} /> Add KPI</button></label></div>
            <div className="metrics-row">{kpiOrder.filter((id) => visibleKpis.includes(id)).map((id) => {
              const item = kpiValue(id);
              return <article className="metric-card draggable-kpi" key={id} draggable onDragStart={() => setDraggedKpi(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderKpi(id)} onDragEnd={() => setDraggedKpi(null)}><div className="metric-label"><span>{kpiLabels[id].toUpperCase()}</span><span className="metric-actions"><GripVertical size={14} aria-hidden="true" /><button className="kpi-move" title="Move KPI earlier" aria-label={`Move ${kpiLabels[id]} earlier`} onClick={() => moveKpi(id, -1)}><ChevronUp size={13} /></button><button className="kpi-move" title="Move KPI later" aria-label={`Move ${kpiLabels[id]} later`} onClick={() => moveKpi(id, 1)}><ChevronDown size={13} /></button><button className="kpi-remove" title={`Remove ${kpiLabels[id]}`} aria-label={`Remove ${kpiLabels[id]} KPI`} onClick={() => setVisibleKpis(visibleKpis.filter((itemId) => itemId !== id))}><X size={13} /></button></span></div><strong className={id === "risk" || id === "horizon" || id === "holdings" ? "metric-word" : ""}>{item.value}</strong><small>{item.detail}</small></article>;
            })}</div>
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

          <section className="retirement-section" id="retirement">
            <div className="section-title-row"><div><p className="eyebrow small-eyebrow">LONG-RANGE SCENARIOS</p><h2>Retirement income, explored</h2></div><span className="local-tag"><LockKeyhole size={13} /> Inputs saved on this device</span></div>
            <div className="retirement-grid">
              <form className="retirement-form surface" onSubmit={(event) => event.preventDefault()}>
                <div className="surface-title"><span className="surface-icon green"><CalendarDays size={17} /></span><div><h3>Starting assumptions</h3><p>Illustrative math, not a promised return.</p></div></div>
                <div className="form-grid">
                  <label className="field"><span>Monthly take-home salary <small>INR</small></span><input type="number" min="0" step="1000" value={monthlySalary || ""} placeholder="e.g. 80,000" onChange={(event) => setMonthlySalary(Number(event.target.value))} /></label>
                  <label className="field"><span>Invest each month <small>INR</small></span><input type="number" min="0" step="500" value={monthlyInvestment || ""} placeholder="e.g. 15,000" onChange={(event) => setMonthlyInvestment(Number(event.target.value))} /></label>
                  <label className="field"><span>Years until retirement</span><input type="number" min="1" max="60" value={retirementYears} onChange={(event) => setRetirementYears(Math.max(1, Math.min(60, Number(event.target.value))))} /></label>
                  <label className="field"><span>Payout duration <small>years</small></span><input type="number" min="1" max="60" value={payoutYears} onChange={(event) => setPayoutYears(Math.max(1, Math.min(60, Number(event.target.value))))} /></label>
                </div>
                <p className="retirement-note">Starting corpus uses your tracked investments ({money(invested)}). The scenarios assume constant nominal returns of 6%, 8%, or 10%, 5% inflation, and a level payout over the chosen duration. Real results will vary.</p>
              </form>
                <div className="retirement-results surface"><div className="holdings-list-heading"><div><h3>Estimated monthly payout</h3><p>Shown in future rupees and today&apos;s purchasing power</p></div><span className="count-badge"><TrendingUp size={14} /></span></div>{retirementScenarios.map((scenario) => <div className="scenario-row" key={scenario.rate}><span className="scenario-rate">{scenario.rate}%<small>illustrative annual return</small></span><span><strong>{money(scenario.payout)} / mo</strong><small>future value · corpus {money(scenario.corpus)}</small></span><strong className="scenario-today">{money(scenario.inTodayMoney)}<small>today&apos;s rupees</small></strong></div>)}<button className="text-action retirement-ask" onClick={() => { setChatInput("Help me understand my retirement scenarios. Ask any follow-up questions you need."); document.getElementById("assistant")?.scrollIntoView({ behavior: "smooth" }); }}><MessageCircle size={14} /> Ask AI about retirement</button></div>
            </div>
          </section>

          <section className="reports-section" id="reports">
            <div className="section-title-row"><div><p className="eyebrow small-eyebrow">A CLEARER VIEW</p><h2>Financial reports</h2></div><span className="local-tag"><FileText size={13} /> Generated on request</span></div>
            <div className="report-builder surface"><div className="report-controls"><label className="field"><span>Report type</span><select value={reportKind} onChange={(event) => setReportKind(event.target.value)}><option>Portfolio snapshot</option><option>Risk and allocation review</option><option>Goal progress and savings gap</option><option>Retirement income scenarios</option><option>Holdings summary</option></select></label><button className="button button-primary" onClick={generateReport} disabled={reportLoading}><FileText size={15} />{reportLoading ? "Preparing report..." : "Generate report"}</button></div>{report ? <article className="report-output" aria-live="polite"><div className="result-title"><Sparkles size={15} />{reportKind}</div><p>{report}</p></article> : <p className="report-empty">Choose a report to summarize your locally tracked figures. Live rate or market research is only included when separately retrieved and verified.</p>}</div>
          </section>

          <section className="holdings-section" id="holdings">
            <div className="section-title-row holdings-title"><div><p className="eyebrow small-eyebrow">KEEP THE DETAILS TOGETHER</p><h2>Investment tracker</h2></div><span className="local-tag"><LockKeyhole size={13} /> Saved on this device</span></div>
            <div className="holdings-grid">
              <form className="add-investment surface" onSubmit={addHolding}>
                <div className="surface-title"><span className="surface-icon green"><Plus size={17} /></span><div><h3>Add an investment</h3><p>Track SIPs, FDs, stocks, or anything else.</p></div></div>
                <label className="field"><span>Investment name</span><input name="holdingName" placeholder="e.g. Monthly index SIP" maxLength={60} /></label>
                <div className="form-grid holding-form-grid">
                  <label className="field"><span>Investment type</span><input name="type" list="investment-types" placeholder="Any investment type" maxLength={30} defaultValue="SIP" /><datalist id="investment-types"><option value="SIP" /><option value="FD" /><option value="Stock" /><option value="Mutual fund" /><option value="Gold" /><option value="Property" /><option value="Cash" /></datalist></label>
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
              <p className="chat-privacy">When you ask, portfolio data and up to 8 recent chat turns are sent to Groq for that request. Chat history is stored only in this browser.</p>
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
