-- AEO Section Writer — run once in Supabase → SQL Editor.

-- ---------- profiles: plan and credits per user ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'none',          -- none | starter | pro | agency (no free plan)
  credits_remaining integer not null default 0,
  daily_cap integer not null default 0,
  period_end timestamptz not null default now(),
  runs_day date not null default current_date,
  runs_today integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- optimizations: saved runs ----------
create table if not exists public.optimizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  heading text,
  search_query text,
  market text,
  language text,
  input text not null,
  output text not null,
  rows jsonb not null,
  keys jsonb not null default '[]',
  engines jsonb not null default '[]'
);
create index if not exists optimizations_user_created on public.optimizations (user_id, created_at desc);

-- ---------- payments ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tran_id text unique not null,
  plan text not null,
  amount numeric(10,2) not null,
  currency text not null default 'BDT',
  status text not null default 'pending',   -- pending | paid | failed | cancelled
  val_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------- row level security: users read only their own rows; writes go through the server ----------
alter table public.profiles enable row level security;
alter table public.optimizations enable row level security;
alter table public.payments enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own optimizations" on public.optimizations;
create policy "own optimizations" on public.optimizations for select using (auth.uid() = user_id);
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments for select using (auth.uid() = user_id);

-- ---------- create a profile for every new user ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- consume one credit atomically; returns credits left, -1 = no plan / none left, -2 = daily cap ----------
create or replace function public.consume_credit(p_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r integer; p public.profiles;
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  -- a paid period that ended leaves the account without a plan (there is no free plan)
  update public.profiles
     set plan = 'none', credits_remaining = 0, daily_cap = 0
   where id = p_user and plan <> 'none' and period_end < now();
  select * into p from public.profiles where id = p_user for update;
  if p.credits_remaining <= 0 then return -1; end if;
  if p.runs_day = current_date and p.runs_today >= p.daily_cap then return -2; end if;
  update public.profiles
     set credits_remaining = credits_remaining - 1,
         runs_today = case when runs_day = current_date then runs_today + 1 else 1 end,
         runs_day = current_date
   where id = p_user
  returning credits_remaining into r;
  return r;
end $$;

create or replace function public.refund_credit(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set credits_remaining = credits_remaining + 1,
         runs_today = greatest(runs_today - 1, 0)
   where id = p_user;
end $$;

-- ---------- activate a paid plan (called after SSLCommerz validation) ----------
create or replace function public.activate_plan(p_user uuid, p_plan text, p_credits integer, p_cap integer, p_days integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  -- unused credits of a plan that is still running are carried over to the new 30-day period
  update public.profiles
     set credits_remaining = p_credits + case when plan <> 'none' and period_end > now() then greatest(credits_remaining, 0) else 0 end,
         plan = p_plan, daily_cap = p_cap,
         period_end = now() + make_interval(days => p_days)
   where id = p_user;
end $$;

revoke execute on function public.consume_credit(uuid) from anon, authenticated;
revoke execute on function public.refund_credit(uuid) from anon, authenticated;
revoke execute on function public.activate_plan(uuid, text, integer, integer, integer) from anon, authenticated;

-- If you ran an older version of this file with a Free plan, switch existing Free accounts off:
-- update public.profiles set plan = 'none', credits_remaining = 0, daily_cap = 0 where plan = 'free';
