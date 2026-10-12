import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const broadcastInput = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(500),
  audience: z.enum(["all", "customers", "riders", "person"]),
  userId: z.string().uuid().optional(),
  actionPath: z.string().trim().min(1).max(200).default("/"),
});

/** Admin: send one announcement to every customer, every driver, or both. */
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => broadcastInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can send announcements.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userIds: string[] = [];
    if (data.audience === "person") {
      if (!data.userId) throw new Error("Choose the person to notify.");
      userIds = [data.userId];
    } else {
    const roles =
      data.audience === "all"
        ? ["customer", "rider"]
        : data.audience === "customers"
          ? ["customer"]
          : ["rider"];

    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", roles as never);
    if (roleError) throw new Error(roleError.message);

    userIds = Array.from(new Set((roleRows ?? []).map((row) => row.user_id)));
    }
    if (userIds.length === 0) throw new Error("No people found for this audience yet.");

    const { data: broadcast, error: broadcastError } = await supabaseAdmin
      .from("broadcast_messages")
      .insert({
        title: data.title,
        body: data.body,
        audience:
          data.audience === "person" ? `person:${data.userId}` : data.audience,
        action_path: data.actionPath,
        recipient_count: userIds.length,
        sent_by: userId,
      })
      .select("id")
      .single();
    if (broadcastError) throw new Error(broadcastError.message);

    const { data: inserted } = await supabaseAdmin
      .from("notifications")
      .insert(
        userIds.map((id) => ({
          user_id: id,
          title: data.title,
          body: data.body,
          channel: "push",
          data: { path: data.actionPath, broadcastId: broadcast.id } as never,
          delivered: false,
        })),
      )
      .select("id, user_id");

    let delivered = 0;
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const fcmKey = process.env["FIREBASE_MESSAGING_API_KEY"];

    if (lovableKey && fcmKey) {
      const { data: devices } = await supabaseAdmin
        .from("notification_devices")
        .select("user_id, push_token")
        .eq("is_active", true)
        .in("user_id", userIds);

      await Promise.all(
        (devices ?? []).map(async (device) => {
          try {
            const response = await fetch(
              "https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${lovableKey}`,
                  "X-Connection-Api-Key": fcmKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token: device.push_token,
                    notification: { title: data.title, body: data.body },
                    data: { path: data.actionPath, title: data.title, body: data.body },
                    android: {
                      priority: "HIGH",
                      notification: {
                        sound: "default",
                        channel_id: "ride_alerts",
                        notification_priority: "PRIORITY_HIGH",
                      },
                    },
                    apns: {
                      headers: { "apns-priority": "10" },
                      payload: { aps: { sound: "default" } },
                    },
                    webpush: {
                      headers: { Urgency: "high", TTL: "3600" },
                      notification: {
                        title: data.title,
                        body: data.body,
                        icon: "/favicon.png",
                        badge: "/favicon.png",
                        tag: `broadcast-${broadcast.id}`,
                      },
                      fcm_options: { link: data.actionPath },
                    },
                  },
                }),
              },
            );
            if (response.ok) {
              delivered += 1;
              const row = inserted?.find((item) => item.user_id === device.user_id);
              if (row) {
                await supabaseAdmin
                  .from("notifications")
                  .update({ delivered: true })
                  .eq("id", row.id);
              }
            } else {
              const status = response.status;
              if (status === 404) {
                await supabaseAdmin
                  .from("notification_devices")
                  .update({ is_active: false })
                  .eq("push_token", device.push_token);
              }
            }
          } catch (error) {
            console.error("Broadcast push failed", error);
          }
        }),
      );

      await supabaseAdmin
        .from("broadcast_messages")
        .update({ delivered_count: delivered })
        .eq("id", broadcast.id);
    }

    return { ok: true, recipients: userIds.length, delivered };
  });

/** Admin: history of announcements already sent. */
export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("broadcast_messages")
      .select("id, title, body, audience, recipient_count, delivered_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Admin: find customers/drivers by name or mobile for a personal notification. */
export const searchNotifyUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ q: z.string().trim().min(2).max(40) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can search people.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const term = data.q.replace(/[%,()]/g, "");
    const { data: people, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, mobile, photo_url")
      .or(`full_name.ilike.%${term}%,mobile.ilike.%${term}%`)
      .limit(15);
    if (error) throw new Error(error.message);
    const ids = (people ?? []).map((p) => p.id);
    const [{ data: roles }, { data: devices }] = await Promise.all([
      ids.length ? supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
      ids.length ? supabaseAdmin.from("notification_devices").select("user_id").eq("is_active", true).in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string }[] }),
    ]);
    return (people ?? []).map((p) => {
      const r = (roles ?? []).filter((x) => x.user_id === p.id).map((x) => String(x.role));
      return {
        ...p,
        role: r.includes("rider") ? "Driver" : r.includes("admin") ? "Admin" : "Customer",
        hasPhone: (devices ?? []).some((d) => d.user_id === p.id),
      };
    });
  });

/** Names for personal notifications in history. */
export const namesForUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return {} as Record<string, string>;
    const { data: rows } = await context.supabase.from("profiles").select("id, full_name, mobile").in("id", data.ids);
    return Object.fromEntries((rows ?? []).map((r) => [r.id, r.full_name || r.mobile])) as Record<string, string>;
  });
