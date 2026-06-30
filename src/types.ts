export type TaskStatus = "new" | "in_progress" | "waiting" | "done";

export type TaskComment = {
  id: string;
  taskId: string;
  site: string;
  userId: string | null;
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
  site: string;
  title: string;
  status: TaskStatus;
  createdByUserId: string | null;
  takenByUserId: string | null;
  completedByUserId: string | null;
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
  site: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type SuiteProfile = {
  userId: string;
  advisorName: string;
  site: string;
  role: string;
  canAccessTasks: boolean;
};
