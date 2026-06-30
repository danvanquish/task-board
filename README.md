# DD25 Team Tasks

Team task board for DD25.

## First version

- Everyone can add tasks.
- Tasks can be marked New, In Progress, Waiting, or Done.
- The app records who added, took, and completed a task.
- Managers can remove completed parent tasks.
- Tasks can have a discreet note visible inside the task modal.
- Tasks have threaded comments.
- Excel rows can be pasted into a batch so each row becomes an individual child task.
- Browser notifications can be enabled per device.

## Deploy

Use this as a separate Vercel project for `tasks.dd25.co.uk`.

Run `supabase-task-board.sql` in Supabase when moving from local-first storage to shared live storage.
