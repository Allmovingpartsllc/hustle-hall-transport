-- Run this once in the Supabase SQL Editor for the Hustle Hall Transport project.
-- Creates a private admin-only file library for the Operations dashboard.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-files',
  'business-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "business_files_admin_read" on storage.objects;
drop policy if exists "business_files_admin_upload" on storage.objects;

create policy "business_files_admin_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-files'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);

create policy "business_files_admin_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-files'
  and (storage.foldername(name))[1] = 'reports'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);
