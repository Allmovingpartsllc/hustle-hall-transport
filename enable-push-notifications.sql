create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Admins manage own push subscriptions" on public.push_subscriptions;
create policy "Admins manage own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (auth.uid() = user_id and public.is_admin())
with check (auth.uid() = user_id and public.is_admin());
