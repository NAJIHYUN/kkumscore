-- Supabase schema bootstrap for Scorebox
-- Run in SQL editor (Supabase)

create extension if not exists pgcrypto;

-- 1) user profile (approval + role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  approved boolean not null default false,
  role text not null default 'all' check (role in ('high','middle','all','admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- optional: auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 2) package links by user (vault)
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  vault text not null check (vault in ('high','middle','all')),
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.packages enable row level security;

drop policy if exists "packages_select_own" on public.packages;
create policy "packages_select_own"
on public.packages for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "packages_insert_own" on public.packages;
create policy "packages_insert_own"
on public.packages for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "packages_delete_own" on public.packages;
create policy "packages_delete_own"
on public.packages for delete
to authenticated
using (auth.uid() = owner_id);

create index if not exists packages_owner_created_idx
on public.packages(owner_id, created_at desc);

-- 3) shared songs (storage-backed)
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  uploader_nickname text not null default '',
  title text not null,
  artist text not null default '',
  key text not null default '',
  pdf_url text not null default '',
  jpg_url text not null default '',
  created_at timestamptz not null default now(),
  check (pdf_url <> '' or jpg_url <> '')
);

alter table public.songs enable row level security;

drop policy if exists "songs_select_all_auth" on public.songs;
drop policy if exists "songs_select_all_public" on public.songs;
create policy "songs_select_all_public"
on public.songs for select
using (true);

drop policy if exists "songs_insert_own" on public.songs;
create policy "songs_insert_own"
on public.songs for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "songs_update_own" on public.songs;
create policy "songs_update_own"
on public.songs for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "songs_delete_own" on public.songs;
create policy "songs_delete_own"
on public.songs for delete
to authenticated
using (auth.uid() = owner_id);

create index if not exists songs_created_idx
on public.songs(created_at desc);

alter table public.songs
add column if not exists uploader_nickname text not null default '';

-- 4) storage bucket + policies (song files)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'score-files',
  'score-files',
  true,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "score_files_select_auth" on storage.objects;
create policy "score_files_select_auth"
on storage.objects for select
to authenticated
using (bucket_id = 'score-files');

drop policy if exists "score_files_insert_own_folder" on storage.objects;
create policy "score_files_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'score-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "score_files_update_own_folder" on storage.objects;
create policy "score_files_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'score-files'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'score-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "score_files_delete_own_folder" on storage.objects;
create policy "score_files_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'score-files'
  and auth.uid()::text = (storage.foldername(name))[1]
);
