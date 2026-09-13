import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "rider" | "customer";

export type Profile = {
  id: string;
  mobile: string;
  full_name: string;
  photo_url: string | null;
  address: string | null;
  my_referral_code: string | null;
};

export type RiderDetails = {
  user_id: string;
  vehicle_category_id: string | null;
  vehicle_number: string | null;
  vehicle_model: string | null;
  license_number: string | null;
  seat_capacity: number;
  base_location_id: string | null;
  is_approved: boolean;
  is_blocked: boolean;
  is_online: boolean;
  subscription_valid_until: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: Profile | null;
  riderDetails: RiderDetails | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const MOBILE_DOMAIN = "shahintravels.app";
export const mobileToEmail = (mobile: string) => `${mobile}@${MOBILE_DOMAIN}`;
export const isValidMobile = (mobile: string) => /^[6-9]\d{9}$/.test(mobile);

export function subscriptionActive(rider: RiderDetails | null): boolean {
  if (!rider?.is_approved || rider.is_blocked || !rider.subscription_valid_until) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${rider.subscription_valid_until}T00:00:00`) >= today;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [riderDetails, setRiderDetails] = useState<RiderDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string | null) => {
    if (!uid) {
      setRole(null);
      setProfile(null);
      setRiderDetails(null);
      return;
    }
    const [roleRes, profileRes, riderRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("profiles")
        .select("id, mobile, full_name, photo_url, address, my_referral_code")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("rider_details").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const roles = (roleRes.data ?? []).map((r) => r.role as AppRole);
    setRole(
      roles.includes("admin")
        ? "admin"
        : roles.includes("rider")
          ? "rider"
          : (roles[0] ?? "customer"),
    );
    setProfile((profileRes.data as Profile) ?? null);
    setRiderDetails((riderRes.data as RiderDetails) ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      void load(next?.user?.id ?? null);
    });
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await load(data.session?.user?.id ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await load(data.session?.user?.id ?? null);
  }, [load]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, role, profile, riderDetails, loading, refresh }),
    [session, role, profile, riderDetails, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function homePathForRole(role: AppRole | null): string {
  if (role === "admin") return "/admin";
  if (role === "rider") return "/rider";
  return "/app";
}
