-- Supabase SQL migration for Money Guard per-user persistence
-- Run this in the Supabase SQL editor.

create table if not exists public.money_guard_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.money_guard_state enable row level security;

drop policy if exists "money_guard_state_select_own" on public.money_guard_state;
create policy "money_guard_state_select_own"
  on public.money_guard_state
  for select
  using (user_id = auth.uid());

drop policy if exists "money_guard_state_insert_own" on public.money_guard_state;
create policy "money_guard_state_insert_own"
  on public.money_guard_state
  for insert
  with check (user_id = auth.uid());

drop policy if exists "money_guard_state_update_own" on public.money_guard_state;
create policy "money_guard_state_update_own"
  on public.money_guard_state
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "money_guard_state_delete_own" on public.money_guard_state;
create policy "money_guard_state_delete_own"
  on public.money_guard_state
  for delete
  using (user_id = auth.uid());

create or replace function public.set_money_guard_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_money_guard_state_updated_at on public.money_guard_state;
create trigger trg_money_guard_state_updated_at
before update on public.money_guard_state
for each row
execute function public.set_money_guard_state_updated_at();
