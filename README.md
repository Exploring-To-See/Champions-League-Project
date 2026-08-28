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
| `/admin` → **Auction Control** | Organiser | Run the auction: open lots, take bids, SOLD / unsold, compulsory-fill alerts, player pool, **Captain Logins**, squads, CSV export |
| `/captain` | Team captains | Password login per team, live purse / reserve / max bid, one-tap bidding |
| `/auction` | Everyone | Read-only live view: lot on the block, bids, **team captains**, wallets, squads, **all players and who bought them**, pool progress |

### Captain sign-in

Captains authenticate against Supabase with a **team code + password**. There is no
e-mail and no Supabase Auth user per captain: `auction_captain_login` checks the
password against a bcrypt hash in `auction_team_auth` — a table with RLS on and no
select policy, so the hash never reaches any browser — and hands back a session
token that expires after 16 hours.

Set them up in **Auction Control → Captain Logins**, in this order:

1. **Setup → Sync Config** first. Password generation acts on the rows in
   `auction_teams`; until the config is synced there are no teams and nothing to
   issue a password *for*.
2. **Captain Logins → Generate Passwords For All Captains.** One click issues a
   fresh password for every team. The plaintext is shown **once**, with Copy All
   and Download CSV — only the bcrypt hash is stored, so a lost password can be
   reissued but never recovered.
3. Send each captain the console link shown at the top of that tab, plus their
   team code and password.

Reissuing a password immediately invalidates the old one and signs that captain
out everywhere. The tab shows, per team, whether a password is set, when it was
issued, and how many sessions are currently live.

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

## 🔗 Four Vercel Links — One Site

Each view can live on its own Vercel domain while staying one connected site.
A sticky nav bar on every page links the four together, and every page carries a
matching footer.

All four domains serve **this same repository**, so every path resolves on every
domain. The table below is what is actually deployed, not a suggestion.

| View | Path | Live domain |
|---|---|---|
| Player Registration | `/` | `1727championsleague.vercel.app` |
| Live Auction (public) | `/auction` | `1727championsauction.vercel.app` |
| Live Auction (stats) | `/auction` | `1727championstats.vercel.app` |
| Team Captain | `/captain` | `1727championsauction.vercel.app/captain` |
| Organiser Console | `/admin` | `championsadmin.vercel.app` |

`1727championstats.vercel.app` has no page of its own — its root redirects to
`/auction`, which is where the all-players board, team wallets and squad lists live.

Because captains sign in on `1727championsauction.vercel.app`, their session token
is scoped to that origin. A captain who opens `/captain` on a *different* domain
gets a separate, empty localStorage and has to sign in again — so send them the one
link from **Organiser Console → Auction Control → Captain Logins**.

### Wiring a domain up — two edits

**1. Root redirect** (`vercel.json` → `redirects`) so the domain's root lands on
its own view:

```json
{
  "source": "/",
  "has": [{ "type": "host", "value": "YOUR-DOMAIN.vercel.app" }],
  "destination": "/auction/",
  "permanent": false
}
```

**2. Cross-links** (`js/links.js`) so the nav points at the right domain instead of
a relative path:

```javascript
window.CLP_LINKS = {
  REGISTRATION: "https://1727championsleague.vercel.app",
  PUBLIC:       "https://1727championsauction.vercel.app",
  CAPTAIN:      "https://1727championsauction.vercel.app",
  ADMIN:        "https://championsadmin.vercel.app"
};
```

Leave any value as `""` and that link stays a **relative path** on whatever domain
the visitor is already on — so the site works before any custom domains exist, and
keeps working as you add them one at a time. Every path also stays reachable on
every domain, so nothing breaks if a domain is missing.

> `js/links.js` is the only place the four URLs are written down. The nav bar, the
> footer, and each page's cross-links all read from it.

---

## 🚀 Setup & Vercel Deployment Guide

### Step 1: Connect Supabase Database
1. Create a project on [Supabase](https://supabase.com).
2. Go to **SQL Editor**, paste contents of `supabase/schema.sql` and run.
3. In a new query, paste `supabase/auction-schema.sql` and run that too.
   **This one is not optional** — without it `/auction`, `/captain` and the
   Auction Control tab have no tables to read and every one of them shows
   "not set up yet". It must run *after* `schema.sql`, which it references.
4. Copy **Project URL** and **Anon Key** from **Project Settings -> API**.
5. Update `js/config.js` with your credentials:
   ```javascript
   SUPABASE_URL: "https://your-project-id.supabase.co",
   SUPABASE_ANON_KEY: "your-anon-public-key-here"
   ```
6. **Authentication → Users → Add user** with the e-mail hard-coded in
   `admin/admin.js`. That password is the Organiser Console login.

See [`supabase/README.md`](supabase/README.md) for what each file installs and
the order to set the auction up in afterwards.

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
│   ├── auction.css         # Auction theme shared by all three views
│   └── nav.css             # Cross-site nav, page intro, step rail, footer
├── js/
│   ├── config.js           # Tournament & Backend Config
│   ├── app.js              # Ratings Math, Jersey Preview & Supabase Submissions
│   ├── links.js            # THE FOUR VERCEL LINKS + shared nav/footer renderer
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
