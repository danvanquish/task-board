import { createClient } from "@supabase/supabase-js";
import { Session } from "@supabase/supabase-js";
import { SuiteProfile, Task, TaskComment, TaskNotification, TaskStatus } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

type TaskRow = {
  id: string;
  parent_id: string | null;
  site: string;
  title: string;
  status: TaskStatus;
  created_by_user_id: string | null;
  taken_by_user_id: string | null;
  completed_by_user_id: string | null;
  created_by: string;
  taken_by: string | null;
  completed_by: string | null;
  note: string | null;
  row_data: { id: string; values: Record<string, string> } | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type CommentRow = {
  id: string;
  task_id: string;
  site: string;
  user_id: string | null;
  author: string;
  body: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  task_id: string;
  site: string;
  message: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  advisor_name: string | null;
  site: string | null;
  role: string | null;
  can_access_tasks: boolean | null;
};

export async function getCurrentSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback: (session: Session | null) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  if (!supabase) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchCurrentProfile(): Promise<SuiteProfile | null> {
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Not signed in");

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, advisor_name, site, role, can_access_tasks")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) throw error;
  const profile = data as ProfileRow | null;
  if (!profile?.site) return null;

  return {
    userId: profile.user_id,
    advisorName: profile.advisor_name ?? userData.user.email ?? "Unknown user",
    site: profile.site,
    role: profile.role ?? "advisor",
    canAccessTasks: profile.can_access_tasks !== false,
  };
}

export async function fetchRemoteState(site: string) {
  if (!supabase) return null;

  const [{ data: tasks, error: tasksError }, { data: comments, error: commentsError }, { data: notifications, error: notificationsError }] =
    await Promise.all([
      supabase.from("tasks").select("*").eq("site", site).order("created_at", { ascending: false }),
      supabase.from("task_comments").select("*").eq("site", site).order("created_at", { ascending: true }),
      supabase.from("task_notifications").select("*").eq("site", site).order("created_at", { ascending: false }).limit(30),
    ]);

  if (tasksError || commentsError || notificationsError) {
    throw tasksError ?? commentsError ?? notificationsError;
  }

  return {
    tasks: (tasks ?? []).map(fromTaskRow),
    comments: (comments ?? []).map(fromCommentRow),
    notifications: (notifications ?? []).map(fromNotificationRow),
  };
}

export async function insertRemoteTasks(tasks: Task[]) {
  if (!supabase || tasks.length === 0) return;
  const { error } = await supabase.from("tasks").insert(tasks.map(toTaskRow));
  if (error) throw error;
}

export async function updateRemoteTask(task: Task) {
  if (!supabase) return;
  const { error } = await supabase.from("tasks").update(toTaskRow(task)).eq("id", task.id);
  if (error) throw error;
}

export async function deleteRemoteCompleted(parentIds: string[]) {
  if (!supabase || parentIds.length === 0) return;
  const { error } = await supabase.from("tasks").delete().in("id", parentIds);
  if (error) throw error;
}

export async function insertRemoteComment(comment: TaskComment) {
  if (!supabase) return;
  const { error } = await supabase.from("task_comments").insert(toCommentRow(comment));
  if (error) throw error;
}

export async function insertRemoteNotification(notification: TaskNotification) {
  if (!supabase) return;
  const { error } = await supabase.from("task_notifications").insert({
    id: notification.id,
    task_id: notification.taskId,
    site: notification.site,
    message: notification.message,
    created_at: notification.createdAt,
  });
  if (error) throw error;
}

export function subscribeToRemoteChanges(onChange: () => void) {
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel("task-board-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "task_notifications" }, onChange)
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

function fromTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    site: row.site,
    title: row.title,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    takenByUserId: row.taken_by_user_id,
    completedByUserId: row.completed_by_user_id,
    createdBy: row.created_by,
    takenBy: row.taken_by,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    note: row.note ?? "",
    rowData: row.row_data,
  };
}

function toTaskRow(task: Task) {
  return {
    id: task.id,
    parent_id: task.parentId,
    site: task.site,
    title: task.title,
    status: task.status,
    created_by_user_id: task.createdByUserId,
    taken_by_user_id: task.takenByUserId,
    completed_by_user_id: task.completedByUserId,
    created_by: task.createdBy,
    taken_by: task.takenBy,
    completed_by: task.completedBy,
    note: task.note,
    row_data: task.rowData,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt,
  };
}

function fromCommentRow(row: CommentRow): TaskComment {
  return {
    id: row.id,
    taskId: row.task_id,
    site: row.site,
    userId: row.user_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
  };
}

function toCommentRow(comment: TaskComment) {
  return {
    id: comment.id,
    task_id: comment.taskId,
    site: comment.site,
    user_id: comment.userId,
    author: comment.author,
    body: comment.body,
    created_at: comment.createdAt,
  };
}

function fromNotificationRow(row: NotificationRow): TaskNotification {
  return {
    id: row.id,
    taskId: row.task_id,
    site: row.site,
    message: row.message,
    createdAt: row.created_at,
    read: false,
  };
}
