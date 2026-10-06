-- Clients authenticate through Supabase Auth; numbered users are client data.
create table public.clients (
  client_id bigint primary key check (client_id > 0),
  client_name text not null check (btrim(client_name) <> ''),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.app_users (
  user_id bigint primary key check (user_id > 0),
  display_name text not null check (btrim(display_name) <> ''),
  created_at timestamptz not null default now()
);

-- A user can be assigned to more than one client.
create table public.client_users (
  client_id bigint not null references public.clients(client_id),
  user_id bigint not null references public.app_users(user_id),
  primary key (client_id, user_id)
);
create index client_users_by_user on public.client_users(user_id, client_id);

create table public.creative_flags (
  flag_id uuid primary key default gen_random_uuid(),
  client_id bigint not null,
  user_id bigint not null,
  ad_id text not null check (btrim(ad_id) <> ''),
  creative_name text not null check (btrim(creative_name) <> ''),
  creative_filter jsonb not null check (jsonb_typeof(creative_filter) = 'object'),
  metric text not null check (metric in ('ctr', 'cpc')),
  drop_percent numeric not null check (drop_percent > '-Infinity'::numeric and drop_percent <= 100),
  dropped_on date not null,
  current_window_start date not null,
  current_window_end date not null,
  flagged_at timestamptz not null default now(),
  foreign key (client_id, user_id) references public.client_users(client_id, user_id),
  check (current_window_end = current_window_start + 6),
  check (dropped_on between current_window_start and current_window_end)
);
create index creative_flags_by_client_date on public.creative_flags(client_id, dropped_on desc);
create index creative_flags_by_client_user on public.creative_flags(client_id, user_id);

comment on column public.creative_flags.creative_filter is 'Snapshot of the thresholds, enabled filters and creative selection used for this flag.';
comment on column public.creative_flags.drop_percent is '100 * (1 - current / baseline). Negative CPC values indicate increased cost, e.g. -99.03 means CPC increased 99.03%.';
comment on column public.creative_flags.dropped_on is 'Date the drop was observed in the data; use the current window end for this app. Not an inferred first-ever drop date.';
comment on column public.creative_flags.flagged_at is 'Timestamp when this flag was recorded, separate from the date of the underlying data.';

alter table public.clients enable row level security;
alter table public.app_users enable row level security;
alter table public.client_users enable row level security;
alter table public.creative_flags enable row level security;

-- Assignments are administered centrally. Clients can append their own flags.
revoke all on public.clients, public.app_users, public.client_users, public.creative_flags from anon, authenticated;
grant select on public.clients, public.app_users, public.client_users, public.creative_flags to authenticated;
grant insert on public.creative_flags to authenticated;
grant all on public.clients, public.app_users, public.client_users, public.creative_flags to service_role;

create policy clients_read_own on public.clients for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy client_users_read_own on public.client_users for select to authenticated
  using (client_id in (select c.client_id from public.clients c));

create policy app_users_read_assigned on public.app_users for select to authenticated
  using (exists (select 1 from public.client_users cu where cu.user_id = app_users.user_id));

create policy creative_flags_read_own on public.creative_flags for select to authenticated
  using (client_id in (select c.client_id from public.clients c));

create policy creative_flags_insert_own on public.creative_flags for insert to authenticated
  with check (client_id in (select c.client_id from public.clients c));
