import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/BrandHeader";

export const Route = createFileRoute("/admin-login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin login — Shahin Travels" },
      { name: "description", content: "Staff login for the Shahin Travels control panel." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin login — Shahin Travels" },
      { property: "og:description", content: "Staff login for the Shahin Travels control panel." },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const { session, role } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session && role === "admin") void navigate({ to: "/admin", replace: true });
  }, [session, role, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) toast.error("Wrong email or password.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-foreground px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark size={44} />
          <div>
            <h1 className="text-base font-bold text-foreground">Admin control panel</h1>
            <p className="text-xs text-muted-foreground">Shahin Travels staff only</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs">
          <Link to="/" className="text-muted-foreground underline underline-offset-4">
            Back to app
          </Link>
        </p>
      </div>
    </main>
  );
}
