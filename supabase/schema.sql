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
