-- Mirror of the SQLite operational schema (D7 + D18). Applied on project vdekfueryshivtdkbbti.
-- Engine keeps using node:sqlite; the backend copies these tables to Supabase.

create table public.app_metadata (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table public.demo_runs (
  id text primary key,
  scenario_id text not null,
  state_json jsonb not null,
  active integer not null default 1 check (active in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_demo_run on public.demo_runs (active) where active = 1;

create table public.allocations (
  run_id text not null references public.demo_runs(id) on delete cascade,
  guest_id text not null,
  space_id text not null,
  status text not null check (status in ('proposed', 'confirmed')),
  plan_version integer not null,
  primary key (run_id, guest_id)
);

create table public.dispatch_tasks (
  id text primary key,
  run_id text not null references public.demo_runs(id) on delete cascade,
  plan_version integer not null,
  area text not null,
  kind text not null,
  payload_json jsonb not null,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'dispatching', 'dispatched', 'unknown', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, idempotency_key)
);

create table public.task_results (
  id text primary key,
  task_id text not null references public.dispatch_tasks(id) on delete cascade,
  external_event_id text not null unique,
  payload_json jsonb not null,
  applied integer not null check (applied in (0, 1)),
  received_at timestamptz not null default now()
);

create table public.workflow_events (
  event_id text primary key,
  event_type text not null check (event_type = 'coordinator'),
  run_id text not null,
  plan_version integer not null,
  request_json jsonb not null,
  response_json jsonb,
  received_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.events (
  id text primary key,
  run_id text not null references public.demo_runs(id) on delete cascade,
  source text not null,
  kind text not null,
  text text,
  payload_json jsonb not null,
  actor_id text,
  sim_seconds integer not null,
  mode text not null check (mode in ('llm', 'rules', 'none')),
  created_at timestamptz not null default now()
);

alter table public.app_metadata enable row level security;
alter table public.demo_runs enable row level security;
alter table public.allocations enable row level security;
alter table public.dispatch_tasks enable row level security;
alter table public.task_results enable row level security;
alter table public.workflow_events enable row level security;
alter table public.events enable row level security;

alter table public.demo_runs replica identity full;
alter publication supabase_realtime add table public.demo_runs;
