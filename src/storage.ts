import { Task, TaskComment, TaskNotification, TeamChatMessage } from "./types";

const tasksKey = "dd25-task-board.tasks";
const commentsKey = "dd25-task-board.comments";
const notificationsKey = "dd25-task-board.notifications";
const readNotificationIdsKey = "dd25-task-board.read-notification-ids";
const teamChatKey = "dd25-task-board.team-chat";
const profileKey = "dd25-task-board.profile";

export type Profile = {
  name: string;
  isManager: boolean;
  notificationsEnabled: boolean;
};

export function loadProfile(): Profile {
  const saved = localStorage.getItem(profileKey);
  if (!saved) {
    return { name: "", isManager: false, notificationsEnabled: false };
  }

  return JSON.parse(saved) as Profile;
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(profileKey, JSON.stringify(profile));
}

export function loadTasks() {
  return readJson<Task[]>(tasksKey, seedTasks());
}

export function saveTasks(tasks: Task[]) {
  localStorage.setItem(tasksKey, JSON.stringify(tasks));
}

export function loadComments() {
  return readJson<TaskComment[]>(commentsKey, []);
}

export function saveComments(comments: TaskComment[]) {
  localStorage.setItem(commentsKey, JSON.stringify(comments));
}

export function loadNotifications() {
  return readJson<TaskNotification[]>(notificationsKey, []);
}

export function saveNotifications(notifications: TaskNotification[]) {
  localStorage.setItem(notificationsKey, JSON.stringify(notifications));
}

export function loadReadNotificationIds() {
  return readJson<string[]>(readNotificationIdsKey, []);
}

export function saveReadNotificationIds(ids: string[]) {
  localStorage.setItem(readNotificationIdsKey, JSON.stringify(ids));
}

export function loadTeamChatMessages() {
  return readJson<TeamChatMessage[]>(teamChatKey, []);
}

export function saveTeamChatMessages(messages: TeamChatMessage[]) {
  localStorage.setItem(teamChatKey, JSON.stringify(messages));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

function seedTasks(): Task[] {
  const now = new Date().toISOString();

  return [
    {
      id: crypto.randomUUID(),
      parentId: null,
      site: "Local",
      title: "Photograph fresh part exchanges",
      status: "new",
      taskScope: "team",
      urgent: false,
      createdByUserId: null,
      takenByUserId: null,
      completedByUserId: null,
      createdBy: "DD25",
      takenBy: null,
      completedBy: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      note: "Example batch: paste rows from Excel to create one task per vehicle.",
      rowData: null,
    },
  ];
}
