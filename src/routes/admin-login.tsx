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
    <main className="min-h-screen bg-muted/40">
      <div className="mx-auto min-h-screen w-full max-w-md bg-background shadow-xl">
        <header className="flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
          <BrandMark size={44} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-foreground">Shahin Travels</h1>
            <p className="text-xs font-medium text-primary">आपकी यात्रा हमारी जिम्मेदारी</p>
          </div>
        </header>
        <section className="px-5 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-foreground">Admin login</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to manage travel operations.
            </p>
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
        </section>
      </div>
    </main>
  );
}
