import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const broadcastInput = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(500),
  audience: z.enum(["all", "customers", "riders"]),
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

    const roles =
      data.audience === "all"
        ? ["customer", "rider"]
        : data.audience === "customers"
          ? ["customer"]
          : ["rider"];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", roles as never);
    if (roleError) throw new Error(roleError.message);

    const userIds = Array.from(new Set((roleRows ?? []).map((row) => row.user_id)));
    if (userIds.length === 0) throw new Error("No people found for this audience yet.");

    const { data: broadcast, error: broadcastError } = await supabaseAdmin
      .from("broadcast_messages")
      .insert({
        title: data.title,
        body: data.body,
        audience: data.audience,
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
              if (status === 404 || status === 400) {
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
