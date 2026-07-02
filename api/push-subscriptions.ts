import { createClient } from "@supabase/supabase-js";

declare const process: {
  env: Record<string, string | undefined>;
};

type VercelRequest = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function requiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function bearerToken(header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

function publicError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : "";

  if (message.includes("Missing VAPID_PUBLIC_KEY")) {
    return "Team Tasks is missing VAPID_PUBLIC_KEY in Vercel";
  }

  if (message.startsWith("Missing ")) {
    return "Team Tasks is missing a Supabase or notification setting in Vercel";
  }

  if (message.includes("task_push_subscriptions") && message.includes("does not exist")) {
    return "Run supabase-task-push.sql in Supabase first";
  }

  if (message.includes("permission denied")) {
    return "Supabase permissions need updating: run supabase-task-push.sql again";
  }

  return message || "Unable to save notification settings";
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const token = bearerToken(request.headers.authorization);
    if (!token) return response.status(401).json({ error: "Unauthorised" });

    const supabase = createClient(
      requiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
      requiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return response.status(401).json({ error: "Please sign in again" });
    }

    if (request.method === "GET") {
      return response.status(200).json({ publicKey: requiredEnv("VAPID_PUBLIC_KEY") });
    }

    if (request.method !== "POST") {
      return response.status(405).json({ error: "Method not allowed" });
    }

    const { subscription } = (request.body ?? {}) as { subscription?: PushSubscriptionBody };

    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return response.status(400).json({ error: "Invalid push subscription" });
    }

    const { error } = await supabase.from("task_push_subscriptions").upsert(
      {
        user_id: authData.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: request.headers["user-agent"] ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) throw error;

    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Task push subscription error", error);
    return response.status(500).json({ error: publicError(error) });
  }
}
