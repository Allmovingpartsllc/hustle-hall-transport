-- Hustle Hall Transport: customer reviews setup
-- Run this once in the Supabase SQL Editor for the Hustle Hall project.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  rating smallint not null check (rating between 1 and 5),
  service text not null check (service in ('Local Ride', 'Student Transportation', 'Package Delivery', 'Business Delivery')),
  review_text text not null check (char_length(review_text) between 10 and 1200),
  recommend boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null
);

alter table public.reviews enable row level security;

grant select, insert on table public.reviews to anon, authenticated;
grant update, delete on table public.reviews to authenticated;

drop policy if exists "reviews_public_read_approved" on public.reviews;
drop policy if exists "reviews_public_submit_pending" on public.reviews;
drop policy if exists "reviews_admin_read_all" on public.reviews;
drop policy if exists "reviews_admin_update" on public.reviews;
drop policy if exists "reviews_admin_delete" on public.reviews;

create policy "reviews_public_read_approved"
on public.reviews
for select
to anon, authenticated
using (status = 'approved');

create policy "reviews_public_submit_pending"
on public.reviews
for insert
to anon, authenticated
with check (
  status = 'pending'
  and moderated_at is null
  and moderated_by is null
);

create policy "reviews_admin_read_all"
on public.reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);

create policy "reviews_admin_update"
on public.reviews
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);

create policy "reviews_admin_delete"
on public.reviews
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);
