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

> The file is run **after** `schema.sql` because `auction_players.registration_id`
> references `registrations(id)`.

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

In the Organiser Console → **Auction Control**, in this order:

1. **Setup → Sync Config** — pushes `js/auction-config.js` into the database.
   This is what creates the four team rows; nothing below works before it.
2. **Captain Logins → Generate Passwords For All Captains** — issues a fresh
   password per team in one click. Shown once; copy or download the CSV then.
3. **Teams & Captains** — rename teams, set colours and purses. (A custom
   password per team can still be set by hand here.)
4. **Player Pool** — import registrations, set each player's category, and
   pre-assign the 8 Captain / Vice Captain retentions.
5. **Control Room → Start** — go live, then open lots one at a time.

### Captain authentication

Captains do **not** get Supabase Auth users. They sign in with a team code and a
password checked by `auction_captain_login` against a bcrypt hash:

| Function | Role |
|---|---|
| `auction_generate_team_passwords(p_team)` | Organiser-only. Pass `null` to reissue every team at once. Returns the plaintext **once** and stores only the hash. |
| `auction_random_password(p_len)` | 31-symbol unambiguous alphabet, rejection-sampled so no symbol is likelier than another. Not callable by `anon` or `authenticated`. |
| `auction_captain_login(p_code, p_password)` | Verifies the hash, issues a 16-hour session token. |
| `auction_captain_session(p_token)` | Validates a stored token on page load; returns null once it expires, is signed out, or the password is reissued. |
| `auction_captain_logout(p_token)` | Drops the session. |
| `auction_captain_accounts()` | Per team: captain, vice captain, wallet, whether a password exists and how many sessions are live. Never returns the hash. |

Issuing a password deletes every existing session for that team, so a reissue
signs the old holder out immediately.
