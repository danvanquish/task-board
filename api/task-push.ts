import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

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

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type ProfileRow = {
  user_id: string;
  site: string | null;
  can_access_tasks: boolean | null;
  access_disabled?: boolean | null;
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

function configurePush() {
  webpush.setVapidDetails(
    requiredEnv("VAPID_SUBJECT"),
    requiredEnv("VAPID_PUBLIC_KEY"),
    requiredEnv("VAPID_PRIVATE_KEY")
  );
}

async function sendPush(subscriptions: PushSubscriptionRow[], payload: unknown) {
  configurePush();

  await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload)
      )
    )
  );
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = bearerToken(request.headers.authorization);
    if (!token) return response.status(401).json({ error: "Unauthorised" });

    const { site, message, taskId } = (request.body ?? {}) as {
      site?: string;
      message?: string;
      taskId?: string;
    };

    if (!site || !message) {
      return response.status(400).json({ error: "Notification details are required" });
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      return response.status(401).json({ error: "Please sign in again" });
    }

    const { data: profileData, error: profileError } = await userClient
      .from("profiles")
      .select("user_id, site, can_access_tasks, access_disabled")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const currentProfile = profileData as ProfileRow | null;
    if (
      !currentProfile ||
      currentProfile.site !== site ||
      currentProfile.can_access_tasks === false ||
      currentProfile.access_disabled === true
    ) {
      return response.status(403).json({ error: "You cannot notify this team" });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: recipientProfiles, error: recipientError } = await adminClient
      .from("profiles")
      .select("user_id, site, can_access_tasks, access_disabled")
      .eq("site", site)
      .neq("user_id", authData.user.id);

    if (recipientError) throw recipientError;

    const recipientIds = ((recipientProfiles ?? []) as ProfileRow[])
      .filter((profile) => profile.can_access_tasks !== false && profile.access_disabled !== true)
      .map((profile) => profile.user_id);

    if (recipientIds.length === 0) {
      return response.status(200).json({ sent: 0 });
    }

    const { data: subscriptions, error: subscriptionError } = await adminClient
      .from("task_push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", recipientIds);

    if (subscriptionError) throw subscriptionError;

    await sendPush((subscriptions ?? []) as PushSubscriptionRow[], {
      title: "DD25 Team Tasks",
      body: message,
      url: taskId ? `/?task=${taskId}` : "/",
    });

    return response.status(200).json({ sent: (subscriptions ?? []).length });
  } catch (error) {
    console.error("Task push error", error);
    return response.status(500).json({ error: "Unable to send task notification" });
  }
}
