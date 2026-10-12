import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Saves the phone's push token for the signed-in user on the server, so the
 * token is reassigned even if this phone was earlier used by another account
 * (a browser upsert is blocked by row security in that case).
 */
export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(20).max(4096),
        deviceType: z.enum(["android", "web"]).default("android"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notification_devices").upsert(
      {
        user_id: context.userId,
        push_token: data.token,
        device_type: data.deviceType,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "push_token" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
