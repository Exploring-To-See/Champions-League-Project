-- ============================================================
-- 1727 CHAMPION'S LEAGUE 2.0 — AUCTION PLATFORM SCHEMA
-- Run AFTER supabase/schema.sql in the Supabase SQL Editor.
-- Dashboard -> SQL Editor -> New Query -> Paste -> Run.
--
-- Design note: every auction rule is enforced HERE, in SECURITY
-- DEFINER functions, not in the browser. js/auction-engine.js is a
-- faithful mirror used only to grey out illegal actions early. A
-- tampered client cannot place an illegal bid: the RPC recomputes
-- purse, reserve, feasibility and compulsory-fill from the tables.
-- Idempotent — safe to re-run.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) CONFIG — mirrored from js/auction-config.js via auction_sync_config
-- ------------------------------------------------------------
create table if not exists public.auction_config (
  id               int primary key check (id = 1),
  tournament       text   not null default '1727 Champion''s League 2.0',
  teams_count      int    not null default 4,
  min_squad        int    not null default 15,
  purse            bigint not null default 10000000,
  retained_cost    bigint not null default 0,
  increment_bands  jsonb  not null default
    '[{"upTo":1000000,"step":50000},{"upTo":null,"step":100000}]'::jsonb,
  updated_at       timestamptz not null default now()
);

create table if not exists public.auction_categories (
  code          text primary key,
  label         text   not null,
  short_code    text   not null,
  base_price    bigint not null check (base_price >= 0),
  player_type   text   not null,
  pool_count    int    not null check (pool_count >= 0),
  min_per_team  int    not null check (min_per_team >= 0),
  is_retained   boolean not null default false,
  color         text default '#00e5ff',
  sort_order    int    not null default 0
);

-- ------------------------------------------------------------
-- 2) TEAMS — credentials live in a separate table with no read policy
-- ------------------------------------------------------------
create table if not exists public.auction_teams (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  short_name   text,
  color        text default '#00e5ff',
  logo_url     text,
  purse_total  bigint not null default 10000000,
  purse_spent  bigint not null default 0 check (purse_spent >= 0),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.auction_team_auth (
  team_id       uuid primary key references public.auction_teams(id) on delete cascade,
  password_hash text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.auction_team_sessions (
  token      text primary key,
  team_id    uuid not null references public.auction_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '16 hours')
);

-- ------------------------------------------------------------
-- 3) PLAYERS — the 64-strong pool for the single auction round
-- ------------------------------------------------------------
create table if not exists public.auction_players (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references public.registrations(id) on delete set null,
  name            text not null,
  category_code   text not null references public.auction_categories(code),
  photo_url       text,
  status          text not null default 'available'
                  -- 'unsold' is a resting state, NOT a return to the pool:
                  -- the randomizer will not draw the player again, and the
                  -- organiser places them by hand once the pool is empty.
                  check (status in ('available','in_lot','sold','unsold')),
  team_id         uuid references public.auction_teams(id) on delete set null,
  sold_price      bigint,
  is_retained     boolean not null default false,
  retained_role   text check (retained_role in ('CAPTAIN','VICE_CAPTAIN')),
  unsold_count    int not null default 0,
  -- what this player won last time, shown on the card when they come up
  achievement     text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_auction_players_cat on public.auction_players(category_code);
create index if not exists idx_auction_players_team on public.auction_players(team_id);
create index if not exists idx_auction_players_status on public.auction_players(status);
-- The auction maths hammers these two shapes: "how many of category X
-- does team T own" (auction_owned) and "how many of X are left"
-- (auction_remaining). Both run on every bid, for every team.
create index if not exists idx_auction_players_owned
  on public.auction_players(team_id, category_code) where status = 'sold';
create index if not exists idx_auction_players_pool
  on public.auction_players(category_code) where status <> 'sold';

-- ------------------------------------------------------------
-- 4) LIVE AUCTION STATE
-- ------------------------------------------------------------
create table if not exists public.auction_state (
  id             int primary key check (id = 1),
  status         text not null default 'setup'
                 check (status in ('setup','live','paused','completed')),
  current_lot_id uuid,
  message        text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.auction_lots (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references public.auction_players(id) on delete cascade,
  status            text not null default 'open' check (status in ('open','sold','unsold')),
  base_price        bigint not null,
  current_bid       bigint,
  current_bidder_id uuid references public.auction_teams(id) on delete set null,
  winning_team_id   uuid references public.auction_teams(id) on delete set null,
  final_price       bigint,
  compulsory_team_id uuid references public.auction_teams(id) on delete set null,
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz
);

create index if not exists idx_auction_lots_status on public.auction_lots(status);

create table if not exists public.auction_bids (
  id         uuid primary key default gen_random_uuid(),
  lot_id     uuid not null references public.auction_lots(id) on delete cascade,
  team_id    uuid not null references public.auction_teams(id) on delete cascade,
  amount     bigint not null,
  source     text not null default 'captain' check (source in ('captain','admin')),
  created_at timestamptz not null default now()
);

create index if not exists idx_auction_bids_lot on public.auction_bids(lot_id, created_at desc);

create table if not exists public.auction_events (
  id         bigserial primary key,
  kind       text not null,
  message    text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_auction_events_time on public.auction_events(created_at desc);

insert into public.auction_config (id) values (1) on conflict (id) do nothing;
insert into public.auction_state  (id, status) values (1, 'setup') on conflict (id) do nothing;


-- ------------------------------------------------------------
-- 2b) IN-PLACE MIGRATIONS for databases created by an earlier
--     version of this file. All are no-ops on a fresh install.
-- ------------------------------------------------------------

alter table public.auction_players add column if not exists achievement text;

-- Allow 'unsold' on installs whose check constraint predates it.
do $$
begin
  alter table public.auction_players drop constraint if exists auction_players_status_check;
  alter table public.auction_players
    add constraint auction_players_status_check
    check (status in ('available','in_lot','sold','unsold'));
end $$;

-- Renaming a category code has to reach auction_players too, so make the
-- foreign key cascade before the rename below runs.
do $$
begin
  alter table public.auction_players drop constraint if exists auction_players_category_code_fkey;
  alter table public.auction_players
    add constraint auction_players_category_code_fkey
    foreign key (category_code) references public.auction_categories(code)
    on update cascade;
end $$;

-- "Circular" was the wrong word: these are Circlers. The cascade above
-- carries the rename into every player row.
update public.auction_categories set code = 'CIRCLER_A' where code = 'CIRCULAR_A';
update public.auction_categories set code = 'CIRCLER_B' where code = 'CIRCULAR_B';
update public.auction_categories set label = 'Circler A', player_type = 'circler'
 where code = 'CIRCLER_A';
update public.auction_categories set label = 'Circler B', player_type = 'circler'
 where code = 'CIRCLER_B';

-- ============================================================
-- 5) DERIVED HELPERS — the auction maths, computed from the
--    tables. Nothing here is hardcoded to the 64/4/15 numbers.
-- ============================================================

-- Indian digit grouping: 7000000 -> Rs.70,00,000
create or replace function public.auction_money(p_amount bigint)
returns text language plpgsql immutable as $$
declare v_s text; v_out text := ''; v_rest text; v_last3 text;
begin
  if p_amount is null then return '—'; end if;
  v_s := abs(p_amount)::text;
  if length(v_s) <= 3 then
    v_out := v_s;
  else
    v_last3 := right(v_s, 3);
    v_rest  := left(v_s, length(v_s) - 3);
    while length(v_rest) > 2 loop
      v_out  := ',' || right(v_rest, 2) || v_out;
      v_rest := left(v_rest, length(v_rest) - 2);
    end loop;
    v_out := v_rest || v_out || ',' || v_last3;
  end if;
  return (case when p_amount < 0 then '-' else '' end) || '₹' || v_out;
end $$;

-- Rule 5: increment band for the CURRENT bid, read from config
create or replace function public.auction_step(p_amount bigint)
returns bigint language plpgsql stable as $$
declare v_band jsonb; v_step bigint := 0;
begin
  for v_band in
    select jsonb_array_elements(increment_bands) from public.auction_config where id = 1
  loop
    v_step := (v_band->>'step')::bigint;
    if v_band->>'upTo' is null then return v_step; end if;
    if p_amount < (v_band->>'upTo')::bigint then return v_step; end if;
  end loop;
  return v_step;
end $$;

create or replace function public.auction_owned(p_team uuid, p_cat text)
returns int language sql stable as $$
  select count(*)::int from public.auction_players
   where team_id = p_team and category_code = p_cat and status = 'sold';
$$;

create or replace function public.auction_purse_left(p_team uuid)
returns bigint language sql stable as $$
  select (purse_total - purse_spent)::bigint from public.auction_teams where id = p_team;
$$;

-- Rule 1: unmet(T, X) = max(0, minimum(X) - owned(T, X))
create or replace function public.auction_unmet(p_team uuid, p_cat text)
returns int language sql stable as $$
  select greatest(0, c.min_per_team - public.auction_owned(p_team, p_cat))
    from public.auction_categories c where c.code = p_cat;
$$;

create or replace function public.auction_total_unmet(p_team uuid)
returns int language sql stable as $$
  select coalesce(sum(public.auction_unmet(p_team, c.code)), 0)::int
    from public.auction_categories c;
$$;

-- Rule 1: reserve(T, P), evaluated AS IF P had already been acquired.
-- Pass null for the plain nothing-acquired reserve wallet.
create or replace function public.auction_reserve(p_team uuid, p_acq_cat text default null)
returns bigint language sql stable as $$
  select coalesce(sum(
           (case when c.code = p_acq_cat and public.auction_unmet(p_team, c.code) > 0
                 then public.auction_unmet(p_team, c.code) - 1
                 else public.auction_unmet(p_team, c.code)
            end) * c.base_price
         ), 0)::bigint
    from public.auction_categories c
   where c.is_retained = false;
$$;

-- Rule 1: maxBid(T, P) = purse(T) - reserve(T, P)
create or replace function public.auction_max_bid(p_team uuid, p_cat text)
returns bigint language sql stable as $$
  select public.auction_purse_left(p_team) - public.auction_reserve(p_team, p_cat);
$$;

-- remaining(X): players in X not yet sold (the lot on the block counts)
create or replace function public.auction_remaining(p_cat text)
returns int language sql stable as $$
  select count(*)::int from public.auction_players
   where category_code = p_cat and status <> 'sold';
$$;

create or replace function public.auction_other_unmet(p_team uuid, p_cat text)
returns int language sql stable as $$
  select coalesce(sum(public.auction_unmet(t.id, p_cat)), 0)::int
    from public.auction_teams t where t.id <> p_team;
$$;

-- Rule 3: feasibility guard — a surplus buy must never make another
-- team's minimum impossible.  remaining(X) - 1 >= sum(other unmet)
create or replace function public.auction_surplus_feasible(p_team uuid, p_cat text)
returns boolean language sql stable as $$
  select (public.auction_remaining(p_cat) - 1) >= public.auction_other_unmet(p_team, p_cat);
$$;

-- Most players T could still end up with in X once every other team's
-- minimum is honoured. Basis for rule 4.
create or replace function public.auction_claimable(p_team uuid, p_cat text)
returns int language sql stable as $$
  select public.auction_remaining(p_cat) - public.auction_other_unmet(p_team, p_cat);
$$;

-- Rule 4: T's count in X is pinned — no more and no fewer than its
-- outstanding minimum.
create or replace function public.auction_counts_locked(p_team uuid, p_cat text)
returns boolean language sql stable as $$
  select public.auction_unmet(p_team, p_cat) > 0
     and public.auction_claimable(p_team, p_cat) <= public.auction_unmet(p_team, p_cat);
$$;

-- Rule 2: may T bid in category X at all (ignoring compulsory pinning)?
create or replace function public.auction_cat_eligible(p_team uuid, p_cat text)
returns boolean language plpgsql stable as $$
declare v_base bigint; v_max bigint;
begin
  select base_price into v_base from public.auction_categories where code = p_cat;
  v_max := public.auction_max_bid(p_team, p_cat);
  if v_max < v_base then return false; end if;                      -- cannot even afford base
  if public.auction_unmet(p_team, p_cat) > 0 then return true; end if; -- still needs the category
  return public.auction_surplus_feasible(p_team, p_cat);            -- surplus, gated by rule 3
end $$;

-- Rule 4: the single team that MUST take what is left in X at base,
-- or null when two or more teams can still legally compete.
create or replace function public.auction_forced_team(p_cat text)
returns uuid language plpgsql stable as $$
declare v_ids uuid[];
begin
  if public.auction_remaining(p_cat) <= 0 then return null; end if;
  select array_agg(t.id) into v_ids
    from public.auction_teams t
   where public.auction_cat_eligible(t.id, p_cat);
  if v_ids is null or array_length(v_ids, 1) <> 1 then return null; end if;
  if not public.auction_counts_locked(v_ids[1], p_cat) then return null; end if;
  return v_ids[1];
end $$;

-- ============================================================
-- 6) LOT CONTEXT + ALERTS + BOARD (read side for all 3 views)
-- ============================================================

-- Everything the console needs about the player on the block:
-- per-team eligibility, live max bids, one-line greyed-out reasons,
-- and compulsory-fill pinning.
create or replace function public.auction_lot_context(p_player uuid)
returns jsonb language plpgsql stable as $$
declare
  v_cat text; v_base bigint; v_short text; v_label text;
  v_forced uuid; v_forced_name text;
  v_current bigint; v_next bigint; v_step bigint;
  v_rows jsonb := '[]'::jsonb;
  t record; v_elig boolean; v_max bigint; v_reason text;
  v_unmet int; v_comp boolean;
begin
  select p.category_code, c.base_price, c.short_code, c.label
    into v_cat, v_base, v_short, v_label
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.id = p_player;

  if v_cat is null then return jsonb_build_object('error', 'Player not found'); end if;

  select l.current_bid into v_current
    from public.auction_lots l
   where l.player_id = p_player and l.status = 'open'
   order by l.opened_at desc limit 1;

  -- Rule 5: opening bid for a lot is the base price, not base + step
  if v_current is null then
    v_next := v_base;
    v_step := public.auction_step(v_base);
  else
    v_step := public.auction_step(v_current);
    v_next := v_current + v_step;
  end if;

  v_forced := public.auction_forced_team(v_cat);
  if v_forced is not null then
    select name into v_forced_name from public.auction_teams where id = v_forced;
  end if;

  for t in select * from public.auction_teams order by sort_order, name loop
    v_unmet := public.auction_unmet(t.id, v_cat);
    v_max   := public.auction_max_bid(t.id, v_cat);
    v_comp  := false;

    if v_forced is not null then
      if t.id = v_forced then
        v_elig := true; v_comp := true; v_max := v_base;
        v_reason := 'Compulsory fill — must take at ' || public.auction_money(v_base);
      else
        v_elig := false; v_max := 0;
        v_reason := 'Compulsory fill for ' || v_forced_name || ' — no competition';
      end if;
    elsif v_max < v_base then
      v_elig := false;
      v_reason := 'Max bid ' || public.auction_money(greatest(v_max, 0)) || ' — below base';
    elsif v_unmet > 0 then
      v_elig := true;
      v_reason := 'Needs ' || v_unmet || ' more ' || v_short || ' — max ' || public.auction_money(v_max);
    elsif not public.auction_surplus_feasible(t.id, v_cat) then
      v_elig := false;
      v_reason := 'Minimum met, category full for surplus';
    else
      v_elig := true;
      v_reason := 'Surplus buy allowed — max ' || public.auction_money(v_max);
    end if;

    if v_elig and v_next > v_max then
      v_reason := 'Max bid ' || public.auction_money(v_max) || ' — cannot meet ' || public.auction_money(v_next);
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'team_id',   t.id,
      'team_name', t.name,
      'team_code', t.code,
      'color',     t.color,
      'eligible',  v_elig,
      'compulsory', v_comp,
      'max_bid',   v_max,
      'unmet',     v_unmet,
      'purse_left', public.auction_purse_left(t.id),
      'reserve',   public.auction_reserve(t.id, v_cat),
      'can_meet_next', (v_elig and v_next <= v_max),
      'reason',    v_reason
    ));
  end loop;

  return jsonb_build_object(
    'player_id',     p_player,
    'category',      v_cat,
    'category_label', v_label,
    'base',          v_base,
    'current_bid',   v_current,
    'next_bid',      v_next,
    'step',          v_step,
    'remaining',     public.auction_remaining(v_cat),
    'compulsory_team_id',   v_forced,
    'compulsory_team_name', v_forced_name,
    'teams',         v_rows
  );
end $$;

-- Rule 4 surfaced for the organiser: recomputed after every sale.
--   forced[] - exactly one team can legally take what is left, at base.
--              This is the deadlock case; show it before the next lot.
--   locked[] - a team's COUNT is pinned but two or more teams may still
--              bid, so price competition continues. Advisory only.
create or replace function public.auction_alerts()
returns jsonb language plpgsql stable as $$
declare
  v_forced jsonb := '[]'::jsonb;
  v_locked jsonb := '[]'::jsonb;
  c record; t record;
  v_rem int; v_need int; v_ft uuid; v_msg text;
begin
  for c in select * from public.auction_categories
            where is_retained = false order by sort_order loop
    v_rem := public.auction_remaining(c.code);
    continue when v_rem <= 0;
    v_ft := public.auction_forced_team(c.code);

    for t in select * from public.auction_teams order by sort_order, name loop
      continue when not public.auction_counts_locked(t.id, c.code);
      v_need := public.auction_unmet(t.id, c.code);

      if v_ft = t.id then
        if v_rem = 1 and v_need = 1 then
          v_msg := 'Last ' || c.label || ' — compulsory fill for ' || t.name ||
                   ' at ' || public.auction_money(c.base_price);
        else
          v_msg := t.name || ' must take all ' || v_need || ' remaining ' || c.label ||
                   ' at ' || public.auction_money(c.base_price);
        end if;
        v_forced := v_forced || jsonb_build_array(jsonb_build_object(
          'team_id', t.id, 'team_name', t.name, 'category', c.code,
          'category_label', c.label, 'count', v_need, 'remaining', v_rem,
          'base', c.base_price, 'message', v_msg));
      else
        v_msg := t.name || ' is locked into exactly ' || v_need || ' more ' ||
                 c.label || ' (' || v_rem || ' left in pool)';
        v_locked := v_locked || jsonb_build_array(jsonb_build_object(
          'team_id', t.id, 'team_name', t.name, 'category', c.code,
          'category_label', c.label, 'count', v_need, 'remaining', v_rem,
          'base', c.base_price, 'message', v_msg));
      end if;
    end loop;
  end loop;

  return jsonb_build_object('forced', v_forced, 'locked', v_locked);
end $$;

-- Rule 6: the organiser may not close the auction while any player is
-- unsold AND any team is short of a minimum. Names both sides.
create or replace function public.auction_end_check()
returns jsonb language plpgsql stable as $$
declare
  v_unsold int; v_names jsonb; v_blockers jsonb := '[]'::jsonb;
  t record; c record; v_need int; v_open jsonb;
begin
  select count(*)::int,
         coalesce(jsonb_agg(name order by name), '[]'::jsonb)
    into v_unsold, v_names
    from public.auction_players where status <> 'sold';

  if v_unsold > 0 then
    for t in select * from public.auction_teams order by sort_order, name loop
      continue when public.auction_total_unmet(t.id) = 0;
      for c in select * from public.auction_categories
                where is_retained = false order by sort_order loop
        v_need := public.auction_unmet(t.id, c.code);
        continue when v_need <= 0;
        select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_open
          from public.auction_players
         where category_code = c.code and status <> 'sold';
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'team_id', t.id, 'team_name', t.name, 'category', c.code,
          'category_label', c.label, 'short', v_need, 'players', v_open));
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'can_end',      jsonb_array_length(v_blockers) = 0,
    'unsold_count', v_unsold,
    'unsold_names', v_names,
    'blockers',     v_blockers);
end $$;

-- Does this team have a captain password set?
--
-- SECURITY DEFINER on purpose. auction_team_auth has RLS enabled and
-- deliberately NO select policy, so a plain (invoker) function reading it
-- as anon or authenticated matches zero rows and would report "no password"
-- forever, whatever is actually stored. Running as the owner is the only way
-- to answer the question — and all that escapes is one boolean.
create or replace function public.auction_team_has_password(p_team uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce((select password_hash is not null
                     from public.auction_team_auth where team_id = p_team), false);
$$;

-- The two sports a player rated themselves highest in, for the card shown
-- when they come up. Unrated sports (0) are skipped rather than padded, so
-- someone who rated only one sport shows one, and a player who rated none
-- shows none instead of an arbitrary pair of zeroes.
create or replace function public.auction_top_sports(p_reg uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('sport', label, 'rating', val)
                            order by ord), '[]'::jsonb)
    from (
      select v.label, v.val,
             row_number() over (order by v.val desc, v.label) as ord
        from public.registrations r
        cross join lateral (values
          ('Pickleball',         r.rating_pickleball),
          ('Poker',              r.rating_poker),
          ('Cricket',            r.rating_cricket),
          ('Triathlon',          r.rating_triathlon),
          ('Archery & Shooting', r.rating_archery_shooting),
          ('Badminton',          r.rating_badminton),
          ('Table Tennis',       r.rating_table_tennis)
        ) as v(label, val)
       where r.id = p_reg and v.val > 0
       order by v.val desc, v.label
       limit 2
    ) t;
$$;

-- Every sport a player rated, in the order the registration form asks them.
-- The captain console shows all seven with their scores, so unlike
-- auction_top_sports this keeps the zeroes: "rated 0 at Poker" is a fact a
-- captain wants, where the player card only wants the two best.
create or replace function public.auction_player_ratings(p_reg uuid)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('sport', label, 'rating', val)
                            order by ord), '[]'::jsonb)
    from public.registrations r
    cross join lateral (values
      (1, 'Pickleball',         r.rating_pickleball),
      (2, 'Poker',              r.rating_poker),
      (3, 'Cricket',            r.rating_cricket),
      (4, 'Triathlon',          r.rating_triathlon),
      (5, 'Archery & Shooting', r.rating_archery_shooting),
      (6, 'Badminton',          r.rating_badminton),
      (7, 'Table Tennis',       r.rating_table_tennis)
    ) as v(ord, label, val)
   where r.id = p_reg;
$$;

-- Captain roster for the PUBLIC live view: who leads each team, what their
-- wallet looks like, and whether a sign-in has been provisioned at all.
--
-- Deliberately stops there. When a password was last issued and how many
-- captains are signed in right now are operational facts a spectator has no
-- use for — the first dates a reissue, the second is a liveness oracle —
-- so they live in auction_captain_admin_accounts() below instead. The one
-- auth fact kept here, has_password, is what makes the panel readable
-- ("sign-in active" vs "awaiting password") and reveals nothing usable:
-- the team codes were already public and the passwords carry ~59 bits.
create or replace function public.auction_captain_accounts()
returns jsonb language sql stable security definer
set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'team_id',      t.id,
           'team_code',    t.code,
           'team_name',    t.name,
           'short_name',   t.short_name,
           'color',        t.color,
           'captain',      (select p.name from public.auction_players p
                             where p.team_id = t.id and p.retained_role = 'CAPTAIN'
                             order by p.sort_order, p.name limit 1),
           'vice_captain', (select p.name from public.auction_players p
                             where p.team_id = t.id and p.retained_role = 'VICE_CAPTAIN'
                             order by p.sort_order, p.name limit 1),
           'has_password', public.auction_team_has_password(t.id),
           'purse_total',  t.purse_total,
           'purse_spent',  t.purse_spent,
           'purse_left',   (t.purse_total - t.purse_spent),
           'squad_size',   (select count(*)::int from public.auction_players p
                             where p.team_id = t.id and p.status = 'sold')
         ) order by t.sort_order, t.name), '[]'::jsonb)
    from public.auction_teams t;
$$;

-- The organiser's view of the same roster, with the two fields held back
-- from the public one. Admin-gated, and never reached by the anon key.
create or replace function public.auction_captain_admin_accounts()
returns jsonb language plpgsql stable security definer
set search_path = public as $$
begin
  perform public.auction_require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'team_id',         t.id,
             'team_code',       t.code,
             'team_name',       t.name,
             'color',           t.color,
             'has_password',    public.auction_team_has_password(t.id),
             'password_set_at', (select a.updated_at from public.auction_team_auth a
                                  where a.team_id = t.id and a.password_hash is not null),
             'active_sessions', (select count(*)::int from public.auction_team_sessions s
                                  where s.team_id = t.id and s.expires_at > now())
           ) order by t.sort_order, t.name), '[]'::jsonb)
      from public.auction_teams t);
end $$;

-- One call, whole auction. All three views poll/subscribe to this.
create or replace function public.auction_board()
returns jsonb language plpgsql stable as $$
declare
  v_state record; v_cfg record; v_lot record;
  v_teams jsonb := '[]'::jsonb; v_ctx jsonb := null;
  t record; c record; v_owned jsonb; v_unmet jsonb; v_complete boolean;
begin
  select * into v_cfg   from public.auction_config where id = 1;
  select * into v_state from public.auction_state  where id = 1;

  -- Always run the SELECT so v_lot is assigned (all-NULL when no lot is
  -- open); referencing an unassigned record variable would raise.
  select * into v_lot from public.auction_lots
   where id = v_state.current_lot_id;
  if v_lot.id is not null then
    v_ctx := public.auction_lot_context(v_lot.player_id);
  end if;

  for t in select * from public.auction_teams order by sort_order, name loop
    v_owned := '{}'::jsonb; v_unmet := '{}'::jsonb; v_complete := true;
    for c in select * from public.auction_categories order by sort_order loop
      v_owned := v_owned || jsonb_build_object(c.code, public.auction_owned(t.id, c.code));
      v_unmet := v_unmet || jsonb_build_object(c.code, public.auction_unmet(t.id, c.code));
      if not c.is_retained
         and public.auction_remaining(c.code) > 0
         and public.auction_cat_eligible(t.id, c.code) then
        v_complete := false;
      end if;
    end loop;

    v_teams := v_teams || jsonb_build_array(jsonb_build_object(
      'id', t.id, 'code', t.code, 'name', t.name, 'short_name', t.short_name,
      'color', t.color, 'logo_url', t.logo_url,
      'purse_total', t.purse_total, 'purse_spent', t.purse_spent,
      'purse_left', public.auction_purse_left(t.id),
      'reserve', public.auction_reserve(t.id, null),
      'owned', v_owned, 'unmet', v_unmet,
      'total_unmet', public.auction_total_unmet(t.id),
      'squad_size', (select count(*) from public.auction_players
                      where team_id = t.id and status = 'sold'),
      'has_password', public.auction_team_has_password(t.id),
      'complete', (public.auction_total_unmet(t.id) = 0 and v_complete)
    ));
  end loop;

  return jsonb_build_object(
    'config', to_jsonb(v_cfg),
    'categories', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]'::jsonb)
                     from public.auction_categories x),
    'state', to_jsonb(v_state),
    'current_lot', case when v_lot.id is null then null else to_jsonb(v_lot) end,
    'lot_context', v_ctx,
    'teams', v_teams,
    'players', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', p.id, 'name', p.name, 'category', p.category_code,
                    'photo_url', p.photo_url, 'status', p.status,
                    'team_id', p.team_id, 'sold_price', p.sold_price,
                    'is_retained', p.is_retained, 'retained_role', p.retained_role,
                    'unsold_count', p.unsold_count, 'sort_order', p.sort_order,
                    'achievement', p.achievement,
                    -- straight off the player's own registration
                    'age', r.age, 'history', r.tournament_status,
                    'top_sports', public.auction_top_sports(p.registration_id),
                    'ratings', public.auction_player_ratings(p.registration_id)
                  ) order by p.sort_order, p.name), '[]'::jsonb)
                  from public.auction_players p
                  left join public.registrations r on r.id = p.registration_id),
    'captains', public.auction_captain_accounts(),
    'alerts', public.auction_alerts(),
    'stranded', public.auction_stranded(),
    'end_check', public.auction_end_check(),
    'recent_bids', (select coalesce(jsonb_agg(jsonb_build_object(
                        'team_id', b.team_id, 'amount', b.amount,
                        'source', b.source, 'created_at', b.created_at) order by b.created_at desc), '[]'::jsonb)
                      from (select * from public.auction_bids
                             where lot_id = v_state.current_lot_id
                             order by created_at desc limit 12) b),
    -- Ordered by id, not created_at. created_at defaults to now(), which is
    -- transaction time, so everything written by one RPC shares a timestamp
    -- and ties order arbitrarily — a draw and the lot_open it triggers, for
    -- instance. id is a bigserial, so it is strictly monotonic. The id also
    -- gives the sold/unsold gavel a key it can rely on.
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', e.id, 'kind', e.kind, 'message', e.message,
                    'created_at', e.created_at
                  ) order by e.id desc), '[]'::jsonb)
                from (select * from public.auction_events
                       order by id desc limit 25) e)
  );
end $$;

-- ============================================================
-- 7) AUTH GUARDS
-- ============================================================

create or replace function public.auction_require_admin()
returns void language plpgsql stable as $$
begin
  if auth.uid() is null then
    raise exception 'Organiser authentication required for this action';
  end if;
end $$;

create or replace function public.auction_team_from_token(p_token text)
returns uuid language sql stable as $$
  select team_id from public.auction_team_sessions
   where token = p_token and expires_at > now();
$$;

-- Captain sign-in. Password is bcrypt-hashed in auction_team_auth,
-- which has no select policy, so hashes never reach the browser.
create or replace function public.auction_captain_login(p_code text, p_password text)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare v_id uuid; v_name text; v_code text; v_hash text; v_token text;
begin
  select t.id, t.name, t.code, a.password_hash
    into v_id, v_name, v_code, v_hash
    from public.auction_teams t
    left join public.auction_team_auth a on a.team_id = t.id
   where upper(t.code) = upper(trim(p_code));

  if v_id is null or v_hash is null then
    raise exception 'Invalid team code or password';
  end if;
  if v_hash <> crypt(p_password, v_hash) then
    raise exception 'Invalid team code or password';
  end if;

  delete from public.auction_team_sessions where expires_at < now();
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.auction_team_sessions (token, team_id) values (v_token, v_id);

  return jsonb_build_object('token', v_token, 'team_id', v_id,
                            'team_name', v_name, 'team_code', v_code);
end $$;

create or replace function public.auction_captain_logout(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.auction_team_sessions where token = p_token;
end $$;

create or replace function public.auction_set_team_password(p_team uuid, p_password text)
returns void language plpgsql security definer
set search_path = public, extensions as $$
begin
  perform public.auction_require_admin();
  if p_password is null or length(p_password) < 4 then
    raise exception 'Captain password must be at least 4 characters';
  end if;
  insert into public.auction_team_auth (team_id, password_hash, updated_at)
  values (p_team, crypt(p_password, gen_salt('bf')), now())
  on conflict (team_id) do update
    set password_hash = excluded.password_hash, updated_at = now();
  -- force a fresh sign-in everywhere with the new password
  delete from public.auction_team_sessions where team_id = p_team;
end $$;

-- Resume check for a stored captain session. Returns null once the token
-- has expired, been signed out, or been invalidated by a password change,
-- so a stale localStorage entry can never keep a console open.
create or replace function public.auction_captain_session(p_token text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare v_id uuid; v_name text; v_code text; v_exp timestamptz;
begin
  if p_token is null or length(p_token) = 0 then return null; end if;

  select t.id, t.name, t.code, s.expires_at
    into v_id, v_name, v_code, v_exp
    from public.auction_team_sessions s
    join public.auction_teams t on t.id = s.team_id
   where s.token = p_token and s.expires_at > now();

  if v_id is null then return null; end if;

  return jsonb_build_object('token', p_token, 'team_id', v_id,
                            'team_name', v_name, 'team_code', v_code,
                            'expires_at', v_exp);
end $$;

-- Readable random password, grouped in fours: HJ4K-MN7P-2QRS.
-- The alphabet is the 31 characters that survive being read down a phone
-- line — O/0, I/1/L and every punctuation mark are gone, so a captain can
-- type what the organiser dictates without a second attempt.
--
-- 31 does not divide 256, so folding a byte with % would make the first
-- 8 symbols fractionally likelier than the rest. Bytes at or above 248
-- are therefore DISCARDED rather than folded, which keeps every symbol
-- exactly equally likely. 12 symbols out of 31 is ~59 bits.
create or replace function public.auction_random_password(p_len int default 12)
returns text language plpgsql volatile
set search_path = public, extensions as $$
declare
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_n     int  := length(v_alpha);          -- 31
  v_max   int  := (256 / v_n) * v_n;        -- 248
  v_out   text := '';
  v_bytes bytea;
  v_b     int;
  i       int;
begin
  if p_len < 8 then p_len := 8; end if;

  -- Draw in generous batches; ~3% of bytes are rejected, so one batch of
  -- 2x almost always suffices and the loop is a formality.
  while length(v_out) < p_len loop
    v_bytes := gen_random_bytes(p_len * 2);
    for i in 0 .. (p_len * 2) - 1 loop
      exit when length(v_out) >= p_len;
      v_b := get_byte(v_bytes, i);
      continue when v_b >= v_max;
      v_out := v_out || substr(v_alpha, (v_b % v_n) + 1, 1);
    end loop;
  end loop;

  return regexp_replace(v_out, '(.{4})(?=.)', '\1-', 'g');
end $$;

-- Issue captain passwords. Pass null for p_team to do every team at once.
-- The plaintext is returned ONCE, here, and never stored — only the bcrypt
-- hash is kept, so a lost password can only be replaced, not recovered.
-- Any live session for an affected team is dropped.
create or replace function public.auction_generate_team_passwords(p_team uuid default null)
returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare t record; v_pw text; v_out jsonb := '[]'::jsonb; v_n int := 0;
begin
  perform public.auction_require_admin();

  for t in select * from public.auction_teams
            where p_team is null or id = p_team
            order by sort_order, name loop
    v_pw := public.auction_random_password(12);

    insert into public.auction_team_auth (team_id, password_hash, updated_at)
    values (t.id, crypt(v_pw, gen_salt('bf')), now())
    on conflict (team_id) do update
      set password_hash = excluded.password_hash, updated_at = now();

    delete from public.auction_team_sessions where team_id = t.id;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'team_id', t.id, 'team_code', t.code, 'team_name', t.name,
      'color', t.color, 'password', v_pw));
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then raise exception 'No teams to issue passwords for'; end if;

  insert into public.auction_events (kind, message)
  values ('captain_auth',
          case when p_team is null
               then 'Captain passwords issued for all ' || v_n || ' teams'
               else 'Captain password reissued for ' ||
                    (select name from public.auction_teams where id = p_team) end);

  return v_out;
end $$;

-- ============================================================
-- 8) SETUP RPCs
-- ============================================================

-- Mirrors js/auction-config.js into the database. Existing team
-- names, colours, purses and passwords are preserved.
create or replace function public.auction_sync_config(p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cat jsonb; v_team jsonb; v_i int := 0; v_purse bigint;
begin
  perform public.auction_require_admin();
  v_purse := (p_config->>'purse')::bigint;

  update public.auction_config set
    tournament      = coalesce(p_config->>'tournament', tournament),
    teams_count     = (p_config->>'teams')::int,
    min_squad       = (p_config->>'minSquad')::int,
    purse           = v_purse,
    retained_cost   = coalesce((p_config->>'retainedCostToTeam')::bigint, 0),
    increment_bands = p_config->'increments',
    updated_at      = now()
  where id = 1;

  v_i := 0;
  for v_cat in select jsonb_array_elements(p_config->'categories') loop
    insert into public.auction_categories
      (code, label, short_code, base_price, player_type, pool_count,
       min_per_team, is_retained, color, sort_order)
    values (
      v_cat->>'code', v_cat->>'label', v_cat->>'short',
      (v_cat->>'base')::bigint, v_cat->>'type', (v_cat->>'pool')::int,
      (v_cat->>'minPerTeam')::int, coalesce((v_cat->>'retained')::boolean, false),
      coalesce(v_cat->>'color', '#00e5ff'), v_i)
    on conflict (code) do update set
      label = excluded.label, short_code = excluded.short_code,
      base_price = excluded.base_price, player_type = excluded.player_type,
      pool_count = excluded.pool_count, min_per_team = excluded.min_per_team,
      is_retained = excluded.is_retained, color = excluded.color,
      sort_order = excluded.sort_order;
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_team in select jsonb_array_elements(p_config->'teamSlots') loop
    insert into public.auction_teams
      (code, name, short_name, color, purse_total, sort_order)
    values (v_team->>'code', v_team->>'name', v_team->>'short',
            coalesce(v_team->>'color', '#00e5ff'), v_purse, v_i)
    on conflict (code) do update set sort_order = excluded.sort_order;
    v_i := v_i + 1;
  end loop;

  -- Teams that have not spent anything track the configured purse
  update public.auction_teams set purse_total = v_purse where purse_spent = 0;

  insert into public.auction_events (kind, message)
  values ('config', 'Auction configuration synced from auction-config.js');

  return public.auction_board();
end $$;

create or replace function public.auction_update_team(
  p_team uuid, p_name text, p_short text, p_color text, p_purse bigint default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.auction_require_admin();
  update public.auction_teams set
    name        = coalesce(nullif(trim(p_name), ''), name),
    short_name  = coalesce(nullif(trim(p_short), ''), short_name),
    color       = coalesce(nullif(trim(p_color), ''), color),
    purse_total = coalesce(p_purse, purse_total)
  where id = p_team;
end $$;

create or replace function public.auction_upsert_player(
  p_id uuid, p_name text, p_cat text, p_photo text,
  p_registration uuid default null, p_sort int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.auction_require_admin();
  if p_id is null then
    insert into public.auction_players (name, category_code, photo_url, registration_id, sort_order)
    values (trim(p_name), p_cat, p_photo, p_registration, p_sort)
    returning id into v_id;
  else
    update public.auction_players set
      name = trim(p_name), photo_url = p_photo, sort_order = p_sort,
      registration_id = coalesce(p_registration, registration_id),
      -- a category move is only safe while the player is still in the pool
      category_code = case when status = 'sold' then category_code else p_cat end
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- Previous-tournament achievement, editable from the Player Pool. Kept on
-- the pool row rather than the registration because the retained captains
-- have achievements too and not all of them registered.
create or replace function public.auction_set_achievement(p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.auction_require_admin();
  update public.auction_players
     set achievement = nullif(trim(coalesce(p_text, '')), '')
   where id = p_id;
end $$;

create or replace function public.auction_delete_player(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.auction_require_admin();
  if exists (select 1 from public.auction_players where id = p_id and status = 'sold') then
    raise exception 'Cannot delete a sold player — revert the sale first';
  end if;
  delete from public.auction_players where id = p_id;
end $$;

-- Retained Captain / Vice Captain: pre-assigned, costs the team nothing.
create or replace function public.auction_set_retained(
  p_player uuid, p_team uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_retained_cost bigint;
begin
  perform public.auction_require_admin();
  select retained_cost into v_retained_cost from public.auction_config where id = 1;

  if p_team is null then
    update public.auction_players
       set is_retained = false, retained_role = null, team_id = null,
           sold_price = null, status = 'available'
     where id = p_player;
    return;
  end if;

  if not exists (select 1 from public.auction_categories c
                  join public.auction_players p on p.category_code = c.code
                 where p.id = p_player and c.is_retained) then
    raise exception 'Only players in a retained category can be pre-assigned';
  end if;

  update public.auction_players
     set is_retained = true, retained_role = p_role, team_id = p_team,
         sold_price = v_retained_cost, status = 'sold'
   where id = p_player;
end $$;

-- Pull registered players across into the auction pool.
create or replace function public.auction_import_registrations(p_cat text)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record; v_max int;
begin
  perform public.auction_require_admin();
  select coalesce(max(sort_order), 0) into v_max from public.auction_players;
  for r in select * from public.registrations
            where id not in (select registration_id from public.auction_players
                              where registration_id is not null)
            order by created_at loop
    v_max := v_max + 1;
    insert into public.auction_players (registration_id, name, category_code, photo_url, sort_order)
    values (r.id, r.full_name, p_cat, r.profile_pic_url, v_max);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ============================================================
-- 9) LIVE AUCTION ACTIONS
-- ============================================================

-- Players nobody can legally buy any more: every team has either met the
-- category minimum and is blocked by rule 3, or lacks the purse above base.
-- The rules guarantee minimums are always fillable, but they do NOT
-- guarantee full sell-through — if every team spends down to its reserve,
-- the slack players strand here. Surfaced so the organiser sees it rather
-- than re-queueing the same lot forever.
create or replace function public.auction_stranded()
returns jsonb language plpgsql stable as $$
declare v_out jsonb := '[]'::jsonb; c record; v_elig int; v_rem int; v_names jsonb;
begin
  for c in select * from public.auction_categories
            where is_retained = false order by sort_order loop
    v_rem := public.auction_remaining(c.code);
    continue when v_rem <= 0;
    select count(*) into v_elig from public.auction_teams t
     where public.auction_cat_eligible(t.id, c.code);
    continue when v_elig > 0;
    select coalesce(jsonb_agg(name order by name), '[]'::jsonb) into v_names
      from public.auction_players where category_code = c.code and status <> 'sold';
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'category', c.code, 'category_label', c.label, 'count', v_rem,
      'base', c.base_price, 'players', v_names,
      'message', v_rem || ' ' || c.label || ' player(s) cannot be sold — no team has ' ||
                 'purse above the base price of ' || public.auction_money(c.base_price)));
  end loop;
  return v_out;
end $$;

-- One-line, human-readable version of auction_end_check() for error text:
-- names which team is short of which category, and by how many.
create or replace function public.auction_blocker_summary()
returns text language plpgsql stable as $$
declare v_parts text[] := '{}'; b jsonb;
begin
  for b in select jsonb_array_elements(public.auction_end_check()->'blockers') loop
    v_parts := v_parts || (b->>'team_name' || ' still needs ' || (b->>'short') ||
                           ' ' || (b->>'category_label'));
  end loop;
  if array_length(v_parts, 1) is null then return 'no team is short'; end if;
  return array_to_string(v_parts, '; ');
end $$;

create or replace function public.auction_set_status(p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_check jsonb;
begin
  perform public.auction_require_admin();

  if p_status = 'completed' then
    -- Rule 6: cannot close while a player is unsold and a team is short
    v_check := public.auction_end_check();
    if not (v_check->>'can_end')::boolean then
      raise exception 'Cannot end the auction — % player(s) still unsold and %',
        v_check->>'unsold_count', public.auction_blocker_summary();
    end if;
  end if;

  update public.auction_state
     set status = p_status, updated_at = now(),
         current_lot_id = case when p_status = 'completed' then null else current_lot_id end
   where id = 1;

  insert into public.auction_events (kind, message)
  values ('state', 'Auction status set to ' || upper(p_status));

  return public.auction_board();
end $$;

-- Put a player on the block. Opening bid is the base price.
create or replace function public.auction_open_lot(p_player uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lot uuid; v_base bigint; v_status text; v_name text; v_cat text; v_forced uuid;
begin
  perform public.auction_require_admin();

  select p.status, p.name, p.category_code, c.base_price
    into v_status, v_name, v_cat, v_base
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.id = p_player;

  if v_status is null then raise exception 'Player not found'; end if;
  if v_status = 'sold'  then raise exception '% has already been sold', v_name; end if;
  if v_status = 'in_lot' then raise exception '% is already on the block', v_name; end if;

  if exists (select 1 from public.auction_lots where status = 'open') then
    raise exception 'Close the open lot (sell or mark unsold) before opening another';
  end if;

  if (select status from public.auction_state where id = 1) not in ('live','paused') then
    raise exception 'Start the auction before opening a lot';
  end if;

  v_forced := public.auction_forced_team(v_cat);

  insert into public.auction_lots (player_id, base_price, compulsory_team_id)
  values (p_player, v_base, v_forced)
  returning id into v_lot;

  update public.auction_players set status = 'in_lot' where id = p_player;
  update public.auction_state set current_lot_id = v_lot, updated_at = now() where id = 1;

  insert into public.auction_events (kind, message, payload)
  values ('lot_open', v_name || ' is on the block at ' || public.auction_money(v_base),
          jsonb_build_object('player_id', p_player, 'lot_id', v_lot));

  return public.auction_board();
end $$;

-- Draw the next player at random and put them straight on the block.
--
-- Replaces picking a name off a list: the organiser cannot choose who comes
-- up, so nobody can be held back for a favourable moment. The draw is over
-- every player still in the pool, ignoring category entirely, and a player
-- can only be drawn once because being sold or being on the block takes them
-- out of the pool. An unsold player returns and can come up again.
--
-- The shuffle happens HERE rather than in the browser: a client-side draw
-- could be re-rolled until it produced a convenient name.
create or replace function public.auction_draw_random()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_player uuid; v_left int;
begin
  perform public.auction_require_admin();

  if exists (select 1 from public.auction_lots where status = 'open') then
    raise exception 'Finish the current player (sold or unsold) before drawing again';
  end if;

  if (select status from public.auction_state where id = 1) not in ('live','paused') then
    raise exception 'Start the auction before drawing a player';
  end if;

  select p.id into v_player
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.status = 'available' and not p.is_retained and not c.is_retained
   order by random()
   limit 1;

  if v_player is null then
    raise exception 'Every player has been drawn — none left in the pool';
  end if;

  select count(*) into v_left
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.status = 'available' and not p.is_retained and not c.is_retained;

  insert into public.auction_events (kind, message, payload)
  select 'draw',
         'Draw #' || p.sort_order || ' — ' || p.name || ' (' || (v_left - 1) || ' left in the pool)',
         jsonb_build_object('player_id', p.id, 'serial', p.sort_order, 'remaining', v_left - 1)
    from public.auction_players p where p.id = v_player;

  return public.auction_open_lot(v_player);
end $$;

-- The gate every bid passes through. Recomputes purse, reserve,
-- eligibility, the feasibility guard and compulsory pinning from the
-- tables — a tampered client cannot get an illegal bid through here.
create or replace function public.auction_place_bid(
  p_lot uuid, p_team uuid, p_amount bigint,
  p_token text default null, p_source text default 'captain')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lot record; v_cat text; v_base bigint; v_name text; v_team_name text;
  v_forced uuid; v_max bigint; v_next bigint; v_unmet int;
begin
  if p_source = 'admin' then
    perform public.auction_require_admin();
  else
    if public.auction_team_from_token(p_token) is distinct from p_team then
      raise exception 'Your captain session has expired — sign in again';
    end if;
  end if;

  if (select status from public.auction_state where id = 1) <> 'live' then
    raise exception 'The auction is not live';
  end if;

  select * into v_lot from public.auction_lots where id = p_lot for update;
  if v_lot.id is null       then raise exception 'Lot not found'; end if;
  if v_lot.status <> 'open' then raise exception 'This lot is already closed'; end if;

  select p.category_code, p.name, c.base_price into v_cat, v_name, v_base
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.id = v_lot.player_id;

  select name into v_team_name from public.auction_teams where id = p_team;
  if v_team_name is null then raise exception 'Team not found'; end if;

  if v_lot.current_bidder_id = p_team then
    raise exception '% already holds the highest bid', v_team_name;
  end if;

  -- Rule 4: a compulsory fill goes to one team at base, uncontested
  v_forced := public.auction_forced_team(v_cat);
  if v_forced is not null then
    if v_forced <> p_team then
      raise exception 'Compulsory fill — only % may take this lot',
        (select name from public.auction_teams where id = v_forced);
    end if;
    if p_amount <> v_base then
      raise exception 'Compulsory fill must be taken at base %', public.auction_money(v_base);
    end if;
  end if;

  -- Rules 2 + 3: eligibility and the feasibility guard
  v_unmet := public.auction_unmet(p_team, v_cat);
  if v_forced is null then
    if v_unmet = 0 and not public.auction_surplus_feasible(p_team, v_cat) then
      raise exception 'Minimum met, category full for surplus';
    end if;
  end if;

  -- Rule 1: purse and reserve
  v_max := case when v_forced is not null then v_base
                else public.auction_max_bid(p_team, v_cat) end;
  if p_amount > v_max then
    raise exception 'Bid exceeds %''s max bid of %', v_team_name, public.auction_money(v_max);
  end if;

  -- Rule 5: increments. Opening bid is base; captains must bid the exact
  -- next step; the organiser may enter a custom amount above the current bid.
  if v_lot.current_bid is null then
    if p_amount < v_base then
      raise exception 'Opening bid is the base price %', public.auction_money(v_base);
    end if;
    if p_source <> 'admin' and p_amount <> v_base then
      raise exception 'Opening bid is the base price %', public.auction_money(v_base);
    end if;
  else
    v_next := v_lot.current_bid + public.auction_step(v_lot.current_bid);
    if p_source = 'admin' then
      if p_amount <= v_lot.current_bid then
        raise exception 'Bid must exceed the current bid of %', public.auction_money(v_lot.current_bid);
      end if;
    elsif p_amount <> v_next then
      raise exception 'Next valid bid is %', public.auction_money(v_next);
    end if;
  end if;

  insert into public.auction_bids (lot_id, team_id, amount, source)
  values (p_lot, p_team, p_amount, p_source);

  update public.auction_lots
     set current_bid = p_amount, current_bidder_id = p_team
   where id = p_lot;

  insert into public.auction_events (kind, message, payload)
  values ('bid', v_team_name || ' bids ' || public.auction_money(p_amount) || ' for ' || v_name,
          jsonb_build_object('lot_id', p_lot, 'team_id', p_team, 'amount', p_amount));

  return public.auction_board();
end $$;

-- Put a specific player on the block by their sheet number (1..56).
--
-- The counterpart to the randomizer: once the pool is drained, everyone
-- left in the unsold list has to be placed by hand, and the sheet serial
-- is the id the organiser is reading off the printed list.
create or replace function public.auction_open_by_serial(p_serial int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_n int;
begin
  perform public.auction_require_admin();

  select count(*) into v_n
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.sort_order = p_serial and not p.is_retained and not c.is_retained;

  if v_n = 0 then
    raise exception 'No player carries number %', p_serial;
  elsif v_n > 1 then
    raise exception 'Number % is on more than one player — fix the pool first', p_serial;
  end if;

  select p.id into v_id
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.sort_order = p_serial and not p.is_retained and not c.is_retained;

  return public.auction_open_lot(v_id);
end $$;

-- Award the player on the block to a team at a price the organiser types in.
--
-- Bidding happens in the room, not in this app, so there is no bid ladder to
-- respect here. What IS still enforced, because it decides whether a squad
-- can be completed at all: the team must be allowed to buy in this category
-- (rules 2 and 3), a compulsory fill must go to the pinned team at base, the
-- price cannot be below base, and it cannot exceed the team's max bid —
-- purse minus the reserve it must keep to fill its remaining minimums.
create or replace function public.auction_award_lot(
  p_lot uuid, p_team uuid, p_price bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lot record; v_cat text; v_base bigint; v_name text; v_team_name text;
  v_forced uuid; v_max bigint; v_unmet int;
begin
  perform public.auction_require_admin();

  select * into v_lot from public.auction_lots where id = p_lot for update;
  if v_lot.id is null       then raise exception 'Lot not found'; end if;
  if v_lot.status <> 'open' then raise exception 'This player is already closed'; end if;

  select p.category_code, p.name, c.base_price into v_cat, v_name, v_base
    from public.auction_players p
    join public.auction_categories c on c.code = p.category_code
   where p.id = v_lot.player_id;

  select name into v_team_name from public.auction_teams where id = p_team;
  if v_team_name is null then raise exception 'Pick a team'; end if;

  if p_price is null or p_price < v_base then
    raise exception 'Price cannot be below the base of %', public.auction_money(v_base);
  end if;

  v_forced := public.auction_forced_team(v_cat);
  if v_forced is not null then
    if v_forced <> p_team then
      raise exception 'Compulsory fill — only % may take this player',
        (select name from public.auction_teams where id = v_forced);
    end if;
    if p_price <> v_base then
      raise exception 'Compulsory fill must be taken at base %', public.auction_money(v_base);
    end if;
  else
    v_unmet := public.auction_unmet(p_team, v_cat);
    if v_unmet = 0 and not public.auction_surplus_feasible(p_team, v_cat) then
      raise exception '% has met this minimum and the category is full for surplus', v_team_name;
    end if;
    v_max := public.auction_max_bid(p_team, v_cat);
    if p_price > v_max then
      raise exception '% exceeds %''s max bid of % (purse % less the % it must keep for its remaining minimums)',
        public.auction_money(p_price), v_team_name, public.auction_money(v_max),
        public.auction_money(public.auction_purse_left(p_team)),
        public.auction_money(public.auction_reserve(p_team, v_cat));
    end if;
  end if;

  update public.auction_players
     set status = 'sold', team_id = p_team, sold_price = p_price
   where id = v_lot.player_id;

  update public.auction_teams
     set purse_spent = purse_spent + p_price
   where id = p_team;

  update public.auction_lots
     set status = 'sold', winning_team_id = p_team, final_price = p_price,
         current_bid = p_price, current_bidder_id = p_team, closed_at = now()
   where id = p_lot;

  update public.auction_state set current_lot_id = null, updated_at = now() where id = 1;

  insert into public.auction_events (kind, message, payload)
  values ('sold', v_name || ' SOLD to ' || v_team_name || ' for ' || public.auction_money(p_price),
          jsonb_build_object('player_id', v_lot.player_id, 'team_id', p_team, 'amount', p_price));

  return public.auction_board();
end $$;

-- Rule 6: SOLD. Deduct from purse, assign, update category counts.
create or replace function public.auction_sell_lot(p_lot uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lot record; v_name text; v_team_name text;
begin
  perform public.auction_require_admin();

  select * into v_lot from public.auction_lots where id = p_lot for update;
  if v_lot.id is null       then raise exception 'Lot not found'; end if;
  if v_lot.status <> 'open' then raise exception 'This lot is already closed'; end if;
  if v_lot.current_bidder_id is null then
    raise exception 'No bids on this lot — mark it unsold instead';
  end if;

  select name into v_name from public.auction_players where id = v_lot.player_id;
  select name into v_team_name from public.auction_teams where id = v_lot.current_bidder_id;

  update public.auction_players
     set status = 'sold', team_id = v_lot.current_bidder_id, sold_price = v_lot.current_bid
   where id = v_lot.player_id;

  update public.auction_teams
     set purse_spent = purse_spent + v_lot.current_bid
   where id = v_lot.current_bidder_id;

  update public.auction_lots
     set status = 'sold', winning_team_id = v_lot.current_bidder_id,
         final_price = v_lot.current_bid, closed_at = now()
   where id = p_lot;

  update public.auction_state set current_lot_id = null, updated_at = now() where id = 1;

  insert into public.auction_events (kind, message, payload)
  values ('sold', v_name || ' SOLD to ' || v_team_name || ' for ' ||
          public.auction_money(v_lot.current_bid),
          jsonb_build_object('player_id', v_lot.player_id,
                             'team_id', v_lot.current_bidder_id,
                             'amount', v_lot.current_bid));

  return public.auction_board();
end $$;

-- Rule 6: UNSOLD. The player goes straight back into the available pool
-- and the organiser can re-queue them at base at any time.
create or replace function public.auction_unsold_lot(p_lot uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_lot record; v_name text;
begin
  perform public.auction_require_admin();

  select * into v_lot from public.auction_lots where id = p_lot for update;
  if v_lot.id is null       then raise exception 'Lot not found'; end if;
  if v_lot.status <> 'open' then raise exception 'This lot is already closed'; end if;

  select name into v_name from public.auction_players where id = v_lot.player_id;

  -- Park, do not return to the pool. The randomizer draws only from
  -- 'available', so an unsold player can never come up a second time;
  -- the organiser places them by hand from the unsold list afterwards.
  update public.auction_players
     set status = 'unsold', unsold_count = unsold_count + 1
   where id = v_lot.player_id;

  update public.auction_lots
     set status = 'unsold', closed_at = now(), current_bid = null, current_bidder_id = null
   where id = p_lot;

  update public.auction_state set current_lot_id = null, updated_at = now() where id = 1;

  insert into public.auction_events (kind, message, payload)
  values ('unsold', v_name || ' went UNSOLD — moved to the unsold list',
          jsonb_build_object('player_id', v_lot.player_id));

  return public.auction_board();
end $$;

-- Undo a sale: refund the purse and drop the player back into the pool.
create or replace function public.auction_revert_sale(p_player uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p record; v_team_name text;
begin
  perform public.auction_require_admin();

  select * into v_p from public.auction_players where id = p_player for update;
  if v_p.id is null           then raise exception 'Player not found'; end if;
  if v_p.status <> 'sold'     then raise exception '% is not sold', v_p.name; end if;
  if v_p.is_retained          then raise exception 'Use the retained assignment control instead'; end if;

  select name into v_team_name from public.auction_teams where id = v_p.team_id;

  update public.auction_teams
     set purse_spent = greatest(0, purse_spent - coalesce(v_p.sold_price, 0))
   where id = v_p.team_id;

  update public.auction_players
     set status = 'available', team_id = null, sold_price = null
   where id = p_player;

  insert into public.auction_events (kind, message, payload)
  values ('revert', 'Sale reverted — ' || v_p.name || ' returned to the pool from ' ||
          coalesce(v_team_name, 'a team'),
          jsonb_build_object('player_id', p_player));

  return public.auction_board();
end $$;

-- Wipe every sale/bid/lot and restore full purses. Retained Captain and
-- Vice Captain assignments survive. Requires the confirmation phrase.
create or replace function public.auction_reset(p_confirm text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.auction_require_admin();
  if p_confirm <> 'RESET AUCTION' then
    raise exception 'Reset not confirmed';
  end if;

  -- Every statement here carries a WHERE clause on purpose. Supabase loads
  -- the safeupdate library for the `authenticator` role, so an unqualified
  -- DELETE or UPDATE raises "DELETE requires a WHERE clause" for anything
  -- arriving through the API. SECURITY DEFINER does not exempt it: the
  -- library is preloaded per session, not per statement owner, which is why
  -- this worked from a direct psql connection but not from the console.
  update public.auction_state set status = 'setup', current_lot_id = null, updated_at = now() where id = 1;
  delete from public.auction_bids where id is not null;
  delete from public.auction_lots where id is not null;
  -- everything that is not a retained captain goes back into the pool,
  -- including anything parked in the unsold list
  update public.auction_players
     set status = 'available', team_id = null, sold_price = null, unsold_count = 0
   where is_retained = false;
  update public.auction_teams set purse_spent = 0 where purse_spent <> 0;

  insert into public.auction_events (kind, message) values ('reset', 'Auction reset to setup');
  return public.auction_board();
end $$;

-- ============================================================
-- 10) ROW LEVEL SECURITY
--     Everyone may READ the auction (the public view needs it).
--     Nobody may WRITE directly — every mutation goes through the
--     SECURITY DEFINER RPCs above, which enforce the rules.
--     Password hashes and captain session tokens have NO read policy.
-- ============================================================

alter table public.auction_config         enable row level security;
alter table public.auction_categories     enable row level security;
alter table public.auction_teams          enable row level security;
alter table public.auction_team_auth      enable row level security;
alter table public.auction_team_sessions  enable row level security;
alter table public.auction_players        enable row level security;
alter table public.auction_state          enable row level security;
alter table public.auction_lots           enable row level security;
alter table public.auction_bids           enable row level security;
alter table public.auction_events         enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'auction_config','auction_categories','auction_teams','auction_players',
    'auction_state','auction_lots','auction_bids','auction_events'
  ] loop
    execute format('drop policy if exists "public can read %1$s" on public.%1$I', t);
    execute format(
      'create policy "public can read %1$s" on public.%1$I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Deliberately no policies on auction_team_auth / auction_team_sessions:
-- with RLS on and no policy, direct client reads return nothing.

grant execute on function
  public.auction_money(bigint),
  public.auction_step(bigint),
  public.auction_owned(uuid, text),
  public.auction_purse_left(uuid),
  public.auction_unmet(uuid, text),
  public.auction_total_unmet(uuid),
  public.auction_reserve(uuid, text),
  public.auction_max_bid(uuid, text),
  public.auction_remaining(text),
  public.auction_other_unmet(uuid, text),
  public.auction_surplus_feasible(uuid, text),
  public.auction_claimable(uuid, text),
  public.auction_counts_locked(uuid, text),
  public.auction_cat_eligible(uuid, text),
  public.auction_forced_team(text),
  public.auction_lot_context(uuid),
  public.auction_alerts(),
  public.auction_end_check(),
  public.auction_stranded(),
  public.auction_blocker_summary(),
  public.auction_board(),
  public.auction_team_has_password(uuid),
  public.auction_top_sports(uuid),
  public.auction_player_ratings(uuid),
  public.auction_captain_accounts(),
  public.auction_captain_login(text, text),
  public.auction_captain_logout(text),
  public.auction_captain_session(text),
  public.auction_place_bid(uuid, uuid, bigint, text, text)
to anon, authenticated;

-- Organiser-only RPCs: they still call auction_require_admin() internally,
-- so an anonymous caller is rejected even though execute is granted.
grant execute on function
  public.auction_sync_config(jsonb),
  public.auction_update_team(uuid, text, text, text, bigint),
  public.auction_set_team_password(uuid, text),
  public.auction_generate_team_passwords(uuid),
  public.auction_captain_admin_accounts(),
  public.auction_upsert_player(uuid, text, text, text, uuid, int),
  public.auction_delete_player(uuid),
  public.auction_set_achievement(uuid, text),
  public.auction_set_retained(uuid, uuid, text),
  public.auction_import_registrations(text),
  public.auction_set_status(text),
  public.auction_open_lot(uuid),
  public.auction_draw_random(),
  public.auction_open_by_serial(int),
  public.auction_award_lot(uuid, uuid, bigint),
  public.auction_sell_lot(uuid),
  public.auction_unsold_lot(uuid),
  public.auction_revert_sale(uuid),
  public.auction_reset(text)
to authenticated;

-- The password generator is only ever called from inside
-- auction_generate_team_passwords, which runs as the owner. Nobody
-- else needs to mint strings from it.
revoke execute on function public.auction_random_password(int)
  from public, anon, authenticated;

-- Belt and braces: the admin roster carries password timestamps and session
-- counts, so make sure the anon key cannot reach it even if a default grant
-- to PUBLIC would otherwise have applied.
revoke execute on function public.auction_captain_admin_accounts() from anon;

-- ============================================================
-- 11) REALTIME — pushes every lot, bid and sale to all three views
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table public.auction_state;
  exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.auction_lots;
  exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.auction_bids;
  exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.auction_players;
  exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.auction_teams;
  exception when others then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.auction_events;
  exception when others then null;
end $$;

-- ============================================================
-- 12) SEED — categories and team slots matching js/auction-config.js.
--     Re-running auction_sync_config from the admin console keeps
--     these in step if the config file changes.
-- ============================================================
insert into public.auction_categories
  (code, label, short_code, base_price, player_type, pool_count, min_per_team, is_retained, color, sort_order)
values
  ('CVC',       'Captain & Vice Captain', 'CVC',    0,      'retained', 8,  2, true,  '#f5c518', 0),
  ('CIRCLER_A', 'Circler A',              'CIR-A',  300000, 'circler',  8,  2, false, '#00e5ff', 1),
  ('CIRCLER_B', 'Circler B',              'CIR-B',  200000, 'circler',  14, 3, false, '#38bdf8', 2),
  ('TABLER_A',  'Tabler A',               'TAB-A',  400000, 'tabler',   12, 3, false, '#ff3b5c', 3),
  ('TABLER_B',  'Tabler B',               'TAB-B',  300000, 'tabler',   12, 3, false, '#fb7185', 4),
  ('TABLER_C',  'Tabler C',               'TAB-C',  200000, 'tabler',   10, 2, false, '#a855f7', 5)
on conflict (code) do update set
  label = excluded.label, short_code = excluded.short_code,
  base_price = excluded.base_price, player_type = excluded.player_type,
  pool_count = excluded.pool_count, min_per_team = excluded.min_per_team,
  is_retained = excluded.is_retained, color = excluded.color,
  sort_order = excluded.sort_order;

insert into public.auction_teams (code, name, short_name, color, purse_total, sort_order)
values
  ('T1', 'Thunder Titans', 'THU', '#00e5ff', 10000000, 0),
  ('T2', 'The Aces',       'ACE', '#ff3b5c', 10000000, 1),
  ('T3', 'Flying Dragons', 'DRA', '#f5c518', 10000000, 2),
  ('T4', 'The Destroyers', 'DES', '#a855f7', 10000000, 3)
on conflict (code) do nothing;

insert into public.auction_team_auth (team_id, password_hash)
select id, null from public.auction_teams
on conflict (team_id) do nothing;

-- ============================================================
-- DONE. Next steps in the Organiser Console -> Auction Control, in order:
--   1. "Setup -> Sync Config"  - push auction-config.js into these tables.
--                                This is what creates the four team rows;
--                                nothing below works before it.
--   2. "Captain Logins"        - "Generate Passwords For All Captains".
--                                Shown once; copy or download the CSV then.
--   3. "Teams & Captains"      - rename teams, set colours and purses
--   4. "Player Pool"           - import registrations, set categories,
--                                pre-assign the 8 Captain/Vice Captain
--   5. "Control Room -> Start" - go live, then open lots one at a time
-- ============================================================
