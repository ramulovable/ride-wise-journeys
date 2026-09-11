import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { homePathForRole, useAuth, type AppRole } from "@/lib/auth";

/** Sends users to their own area if they open a section for a different role. */
export function useRoleGuard(expected: AppRole) {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !role) return;
    if (role !== expected) void navigate({ to: homePathForRole(role) as "/app", replace: true });
  }, [role, loading, expected, navigate]);

  return { allowed: role === expected, loading: loading || !role };
}
