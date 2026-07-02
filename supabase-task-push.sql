create table if not exists public.task_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_push_subscriptions enable row level security;

grant select, insert, update, delete on public.task_push_subscriptions to authenticated;

drop policy if exists "task_push_subscriptions_select_own" on public.task_push_subscriptions;
create policy "task_push_subscriptions_select_own"
on public.task_push_subscriptions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "task_push_subscriptions_insert_own" on public.task_push_subscriptions;
create policy "task_push_subscriptions_insert_own"
on public.task_push_subscriptions
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "task_push_subscriptions_update_own" on public.task_push_subscriptions;
create policy "task_push_subscriptions_update_own"
on public.task_push_subscriptions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "task_push_subscriptions_delete_own" on public.task_push_subscriptions;
create policy "task_push_subscriptions_delete_own"
on public.task_push_subscriptions
for delete
to authenticated
using (user_id = auth.uid());
