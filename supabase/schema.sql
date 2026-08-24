-- ============================================================
-- CHAMPIONS LEAGUE SPORTS TOURNAMENT — SUPABASE SCHEMA
-- Run this once in your Supabase Project SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================

-- 1) Registrations Table
create table if not exists public.registrations (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  reg_code                text not null unique,
  full_name               text not null,
  age                     integer not null check (age between 5 and 100),
  sex                     text not null check (sex in ('Male','Female','Other')),
  profile_pic_url         text,
  
  -- Ratings across 8 sports (out of 10)
  rating_pickleball       numeric(3,1) default 5.0 check (rating_pickleball between 0 and 10),
  rating_poker            numeric(3,1) default 5.0 check (rating_poker between 0 and 10),
  rating_cricket          numeric(3,1) default 5.0 check (rating_cricket between 0 and 10),
  rating_triathlon        numeric(3,1) default 5.0 check (rating_triathlon between 0 and 10),
  rating_archery_shooting numeric(3,1) default 5.0 check (rating_archery_shooting between 0 and 10),
  rating_badminton        numeric(3,1) default 5.0 check (rating_badminton between 0 and 10),
  rating_table_tennis     numeric(3,1) default 5.0 check (rating_table_tennis between 0 and 10),
  rating_football         numeric(3,1) default 5.0 check (rating_football between 0 and 10),
  combined_rating         numeric(3,1) default 5.0 check (combined_rating between 0 and 10),

  tournament_status       text not null check (tournament_status in ('Previous Participant','Debut')),
  jersey_name             text not null,
  jersey_size             text not null check (jersey_size in ('XS','S','M','L','XL','XXL','3XL')),
  status                  text not null default 'pending' check (status in ('pending','verified','checked-in'))
);

-- Enable Row Level Security (RLS)
alter table public.registrations enable row level security;

-- Policies for registrations table
drop policy if exists "public can submit registration" on public.registrations;
create policy "public can submit registration"
  on public.registrations for insert
  to anon, authenticated
  with check (true);

drop policy if exists "public can view registrations" on public.registrations;
create policy "public can view registrations"
  on public.registrations for select
  to anon, authenticated
  using (true);

-- 2) Event Settings Table
create table if not exists public.event_settings (
  id                 int primary key check (id = 1),
  registration_open  boolean not null default true,
  banner_message     text,
  updated_at         timestamptz not null default now()
);

insert into public.event_settings (id, registration_open)
values (1, true)
on conflict (id) do nothing;

alter table public.event_settings enable row level security;

drop policy if exists "public can view settings" on public.event_settings;
create policy "public can view settings"
  on public.event_settings for select
  to anon, authenticated
  using (true);

-- 3) Storage Bucket setup for player profile photos
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'registrations', 'registrations', true,
    8388608,
    array['image/jpeg','image/png','image/webp','image/heic']
  )
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  null;
end $$;

-- Storage upload policies
do $$
begin
  drop policy if exists "public can upload photos" on storage.objects;
  create policy "public can upload photos"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'registrations');

  drop policy if exists "public can view photos" on storage.objects;
  create policy "public can view photos"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'registrations');
exception when others then
  null;
end $$;
