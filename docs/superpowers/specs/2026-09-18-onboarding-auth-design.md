# Onboarding + Supabase Auth — Design Spec

**Date:** 2026-09-18
**Status:** Approved for planning

## 1. Goal

Give PromptVault an optional onboarding/auth flow so a user can:
- Use the app immediately with zero account (local-only personal vault — unchanged default).
- Opt into Supabase Auth (email/password + Google SSO) when they want cloud sync/backup.
- After first successful login, push their existing local prompts to Supabase so they aren't lost, and keep future prompts syncing.

This spec covers **onboarding + auth + first sync only**. Group vaults (invite codes), full bidirectional conflict resolution, and Import/Export JSON backup are out of scope — they get their own specs later (Import/Export already has technical notes in `AGENTS.md`).

## 2. Non-goals

- No mandatory login. Guests must never be blocked from the core loop (save/search/copy).
- No custom auth backend/API — Supabase Auth is used directly via `@supabase/supabase-js`.
- No Apple Sign-In in this pass (Google only). Revisit if/when publishing to the App Store.
- No two-way realtime sync engine. First-login push is a one-time upload; ongoing sync is "local writes flow up when online," not full conflict resolution (matches the personal-vault-is-local-first / group-vault-is-online-only split already decided in AGENTS.md).

## 3. Assumptions carried from prior discussion

- A Supabase project already exists with Email/Password and Google OAuth providers enabled in the dashboard. This spec does not cover provisioning the Supabase project itself, only wiring the Expo app to it.
- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` will be provided as Expo public env vars (not committed).

## 4. Screens & Flow

```
App launch
  └─ index.tsx (existing local-first home) — UNCHANGED as default entry
        └─ "Đăng nhập để đồng bộ" entry point (button/menu item)
              └─ Welcome screen
                    ├─ [Dùng ngay] → dismiss, stay local-only (sets a local flag so it isn't shown again)
                    └─ [Đăng nhập / Đăng ký] → Auth screen
                          ├─ Email/Password form
                          │     ├─ Sign up: email, password, first_name, last_name, username
                          │     └─ Sign in: email, password
                          └─ [Tiếp tục với Google] → supabase.auth.signInWithOAuth (Google)
                                └─ On success (either path) → Sync Prompt screen
                                      ├─ [Đồng bộ ngay] → push local prompts to Supabase
                                      └─ [Để sau] → skip, go to home (already authenticated)
```

- The Welcome screen is reachable any time from an existing "Account" entry point in the app (not just on first launch) — this is not a first-run gate.
- Once a session exists (`supabase.auth.getSession()` resolves with a session), the Welcome/Auth screens are skipped and the entry point shows account state instead (e.g., "Đã đồng bộ với <email>").

## 5. Data model

### Supabase (Postgres)

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  first_name text not null,
  last_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
```

```sql
-- prompts table (cloud), mirrors local schema from AGENTS.md, scoped to the user's personal vault
create table public.prompts (
  id text primary key,          -- UUID, generated client-side, same id as local row
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  category text,
  tags text,
  is_favorite integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null
);

alter table public.prompts enable row level security;

create policy "prompts_all_own" on public.prompts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Username uniqueness is enforced by the `unique` constraint; a sign-up attempt with a taken username surfaces a client-side error ("Username đã được sử dụng") from the resulting Postgres error, not a pre-check query.

### Local (expo-sqlite)

Add one column to the existing `prompts` table (per AGENTS.md v2 schema):

```sql
ALTER TABLE prompts ADD COLUMN synced_at INTEGER;
```

`synced_at IS NULL` marks a row as never pushed. After a successful push, it's set to the push timestamp.

## 6. Auth integration

- New module `src/lib/supabase.ts`: creates and exports the `supabase` client (`createClient` with `AsyncStorage`-backed session persistence — `@react-native-async-storage/async-storage` needs to be added as a dependency, it isn't in package.json yet).
- New module `src/lib/auth.ts`: thin wrappers —
  - `signUpWithEmail({ email, password, firstName, lastName, username })` → calls `supabase.auth.signUp`, then inserts the `profiles` row.
  - `signInWithEmail({ email, password })` → `supabase.auth.signInWithPassword`.
  - `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })` opened via `expo-web-browser`'s `openAuthSessionAsync`, redirect URI built from `app.json`'s `scheme` (`propmtvaults://`).
  - `getSession()` / `onAuthStateChange()` passthroughs used by the root layout to decide whether to show the "Đã đồng bộ" state.
- New module `src/lib/sync.ts`: `pushLocalPromptsToCloud()` — reads all local prompts where `synced_at IS NULL OR updated_at > synced_at`, upserts them to `public.prompts` in a batch, then updates local `synced_at`.

## 7. Error handling

- Network/Supabase errors during sign up/in surface as inline form errors (not silent failures) — map known Supabase error codes (`user_already_exists`, `invalid_credentials`, unique-violation on `username`) to Vietnamese copy; unknown errors show a generic "Có lỗi xảy ra, thử lại sau."
- If `pushLocalPromptsToCloud()` partially fails (some rows upsert, some don't), the successfully-synced rows still get `synced_at` updated — failure is per-row, not all-or-nothing, so a retry only re-attempts the rows still missing `synced_at`.
- Losing network mid-OAuth: `signInWithOAuth`'s browser flow simply fails to redirect back; treat as cancelled sign-in, return to Auth screen with no error dialog (matches "don't trigger blocking dialogs").

## 8. Testing

- Unit tests for `src/lib/auth.ts` and `src/lib/sync.ts` against a mocked `supabase-js` client (no live network in tests).
- Manual test plan (run via `run` skill against Expo dev server): guest flow never sees auth screens; sign-up creates a `profiles` row; sign-in with wrong password shows inline error; Google SSO round-trips back to the app; sync pushes local prompts and sets `synced_at`.

## 9. Staged rollout

- **Stage 1 — Local groundwork:** add `synced_at` column + migration, add `src/lib/supabase.ts` client setup, add env vars and `@react-native-async-storage/async-storage` dependency. No UI yet; nothing user-visible changes.
- **Stage 2 — Email/password auth:** Welcome screen, Auth screen (sign up + sign in forms), `src/lib/auth.ts` email methods, session-aware entry point in the existing UI. Google button not wired yet (hidden/disabled).
- **Stage 3 — Google SSO:** wire `signInWithGoogle()`, OAuth redirect handling, enable the Google button.
- **Stage 4 — Sync:** `src/lib/sync.ts`, Sync Prompt screen, "Đồng bộ ngay / Để sau" choice after login.

Each stage ships a working, independently testable slice; Stage 1 alone changes nothing user-facing, Stage 2 alone gives working email auth without SSO or sync, etc.
