# Champions League Sports Tournament — Registration Web App

Official Registration Web Application for the **Champions League Sports Tournament 2026**. Designed for deployment on **Vercel** with full **Supabase Database & Storage** integration.

![Champions League Header](assets/champions-logo.png)

## 🌟 Key Features

- 🏆 **Champions League Aesthetic**: Custom dark-mode glassmorphism UI with Champions League logo header and gold/cyan glowing theme.
- 🐯 **Pug Tiger Mascot**: Official mascot graphic display on the right sidebar layout.
- ⚽ **8 Sports Combined Rating System**: Interactive skill sliders (1 to 10) across 8 disciplines:
  1. Pickleball
  2. Poker
  3. Cricket
  4. Triathlon
  5. Archery & Shooting
  6. Badminton
  7. Table Tennis
  8. Football / Multi-Sport
  - Live calculation of real-time **Combined Skill Index**.
- 👕 **Live 3D Jersey Customizer**: Real-time graphics rendering Jersey Name and Jersey Size badge.
- 📸 **Photo Compression & Upload**: Drag-and-drop avatar uploader with client-side canvas compression.
- 🛡️ **Organiser Admin Console (`/admin`)**: Registration list, player stats summary, search, status filter, and CSV data export.
- ⚡ **Supabase Ready**: Includes complete `schema.sql` database schema and RLS policies.

- 🔨 **Live Auction Platform**: single-round auction for all 64 players with three views —
  Organiser control (`/admin` → Auction Control), Team Captain bidding (`/captain`),
  and a public live view (`/auction`).

---

## 🔨 Auction Platform

One single auction round covering all 64 players. Four teams, ₹1 crore purse each,
minimum 15-player squads (2 retained + 13 bought). Every squad-maths number is
**derived from `js/auction-config.js`** — nothing is hardcoded.

### Three views

| Route | Who | What |
|---|---|---|
| `/admin` → **Auction Control** | Organiser | Run the auction: open lots, take bids, SOLD / unsold, compulsory-fill alerts, player pool, team passwords, squads, CSV export |
| `/captain` | Team captains | Password login per team, live purse / reserve / max bid, one-tap bidding |
| `/auction` | Everyone | Read-only live view: lot on the block, bids, purses, squads, pool progress |

### The rules, and where they are enforced

Every rule is enforced **server side** in Postgres `SECURITY DEFINER` functions.
`js/auction-engine.js` is a faithful mirror used only to grey out illegal actions
before the server is called — a tampered browser cannot place an illegal bid.

1. **Purse & reserve** — `maxBid(T,P) = purse(T) − reserve(T,P)`, where the reserve is
   evaluated *as if P had already been acquired*. Shown live on every console and
   recomputed after every purchase.
2. **Eligibility** — a team may bid if it still needs the category, or has met the
   minimum and passes the feasibility guard. Ineligible teams are greyed out with a
   one-line reason.
3. **Feasibility guard** — a surplus buy may never make another team's minimum
   impossible: `remaining(X) − 1 ≥ Σ unmet(T',X)`. Computed generically from the
   counts, so it blocks surplus in every zero-slack category automatically.
4. **Compulsory fill** — when exactly one team can legally take what is left in a
   category and its count is pinned, those players are its at base price and nobody
   may compete. Flagged prominently before the next lot opens.
5. **Increments** — below ₹10,00,000 → ₹50,000 steps; ₹10,00,000 and above →
   ₹1,00,000 steps. Opening bid is the base price, not base + step. The organiser can
   enter a custom bid that still respects max bid.
6. **Sold / unsold** — unsold players return to the pool and can be re-queued at base.
   The auction cannot be closed while any player is unsold *and* any team has an unmet
   minimum; the console names which team and which players.
7. **Squad completion** — no fixed squad cap. Teams keep bidding while rules 2 and 3
   allow, so final squads are uneven (15 to 19 on these numbers).

### Derived, never hardcoded

Computed from the config at runtime and verified against the live database:

| Quantity | Value on these numbers |
|---|---|
| Minimum reserve wallet | **₹35,00,000** (2×2L + 3×1L + 3×5L + 3×3L + 2×2L) |
| Slack per category | Circular B **2**, Tabler C **2**; Circular A / Tabler A / Tabler B **0** |
| Max squad (pool-bound) | **19** |
| Worked example | full purse, nothing bought, bidding on a Tabler A → max bid **₹70,00,000** |

Because Circular A, Tabler A and Tabler B have zero slack, no team can ever buy a
surplus one — the guard derives this from the counts rather than special-casing it.

### One thing worth deciding before the live event

The rules guarantee **every team can always fill its minimums** — verified across
randomised full-auction simulations, which never once left a team short. They do
**not** guarantee all 64 players are sold: if all four teams bid their purses down to
the reserve floor, the four slack players (2 Circular B + 2 Tabler C) become
unsellable, because no team has purse above their base price.

Rule 6 permits closing the auction in that state, since it only guards minimums. The
console detects it and says so explicitly (`auction_stranded`) rather than letting the
organiser re-queue the same lots forever. If those four players must always be placed,
the fix is a policy decision — e.g. cap discretionary spend, or let the organiser
assign leftovers at base — not a change to the maths.

---

## 🚀 Setup & Vercel Deployment Guide

### Step 1: Connect Supabase Database
1. Create a project on [Supabase](https://supabase.com).
2. Go to **SQL Editor**, paste contents of `supabase/schema.sql` and run.
3. Copy **Project URL** and **Anon Key** from **Project Settings -> API**.
4. Update `js/config.js` with your credentials:
   ```javascript
   SUPABASE_URL: "https://your-project-id.supabase.co",
   SUPABASE_ANON_KEY: "your-anon-public-key-here"
   ```

### Step 2: Deploy to Vercel
1. Import this GitHub repository into your [Vercel Dashboard](https://vercel.com).
2. Framework Preset: **Other / Static HTML**.
3. Click **Deploy**.

---

## 📁 Repository Structure

```
.
├── index.html              # Main Registration Form & Mascot Layout
├── css/
│   ├── style.css           # Design System & Responsive Theme
│   └── auction.css         # Auction theme shared by all three views
├── js/
│   ├── config.js           # Tournament & Backend Config
│   ├── app.js              # Ratings Math, Jersey Preview & Supabase Submissions
│   ├── auction-config.js   # AUCTION SINGLE SOURCE OF TRUTH (teams, pool, minimums)
│   ├── auction-engine.js   # Rules engine: reserve, max bid, feasibility, compulsory
│   └── auction-client.js   # Shared Supabase data layer for all three auction views
├── assets/
│   ├── champions-logo.png  # Champions League Logo
│   ├── pug-tiger-mascot.png# Pug Tiger Mascot Graphic
│   └── sports-bg.png       # Stadium Background
├── admin/
│   ├── index.html          # Organiser Console (Registrations + Auction Control tabs)
│   ├── admin.js            # Registration management & CSV export
│   └── auction.js          # Auction control room, player pool, teams, squads
├── captain/
│   ├── index.html          # Team Captain bidding console
│   └── captain.js          # Captain login + live bidding
├── auction/
│   ├── index.html          # Public live auction view
│   └── auction.js          # Read-only live rendering
├── supabase/
│   ├── schema.sql          # Registrations, settings, storage policies
│   ├── auction-schema.sql  # Auction tables, rule functions, RLS, realtime
│   └── README.md           # Database Setup Instructions
├── vercel.json             # Vercel Route Config
└── README.md
```

---
*Built for Champions League Tournament 2026.*
