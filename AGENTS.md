<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Server-fn bearer middleware is src/lib/fast-auth-attacher.ts (getSession capped at 3s) — a stalled token refresh must never block login requests.
- Field employees are rows in public.field_employees (not an app_role); founder = existing admin role. Employee access is checked server-side in src/lib/field.functions.ts — keeps the auth/role enum untouched and employees can never gain admin powers like the Blue Tick.
- Driver online eligibility = approved, not blocked, and (subscription valid OR rider_details.commission_plan_active); keep DB triggers/RPCs and every TS eligibility query in sync.
- financial_ledger is append-only (amounts immutable, no deletes); corrections are new entries.

- AI assistant Ayesha = pre-generated state video clips (idle/speak/check/coffee) + src/lib/ayesha.functions.ts: Gemini first, Groq only on Gemini 429, Groq Whisper for speech-to-text — avoids paid streaming-avatar subscriptions and never mixes engines in one reply.