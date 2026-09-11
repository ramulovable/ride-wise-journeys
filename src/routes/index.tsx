import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { homePathForRole, isValidMobile, mobileToEmail, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import banner from "@/assets/shahin-welcome.png.asset.json";
import { BrandMark } from "@/components/BrandHeader";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shahin Travels — Book a ride in Darbhanga" },
      {
        name: "description",
        content:
          "Sign in to Shahin Travels to book E-Rickshaw, bike and car rides across Darbhanga. आपकी यात्रा, हमारी जिम्मेदारी.",
      },
      { property: "og:title", content: "Shahin Travels — Book a ride in Darbhanga" },
      {
        property: "og:description",
        content: "Safe rides, reliable service, affordable fares, on-time always.",
      },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session && role) void navigate({ to: homePathForRole(role), replace: true });
  }, [loading, session, role, navigate]);

  return (
    <main className="min-h-screen bg-muted/40">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background shadow-xl">
        <header className="flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
          <BrandMark size={44} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-foreground">Shahin Travels</h1>
            <p className="text-xs font-medium text-primary">आपकी यात्रा हमारी जिम्मेदारी</p>
          </div>
        </header>

        <section className="relative h-32 overflow-hidden sm:h-40">
          <img
            src={banner.url}
            alt="Shahin Travels service area"
            className="h-full w-full object-cover object-bottom"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        </section>

        <section className="relative -mt-5 flex-1 rounded-t-2xl bg-card px-5 pb-6 pt-5 shadow-lg">
          <AuthCard />

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Ride • Book • Reach — a safer & smarter tomorrow
          </p>
          <p className="mt-2 text-center text-xs">
            <Link to="/admin-login" className="text-muted-foreground underline underline-offset-4">
              Admin login
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

function AuthCard() {
  return (
    <Tabs defaultValue="login">
      <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg">
        <TabsTrigger value="login">Login</TabsTrigger>
        <TabsTrigger value="signup">Create account</TabsTrigger>
      </TabsList>
      <TabsContent value="login" className="pt-3">
        <LoginForm />
      </TabsContent>
      <TabsContent value="signup" className="pt-3">
        <SignupForm />
      </TabsContent>
    </Tabs>
  );
}

function LoginForm() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidMobile(mobile)) {
      toast.error("Enter a valid 10-digit mobile number starting with 6-9.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: mobileToEmail(mobile),
      password,
    });
    setBusy(false);
    if (error) toast.error("Wrong mobile number or password.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div className="space-y-1.5">
        <Label htmlFor="login-mobile">Mobile number</Label>
        <Input
          id="login-mobile"
          inputMode="numeric"
          maxLength={10}
          placeholder="9876543210"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          className="h-10"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          className="h-10"
        />
      </div>
      <Button type="submit" className="h-10 w-full" disabled={busy}>
        {busy ? "Signing in…" : "Login"}
      </Button>
    </form>
  );
}

function SignupForm() {
  const [role, setRole] = useState<"customer" | "rider">("customer");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fullName.trim().length < 2) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!isValidMobile(mobile)) {
      toast.error("Enter a valid 10-digit mobile number starting with 6-9.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: mobileToEmail(mobile),
      password,
      options: { data: { mobile, full_name: fullName.trim(), role } },
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("already")
          ? "This mobile number is already registered."
          : error.message,
      );
      return;
    }
    toast.success(
      role === "rider"
        ? "Account created. Complete your vehicle details next."
        : "Account created.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["customer", "rider"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-xl border px-3 py-3 text-sm font-medium capitalize transition ${
              role === r
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {r === "customer" ? "I need a ride" : "I am a driver"}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-name">Full name</Label>
        <Input
          id="su-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-mobile">Mobile number</Label>
        <Input
          id="su-mobile"
          inputMode="numeric"
          maxLength={10}
          placeholder="9876543210"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-password">Password</Label>
        <Input
          id="su-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
