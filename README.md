This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Fincorpus Investments

A responsive, browser-first personal finance workspace built with Next.js App Router, TypeScript, and Tailwind CSS. User profiles, holdings, net worth, and chat history are stored in the current browser. API routes are stateless and intended for Vercel serverless deployment.

## Run locally

```powershell
cd fincorpus-investments
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The dashboard and local portfolio tracker work without API keys. AI planning/chat and NSE stock quotes need provider credentials.

## Environment variables

Set these in `.env.local` for local development and in the Vercel project environment settings for deployment:

| Variable | Required for | Notes |
| --- | --- | --- |
| `GROQ_API_KEY` | AI allocation notes and chat | Server-only. Never prefix with `NEXT_PUBLIC_`. |
| `GROQ_MODEL` | Optional model selection | Defaults to `llama-3.3-70b-versatile`; use a model enabled for your Groq account. |
| `TWELVE_DATA_API_KEY` | NSE quotes and volatility estimates | Server-only. Provider symbols, exchanges, history, and free-tier limits may vary by account. |

Gold uses Gold-API.com for the XAU spot price and ExchangeRate-API for USD/INR conversion. These providers are accessed by the serverless route without an application database. Availability, terms, update cadence, and free quotas can change. The displayed INR/10g estimate is converted international spot, not a local jeweller, MCX, or tax-inclusive quote.

## Privacy and account limitations

- There is no database, server-side user account, sync, or account recovery. Each browser profile is separate.
- The local profile stores the email, name, net worth, and a PBKDF2 password verifier in browser storage. This is a convenience gate, not secure authentication. Anyone with access to the browser profile or developer tools may access or alter local data; clearing browser storage removes it.
- Holdings and chat history remain in browser storage. When a user requests AI help, relevant goal details, risk preference, amounts, and recorded holdings are sent to Groq for that request. They are not saved by this app's API route; review Groq's current data-handling terms before entering sensitive information.
- Market responses may be delayed, limited, or unavailable. Historical annualized volatility is a descriptive measure of recent price variation, not a forecast or complete measure of risk.
- AI-generated content may be inaccurate and is not financial, tax, or investment advice. Returns are not guaranteed. Verify information and consult a qualified professional before making financial decisions.

## Checks

```powershell
npm run lint
npm run build
```

## Deployment

Import this folder as a Next.js project in Vercel. Add provider keys as server-side environment variables, then deploy. No database or persistent server is required; the API handlers use standard request/response routes and external fetch calls.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
