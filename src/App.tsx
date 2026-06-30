import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  MessageSquareText,
  Plus,
  StickyNote,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { makeChildTasks, parsePastedTable } from "./excel";
import {
  loadComments,
  loadNotifications,
  loadProfile,
  loadTasks,
  saveComments,
  saveNotifications,
  saveProfile,
  saveTasks,
} from "./storage";
import { Task, TaskComment, TaskNotification, TaskStatus } from "./types";
import {
  deleteRemoteCompleted,
  fetchRemoteState,
  insertRemoteComment,
  insertRemoteNotification,
  insertRemoteTasks,
  isSupabaseEnabled,
  fetchCurrentProfile,
  getCurrentSession,
  onAuthChange,
  requestPasswordReset,
  signIn,
  signOut,
  subscribeToRemoteChanges,
  updatePassword,
  updateRemoteTask,
} from "./supabase";
import type { Session } from "@supabase/supabase-js";
import { SuiteProfile } from "./types";

const statusLabels: Record<TaskStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  waiting: "Waiting",
  done: "Done",
};

const statusOrder: TaskStatus[] = ["new", "in_progress", "waiting", "done"];

export function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [session, setSession] = useState<Session | null>(null);
  const [suiteProfile, setSuiteProfile] = useState<SuiteProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(isSupabaseEnabled);
  const [tasks, setTasks] = useState(loadTasks);
  const [comments, setComments] = useState(loadComments);
  const [notifications, setNotifications] = useState(loadNotifications);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [toast, setToast] = useState("");

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const parentTasks = useMemo(() => tasks.filter((task) => !task.parentId), [tasks]);
  const childTasks = useMemo(() => tasks.filter((task) => task.parentId), [tasks]);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const actorName = suiteProfile?.advisorName || profile.name || "Someone";
  const actorUserId = suiteProfile?.userId ?? null;
  const activeSite = suiteProfile?.site ?? "Local";
  const isManager = suiteProfile
    ? suiteProfile.role.toLowerCase() === "manager" || suiteProfile.role.toLowerCase() === "super_admin"
    : profile.isManager;

  useEffect(() => {
    if (!isSupabaseEnabled) return;

    let cancelled = false;

    async function loadAuth() {
      try {
        const currentSession = await getCurrentSession();
        if (cancelled) return;

        setSession(currentSession);
        if (currentSession) {
          setSuiteProfile(await fetchCurrentProfile());
        } else {
          setSuiteProfile(null);
        }
      } catch (error) {
        console.error(error);
        setToast("Unable to load your DD25 login");
      } finally {
        if (!cancelled) setIsCheckingAuth(false);
      }
    }

    void loadAuth();
    const unsubscribe = onAuthChange((nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setSuiteProfile(null);
        setIsCheckingAuth(false);
        return;
      }

      void fetchCurrentProfile()
        .then(setSuiteProfile)
        .catch((error) => {
          console.error(error);
          setToast("Unable to load your DD25 profile");
        })
        .finally(() => setIsCheckingAuth(false));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseEnabled || !suiteProfile?.site) return;

    let cancelled = false;

    async function loadRemote() {
      try {
        const remote = await fetchRemoteState(suiteProfile.site);
        if (!remote || cancelled) return;

        setTasks(remote.tasks);
        saveTasks(remote.tasks);
        setComments(remote.comments);
        saveComments(remote.comments);
        setNotifications(remote.notifications);
        saveNotifications(remote.notifications);
      } catch (error) {
        console.error(error);
        setToast("Unable to load shared tasks");
      }
    }

    void loadRemote();
    const unsubscribe = subscribeToRemoteChanges(() => void loadRemote());

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [suiteProfile?.site]);

  function updateProfile(nextProfile: typeof profile) {
    setProfile(nextProfile);
    saveProfile(nextProfile);
  }

  function persistTasks(nextTasks: Task[]) {
    setTasks(nextTasks);
    saveTasks(nextTasks);
  }

  function persistComments(nextComments: TaskComment[]) {
    setComments(nextComments);
    saveComments(nextComments);
  }

  function addNotification(taskId: string, message: string) {
    const nextNotification: TaskNotification = {
      id: crypto.randomUUID(),
      taskId,
      site: activeSite,
      message,
      createdAt: new Date().toISOString(),
      read: false,
    };
    const nextNotifications = [nextNotification, ...notifications].slice(0, 30);

    setNotifications(nextNotifications);
    saveNotifications(nextNotifications);
    void insertRemoteNotification(nextNotification).catch((error) => {
      console.error(error);
      setToast("Unable to save notification");
    });

    if (profile.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification("DD25 Tasks", { body: message });
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setToast("This browser does not support notifications");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setToast("Notifications were not allowed");
      return;
    }

    updateProfile({ ...profile, notificationsEnabled: true });
    setToast("Notifications enabled on this device");
  }

  function setTaskStatus(task: Task, status: TaskStatus) {
    const actor = actorName;
    const now = new Date().toISOString();
    const changedTasks: Task[] = [];
    const nextTasks = tasks.map((item) => {
      if (item.id !== task.id) return item;

      const changedTask = {
        ...item,
        status,
        takenByUserId: status === "in_progress" ? actorUserId : item.takenByUserId,
        completedByUserId: status === "done" ? actorUserId : status !== "done" ? null : item.completedByUserId,
        takenBy: status === "in_progress" ? actor : item.takenBy,
        completedBy: status === "done" ? actor : status !== "done" ? null : item.completedBy,
        completedAt: status === "done" ? now : null,
        updatedAt: now,
      };

      changedTasks.push(changedTask);
      return changedTask;
    });

    const afterParentUpdate = updateParentCompletion(nextTasks);
    persistTasks(afterParentUpdate);
    const affectedParentId = task.parentId ?? task.id;
    afterParentUpdate
      .filter((item) => changedTasks.some((changedTask) => changedTask.id === item.id) || item.id === affectedParentId)
      .forEach((item) => {
        void updateRemoteTask(item).catch((error) => {
          console.error(error);
          setToast("Unable to save task update");
        });
      });

    if (status === "done") {
      addNotification(task.id, `${actor} completed: ${task.title}`);
    } else if (status === "in_progress") {
      addNotification(task.id, `${actor} is doing: ${task.title}`);
    }
  }

  function updateParentCompletion(nextTasks: Task[]) {
    return nextTasks.map((task) => {
      if (task.parentId) return task;

      const children = nextTasks.filter((child) => child.parentId === task.id);
      if (children.length === 0) return task;

      const allDone = children.every((child) => child.status === "done");
      const anyStarted = children.some((child) => child.status !== "new");

      return {
        ...task,
        status: allDone ? "done" : anyStarted ? "in_progress" : "new",
        completedAt: allDone ? new Date().toISOString() : null,
        completedBy: allDone ? "Team" : null,
      };
    });
  }

  function removeCompleted() {
    if (!isManager) {
      setToast("Only managers can remove completed tasks");
      return;
    }

    const completedParentIds = new Set(
      tasks.filter((task) => !task.parentId && task.status === "done").map((task) => task.id)
    );
    const nextTasks = tasks.filter((task) => {
      if (!task.parentId) return task.status !== "done";
      return !completedParentIds.has(task.parentId);
    });

    persistTasks(nextTasks);
    void deleteRemoteCompleted([...completedParentIds]).catch((error) => {
      console.error(error);
      setToast("Unable to remove completed tasks");
    });
    setSelectedTaskId(null);
    setToast("Completed tasks removed");
  }

  function addComment(taskId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) return;

    const nextComments = [
      ...comments,
      {
        id: crypto.randomUUID(),
        taskId,
        site: activeSite,
        userId: actorUserId,
        author: actorName,
        body: trimmed,
        createdAt: new Date().toISOString(),
      },
    ];

    persistComments(nextComments);
    void insertRemoteComment(nextComments[nextComments.length - 1]).catch((error) => {
      console.error(error);
      setToast("Unable to save comment");
    });
    addNotification(taskId, `${actorName} commented on a task`);
  }

  function saveNote(taskId: string, note: string) {
    const changedTask = tasks.find((task) => task.id === taskId);
    if (!changedTask) return;

    const nextTask = { ...changedTask, note, updatedAt: new Date().toISOString() };
    persistTasks(tasks.map((task) => (task.id === taskId ? nextTask : task)));
    void updateRemoteTask(nextTask).catch((error) => {
      console.error(error);
      setToast("Unable to save note");
    });
  }

  function addSingleTask(title: string, note: string) {
    const trimmed = title.trim();
    if (!trimmed) return;

    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      parentId: null,
      site: activeSite,
      title: trimmed,
      status: "new",
      createdByUserId: actorUserId,
      takenByUserId: null,
      completedByUserId: null,
      createdBy: actorName,
      takenBy: null,
      completedBy: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      note,
      rowData: null,
    };

    persistTasks([task, ...tasks]);
    void insertRemoteTasks([task]).catch((error) => {
      console.error(error);
      setToast("Unable to save new task");
    });
    addNotification(task.id, `${task.createdBy} added: ${task.title}`);
    setIsAdding(false);
  }

  function addBatchTask(title: string, paste: string, note: string) {
    const parsed = parsePastedTable(paste);
    if (!title.trim() || parsed.rows.length === 0) return;

    const now = new Date().toISOString();
    const parent: Task = {
      id: crypto.randomUUID(),
      parentId: null,
      site: activeSite,
      title: title.trim(),
      status: "new",
      createdByUserId: actorUserId,
      takenByUserId: null,
      completedByUserId: null,
      createdBy: actorName,
      takenBy: null,
      completedBy: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      note,
      rowData: null,
    };
    const children = makeChildTasks(parent, parsed.rows, actorName, actorUserId);

    persistTasks([parent, ...children, ...tasks]);
    void insertRemoteTasks([parent, ...children]).catch((error) => {
      console.error(error);
      setToast("Unable to save task batch");
    });
    addNotification(parent.id, `${parent.createdBy} added ${children.length} vehicle tasks`);
    setIsAdding(false);
  }

  if (isSupabaseEnabled && isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#f6f8f5] text-[#102a2a] auth-shell">
        <div className="auth-card">Checking your DD25 login...</div>
      </div>
    );
  }

  if (isSupabaseEnabled && window.location.pathname === "/reset-password") {
    return <ResetPasswordScreen />;
  }

  if (isSupabaseEnabled && !session) {
    return <LoginScreen onSignIn={signIn} />;
  }

  if (isSupabaseEnabled && !suiteProfile) {
    return (
      <div className="min-h-screen bg-[#f6f8f5] text-[#102a2a] auth-shell">
        <div className="auth-card">
          <img src="/dd25-logo.png" alt="DD25" className="auth-logo" />
          <h1>Profile needed</h1>
          <p>Your DD25 account needs a profile with a dealership/site before Team Tasks can open.</p>
          <button className="button wide" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (isSupabaseEnabled && suiteProfile && !suiteProfile.canAccessTasks) {
    return (
      <div className="min-h-screen bg-[#f6f8f5] text-[#102a2a] auth-shell">
        <div className="auth-card">
          <img src="/dd25-logo.png" alt="DD25" className="auth-logo" />
          <h1>No Team Tasks Access</h1>
          <p>Your DD25 account is not currently enabled for Team Tasks.</p>
          <button className="button wide" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8f5] text-[#102a2a]">
      <header className="sticky top-0 z-10 border-b border-[#d9e5e0] bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/dd25-logo.png" alt="DD25" className="h-12 w-28 rounded-md bg-[#0b3937] object-contain" />
            <div>
              <h1 className="text-xl font-semibold">Team Tasks</h1>
              <p className="text-sm text-[#59716d]">
                {activeSite} · Shared jobs, vehicle batches, notes, and task updates.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="user-chip">{actorName}{isManager ? " · Manager" : ""}</div>
            <button className="button secondary" onClick={enableNotifications}>
              <Bell className="h-4 w-4" />
              {profile.notificationsEnabled ? "On" : "Notify"}
              {unreadCount > 0 && <span className="pill">{unreadCount}</span>}
            </button>
            <button className="button" onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
              Add Task
            </button>
            {isSupabaseEnabled && (
              <button className="button secondary" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <section className="mb-5 grid gap-3 md:grid-cols-4">
          <Metric label="Open tasks" value={tasks.filter((task) => task.status !== "done").length} />
          <Metric label="Vehicle rows" value={childTasks.length} />
          <Metric label="Completed" value={tasks.filter((task) => task.status === "done").length} />
          <Metric label="Notes" value={tasks.filter((task) => task.note.trim()).length} />
        </section>

        <section className="grid gap-4 xl:grid-cols-4">
          {statusOrder.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              tasks={parentTasks.filter((task) => task.status === status)}
              childTasks={childTasks}
              comments={comments}
              onOpen={setSelectedTaskId}
            />
          ))}
        </section>
      </main>

      {isManager && tasks.some((task) => task.status === "done") && (
        <button className="cleanup-button" onClick={removeCompleted}>
          <Trash2 className="h-4 w-4" />
          Remove completed tasks
        </button>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          children={childTasks.filter((task) => task.parentId === selectedTask.id)}
          comments={comments.filter((comment) => comment.taskId === selectedTask.id)}
          allComments={comments}
          onClose={() => setSelectedTaskId(null)}
          onStatus={setTaskStatus}
          onOpen={setSelectedTaskId}
          onComment={addComment}
          onSaveNote={saveNote}
        />
      )}

      {isAdding && (
        <AddTaskModal
          onClose={() => setIsAdding(false)}
          onSingle={addSingleTask}
          onBatch={addBatchTask}
        />
      )}

      {toast && (
        <button className="toast" onClick={() => setToast("")}>
          {toast}
        </button>
      )}
    </div>
  );
}

function LoginScreen({ onSignIn }: { onSignIn: (email: string, password: string) => Promise<void> | void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await onSignIn(email, password);
    } catch (signInError) {
      console.error(signInError);
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    const resetEmail = email.trim();
    if (!resetEmail) {
      setError("Enter your email address first, then choose Forgot password.");
      return;
    }

    setResetting(true);
    setError("");

    try {
      await requestPasswordReset(resetEmail);
      setError("If that email has access, a password reset link has been sent.");
    } catch (resetError) {
      console.error(resetError);
      setError(resetError instanceof Error ? resetError.message : "Unable to send reset link");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8f5] text-[#102a2a] auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <img src="/dd25-logo.png" alt="DD25" className="auth-logo" />
          <h1>Team Tasks</h1>
          <p>Sign in with your DD25 account</p>
        </div>

        <label>Email</label>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />

        <label>Password</label>
        <div className="password-field">
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="button wide" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <button type="button" className="link-button" disabled={resetting} onClick={resetPassword}>
          {resetting ? "Sending reset link..." : "Forgot password?"}
        </button>

        <p className="auth-footer">© Daniel Dawson / DD25. Confidential.</p>
      </form>
    </div>
  );
}

function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Enter at least 8 characters.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      await updatePassword(password);
      setMessage("Password updated. You can now sign in.");
      await signOut();
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Unable to update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8f5] text-[#102a2a] auth-shell">
      <form className="auth-card" onSubmit={savePassword}>
        <div className="auth-brand">
          <img src="/dd25-logo.png" alt="DD25" className="auth-logo" />
          <h1>Set New Password</h1>
          <p>Choose a new DD25 password.</p>
        </div>

        <label>New password</label>
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
        {message && <p className="auth-error">{message}</p>}
        <button className="button wide" disabled={saving}>
          {saving ? "Saving..." : "Save password"}
        </button>
      </form>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#d9e5e0] bg-white p-4 shadow-sm">
      <p className="text-sm text-[#59716d]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TaskColumn({
  status,
  tasks,
  childTasks,
  comments,
  onOpen,
}: {
  status: TaskStatus;
  tasks: Task[];
  childTasks: Task[];
  comments: TaskComment[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="min-h-[520px] rounded-lg border border-[#d9e5e0] bg-[#eef5f2] p-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{statusLabels[status]}</h2>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold">{tasks.length}</span>
      </div>

      <div className="grid gap-3">
        {tasks.map((task) => {
          const children = childTasks.filter((child) => child.parentId === task.id);
          const doneChildren = children.filter((child) => child.status === "done").length;
          const commentCount = comments.filter(
            (comment) => comment.taskId === task.id || children.some((child) => child.id === comment.taskId)
          ).length;

          return (
            <button key={task.id} className="task-card" onClick={() => onOpen(task.id)}>
              <div className="flex items-start justify-between gap-3">
                <h3>{task.title}</h3>
                {task.note.trim() && <StickyNote className="h-4 w-4 text-[#c99319]" />}
              </div>
              <div className="meta">
                <span>Added by {task.createdBy}</span>
                {task.takenBy && <span>Doing: {task.takenBy}</span>}
                {task.completedBy && <span>Done by {task.completedBy}</span>}
              </div>
              {children.length > 0 && (
                <div>
                  <div className="progress-bar">
                    <span style={{ width: `${(doneChildren / children.length) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[#59716d]">
                    {doneChildren} of {children.length} rows complete
                  </p>
                </div>
              )}
              <div className="card-footer">
                {commentCount > 0 && (
                  <span>
                    <MessageSquareText className="h-3.5 w-3.5" />
                    {commentCount}
                  </span>
                )}
                <span>{new Date(task.createdAt).toLocaleDateString("en-GB")}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TaskModal({
  task,
  children,
  comments,
  allComments,
  onClose,
  onStatus,
  onOpen,
  onComment,
  onSaveNote,
}: {
  task: Task;
  children: Task[];
  comments: TaskComment[];
  allComments: TaskComment[];
  onClose: () => void;
  onStatus: (task: Task, status: TaskStatus) => void;
  onOpen: (id: string) => void;
  onComment: (taskId: string, body: string) => void;
  onSaveNote: (taskId: string, note: string) => void;
}) {
  const [note, setNote] = useState(task.note);
  const [comment, setComment] = useState("");

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="text-sm text-[#59716d]">{statusLabels[task.status]}</p>
            <h2>{task.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="status-row">
          {statusOrder.map((status) => (
            <button
              key={status}
              className={`status-button ${task.status === status ? "active" : ""}`}
              onClick={() => onStatus(task, status)}
            >
              {statusLabels[status]}
            </button>
          ))}
        </div>

        <div className="detail-grid">
          <div>
            <label>Discreet note</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => onSaveNote(task.id, note)}
              placeholder="Only shown when this task is opened"
            />
          </div>

          <div className="facts">
            <p><strong>Added by</strong>{task.createdBy}</p>
            <p><strong>Doing</strong>{task.takenBy || "Unclaimed"}</p>
            <p><strong>Done by</strong>{task.completedBy || "Not done"}</p>
          </div>
        </div>

        {task.rowData && (
          <div className="row-data">
            {Object.entries(task.rowData.values).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{value || "-"}</strong>
              </div>
            ))}
          </div>
        )}

        {children.length > 0 && (
          <div>
            <h3 className="section-title">Rows in this batch</h3>
            <div className="batch-table">
              {children.map((child) => (
                <button key={child.id} onClick={() => onOpen(child.id)}>
                  <span>{child.title}</span>
                  <span>{statusLabels[child.status]}</span>
                  <span>{child.completedBy || child.takenBy || "Unclaimed"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="section-title">Comments</h3>
          <div className="comments">
            {comments.length === 0 ? (
              <p className="empty">No comments yet.</p>
            ) : (
              comments.map((item) => (
                <div key={item.id} className="comment">
                  <div>
                    <strong>{item.author}</strong>
                    <span>{new Date(item.createdAt).toLocaleString("en-GB")}</span>
                  </div>
                  <p>{item.body}</p>
                </div>
              ))
            )}
          </div>
          <form
            className="comment-form"
            onSubmit={(event) => {
              event.preventDefault();
              onComment(task.id, comment);
              setComment("");
            }}
          >
            <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" />
            <button className="button">Send</button>
          </form>
        </div>

        {children.length > 0 && allComments.some((item) => children.some((child) => child.id === item.taskId)) && (
          <p className="empty">Some row tasks also have their own comments. Open a row to view them.</p>
        )}
      </div>
    </div>
  );
}

function AddTaskModal({
  onClose,
  onSingle,
  onBatch,
}: {
  onClose: () => void;
  onSingle: (title: string, note: string) => void;
  onBatch: (title: string, paste: string, note: string) => void;
}) {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [paste, setPaste] = useState("");
  const parsed = parsePastedTable(paste);

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="text-sm text-[#59716d]">Create work</p>
            <h2>Add a task</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="status-row">
          <button className={`status-button ${mode === "single" ? "active" : ""}`} onClick={() => setMode("single")}>
            Single task
          </button>
          <button className={`status-button ${mode === "batch" ? "active" : ""}`} onClick={() => setMode("batch")}>
            Paste Excel rows
          </button>
        </div>

        <label>Task title</label>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Photograph used car stock" />

        <label>Discreet note</label>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional detail for the task" />

        {mode === "batch" && (
          <>
            <label>Paste rows from Excel</label>
            <textarea
              className="paste-box"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={"Reg\tModel\tColour\tPeg Number\nAB12 CDE\tC3 Aircross\tBlue\t47"}
            />
            {parsed.rows.length > 0 && (
              <p className="empty">{parsed.rows.length} row tasks will be created.</p>
            )}
          </>
        )}

        <button
          className="button wide"
          onClick={() => (mode === "single" ? onSingle(title, note) : onBatch(title, paste, note))}
        >
          <ClipboardList className="h-4 w-4" />
          Create
        </button>
      </div>
    </div>
  );
}
