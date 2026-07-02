alter table public.profiles
  add column if not exists access_disabled boolean not null default false;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.tasks(id) on delete cascade,
  site text not null,
  title text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  task_scope text not null default 'team' check (task_scope in ('team', 'personal')),
  urgent boolean not null default false,
  created_by_user_id uuid references auth.users(id),
  taken_by_user_id uuid references auth.users(id),
  completed_by_user_id uuid references auth.users(id),
  created_by text not null,
  taken_by text,
  completed_by text,
  note text not null default '',
  row_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.tasks
  add column if not exists site text,
  add column if not exists task_scope text not null default 'team',
  add column if not exists urgent boolean not null default false,
  add column if not exists created_by_user_id uuid references auth.users(id),
  add column if not exists taken_by_user_id uuid references auth.users(id),
  add column if not exists completed_by_user_id uuid references auth.users(id);

update public.tasks
set status = 'in_progress'
where status = 'waiting';

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check check (status in ('new', 'in_progress', 'done'));

alter table public.tasks
  drop constraint if exists tasks_task_scope_check;

alter table public.tasks
  add constraint tasks_task_scope_check check (task_scope in ('team', 'personal'));

update public.tasks
set site = 'Redditch'
where site is null;

alter table public.tasks
  alter column site set not null;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  site text not null,
  user_id uuid references auth.users(id),
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.task_comments
  add column if not exists site text,
  add column if not exists user_id uuid references auth.users(id);

update public.task_comments comment
set site = task.site
from public.tasks task
where comment.task_id = task.id
  and comment.site is null;

update public.task_comments
set site = 'Redditch'
where site is null;

alter table public.task_comments
  alter column site set not null;

create table if not exists public.task_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  site text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  user_id uuid references auth.users(id),
  author text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.task_notifications
  add column if not exists site text;

update public.task_notifications notification
set site = task.site
from public.tasks task
where notification.task_id = task.id
  and notification.site is null;

update public.task_notifications
set site = 'Redditch'
where site is null;

alter table public.task_notifications
  alter column site set not null;

alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_notifications enable row level security;
alter table public.team_chat_messages enable row level security;

grant select, insert on public.team_chat_messages to authenticated;

drop policy if exists "tasks_read_all" on public.tasks;
drop policy if exists "tasks_insert_all" on public.tasks;
drop policy if exists "tasks_update_all" on public.tasks;
drop policy if exists "tasks_read_site" on public.tasks;
drop policy if exists "tasks_insert_site" on public.tasks;
drop policy if exists "tasks_update_site" on public.tasks;
drop policy if exists "tasks_delete_manager_site" on public.tasks;

create policy "tasks_read_site"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = tasks.site
      and coalesce(profiles.access_disabled, false) = false
      and (
        tasks.task_scope = 'team'
        or (
          tasks.task_scope = 'personal'
          and tasks.created_by_user_id = auth.uid()
        )
      )
  )
);

create policy "tasks_insert_site"
on public.tasks
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = tasks.site
      and coalesce(profiles.access_disabled, false) = false
      and tasks.task_scope in ('team', 'personal')
  )
);

create policy "tasks_update_site"
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = tasks.site
      and coalesce(profiles.access_disabled, false) = false
      and (
        tasks.task_scope = 'team'
        or (
          tasks.task_scope = 'personal'
          and tasks.created_by_user_id = auth.uid()
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = tasks.site
      and coalesce(profiles.access_disabled, false) = false
      and (
        tasks.task_scope = 'team'
        or (
          tasks.task_scope = 'personal'
          and tasks.created_by_user_id = auth.uid()
        )
      )
  )
);

create policy "tasks_delete_manager_site"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = tasks.site
      and coalesce(profiles.access_disabled, false) = false
      and (
        (
          tasks.task_scope = 'team'
          and lower(profiles.role) in ('manager', 'super_admin')
        )
        or (
          tasks.task_scope = 'personal'
          and tasks.created_by_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "comments_read_all" on public.task_comments;
drop policy if exists "comments_insert_all" on public.task_comments;
drop policy if exists "comments_read_site" on public.task_comments;
drop policy if exists "comments_insert_site" on public.task_comments;

create policy "comments_read_site"
on public.task_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.tasks task
    join public.profiles profiles on profiles.site = task.site
    where task.id = task_comments.task_id
      and profiles.user_id = auth.uid()
      and coalesce(profiles.access_disabled, false) = false
      and (
        task.task_scope = 'team'
        or (
          task.task_scope = 'personal'
          and task.created_by_user_id = auth.uid()
        )
      )
  )
);

create policy "comments_insert_site"
on public.task_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.tasks task
    join public.profiles profiles on profiles.site = task.site
    where task.id = task_comments.task_id
      and profiles.user_id = auth.uid()
      and coalesce(profiles.access_disabled, false) = false
      and (
        task.task_scope = 'team'
        or (
          task.task_scope = 'personal'
          and task.created_by_user_id = auth.uid()
        )
      )
  )
);

drop policy if exists "notifications_read_all" on public.task_notifications;
drop policy if exists "notifications_insert_all" on public.task_notifications;
drop policy if exists "notifications_read_site" on public.task_notifications;
drop policy if exists "notifications_insert_site" on public.task_notifications;

create policy "notifications_read_site"
on public.task_notifications
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = task_notifications.site
      and coalesce(profiles.access_disabled, false) = false
  )
);

create policy "notifications_insert_site"
on public.task_notifications
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = task_notifications.site
      and coalesce(profiles.access_disabled, false) = false
  )
);

drop policy if exists "team_chat_read_site" on public.team_chat_messages;
drop policy if exists "team_chat_insert_site" on public.team_chat_messages;

create policy "team_chat_read_site"
on public.team_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = team_chat_messages.site
      and coalesce(profiles.access_disabled, false) = false
  )
);

create policy "team_chat_insert_site"
on public.team_chat_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.site = team_chat_messages.site
      and coalesce(profiles.access_disabled, false) = false
  )
);
