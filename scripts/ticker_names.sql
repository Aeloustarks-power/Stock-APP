-- Site-wide Chinese names (all devices, Eric + Vivien).
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.ticker_names (
  symbol text primary key,
  name_zh text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.ticker_names enable row level security;

drop policy if exists ticker_names_select on public.ticker_names;
drop policy if exists ticker_names_insert on public.ticker_names;
drop policy if exists ticker_names_update on public.ticker_names;
drop policy if exists ticker_names_delete on public.ticker_names;

create policy ticker_names_select on public.ticker_names
  for select using (true);

create policy ticker_names_insert on public.ticker_names
  for insert with check (true);

create policy ticker_names_update on public.ticker_names
  for update using (true) with check (true);

create policy ticker_names_delete on public.ticker_names
  for delete using (true);
