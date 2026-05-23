create table if not exists public.money_guard_state (
  user_id uuid primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.money_guard_state enable row level security;

create policy "Allow read own state" on public.money_guard_state
  for select
  using (auth.uid() = user_id);

create policy "Allow upsert own state" on public.money_guard_state
  for insert
  with check (auth.uid() = user_id);

create policy "Allow update own state" on public.money_guard_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_money_guard_state_updated_at
before update on public.money_guard_state
for each row
execute function public.handle_updated_at();
