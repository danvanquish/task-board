export type TaskStatus = "new" | "in_progress" | "waiting" | "done";

export type TaskComment = {
  id: string;
  taskId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type TaskRowData = {
  id: string;
  values: Record<string, string>;
};

export type Task = {
  id: string;
  parentId: string | null;
  title: string;
  status: TaskStatus;
  createdBy: string;
  takenBy: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  note: string;
  rowData: TaskRowData | null;
};

export type TaskNotification = {
  id: string;
  taskId: string;
  message: string;
  createdAt: string;
  read: boolean;
};
