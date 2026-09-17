create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create table public.prompts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text,
  tags text,
  is_favorite integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);

alter table public.prompts enable row level security;

create policy "prompts_all_own" on public.prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
