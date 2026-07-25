# CARVE
### Product Requirements Document
*"Shelf space isn't given. It's carved out."*

---

**Product:** Carve — AI Retail Readiness Platform for Emerging CPG Brands
**Author:** [Your Name]
**Date:** July 2026
**Version:** 3.1 — Added AI-generation verification (independent second-pass Claude checker) and observability (`generation_log` provenance) as v1-phase requirements rather than later hardening; open question added on whether a founder confirm step is needed before AI-generated documents are sent externally
**Status:** Pre-Validation — Phase 0 gate applies before build investment
**Confidentiality:** Internal / Founding Team Only

---

## 1. Executive Summary

Carve is an AI-powered retail readiness platform that tells emerging CPG brand founders exactly what stands between them and a purchase order from Whole Foods, Sprouts, or any specialty grocery retailer — and generates the actual documents to fix it. It is the product that exists between a brand's first DTC sale and its first retail distribution door.

The name reflects the product's core truth: shelf space is not given. Every brand that made it to the shelf carved out their position against competition, buyer skepticism, and a system designed to reject most applicants. Carve shows you how to do it — and hands you the tools to execute.

| Dimension | Detail |
|---|---|
| Target Customer | Emerging CPG brand founders, $200K–1.5M DTC/Amazon revenue, zero retail doors, no broker yet |
| Primary Retailers v1 | Whole Foods Market, Sprouts Farmers Market |
| Expansion Retailers v2 | Natural Grocers, Fresh Thyme, Earth Fare, Thrive Market |
| Core Problem | Pre-distribution founders are blind to margin math, distributor prerequisites, submission timing, production requirements, and what competing SKUs already occupy their shelf space |
| Core Solution | AI readiness score (6 dimensions) + single ranked blocker + full cost waterfall + document generation + PO outcome logging (the v1 core loop), plus a free investor readiness test (post-v1 growth feature) |
| Revenue Model | $49/mo base + $299 per-retailer package + $499 first PO + $99/mo stay-in + $750/mo broker |
| Top-of-Funnel | Free Investor Readiness Test — shareable, viral within Startup CPG community (post-v1 growth feature) |
| Competitive Moat | Pre-distribution wedge (Byzzer/Crisp/SPINS all require existing retail data) + outcome network effect |

> **v1 scope note:** The initial engineering build (v1) concentrates entirely on the PO-path core loop — brand intake, 6-dimension scoring, a single ranked blocker surfaced one at a time, full cost waterfall, document generation, and PO outcome logging (see §12). Paid subscriptions and Stripe billing, the broker multi-client dashboard, stay-in/post-placement tracking, competitive shelf-positioning scraping, LEAP calendar alerts, cross-brand outcome benchmarking, and the free Investor Readiness Test are all real, scoped, and documented throughout this PRD — they simply ship in later phases, not in v1.

---

## 2. Problem Statement

### 2.1 The Core Gap

The natural and specialty grocery market generates over $220 billion in annual US revenue. Getting a product onto those shelves is the singular goal of thousands of emerging CPG brands each year. The path to a purchase order from Whole Foods or Sprouts requires navigating: correct margin mathematics, distributor prerequisites, category submission timing, certification requirements, production capacity, and competitive shelf positioning. Founders are blind to all of this.

The current state: a founder making a single-origin spice blend with $400K in DTC revenue does not know that Whole Foods requires a UNFI pickup number before finalising a PO, that their current wholesale price leaves the retailer at 36% margin when the buyer expects 40%, that the submission window for their category closed last month, that Sprouts already has four similar SKUs priced $8–12 in their category, or that they cannot actually fulfil a regional PO because they have no co-manufacturer and their lead time is 90 days.

They spend $18,000 on a trade show booth. A buyer takes their card. They hear nothing for six months. They hire a broker at 7% of revenue. The broker tells them what Carve tells them in ten minutes.

### 2.2 What Shark Tank Teaches About This Problem

The pattern across hundreds of CPG Shark Tank appearances reveals three failure modes that inform how Carve is built — this is market research shaping the product, not a rationale for naming a Carve feature after any one panelist:

- **Getting in but not staying in:** JicaFoods had 700 retail doors including Whole Foods and Sprouts. Kevin O'Leary killed the deal citing thin margins. By November 2025 neither retailer carried their products. Getting in is not the end goal — maintaining velocity and margins is.
- **Production constraints killing national opportunity:** Im'peccable Chicken had retailer interest from Whole Foods, Sprouts, Target, and others before their Shark Tank appearance — but was constrained by production capacity rather than demand. The $200K investment was needed specifically to solve manufacturing, not distribution.
- **O'Leary's unit economics test:** Kevin O'Leary has killed more CPG deals than any other Shark, almost always on the same question: show me the unit economics from factory to shelf. Founders who cannot answer this cold in a buyer meeting get the same result as in the Tank.

These are market signals about *what buyers and investors actually scrutinize* — unit economics, production readiness, margin durability — and they inform Carve's scoring dimensions (§6, FR-01) and its investor-readiness assessment (§6, FR-08) generically, not a decision to brand a Carve feature with a living public figure's name.

### 2.3 Why Existing Tools Don't Solve This

| Tool | Who It Serves | Why It Fails Pre-Distribution Founders |
|---|---|---|
| Byzzer by NIQ | Brands in 1+ retailers | Requires POS data from inside retailer portals. Useless at zero doors. |
| Crisp | Brands in 40+ retailers | Enterprise supply chain tool. Same data prerequisite. |
| SPINS Ignite | Natural channel brands with distribution | $100K+/year. Requires being in-channel already. |
| RangeMe | Any brand | Passive directory. Brands list, hope buyers find them. No readiness intelligence. |
| Food Brokers | Any brand paying forever | 5–8% of gross revenue indefinitely. Slow. Not data-driven. |
| Trade Shows | Brands with $10K–50K | One expensive moment per year. No intelligence. No guarantee of access. |

---

## 3. Goals & Objectives

### 3.1 Primary Goals

- **Validate willingness to pay before building** — 5+ direct conversations with brand founders matching the ICP; 3+ unprompted yes responses before any production build commences.
- **Go from diagnosis to execution** — Harvey doesn't just tell lawyers their contract has a problem; it fixes the contract. Carve doesn't just tell founders their margin is off; it recalculates and generates the KeHE application.
- **Surface an investor readiness test in a free, viral format** — a free, generic investor readiness test is the top-of-funnel acquisition engine, planned for the post-v1 growth phase (§12, Phase 5). Every CPG founder who shares their score brings 5 more to Carve.
- **Build the outcome network effect** — every brand that logs their result (got in, rejected, still in process) makes the readiness benchmark more accurate for every subsequent brand. PO outcome logging ships in v1 (FR-07) as a single-brand record; the cross-brand benchmark this goal describes is a later-phase capability (FR-14) once enough brands have logged results. This is the moat nobody else can replicate without Carve's user base.
- **Own the pre-distribution layer, then expand** — Year 1: natural specialty grocery. Year 2: beauty (Sephora, Ulta). Year 3: outdoor (REI), pet (PetSmart). The retailer intelligence model is category-agnostic.

### 3.2 Non-Goals

- Carve is not a post-distribution analytics platform (Byzzer, Crisp, SPINS serve that).
- Carve is not a product listing directory (RangeMe serves that).
- Carve is not a broker replacement — it is a broker augmentation and a broker alternative for founders who cannot yet afford one.
- Carve does not cover conventional grocery (Kroger, Walmart, Target) in v1.
- Carve does not produce packaging design or marketing creative.

---

## 4. Target Customer & Personas

### 4.1 Ideal Customer Profile

| Dimension | Carve ICP |
|---|---|
| Annual Revenue | $200K–1.5M, primarily DTC (Shopify), Amazon, or local/regional retail |
| Category | Natural, organic, or better-for-you CPG — food, beverage, wellness, supplements, personal care |
| Distribution Status | Zero to one specialty retail doors. Not yet working with a national broker. |
| Retail Goal | First placement in Whole Foods, Sprouts, Natural Grocers, Fresh Thyme, or a major regional co-op |
| Team Size | 1–3 people. Founder doing their own sales, marketing, and retail outreach. |
| Data Sophistication | Uses Shopify and Amazon Seller Central. Has not used SPINS, Crisp, or Byzzer. |
| Budget Sensitivity | Aware that brokers are expensive. Willing to pay $49–$299/month for self-serve intelligence. |
| Discovery Channel | Startup CPG Slack (50K members), Naturally Network, KeHE Elevate alumni, Expo West attendees |

### 4.2 Personas

**Persona 1 — Maya, the Founder-Seller (Primary, Individual Tier)**

A 34-year-old co-founder of a regenerative spice brand doing $420K in annual DTC revenue. Has a cult following on Instagram. Had two informal conversations with a Sprouts regional buyer but hasn't submitted formally because she doesn't know whether her pricing is right, which distributor Sprouts uses, or when the submission window for her category opens. Spent $18,000 at Expo West last year. Left with 12 business cards and one promising conversation that went nowhere after four months of silence.

- Job-to-be-done: Know exactly what's blocking her from Sprouts and fix it this month.
- Willingness to pay: $299 once for a Sprouts-specific submission package.

**Persona 2 — Daniel, the Food Broker (Enterprise Tier)**

Runs an independent natural food brokerage managing 22 brands. Earns 6% of gross sales from each. Spends 40% of his time on preparation work — researching submission calendars, building sell sheets, calculating margin scenarios — that does not depend on his buyer relationships. Carve at $750/month makes him 3x more efficient, allowing him to manage 40 brands instead of 22.

- Job-to-be-done: Reduce brand prep time so he can manage more clients without adding staff.
- Willingness to pay: $750/month for an agency dashboard covering all active clients.

**Persona 3 — Carlos, the Shark Tank-Bound Founder (Acquisition Target)**

Preparing to pitch on Shark Tank with a functional beverage brand. Has 150 retail doors through regional distributors but no national chain presence. Knows the Sharks will ask about retail strategy, unit economics, and category competition. Needs to arrive at the pitch knowing his investor score, his cost waterfall, and why his product earns shelf space over the three incumbents in his category.

- Job-to-be-done: Pass the investor readiness test before walking into the Tank.
- Entry point: Free Investor Readiness Test → upgrades to $299 per-retailer package.

**Persona 4 — Sophie, the Post-Placement Founder (Stay-In Tier)**

Got into Sprouts Innovation Set three months ago. Thrilled. Now realising she has no idea what velocity she needs to hit to earn permanent placement, how often she should be running demos, or how to manage the buyer relationship. The 90-day trial period ends in six weeks and she is getting nervous.

- Job-to-be-done: Not get discontinued. Know exactly what to do in the next six weeks.
- Willingness to pay: $99/month for the stay-in subscription.

---

## 5. User Stories

| ID | As a… | I want to… | So that… | Pri. |
|---|---|---|---|---|
| US-01 | Brand founder | see my readiness score across all 6 dimensions for my target retailer | I know exactly what to fix before approaching a buyer | P0 |
| US-02 | Brand founder | see the full cost waterfall from factory to consumer shelf | I can answer the toughest investor unit-economics question without hesitation | P0 |
| US-03 | Brand founder | take the free Investor Readiness Test and share my score | I understand my investor readiness and bring others to Carve | P1 |
| US-04 | Brand founder | receive exactly one blocker with a specific resolution path | I know what to do this week, not a list of 12 things | P0 |
| US-05 | Brand founder | generate a complete KeHE Elevate application email | I can submit to KeHE today without spending hours drafting | P0 |
| US-06 | Brand founder | generate a Sprouts submission package with a personalised checklist | I submit everything correctly the first time | P0 |
| US-07 | Brand founder | see how many SKUs already occupy my category at my target retailer | I know the competitive gap I fill and can articulate it to a buyer | P1 |
| US-08 | Brand founder | be alerted when the Whole Foods LEAP application window opens | I don't miss the annual window I have been preparing for | P1 |
| US-09 | Brand founder | be told when I am not ready for a retailer and which to target first | I don't burn $18K on a trade show before I am ready | P0 |
| US-10 | Post-placement founder | see a 90-day stay-in checklist after I get my first placement | I do not get discontinued in the trial period | P1 |
| US-11 | Post-placement founder | receive a velocity alert when I am at risk of discontinuation | I take action before it is too late | P1 |
| US-12 | Food broker | manage all my client brands in one dashboard with scores and blockers | I don't manage 30 brands in a spreadsheet | P1 |
| US-13 | Food broker | generate a pitch brief for any client in under 5 minutes | I spend more time on buyer relationships and less on prep work | P1 |
| US-14 | Shark Tank founder | arrive at the Tank with my investor score, waterfall, and competitive positioning | I can answer every retail question without hesitation | P1 |
| US-15 | Any founder | log my result when I get into (or am rejected from) a retailer | I complete the core loop and contribute to the future benchmark that helps other founders | P0 |

---

## 6. Functional Requirements

### 6.1 Core Features (P0 — v1 Build: PO-Path Core Loop)

The seven requirements below **are the v1 build.** Together they form the complete PO-path loop — brand intake → 6-dimension scoring → single ranked blocker surfaced one at a time → full cost waterfall → document generation → PO outcome logging. Nothing outside this section ships before this loop is live end-to-end (see §12).

**FR-01: Readiness Score — 6 Dimensions**

Brand founder enters product details. System returns a 0–100 score across six weighted dimensions:

| Dimension | Weight | What It Measures |
|---|---|---|
| Margin Readiness | 30% | Does wholesale pricing leave the retailer at their minimum gross margin? |
| Distributor Readiness | 25% | Is a KeHE or UNFI relationship in place? Are EDI and EFT capability established? |
| Certification Readiness | 20% | USDA Organic, Non-GMO, Gluten-Free, and food safety certs (SQF, BRC) |
| Timing | 15% | Is the category submission window open? When is the next reset cycle? |
| Velocity | 10% | Existing units-per-store-per-week data. Zero if DTC-only. |
| Fulfillment Readiness | 10% (NEW) | Co-manufacturer in place? Lead time under 30 days? Production capacity for regional rollout? |

Note: weights sum to 110% because Fulfillment was added as a net-new dimension. Rebalance to: Margin 27%, Distributor 23%, Certification 18%, Timing 13%, Velocity 10%, Fulfillment 9%.

**FR-02: Full Cost Waterfall Calculator (NEW)**

Input: factory cost, co-packing fee, freight to DC, distributor markup %, retailer margin %, chargeback estimate, MSRP.

Output: step-by-step money flow from factory to consumer, founder margin %, retailer margin %, all-in unit economics, an investor-readiness verdict (pass / marginal / fail), and a Claude-generated statement of what's blocking investor confidence in this brand specifically.

This feature is available on the base subscription. It is the most shareable output Carve generates.

**FR-03: Single Blocker Surfacing**

After scoring, Carve surfaces exactly one blocker — the highest-priority gap. Never two. The blocker is stated in plain language with specific numbers. Example: "Your $4.50 wholesale gives Sprouts 55% margin — that clears their 40% minimum. The real blocker is your co-manufacturer relationship. You cannot fulfil a regional PO with a 90-day lead time."

**FR-04: Weekly Action Cadence**

Every Monday, Carve sends one specific action per active user. Named. Time-bound. Includes a draft email or template where relevant. Completing an action updates the readiness score and unlocks the next action.

**FR-05: Document Generation Layer**

After completing a retailer assessment, founders can generate the actual documents needed to fix their blockers and submit. Each document is generated by Claude API using the brand's real inputs — not templates.

| Document | When Generated | What It Contains |
|---|---|---|
| KeHE Elevate Application | Distributor blocker identified | Complete email to KeHE's new brand intake team with brand intro, product details, distribution goal, and why they fit KeHE's natural portfolio |
| Sprouts Submission Checklist | Sprouts target selected | Personalised checklist of everything required, marked done/not-done based on founder's current state. Includes direct links. |
| Whole Foods Pitch Brief | WF target, score > 60 | One-page buyer pitch: category gap, velocity proof, margin scenario, launch support plan, brand story |
| Sell Sheet Outline | Any retailer | Structure and content for a retail-ready sell sheet in the format buyers expect |
| UNFI Application Draft | WF target, no UNFI | Complete UNFI supplier application with company overview, product details, distribution goals |
| Buyer Outreach Email | Any retailer | Personalised cold email to a category buyer. Direct, data-led, specific ask. Subject line included. |

**FR-06: Not-Ready Redirect**

If readiness score falls below 40/100 for target retailer, Carve explicitly states the brand is not ready and recommends an alternative stepping-stone retailer. Example: "You are not ready for Whole Foods. Your DTC revenue is below the $100K minimum UNFI typically requires. Start with Natural Grocers or Fresh Thyme — here's why and what you need to get there."

**FR-07: PO Outcome Logging (NEW)**

A "Log My Result" action lets a founder record the outcome of a retailer submission — won, rejected, or still pending — against that brand's assessment history. This closes the v1 PO-path loop: intake, score, blocker, waterfall, documents, outcome.

In v1, outcome logs are stored per-brand only. There is no cross-brand aggregation, cohort comparison, or benchmark reporting — that is FR-14 (§6.3), a later-phase capability that activates once enough brands have logged results for aggregate data to be statistically meaningful.

### 6.2 Growth Features (P1 — Post-v1)

Everything below is real, scoped, and staying on the roadmap. It does not ship until the v1 core loop (§6.1) is live and stable — see §12 for exact phase sequencing.

**FR-08: Investor Readiness Test (Free Growth Feature)**

A 10-question assessment that simulates the toughest investor and buyer questions a CPG founder will face — the kind asked on Shark Tank and in retail buyer meetings. Claude API evaluates each answer and generates a score (0–100) plus a specific verdict on what's blocking investor confidence.

This feature requires no subscription and no signup for the basic score. It is the top-of-funnel acquisition engine. Output includes a shareable card branded with Carve that founders post to LinkedIn and Instagram.

Conversion path: Free Investor Readiness Test → "Get your full retail readiness score" CTA → $49/month subscription.

**FR-09: Competitive Shelf Positioning (NEW)**

Using weekly scraping of retailer websites and Instacart, Carve builds a database of current SKUs per category per retailer. When a brand submits, they receive: current SKU count in their category at their target retailer, existing price range, where their MSRP sits in that range, whether a private label version exists, what gap they fill, and the most likely question a buyer will ask about competitive differentiation.

**FR-10: LEAP Calendar Tracker (NEW)**

Carve monitors Whole Foods' LinkedIn weekly for LEAP program announcements. When an announcement is detected, all brands with a LEAP alert set receive an immediate email with the program overview, an eligibility check, and the application link. Brands waiting for this window stay subscribed specifically because of this alert.

**FR-11: Post-Placement Stay-In Checklist (NEW)**

After a founder logs their first retail placement, the Stay-In subscription unlocks. This provides: the specific velocity number they need to hit at that retailer to earn permanent placement, a week-by-week 90-day action plan, demo scheduling reminders, buyer check-in cadence, and a "discontinuation risk" alert if velocity data suggests they are below threshold.

**FR-12: Retailer Intelligence Database (Expanded)**

Live data in retailers.json covering six retailers at launch:

- Whole Foods Market (with LEAP Early Growth, On the Verge, 100+ new locations planned)
- Sprouts Farmers Market (Innovation Set, Forager program, KeHE 10-year deal)
- Natural Grocers (stepping-stone retailer, USDA Organic preference)
- Fresh Thyme Farmers Market (Midwest-focused, KeHE/UNFI distributor options)
- Earth Fare (Southeast-focused, clean label emphasis)
- Thrive Market (online-only, membership model, different margin requirements)

**FR-13: Broker Dashboard**

A broker account can add multiple brand clients. Single view showing all clients with current scores, primary blockers, last assessment date, and quick actions: generate pitch brief, generate application, view full report. Broker can generate a pitch brief for any client in one click. Priced at $750/month.

### 6.3 Future Features (P2 — Later Phase)

**FR-14: Cross-Brand Outcome Benchmark Intelligence**

Builds on the per-brand outcome logs founders record via FR-07 (§6.1). Once enough brands have logged results, this feature anonymises and aggregates them into the proprietary benchmark dataset: what readiness score predicted success, what velocity benchmark actually mattered, median time from first assessment to first PO. This dataset is the long-term moat.

---

## 7. Non-Functional Requirements

| Requirement | Specification |
|---|---|
| Accuracy | Every retailer requirement data point cites its source. AI generates specific blocker statements and document content — never invents factual retailer requirements. Weekly human review of scraped source data (distinct from the automated Verification row below, which checks each AI *output*, not the source data). |
| Verification (NEW) | Every AI-generated narrative or document (score narrative, blocker statement, waterfall verdict, all FR-05 documents, FR-08 test evaluation) is checked by a second, independent Claude call before being shown to the founder. The checker compares the generation against `retailers.json` and the deterministic waterfall calculator's own output. On a flagged discrepancy, the document is not shown as final — the founder instead sees a retry/pending state while it is silently regenerated once, or, if it fails a second time, an explicit "this result needs review" state rather than any output. Exact UX for this state is a Phase 2/3 design decision, not specified further here. |
| Observability (NEW) | Every AI generation call (both the primary generation and its verification check) is logged to `generation_log` — see §10 — capturing prompt version, retailer-data snapshot, brand input snapshot, model, output, and timestamp. This log is the instrumentation the §13.2 "Data accuracy vs ground truth" metric is measured from; without it that metric cannot be produced. |
| Freshness | Retailer data refreshed weekly via automated scraping + human review. LEAP calendar monitored daily for announcements. Freshness timestamp displayed per retailer. |
| Performance | Readiness score returns in <5 seconds. Document generation in <15 seconds. Waterfall calculator instant. |
| Security | RLS policies enforced in Supabase. No brand data shared between accounts. Claude API calls use brand data in-session only and it is never used for model training without explicit consent — this governs Anthropic's handling of the data, not Carve's own storage of it. Separately, Carve persists that same data in `generation_log` (§10.1) as its own audit trail under the same RLS/access controls as all other brand data; retention period is not yet decided (see §15.2). |
| Scalability | Architecture supports 10,000 active users without degradation. Retailer database extensible to 50+ retailers without architectural changes. |
| Accessibility | WCAG 2.1 AA. Mobile-responsive from day one. |
| Reliability | 99.5% uptime SLA. Email alerts within 30 minutes of trigger. |
| Liability | All retailer requirement data explicitly positioned as informational. Carve is not a legal advisor, compliance auditor, or official representative of any retailer. Disclaimers present on every output. |

---

## 8. Revenue Model & Business Economics

### 8.1 Pricing Tiers

| Tier | Price | What It Covers | Target Customer |
|---|---|---|---|
| Investor Readiness Test | FREE | 10-question investor readiness assessment. Shareable score card. Investor-readiness verdict statement. No subscription required. | Top-of-funnel acquisition for all personas (post-v1 growth feature) |
| Base Subscription | $49/month | Readiness score (6 dimensions) for 1 target retailer, single blocker, weekly action, LEAP alert, cost waterfall calculator | Every active founder in pre-distribution phase |
| Retailer Launch Package | $299 one-time per retailer | Full submission package: score, all documents (KeHE application, submission checklist, pitch brief, sell sheet outline, buyer email), competitive shelf positioning | Founders 60%+ ready preparing to submit |
| First PO Celebration | $499 one-time | Logged when founder gets first PO. Retrospective on what worked. Next-retailer readiness assessment. Stay-in checklist activation. | Founders who cracked their first door |
| Stay-In Subscription | $99/month | 90-day post-placement checklist, velocity tracking, demo reminders, buyer check-in cadence, discontinuation risk alerts | Founders with active retail placement (post-v1) |
| Broker Dashboard | $750/month | Multi-client management, bulk pitch brief generation, client readiness tracking, agency-level reporting | Food brokers managing 10–30+ brands (post-v1) |

*Note: the tiers above are the full monetization model, unchanged from v2. Stripe-based billing automation is a Phase 6 build item (§12); Phases 0–4 (concierge through v1) may collect payment manually via invoice rather than through live subscription infrastructure.*

### 8.2 Unit Economics Projection

| Scenario | Monthly Users | MRR Estimate | Annual Run Rate |
|---|---|---|---|
| Conservative (Month 6) | 200 base + 10 brokers + 5 stay-in | $9,800 + $7,500 + $495 | $212K ARR |
| Base Case (Month 12) | 700 base + 25 brokers + 20 stay-in + 60 packages | $34,300 + $18,750 + $1,980 + $17,940 | $877K ARR |
| Growth Case (Month 18) | 1,800 base + 60 brokers + 80 stay-in + 150 packages | $88,200 + $45,000 + $7,920 + $44,850 | $2.2M ARR |

---

## 9. Go-To-Market Strategy

### 9.1 The Investor Readiness Test Viral Loop

The free Investor Readiness Test is the single most important customer acquisition feature planned for the post-v1 growth phase (§12, Phase 5). It is free, shareable, and intensely relevant to every CPG founder who has ever thought about investor or buyer scrutiny. The mechanics:

- Founder takes the 10-question test. Takes 5 minutes. No signup required for basic score.
- Receives a score (0–100) plus a specific verdict on what's blocking investor confidence in their brand.
- Receives a shareable card: "I scored [X] on the Carve Investor Readiness Test. Is your brand investor-ready?"
- Card links to carve.ai. Every share is organic acquisition within the CPG founder community.
- After receiving score: "Want to know what's actually blocking you from Whole Foods? Get your full retail readiness score." CTA to $49/month.

### 9.2 Startup CPG Partnership (Highest Priority)

Startup CPG has 50,000+ emerging brand founders in their Slack community. They already partner with Byzzer (post-distribution analytics) and Cultivate CPG (national broker). Carve is the pre-distribution layer they do not have. Their Whole Foods 101 webinar attracted 300+ attendees — proof that the community is hungry for exactly what Carve provides.

Target outcome: Carve becomes the official retail readiness tool for the Startup CPG community, embedded in their onboarding, featured in their newsletter, and mentioned in their retailer webinar series.

### 9.3 Shark Tank Alumni Network

Brands that appear on Shark Tank need their retail story fast. Post-Tank brands are often scrambling to fulfil the distribution promise they made to the Sharks. Carve's Investor Readiness Test and waterfall calculator are precisely what they need both before the pitch and after. Outreach: Shark Tank alumni Facebook groups and official Shark Tank brand pages.

### 9.4 Broker Channel

A single broker sale at $750/month replaces 15 individual founder subscriptions. Brokers see Carve as a productivity tool that makes them more efficient and more profitable, not as a threat. Early outreach through natural food broker associations, LinkedIn, and referrals from founder customers.

---

## 10. Technical Architecture

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui | Matches the existing product design. App Router + server components suit the intake-to-dashboard flow. |
| Backend | FastAPI (Python 3.11) | AI/ML integration cleanest in Python. Async for performance. |
| Database | Supabase (PostgreSQL + Auth) | Managed Postgres and Auth hosting only. All reads and writes go through the FastAPI backend — there is no direct client-to-database access via Supabase's client SDK, and Postgres RLS is not relied upon as a substitute for backend business logic. See architectural principle below. |
| AI Generation | Anthropic Claude API (claude-sonnet-4-6) | $3/M input, $15/M output. ~$0.05-0.10 per document generated for the primary generation call; add the §10.1 verification call on top (roughly doubles the per-document cost). |
| Retailer Intelligence | Firecrawl/Apify scraping + retailers.json + human review | Public retailer portals scraped weekly. Human layer validates before publishing. |
| Competitive Shelf Data | Instacart + retailer website scraping via Firecrawl | Weekly scrape of SKUs per category per retailer. Stored in Supabase. |
| Brand Data Ingestion | Shopify Partner API + Amazon SP-API | Both free. Brands authorize Carve to read their own sales data. |
| Payments | Stripe | Subscription + one-time payment mix. Webhook handler for subscription events. |
| Email | Resend | Weekly actions, LEAP alerts, discontinuation warnings. Free tier covers early stage. |
| Deployment | Vercel (frontend) + Fly.io or Render (backend) | Free tiers adequate for 0–500 users. Scales predictably. |

> **Architectural principle: one API layer owns all business rules.** Supabase is used strictly as managed infrastructure — Postgres and Auth hosting. FastAPI is the sole data-access and business-logic layer: no client reads or writes Supabase directly via its client SDK, and Row Level Security is not used as a substitute for backend authorization or business rules. RLS may still be enabled as defense-in-depth, but it is never the primary enforcement mechanism.

### 10.1 AI Generation Verification & Logging

Every AI generation call in the product — FR-01/03 score narrative and blocker statement, FR-02 waterfall verdict (Phase 2), FR-05 documents (Phase 3), FR-08 test evaluation (Phase 5, once it ships) — runs as two Claude calls, not one: a **generation** call and a **verification** call. The verification call receives the generated output plus the same source facts (the relevant `retailers.json` entries and the deterministic waterfall calculator's own numbers) and checks the generation for factual drift before the FastAPI layer returns it to the frontend. This roughly doubles Claude spend on generation-heavy paths (§10.2) but is the mechanism behind the §7 Verification requirement.

Both calls are recorded in a `generation_log` table (Supabase, behind the same RLS/access controls as other brand data — see §7 Security) with, per row: `prompt_version`, `retailer_data_snapshot_id`, `brand_input_snapshot`, `model`, `output`, `verification_result`, and `created_at`. This is the full provenance trail: it's what makes the §13.2 "Data accuracy vs ground truth" metric measurable, and it's what lets a specific founder-facing document be reconstructed later — which prompt version, which retailer-data snapshot, and which brand inputs produced it.

### 10.2 Infrastructure Cost at Early Stage

| Component | Cost at 0–500 Users | Cost at 500–2,000 Users |
|---|---|---|
| Claude API (generation + verification calls, §10.1) | $35–90/month | $250–700/month |
| Firecrawl/Apify | $16–49/month | $49–99/month |
| Supabase | Free tier | $25/month |
| Vercel + Fly.io/Render | Free tier | $40/month |
| Resend | Free tier | $20/month |
| **Total** | **$75–190/month** | **$400–900/month** |

---

## 11. Competitive Analysis & Positioning

### 11.1 The Shark Tank Parallel

Kevin O'Leary has said versions of "the food category is brutal" in dozens of episodes. He is right. CPG brands fail because of thin margins, production constraints, and buyers who receive hundreds of pitches a week. What O'Leary actually reveals is not that CPG is unwinnable — it is that the brands who fail walk in unprepared. They do not know their unit economics cold. They do not know what competing SKUs are already on the shelf. They do not know what the buyer's actual criteria are.

Carve is preparation. It is what you use before you walk in the room — whether that room is a buyer's office, a trade show booth, or the Tank.

### 11.2 Positioning Statement

Carve is the only platform built specifically for CPG brand founders before they have retail distribution — the moment when they need the most help and the fewest tools exist. Where Byzzer shows how your product performs after you are already on shelves, Carve shows exactly what you need to do to get on shelves in the first place. And unlike a broker at 7% of revenue, Carve costs $49/month and hands you the documents to act on its intelligence immediately.

---

## 12. Timeline & Milestones

Milestone-gated, not calendar-gated. Each phase begins only when prior phase gate criteria are met.

> **v1 boundary:** Phases 0–4 constitute the v1 build — the PO-path core loop: brand intake, 6-dimension scoring, a single ranked blocker surfaced one at a time, full cost waterfall, document generation, and PO outcome logging. Phase 5 onward is explicitly post-v1. Those phases are sequenced, not deprioritized — the free Investor Readiness Test, Stripe billing, the broker dashboard, expanded retailers, competitive shelf positioning, stay-in tracking, LEAP alerts, and cross-brand benchmarking all remain committed roadmap, built after the core loop is proven.

| Phase | Gate to Proceed | Deliverables |
|---|---|---|
| Phase 0: Validation | 5+ conversations, 3+ unprompted yes, monetisation mechanic confirmed | Validated ICP, confirmed pricing, 5 early access users identified |
| Phase 1: Concierge MVP | Phase 0 gate cleared. 3 paying customers at $49–149/month manual service. | Manual Carve service: founder fills form, you run assessment and generate report via Claude API, send PDF |
| Phase 2: Self-Serve Diagnostic Core *(v1 build begins)* | 5+ paying concierge customers. | FastAPI backend: readiness score (6 dimensions), full cost waterfall calculator, single blocker surfacing. `generation_log` table live (§10.1). Verification checker (second Claude call) wired into the blocker statement and waterfall verdict generations. Next.js 14 (App Router) frontend: onboarding/intake form, dashboard, SingleBlocker component. |
| Phase 3: Document Generation *(v1 continues)* | 10+ paying subscribers. | KeHE application, Sprouts submission checklist, WF pitch brief, sell sheet outline, UNFI application draft, buyer outreach email — all Claude-generated, brand-specific, tied to the blocker surfaced in Phase 2. Verification checker extended to all six document types. `generation_log` now covers every AI surface in v1 — this is what makes the §13.2 accuracy metric measurable starting at its first Month 3 checkpoint. |
| Phase 4: PO Outcome Logging *(v1 complete)* | 15+ paying subscribers, 3+ brands through document generation. | "Log My Result" action — founders record PO outcome (won / rejected / pending) per brand. Completes the v1 PO-path loop: intake → score → blocker → waterfall → documents → outcome. No aggregate benchmarking yet (see Phase 10). |
| Phase 5: Investor Readiness Test *(post-v1 growth)* | 20+ paying subscribers, v1 loop stable in production. | Free, no-signup Investor Readiness Test live. Shareable score card. Top-of-funnel acquisition begins. Verification checker and `generation_log` (§10.1) extended to FR-08's test evaluation, consistent with every other AI generation surface. |
| Phase 6: Stripe + Broker Dashboard | 30+ paying subscribers, 1 broker in pilot. | Stripe payments live (subscriptions + one-time). Broker multi-client dashboard beta. |
| Phase 7: Expanded Retailers + Shelf Positioning | 50+ subscribers, 3+ broker accounts. | Natural Grocers, Fresh Thyme, Thrive Market added to retailer database. Competitive shelf-positioning scraping feature live. |
| Phase 8: Stay-In + LEAP Alert | $100K ARR. | Post-placement stay-in subscription. LEAP calendar tracker. Discontinuation risk alerts. |
| Phase 9: Production Hardening | Stable revenue. | Vercel + Fly.io/Render production deploy. Sentry error monitoring. PostHog analytics. |
| Phase 10: Cross-Brand Outcome Intelligence | 200+ brands have logged results (via Phase 4 outcome log). | Anonymised, aggregated benchmark dataset. "Brands like yours had an average score of X when they got in." |

---

## 13. Success Metrics

### 13.1 Validation Phase

| Metric | Target | Timeframe |
|---|---|---|
| Direct founder conversations | 5+ | 3 weeks |
| Unprompted willingness to pay | 3 of 5+ | 3 weeks |
| Pricing model confirmed | consensus on subscription + per-retailer model | 3 weeks |

### 13.2 Post-Launch Product Metrics

| Metric | Month 3 | Month 6 | Month 12 |
|---|---|---|---|
| Active paying subscribers | 20 | 100 | 500 |
| Monthly recurring revenue | $2K | $10K | $40K |
| Investor Readiness Test completions (free) | 500 | 2,000 | 10,000 |
| Free-to-paid conversion rate | — | 8%+ | 10%+ |
| Weekly action completion rate | 40%+ | 55%+ | 65%+ |
| Brands logging first retail PO | 2 | 10 | 50 |
| Broker accounts active | 0 | 3 | 15 |
| Data accuracy vs ground truth | 95%+ | 97%+ | 98%+ |
| Net Promoter Score | — | 50+ | 65+ |

---

## 14. Risks & Mitigations

| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| Demonstrated pain does not convert to willingness to pay | Med | High | Phase 0 gate: zero build until 3+ unprompted yes. Concierge MVP proves paying behaviour before self-serve is built. |
| Retailer data becomes stale and misleads founders | Med | High | Weekly automated scraping + human verification. Freshness timestamps on every data point. User-reported feedback mechanism. |
| A well-resourced incumbent (NIQ/Byzzer) builds a pre-distribution feature | Low–Med | High | Speed to market and outcome network effect. NIQ's incentive to cannibalise Byzzer's positioning is low. Move fast to establish user base. |
| Brokers see Carve as a threat and discourage clients from using it | Low | Med | Position Carve as broker-enabling. $750/month broker tier makes them more efficient. Early design partner outreach to brokers. |
| Investor Readiness Test goes viral but does not convert to paid | Med | Med | Optimise the conversion path from score reveal to subscription CTA. A/B test the moment between score and paywall. |
| Production/co-manufacturer readiness scoring is inaccurate for many brand types | Med | Med | Start with conservative thresholds. Use user feedback to calibrate. Flag as "estimate" not "certified". |
| The knowledge curation layer drifts from actual retailer criteria | High | Med | Weekly scraping schedule. Contract with a part-time natural channel expert (ex-buyer or experienced broker) to validate accuracy monthly. |

---

## 15. Open Questions

### 15.1 Before Phase 1

- Has Phase 0 validation (5+ conversations, 3+ yes responses) been completed?
- Is the pricing model confirmed (subscription + per-retailer + stay-in)?
- Has a trademark search been completed for "Carve" in Class 42 (SaaS)?
- Which 2 retailers are covered in the concierge MVP? (Recommendation: Sprouts + WF)

### 15.2 Strategic Questions

- With the Investor Readiness Test now sequenced as a Phase 5, post-v1 feature, should Phase 0 validation conversations still test its messaging, or wait until the v1 core loop is live?
- Should the broker dashboard remain in Phase 6 as scheduled, or does early broker interest justify pulling it forward?
- Is a Startup CPG partnership conversation the first GTM move after validation?
- Does the stay-in subscription require Supabase real-time velocity data from distributors, or is self-reported data sufficient to start?
- Does any AI-generated document (KeHE application, UNFI draft, etc. — FR-05) need a founder review/confirm step before it's sent externally, or is the current §7 Liability posture (informational tool, disclaimer-only) sufficient on its own? The §7/§10.1 verification checker catches factual drift against known source data, but does not require the founder to confirm anything before sending — this is a distinct, currently undecided question.
- What retention period applies to `generation_log` (§10.1, §7 Security), which persists brand input/output data indefinitely by default today? No policy is set yet.

---

## 16. Appendix

### 16.1 Glossary

- **Category reset:** Scheduled period when a retailer reviews and updates product assortment. The primary window for new brands to gain shelf placement.
- **Co-manufacturer (co-man):** A third-party production facility that manufactures a brand's products. Required by most major retailers before they will issue a PO at scale.
- **Discontinuation risk:** The risk that a retailer removes a brand's products due to insufficient velocity, out-of-stocks, or failure to participate in promotional events.
- **EDI (Electronic Data Interchange):** Standard system for transmitting purchase orders and invoices between retailers and suppliers. Required by all major specialty grocery retailers.
- **Facing:** In retail, a facing is one product unit visible from the aisle. More facings = more shelf space. A brand's first retail placement may start with 1–2 facings.
- **Innovation Set (Sprouts):** Dedicated shelf section for emerging brands in a 90-day trial period. Approximately 40% of Innovation Set brands earn permanent placement.
- **Investor Readiness Test:** Carve's free investor-readiness assessment simulating the toughest investor and buyer questions a CPG brand will face about retail strategy and unit economics. A post-v1 growth feature (see §12, Phase 5).
- **KeHE Elevate:** KeHE Distributors' accelerator program for brands seeking natural distribution. Primary pathway for brands targeting Sprouts, Fresh Thyme, and Natural Grocers.
- **LEAP (Whole Foods):** Local and Emerging Accelerator Program. Two cohorts: LEAP Early Growth (brands new to WF) and LEAP On the Verge (brands already in WF showing growth potential). Applications open annually.
- **Private label risk:** When a retailer creates their own version of a brand's successful product under the store's name (e.g., Sprouts brand spice blends). A real risk once a brand proves market demand.
- **Stay-in subscription:** Carve's $99/month post-placement tier providing 90-day action plans, velocity tracking, and discontinuation risk alerts for brands that have achieved their first retail door.
- **Velocity (UPSPW):** Units Per Store Per Week. The primary metric retail buyers use to evaluate brand performance. Brands typically need 2–3 UPSPW minimum to maintain placement.
- **Waterfall:** The full cost flow from factory to consumer shelf: factory cost → co-packing → freight → distributor markup → retailer margin → chargebacks → MSRP.

---

## Document History

| Version | Date | Changes |
|---|---|---|
| 1.0 | June 20, 2026 | Initial PRD as "Greenlit". Pre-distribution wedge, 5-dimension score, basic document generation. |
| 2.0 | June 27, 2026 | Renamed to Carve. Added: 6th scoring dimension (Fulfillment), full cost waterfall, O'Leary test (free viral feature), competitive shelf positioning, LEAP calendar tracker, stay-in subscription, post-placement checklist, 4 additional retailers, Shark Tank research integration, Startup CPG GTM partnership, updated revenue model and timeline. |
| 3.0 | July 19, 2026 | Renamed the Kevin O'Leary Investor Readiness Test to the Investor Readiness Test, removing named-celebrity branding and "what O'Leary would say" language throughout (Exec Summary, §3.1, FR-08, §8.1, §9.1, User Stories, Glossary); §2.2 Shark Tank case studies retained as market research with a lightly reframed transition. Re-sequenced the roadmap around v1 = PO-path core loop only (intake, scoring, single blocker, waterfall, document generation, PO outcome logging); confirmed Stripe/paid tiers, broker dashboard, stay-in tracking, competitive shelf positioning, LEAP alerts, cross-brand benchmarking, and the free Investor Readiness Test as later-phase, and split outcome logging (FR-07, v1) from benchmark aggregation (FR-14, later). Corrected §10 Technical Architecture: Next.js 14 App Router (not React+Vite), Supabase used strictly as managed infrastructure with FastAPI as the sole data-access/business-logic layer (RLS not used as a business-rule substitute), and Fly.io/Render for backend deployment (not Railway). |
| 3.1 | July 19, 2026 | Added AI-generation trust infrastructure, previously implicit or missing: §7 gained Verification (independent second Claude call checks every generation against `retailers.json` and the waterfall calculator's own numbers before it reaches the founder) and Observability (`generation_log` provenance) as named NFRs, and the pre-existing Accuracy row was reworded to remove a naming collision with the new Verification row. §10 gained a new §10.1 describing the two-call generation+verification architecture, the `generation_log` schema (prompt version, retailer-data snapshot, brand input snapshot, model, output, verification result), and the founder-facing behavior on a flagged discrepancy; infrastructure cost estimates in §10.2 (and the per-document cost note in §10) updated to reflect the added Claude calls. §12 moved this instrumentation into Phase 2 (blocker/waterfall) and Phase 3 (all six FR-05 documents) instead of Phase 9, and Phase 5 now explicitly extends it to FR-08 when that feature ships. §15.2 gained two open questions: whether AI-generated documents need a founder confirm step before external send (deliberately left undecided rather than resolved in this revision), and what retention period applies to `generation_log`'s persisted brand data. §7 Security reworded to reconcile "Claude API calls use brand data in-session only" (Anthropic's handling) with `generation_log`'s indefinite-by-default persistence (Carve's own audit trail) — these were previously in unstated tension. |
