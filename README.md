# Saturn — your tax refund, in every paycheck

**Overtime and tip workers overpay federal tax all year.** The 2025 tax law (OBBBA) made the premium part of overtime and up to $25,000 of tips deductible, but withholding doesn't change unless the worker files a new W-4 with the right Step 4(b) amount. Most never do, and wait until April to get their own money back.

Saturn reads a paystub photo, computes the worker's 2026 federal tax exactly, and shows **how much they overpay per paycheck**, then hands them the **official IRS 2026 W-4, already filled in** (SSN left blank on purpose), an email to HR, and **payday reminders in their own calendar**. Every payday check compares the new paystub with the plan, so a drop in overtime never turns into a bill in April.

Built at Zimran Business Cup 2026 · Money track · B2C · web only.

## Try it (jury)
1. Answer the 3-question quiz on the home page (or go straight to **Check my paystub**).
2. Pick the sample **Maria, ER nurse** (or upload any paystub PDF/photo; you'll be asked to black out private info first). The fictional paystub image is read by AI → confirm the numbers → result: **+$79 every paycheck ($2,063/yr)**.
3. Start **Saturn Plus** (7-day free trial). Checkout test card: `4242 4242 4242 4242`, any future date, any CVC.
4. Click **Download my pre-filled W-4 (PDF)**: the real IRS form with Steps 1(c), 3, 4(b) and the page 4 worksheet filled in. Then **Add payday reminders to my calendar** (.ics, repeats on her pay schedule).
5. Open **Payday check** → pick **Maria's next paycheck (no overtime)** → it warns she'd owe ~$690 in April and shows the fix. The tracker fills one of 26 dots and shows money kept so far.

**Proof the AI is real:** open `/api/ai-check` on the live site. It sends the fictional sample paystub to the vision model and shows what it read next to the true values.

## Privacy by design
- **We only need 8 numbers** (pay frequency, gross, pre-tax deductions, taxable wages, overtime, tips, federal tax withheld). Never an SSN, bank login, address or card. The pre-filled W-4 is generated on the user's device and leaves the SSN box empty.
- **Black-out step before upload** (`components/Redactor.tsx`): the user drags boxes over their SSN, address or account numbers; only the covered image is sent.
- The AI prompt never extracts SSNs, bank/routing numbers, addresses or IDs, and the output schema has no field for them.
- Images are processed in memory and never stored; results stay in the user's browser, with a one-click **Delete my data**.
- Cards are entered only on **Stripe Checkout**; card data never touches our server.
- Production: use an AI provider whose API terms exclude training on customer data.

## Who it's for
Maria, 32, ER nurse in Houston: ~12 overtime hours every two weeks, a big refund every April, short on cash every month. Next: servers and bartenders (tips), warehouse, trucking, police/fire, then everyone with a large refund.

## Business model
| | Price | What |
|---|---|---|
| Free | $0 | AI paystub reading, overpayment per paycheck, under-withholding warning, first payday check |
| **Saturn Plus** | **$79/year (default)** or $9.99/month, 7-day free trial | Exact W-4 values, pre-filled official W-4 (PDF), HR email, payday check on every paystub + calendar reminders, alert before April, January W-4 refresh |

**Why a subscription:** hours, overtime, tips, jobs and families change all year, and the rules change every January (2027 brackets, and the overtime/tips deductions run 2025–2028). A W-4 that was right in March can be wrong by August. Plus is the payday autopilot that keeps it right.

**Unit economics (assumptions to validate):** ~$90–120 revenue per subscriber per year · ~90% gross margin (AI cost ≈ $0.01 per paystub) · target blended CAC ≤ $35 (paid social to nurses/servers + coworker referrals via the built-in share button) · ~8% monthly churn on monthly, annual plan collected up front → Day-0 ROAS ≥ 1 on annual · LTV/CAC ≈ 3.

**Market:** 99.1M tax refunds in 2026, IRS filing season statistics (TAM) → ~13–17M households with overtime or tip income who can use the new deductions (SAM) → 1M paying subscribers (SOM, ~6–7% of SAM).
**3-year path:** 120k → 500k → 1M subscribers ≈ $12M → $50M → ~$100–120M ARR. Expansion: everyone with a large refund, second jobs, couples, then state withholding.

**What if the overtime/tips deductions end after 2028?** The core problem stays: tens of millions of people get large refunds every year because their W-4 is wrong. The deductions are the wedge; withholding autopilot is the business.

## How the tax engine works (`lib/tax.ts`)
Deterministic, no AI in the math. Tax year 2026:
- Brackets (single / married filing jointly) and standard deduction ($16,100 / $32,200)
- Child tax credit $2,200 per child, $500 other dependents (phase-out $200k / $400k)
- **Qualified overtime deduction:** only the FLSA premium counts: ⅓ of time-and-a-half pay, ¼ of double-time pay. Cap $12,500 / $25,000, reduced $100 per $1,000 of MAGI above $150k / $300k
- **Qualified tips deduction:** up to $25,000, same phase-out
- Overpayment = projected withholding − projected tax; we keep a **$300 safety buffer** (target a small refund, never a bill)
- W-4 output: Step 1(c), Step 2, Step 3, Step 4(b) (deductions worksheet lines 1a/1b), Step 4(c) (extra withholding when under-withheld)

Tests with hand-checked worked examples: `npm test` (`scripts/selftest.ts`).

Scope of the MVP: W-2 employees, federal income tax only (no state tax, FICA, itemizing, self-employment). 2027 values (Rev. Proc. 2026-35) get loaded for the January W-4 season.

## Tech
- Next.js 15 (App Router) + TypeScript on Vercel. No database, no accounts: results stay in the user's browser.
- `app/api/paystub`: a vision model (Groq Qwen 3.6 by default; Gemini, Claude or GPT also supported) reads the paystub into a strict JSON schema; `lib/paystub.ts` validates and fills gaps (taxable wages = gross − pre-tax, OT pay = hours × rate, double-time detection). Images are processed in memory, never stored.
- `app/api/email`: HR email (template, polished by AI when a key is set)
- `app/api/checkout`: Stripe Checkout for Saturn Plus (annual / monthly subscription, 7-day trial), no SDK
- `lib/w4pdf.ts`: fills the unmodified IRS 2026 Form W-4 (`public/forms/fw4-2026.pdf`, public domain) in the browser with pdf-lib. SSN, address, signature and employer section are never filled
- `lib/ics.ts`: recurring payday reminder (.ics) built from the pay frequency and pay date on the paystub
- Vercel Analytics for page views (enable it in the Vercel project → Analytics)
- Rate limiting on all API routes; keys never reach the browser
- Sample paystubs in `public/samples` are fictional and watermarked "SAMPLE"

## Run locally
```bash
npm install
cp .env.example .env.local   # optional: GROQ_API_KEY (free) or GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY
npm run dev
```

Disclaimer: educational withholding tool, not tax advice.
