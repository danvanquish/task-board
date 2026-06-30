create table if not exists public.task_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  is_manager boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting', 'done')),
  created_by text not null,
  taken_by text,
  completed_by text,
  note text not null default '',
  row_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_notifications enable row level security;

drop policy if exists "tasks_read_all" on public.tasks;
create policy "tasks_read_all" on public.tasks for select using (true);

drop policy if exists "tasks_insert_all" on public.tasks;
create policy "tasks_insert_all" on public.tasks for insert with check (true);

drop policy if exists "tasks_update_all" on public.tasks;
create policy "tasks_update_all" on public.tasks for update using (true) with check (true);

drop policy if exists "comments_read_all" on public.task_comments;
create policy "comments_read_all" on public.task_comments for select using (true);

drop policy if exists "comments_insert_all" on public.task_comments;
create policy "comments_insert_all" on public.task_comments for insert with check (true);

drop policy if exists "notifications_read_all" on public.task_notifications;
create policy "notifications_read_all" on public.task_notifications for select using (true);

drop policy if exists "notifications_insert_all" on public.task_notifications;
create policy "notifications_insert_all" on public.task_notifications for insert with check (true);
