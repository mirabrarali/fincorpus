# Fincorpus Investments

A responsive, browser-first personal finance dashboard built with Next.js App Router, TypeScript, and Tailwind CSS. User profile, holdings, retirement assumptions, KPIs, and chat history stay in the current browser. API routes are stateless and Vercel-compatible.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Add server-only provider keys to `.env.local` for live stock quotes and Groq AI. Never commit actual key values.

## Environment variables

Set keys in `.env.local` locally and in Vercel Project Settings → Environment Variables in production:

| Variable | Used for | Notes |
| --- | --- | --- |
| `GROQ_API_KEY` | AI chat, reports, and web research | Server-only. Never prefix with `NEXT_PUBLIC_`. |
| `GROQ_MODEL` | Optional model selection | Defaults to `openai/gpt-oss-120b`; browser search is enabled only for supported GPT-OSS models. |
| `TWELVE_DATA_API_KEY` | NSE/BSE quotes, symbol search, historical volatility | Server-only. Symbols, exchanges, history, and free-tier limits depend on provider access. |

Stock quotes and symbol searches use Twelve Data through `/api/markets`; no hard-coded quote values are returned. If a live provider fails, the UI says the quote is unavailable. Gold is converted from Gold-API.com XAU/USD spot using ExchangeRate-API USD/INR. The result is an indicative global spot conversion per 10g, not local retail, MCX, or tax-inclusive pricing. Free provider rate limits and update delays apply.

The unified search routes tickers and gold to market providers. Bank FD rates, mutual-fund research, and general financial questions use Groq web search and display source links when available. If a current source cannot be verified, the app says so instead of inventing a current rate or ROI.

## Features and assumptions

- Add tracked investments with user-defined names, types, amounts, and dates.
- Configure, add, hide, and reorder dashboard KPIs. KPI visibility and order are stored locally; AI chat can add or remove KPI tiles on request.
- Retirement scenarios use monthly contribution calculations at illustrative nominal return assumptions of 6%, 8%, and 10%, plus a 5% inflation adjustment. Payout estimates assume the same return during withdrawals. Taxes, fees, changing returns, inflation variation, and contribution changes are not forecast.
- Financial reports summarize entered local data; live product rates are not included unless separately retrieved and verified.

## Privacy and limits

- There is no database, server-side user account, sync, or account recovery. Each browser profile is separate.
- Local email/password is a convenience gate, not secure authentication. Browser access or developer tools can expose or alter local records; clearing browser storage removes them.
- When AI is used, relevant personal financial inputs, holdings, and up to eight recent chat turns are sent to Groq for that request. The app API does not persist them; review the provider's data terms before entering sensitive information.
- AI-generated content can be wrong and is not financial, tax, or investment advice. Returns are not guaranteed. Historical volatility is not a forecast. Verify information and consult a qualified professional before acting.

## Validate and deploy

```powershell
npm run lint
npm run build
```

Import this project folder into Vercel as a Next.js app, set the server environment variables, and deploy. No database or persistent server is required.
