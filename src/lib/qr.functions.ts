import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public: resolves a printed vehicle QR token to the driver's referral code so
 * old and new QR codes both open signup with the code already filled in.
 * Returns only non-sensitive display info.
 */
export const resolveVehicleQr = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string().min(4).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vehicle } = await supabaseAdmin
      .from("rider_vehicles")
      .select("rider_id, vehicle_number, brand_name, vehicle_model")
      .eq("qr_token", data.token)
      .maybeSingle();
    if (!vehicle) return null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, full_name, my_referral_code, is_blocked")
      .eq("id", vehicle.rider_id)
      .maybeSingle();
    if (!profile || profile.is_blocked) return null;
    return {
      driverName: profile.first_name || profile.full_name.split(" ")[0] || "Driver",
      vehicle: [vehicle.brand_name, vehicle.vehicle_model].filter(Boolean).join(" ") || null,
      vehicleNumber: vehicle.vehicle_number,
      referralCode: profile.my_referral_code,
    };
  });
