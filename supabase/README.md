# Supabase Setup Guide — 1727 Champion's League 2.0

Two SQL files, run in order, in the Supabase **SQL Editor**.

## 1. Create the project
Go to [supabase.com](https://supabase.com) and create a free project.

## 2. Run the schemas (in this order)

| Order | File | Creates |
|---|---|---|
| 1 | `supabase/schema.sql` | `registrations`, `event_settings`, storage bucket + policies |
| 2 | `supabase/auction-schema.sql` | the whole auction platform (tables, rules engine, RLS, realtime) |

Both files are **idempotent** — safe to re-run after edits.

## 3. Copy credentials
**Project Settings → API** → copy the **Project URL** and **anon / public** key into `js/config.js`.

## 4. Create the organiser account
**Authentication → Users → Add user**, using the e-mail hard-coded in `admin/admin.js`.
That password is the Organiser Console login.

---

## What `auction-schema.sql` installs

### Tables
`auction_config`, `auction_categories`, `auction_teams`, `auction_team_auth`,
`auction_team_sessions`, `auction_players`, `auction_state`, `auction_lots`,
`auction_bids`, `auction_events`

### Where the rules live
Every auction rule is enforced **server side** in `SECURITY DEFINER` functions.
`js/auction-engine.js` mirrors them only so the UI can grey out an illegal action
early — a tampered browser cannot push an illegal bid through, because
`auction_place_bid` recomputes purse, reserve, feasibility and compulsory-fill
from the tables on every call.

| Rule | Function |
|---|---|
| 1 — purse & reserve | `auction_reserve`, `auction_max_bid` |
| 2 — eligibility | `auction_cat_eligible`, `auction_lot_context` |
| 3 — feasibility guard | `auction_surplus_feasible` |
| 4 — compulsory fill | `auction_forced_team`, `auction_alerts` |
| 5 — increments | `auction_step` |
| 6 — sold / unsold / end guard | `auction_sell_lot`, `auction_unsold_lot`, `auction_end_check` |
| 7 — squad completion | `auction_board` (`complete` flag per team) |
| — unsellable players | `auction_stranded` |

`auction_board()` returns the entire auction in one call; all three views use it.

### Security
- Every auction table is readable by `anon` (the public live view needs it).
- **No** table accepts a direct write — all mutations go through the RPCs.
- `auction_team_auth` (bcrypt password hashes) and `auction_team_sessions`
  (captain tokens) have RLS enabled and **no** select policy, so they never
  reach any browser.
- Organiser RPCs call `auction_require_admin()`, which rejects anonymous callers.

### Realtime
`auction_state`, `auction_lots`, `auction_bids`, `auction_players`,
`auction_teams` and `auction_events` are added to the `supabase_realtime`
publication, so every console updates the moment a bid lands.

---

## After the schema runs

In the Organiser Console → **Auction Control**:

1. **Setup → Sync Config** — pushes `js/auction-config.js` into the database.
2. **Teams & Captains** — name the teams and set each captain's password.
3. **Player Pool** — import registrations, set each player's category, and
   pre-assign the 8 Captain / Vice Captain retentions.
4. **Control Room → Start** — go live, then open lots one at a time.
