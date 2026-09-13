import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { InstallAppBar } from "@/components/InstallAppBar";

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
      <InstallAppBar offsetNav={false} />
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
  const [mode, setMode] = useState<"password" | "otp">("password");

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-2">
        {(["password", "otp"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
              mode === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {value === "password" ? "Login with password" : "Login with OTP"}
          </button>
        ))}
      </div>
      {mode === "password" ? <PasswordLoginForm /> : <OtpLoginForm />}
    </div>
  );
}

function PasswordLoginForm() {
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

function OtpLoginForm() {
  const [mobile, setMobile] = useState("");
  const [verifying, setVerifying] = useState(false);

  if (verifying) {
    return (
      <OtpField
        mobile={mobile}
        purpose="login"
        onChangeNumber={() => setVerifying(false)}
        onVerified={async (result) => {
          if (!result.tokenHash) throw new Error("We couldn't sign you in. Please try again.");
          const { error } = await supabase.auth.verifyOtp({
            type: "magiclink",
            token_hash: result.tokenHash,
          });
          if (error) throw new Error("We couldn't sign you in. Please try again.");
        }}
      />
    );
  }

  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isValidMobile(mobile)) {
          toast.error("Enter a valid 10-digit mobile number starting with 6-9.");
          return;
        }
        setVerifying(true);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="otp-mobile">Mobile number</Label>
        <Input
          id="otp-mobile"
          inputMode="numeric"
          maxLength={10}
          placeholder="9876543210"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
          className="h-10"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        We will send a 6-digit code by SMS to this number.
      </p>
      <Button type="submit" className="h-10 w-full">
        Send code
      </Button>
    </form>
  );
}

const SIGNUP_ATTEMPT_KEY = "shahin-signup-attempts";
const SIGNUP_WINDOW_MS = 10 * 60_000;
const SIGNUP_MAX_ATTEMPTS = 5;

function signupThrottled() {
  if (typeof window === "undefined") return false;
  const now = Date.now();
  let attempts: number[] = [];
  try {
    attempts = (
      JSON.parse(window.localStorage.getItem(SIGNUP_ATTEMPT_KEY) ?? "[]") as number[]
    ).filter((time) => typeof time === "number" && now - time < SIGNUP_WINDOW_MS);
  } catch {
    attempts = [];
  }
  if (attempts.length >= SIGNUP_MAX_ATTEMPTS) return true;
  attempts.push(now);
  window.localStorage.setItem(SIGNUP_ATTEMPT_KEY, JSON.stringify(attempts));
  return false;
}

function SignupForm() {
  const [role, setRole] = useState<"customer" | "rider">("customer");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState("");
  const [referral, setReferral] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const confirmVerified = useServerFn(assertSignupVerified);

  function onSubmit(e: React.FormEvent) {
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
    if (address.trim().length > 200) {
      toast.error("Address must be under 200 characters.");
      return;
    }
    if (photo && photo.size > 5 * 1024 * 1024) {
      toast.error("Profile photo must be smaller than 5 MB.");
      return;
    }
    if (signupThrottled()) {
      toast.error("Too many attempts. Please wait a few minutes and try again.");
      return;
    }
    setVerifying(true);
  }

  async function createAccount(ticket: string) {
    await confirmVerified({ data: { mobile, ticket } });
    setBusy(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: mobileToEmail(mobile),
      password,
      options: {
        data: {
          mobile,
          full_name: fullName.trim(),
          role,
          address: address.trim(),
          referral_code: referral.trim().toUpperCase(),
        },
      },
    });
    if (error) {
      setBusy(false);
      setVerifying(false);
      toast.error(
        error.message.includes("already")
          ? "This mobile number is already registered."
          : error.message,
      );
      return;
    }

    const userId = signUpData.user?.id;
    if (photo && signUpData.session && userId) {
      const extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/profile.${extension}`;
      const upload = await supabase.storage
        .from("profile-photos")
        .upload(path, photo, { upsert: true, contentType: photo.type });
      if (upload.error) toast.error("Account created, but the photo could not be uploaded.");
      else await supabase.from("profiles").update({ photo_url: path }).eq("id", userId);
    }
    const enteredCode = referral.trim().toUpperCase();
    if (enteredCode && signUpData.session && userId) {
      const { count } = await supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referred_user_id", userId);
      if (!count) {
        toast.error("That referral code could not be applied, but your account was created.");
      }
    }
    setBusy(false);
    toast.success(
      role === "rider"
        ? "Account created. An administrator will review and approve your driver account."
        : "Account created.",
    );
  }

  if (verifying) {
    return (
      <div className="space-y-4">
        <OtpField
          mobile={mobile}
          purpose="signup"
          onChangeNumber={() => setVerifying(false)}
          onVerified={async (result) => {
            if (!result.ticket) throw new Error("Verification failed. Please try again.");
            await createAccount(result.ticket);
          }}
        />
        {busy ? (
          <p className="text-center text-xs text-muted-foreground">Creating your account…</p>
        ) : null}
      </div>
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
      <div className="space-y-1.5">
        <Label htmlFor="su-address">Address</Label>
        <Input
          id="su-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="House, area, city"
          maxLength={200}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-referral">Referral code (optional)</Label>
        <Input
          id="su-referral"
          value={referral}
          onChange={(e) => setReferral(e.target.value.toUpperCase())}
          placeholder="SHAHIN123"
          maxLength={20}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su-photo">Profile photo (optional)</Label>
        <Input
          id="su-photo"
          type="file"
          accept="image/*"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
