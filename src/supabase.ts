import { createClient } from "@supabase/supabase-js";
import { Task, TaskComment, TaskNotification, TaskStatus } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseEnabled = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseEnabled
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

type TaskRow = {
  id: string;
  parent_id: string | null;
  title: string;
  status: TaskStatus;
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
  author: string;
  body: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  task_id: string;
  message: string;
  created_at: string;
};

export async function fetchRemoteState() {
  if (!supabase) return null;

  const [{ data: tasks, error: tasksError }, { data: comments, error: commentsError }, { data: notifications, error: notificationsError }] =
    await Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("task_comments").select("*").order("created_at", { ascending: true }),
      supabase.from("task_notifications").select("*").order("created_at", { ascending: false }).limit(30),
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
    title: row.title,
    status: row.status,
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
    title: task.title,
    status: task.status,
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
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
  };
}

function toCommentRow(comment: TaskComment) {
  return {
    id: comment.id,
    task_id: comment.taskId,
    author: comment.author,
    body: comment.body,
    created_at: comment.createdAt,
  };
}

function fromNotificationRow(row: NotificationRow): TaskNotification {
  return {
    id: row.id,
    taskId: row.task_id,
    message: row.message,
    createdAt: row.created_at,
    read: false,
  };
}
