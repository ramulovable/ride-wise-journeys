import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bike, User, Check, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { homePathForRole, isValidMobile, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import banner from "@/assets/shahin-welcome.png.asset.json";
import { BrandMark } from "@/components/BrandHeader";
import { InstallAppBar } from "@/components/InstallAppBar";
import { OtpField } from "@/components/OtpField";
import { PinField } from "@/components/PinField";
import { loginWithPin, lookupMobile, setPin, signupWithMobile } from "@/lib/pin.functions";
import {
  fetchPermissionPolicies,
  flushPermissionResults,
  readPermission,
  rememberPermission,
  requestPermission,
  type PermissionPolicy,
  type PermissionState,
} from "@/lib/permissions";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WelcomePage,
});

const REF_STORAGE_KEY = "shahin_referral_code";
const LANG_KEY = "shahin_language";
const PIN_LENGTH = 4;

type Step =
  "language" | "role" | "mobile" | "otp" | "permissions" | "profile" | "pin-create" | "pin-login";

type Mode = "signup" | "login" | "reset";

function useCapturedReferral(): string {
  const [code, setCode] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) {
      const clean = fromUrl.trim().toUpperCase().slice(0, 20);
      window.sessionStorage.setItem(REF_STORAGE_KEY, clean);
      setCode(clean);
      return;
    }
    setCode(window.sessionStorage.getItem(REF_STORAGE_KEY) ?? "");
  }, []);
  return code;
}

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const cleaned = message.replace(/^Error:\s*/i, "").trim();
  if (!cleaned || cleaned.length > 200 || /fetch|\{|\[/i.test(cleaned)) {
    return "Something went wrong. Please try again.";
  }
  return cleaned;
}

function WelcomePage() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session && role) void navigate({ to: homePathForRole(role), replace: true });
  }, [loading, session, role, navigate]);

  if (loading || (session && role)) return <Splash />;

  return (
    <main className="min-h-screen bg-muted/40">
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background shadow-xl">
        <header className="flex min-h-16 items-center gap-3 border-b border-border bg-card px-4 py-2.5">
          <BrandMark size={44} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-foreground">Shahin Travels</h1>
            <p className="text-xs font-medium text-primary">आपकी यात्रा, हमारी जिम्मेदारी!</p>
          </div>
        </header>

        <section className="relative h-28 overflow-hidden sm:h-36">
          <img
            src={banner.url}
            alt="Shahin Travels service area"
            className="h-full w-full object-cover object-bottom"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
        </section>

        <section className="relative -mt-5 flex-1 rounded-t-2xl bg-card px-5 pb-8 pt-5 shadow-lg">
          <Onboarding />
          <p className="mt-6 text-center text-xs">
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

function Splash() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <BrandMark size={72} />
      <p className="text-lg font-bold">Shahin Travels</p>
      <p className="text-xs text-primary">आपकी यात्रा, हमारी जिम्मेदारी!</p>
      <div className="h-1 w-24 animate-pulse rounded-full bg-primary/40" />
    </main>
  );
}

function Onboarding() {
  const { t, language, setLanguage } = useI18n();
  const [step, setStep] = useState<Step>("language");
  const [mode, setMode] = useState<Mode>("signup");
  const [role, setRole] = useState<"customer" | "rider">("customer");
  const [mobile, setMobile] = useState("");
  const [ticket, setTicket] = useState("");
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    address: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [referral, setReferral] = useState("");
  const captured = useCapturedReferral();

  useEffect(() => {
    if (captured) setReferral((current) => current || captured);
  }, [captured]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(LANG_KEY)) setStep("role");
  }, []);

  async function finishSession(tokenHash: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: tokenHash,
    });
    if (error || !data.user) throw new Error("We couldn't sign you in. Please try again.");
    const userId = data.user.id;
    await flushPermissionResults(userId);
    if (photo) {
      const extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/profile.${extension}`;
      const upload = await supabase.storage
        .from("profile-photos")
        .upload(path, photo, { upsert: true, contentType: photo.type });
      if (!upload.error)
        await supabase.from("profiles").update({ photo_url: path }).eq("id", userId);
    }
  }

  if (step === "language") {
    return (
      <LanguageStep
        current={language}
        onPick={(code) => {
          setLanguage(code);
          setStep("role");
        }}
      />
    );
  }

  if (step === "role") {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("role.title")}</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setRole("rider");
            setMode("signup");
            setStep("mobile");
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left transition hover:border-primary"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bike className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-semibold">{t("role.driver")}</span>
            <span className="block text-xs text-muted-foreground">{t("role.driverHint")}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setRole("customer");
            setMode("signup");
            setStep("mobile");
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-border p-4 text-left transition hover:border-primary"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </span>
          <span>
            <span className="block font-semibold">{t("role.customer")}</span>
            <span className="block text-xs text-muted-foreground">{t("role.customerHint")}</span>
          </span>
        </button>
        <Button
          variant="outline"
          className="h-11 w-full"
          onClick={() => {
            setMode("login");
            setStep("mobile");
          }}
        >
          {t("role.haveAccount")}
        </Button>
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline underline-offset-4"
          onClick={() => setStep("language")}
        >
          {t("lang.title")}
        </button>
      </div>
    );
  }

  if (step === "mobile") {
    return (
      <MobileStep
        mode={mode}
        value={mobile}
        onChange={setMobile}
        onBack={() => setStep("role")}
        onExistingWithPin={() => setStep("pin-login")}
        onNeedOtp={() => setStep("otp")}
      />
    );
  }

  if (step === "otp") {
    return (
      <OtpField
        mobile={mobile}
        purpose={mode === "signup" ? "signup" : "login"}
        onChangeNumber={() => setStep("mobile")}
        onVerified={async (result) => {
          if (mode === "signup") {
            if (!result.ticket) throw new Error("Verification failed. Please try again.");
            setTicket(result.ticket);
            setStep("permissions");
            return;
          }
          // Login or PIN reset: the code proves the number, then a new PIN is set.
          if (result.ticket) {
            setTicket(result.ticket);
          } else if (result.tokenHash) {
            // Older flow returns a session token; sign in and set the PIN afterwards.
            await finishSession(result.tokenHash);
            return;
          }
          setStep("pin-create");
        }}
      />
    );
  }

  if (step === "permissions") {
    return <PermissionStep role={role} onDone={() => setStep("profile")} />;
  }

  if (step === "profile") {
    return (
      <ProfileStep
        value={profile}
        onChange={setProfile}
        referral={referral}
        onReferralChange={setReferral}
        onPhoto={setPhoto}
        onBack={() => setStep("permissions")}
        onNext={() => setStep("pin-create")}
      />
    );
  }

  if (step === "pin-create") {
    return (
      <PinCreateStep
        mode={mode}
        onBack={() => setStep(mode === "signup" ? "profile" : "mobile")}
        onSubmit={async (pin) => {
          if (mode === "signup") {
            const result = await signupWithMobile({
              data: {
                mobile,
                ticket,
                role,
                pin,
                firstName: profile.firstName.trim(),
                lastName: profile.lastName.trim(),
                dateOfBirth: profile.dateOfBirth || undefined,
                address: profile.address.trim(),
                language,
                referralCode: referral.trim().toUpperCase(),
              },
            });
            await finishSession(result.tokenHash);
            toast.success(role === "rider" ? t("signup.riderPending") : t("signup.done"));
            return;
          }
          const result = await setPin({ data: { mobile, ticket, pin } });
          await finishSession(result.tokenHash);
          toast.success("Your PIN is ready.");
        }}
      />
    );
  }

  return (
    <PinLoginStep
      mobile={mobile}
      onBack={() => setStep("mobile")}
      onForgot={() => {
        setMode("reset");
        setStep("otp");
      }}
      onSuccess={finishSession}
    />
  );
}

function LanguageStep({ current, onPick }: { current: string; onPick: (code: string) => void }) {
  const { t } = useI18n();
  const languages = useQuery({
    queryKey: ["languages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("languages")
        .select("code, native_name, english_name")
        .eq("is_active", true)
        .order("sort_order");
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{t("lang.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("lang.subtitle")}</p>
      </div>
      <div className="grid max-h-[55vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
        {(languages.data ?? []).map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => onPick(lang.code)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              current === lang.code ? "border-primary bg-primary/10" : "border-border"
            }`}
          >
            <span className="block text-sm font-semibold">{lang.native_name}</span>
            <span className="block text-[11px] text-muted-foreground">{lang.english_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileStep({
  mode,
  value,
  onChange,
  onBack,
  onExistingWithPin,
  onNeedOtp,
}: {
  mode: Mode;
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onExistingWithPin: () => void;
  onNeedOtp: () => void;
}) {
  const { t } = useI18n();
  const lookup = useServerFn(lookupMobile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValidMobile(value)) {
      setError(t("mobile.invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await lookup({ data: { mobile: value } });
      if (mode === "signup" && result.exists) {
        setError(
          `This mobile number is already registered as a ${result.role === "rider" ? "Driver" : "Customer"}. Please log in with your existing account.`,
        );
        return;
      }
      if (mode !== "signup" && !result.exists) {
        setError("No account found for this number.");
        return;
      }
      if (mode !== "signup" && result.hasPin) onExistingWithPin();
      else onNeedOtp();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-base font-semibold">{t("mobile.title")}</h2>
      <div className="space-y-1.5">
        <Label htmlFor="mobile">{t("mobile.label")}</Label>
        <Input
          id="mobile"
          autoFocus
          inputMode="numeric"
          maxLength={10}
          placeholder="9876543210"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          className="h-11 text-base"
        />
        <p className="text-xs text-muted-foreground">{t("mobile.hint")}</p>
      </div>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? t("common.pleaseWait") : t("common.continue")}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        {t("common.back")}
      </button>
    </form>
  );
}

function PermissionStep({ role, onDone }: { role: "customer" | "rider"; onDone: () => void }) {
  const { t } = useI18n();
  const [states, setStates] = useState<Record<string, PermissionState>>({});
  const policies = useQuery({
    queryKey: ["permission-policies", role],
    queryFn: () => fetchPermissionPolicies(role),
  });

  useEffect(() => {
    const list = policies.data ?? [];
    if (!list.length) return;
    void Promise.all(
      list.map(
        async (policy) =>
          [policy.permission_key, await readPermission(policy.permission_key)] as const,
      ),
    ).then((entries) => setStates(Object.fromEntries(entries)));
  }, [policies.data]);

  const list = (policies.data ?? []).filter(
    (policy) => policy.permission_key === "location" || policy.permission_key === "notifications",
  );
  const blocked = list.some(
    (policy) => policy.is_mandatory && states[policy.permission_key] !== "granted",
  );

  async function ask(policy: PermissionPolicy) {
    const result = await requestPermission(policy.permission_key);
    rememberPermission(policy.permission_key, result);
    setStates((current) => ({ ...current, [policy.permission_key]: result }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t("perm.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("perm.subtitle")}</p>
      </div>
      <div className="space-y-3">
        {list.map((policy) => {
          const state = states[policy.permission_key] ?? "prompt";
          return (
            <div key={policy.permission_key} className="rounded-2xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {policy.display_name}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {policy.is_mandatory ? t("perm.required") : t("perm.optional")}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{policy.description}</p>
                </div>
                {state === "granted" ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-primary">
                    <Check className="h-4 w-4" /> {t("perm.granted")}
                  </span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => void ask(policy)}>
                    {t("perm.allow")}
                  </Button>
                )}
              </div>
              {state === "denied" ? (
                <p className="mt-2 text-xs font-medium text-destructive">{t("perm.denied")}</p>
              ) : null}
            </div>
          );
        })}
      </div>
      {blocked ? (
        <p className="rounded-xl bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {t("perm.blockedTitle")} — drivers cannot go online without location access. Please allow
          it here, or enable it in your phone settings for this site.
        </p>
      ) : null}
      <Button className="h-11 w-full" disabled={blocked} onClick={onDone}>
        {t("common.continue")}
      </Button>
    </div>
  );
}

type ProfileValue = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: string;
};

function ProfileStep({
  value,
  onChange,
  referral,
  onReferralChange,
  onPhoto,
  onBack,
  onNext,
}: {
  value: ProfileValue;
  onChange: (value: ProfileValue) => void;
  referral: string;
  onReferralChange: (value: string) => void;
  onPhoto: (file: File | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (value.firstName.trim().length < 2) {
      toast.error("Please enter your first name.");
      return;
    }
    if (value.address.trim().length > 200) {
      toast.error("Address must be under 200 characters.");
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <h2 className="text-base font-semibold">{t("profile.title")}</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="first-name">{t("profile.firstName")}</Label>
          <Input
            id="first-name"
            value={value.firstName}
            onChange={(e) => onChange({ ...value, firstName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last-name">{t("profile.lastName")}</Label>
          <Input
            id="last-name"
            value={value.lastName}
            onChange={(e) => onChange({ ...value, lastName: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dob">{t("profile.dob")}</Label>
        <Input
          id="dob"
          type="date"
          value={value.dateOfBirth}
          onChange={(e) => onChange({ ...value, dateOfBirth: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">{t("profile.address")}</Label>
        <Input
          id="address"
          maxLength={200}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="House, area, city"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="referral">{t("profile.referral")}</Label>
        <Input
          id="referral"
          maxLength={20}
          value={referral}
          onChange={(e) => onReferralChange(e.target.value.toUpperCase())}
          placeholder="ST8K4P2X"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="photo">{t("profile.photo")}</Label>
        <Input
          id="photo"
          type="file"
          accept="image/*"
          onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
        />
      </div>
      <Button type="submit" className="h-11 w-full">
        {t("common.continue")}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        {t("common.back")}
      </button>
    </form>
  );
}

function PinCreateStep({
  mode,
  onBack,
  onSubmit,
}: {
  mode: Mode;
  onBack: () => void;
  onSubmit: (pin: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [stage, setStage] = useState<"create" | "confirm">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(value: string) {
    if (value !== pin) {
      setError(t("pin.mismatch"));
      setConfirm("");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(pin);
    } catch (err) {
      setError(readableError(err));
      setStage("create");
      setPinValue("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">
          {stage === "create"
            ? t("pin.createTitle", { length: PIN_LENGTH })
            : t("pin.confirmTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {mode === "signup"
            ? "You will use this PIN every time you log in."
            : "Set a new PIN for your account."}
        </p>
      </div>
      {stage === "create" ? (
        <PinField
          value={pin}
          onChange={setPinValue}
          length={PIN_LENGTH}
          disabled={busy}
          onComplete={() => {
            setError(null);
            setStage("confirm");
          }}
        />
      ) : (
        <PinField
          value={confirm}
          onChange={setConfirm}
          length={PIN_LENGTH}
          disabled={busy}
          onComplete={(value) => void finish(value)}
        />
      )}
      {error ? <p className="text-center text-xs font-medium text-destructive">{error}</p> : null}
      {busy ? (
        <p className="text-center text-xs text-muted-foreground">{t("signup.creating")}</p>
      ) : null}
      <button
        type="button"
        onClick={() => (stage === "confirm" ? setStage("create") : onBack())}
        className="w-full text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        {t("common.back")}
      </button>
    </div>
  );
}

function PinLoginStep({
  mobile,
  onBack,
  onForgot,
  onSuccess,
}: {
  mobile: string;
  onBack: () => void;
  onForgot: () => void;
  onSuccess: (tokenHash: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const login = useServerFn(loginWithPin);
  const [pin, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await login({ data: { mobile, pin: value } });
      await onSuccess(result.tokenHash);
    } catch (err) {
      setPinValue("");
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">{t("pin.loginTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("pin.loginSubtitle")}</p>
      </div>
      <PinField
        value={pin}
        onChange={setPinValue}
        length={PIN_LENGTH}
        disabled={busy}
        onComplete={(value) => void submit(value)}
      />
      {error ? <p className="text-center text-xs font-medium text-destructive">{error}</p> : null}
      <Button
        className="h-11 w-full"
        disabled={busy || pin.length !== PIN_LENGTH}
        onClick={() => void submit(pin)}
      >
        {busy ? t("common.pleaseWait") : t("pin.login")}
      </Button>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground underline underline-offset-4"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          onClick={onForgot}
          className="font-medium text-primary underline underline-offset-4"
        >
          {t("pin.forgot")}
        </button>
      </div>
    </div>
  );
}
