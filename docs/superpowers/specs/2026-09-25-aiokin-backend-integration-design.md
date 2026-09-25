# PromptVault → AioKin Backend Integration — Design Spec

**Date:** 2026-09-25
**Status:** Draft, awaiting review
**Replaces (runtime behaviour, not the documents):** the Supabase Auth + `supabase.from('prompts')` design in `2026-09-18-onboarding-auth-design.md` §5–§6 and `src/lib/sync.ts`.
**Backend source of truth (repo `AioKin`, read-only from here):**

| Ref | Document | What this spec takes from it |
|---|---|---|
| B-AUTH | `docs/auth-opaque-tokens-biometric.md` | §4 device fields, §5 biometric wire sequence, §6 API table, §7 locked decisions (ECDSA P-256, DER) |
| B-OPQ | `docs/superpowers/plans/2026-09-25-opaque-access-tokens.md` | "this plan changes no request/response shape" |
| B-SES | `docs/superpowers/plans/2026-09-25-token-session-management.md` | `deviceId`/`deviceName`/`platform` on login/refresh/verify-otp; `GET/DELETE /account/sessions` |
| B-BIO | `docs/superpowers/plans/2026-09-25-biometric-device-login.md` | `/auth/biometric/*` DTOs, Task 3–4 |
| B-SPC | `docs/superpowers/plans/2026-09-25-promptvault-space-and-prompt-domain.md` | `/spaces/*`, read-only `/prompts` |
| B-SYN | `docs/superpowers/plans/2026-09-25-promptvault-sync-engine.md` | `/sync/push`, `/sync/pull`, `/sync/conflicts/{id}/resolve` |
| B-MRG | `docs/superpowers/specs/2026-09-25-promptvault-merge-design.md` | §6 sync model, §7 client architecture |
| B-CODE | `AioKin/Controllers/Auth/AuthController.cs`, `Account/AccountController.cs`, `Common/OperationResultHttpExtensions.cs`, `Models/**` | endpoints that exist **today** |

## 1. Goal

The Expo app stops talking to Supabase. All auth goes through the AioKin ASP.NET Core API (opaque bearer tokens), and prompts sync two-way with the backend's Space/Prompt domain through the offline-first outbox → `/sync/push` / `/sync/pull` engine, with Git-style conflicts resolved by the user in a side-by-side screen. When the work is done the app has **no Supabase client, dependency or env var**.

## 2. Binding decisions (from the user) and non-goals

1. Auth moves entirely to AioKin. No Supabase Auth, no `supabase.from(...)`. Supabase remains only the backend's database host.
2. Android Kotlin app is paused — out of scope.
3. One backend for all clients. The app requests **no client-specific endpoints**; anything missing is listed in §15 "Backend gaps" instead of being designed around silently.

Non-goals: tags/variables UI, prompt version history, AI enrichment, team member management UI (see gap G3), Facebook login.

Guest mode stays: the app is usable with no account (`welcome.tsx` "Dùng ngay, không cần tài khoản"). Nothing in this spec gates local use behind login.

## 3. Current state of the app (what we reuse)

| File | Today | Fate |
|---|---|---|
| `src/services/apiClient.ts` | `fetch` wrapper, `ApiError(status, message)`, base URL `EXPO_PUBLIC_API_BASE_URL` | **Extended**: envelope unwrapping, error codes, bearer, refresh-on-401 |
| `src/lib/secureStorage.ts` | `LargeSecureStore` (AES in AsyncStorage, key in SecureStore) | **Kept** — still backs the persisted `authStore` (user profile, flags) |
| `src/lib/db.ts` | SQLite v2: `vaults`, `prompts`(+`copy_count`), `prompts_fts` + 3 triggers | **Migrated** to v3 (§9) |
| `src/lib/prompts.ts` | CRUD on local `prompts` | **Extended**: writes to synced spaces also enqueue outbox rows in the same transaction |
| `src/lib/auth.ts`, `supabase.ts`, `sync.ts` | Supabase Auth / table sync | **Deleted** |
| `src/store/authStore.ts` | persisted `user`, `hasOnboarded`, `keepSignedIn`; built from Supabase `Session` | **Rewritten** on top of `/account/me` |
| `src/store/sessionStore.ts` | holds a Supabase `Session`, unused by screens | **Deleted** |
| `src/lib/biometric.ts`, `appLock.ts` | local app lock (expo-local-authentication) | **Unchanged**; biometric *login* is a separate feature (§8) |
| `src/lib/oauthState.ts` | suppresses app-lock while the OAuth browser is open | Kept (reused by biometric prompt) |
| `src/app/onboarding/*` | welcome, signup, verify-email, login, forgot-password, sync | Rewired (§6); new `reset-password` screen |
| `src/app/vault-switcher.tsx` | hard-coded "Kho cá nhân" | Becomes the Space switcher (§10) |

Test harness: `jest-expo` preset, `__mocks__/expo-sqlite.js` backed by `better-sqlite3` in-memory. The mock has no `withTransactionAsync` today — the plan adds it.

## 4. API client

### 4.1 Response shapes the client must handle (verified in B-CODE / plans)

| Endpoint | Success body | Source |
|---|---|---|
| `POST /auth/login` | **raw** `TokenResponse` — snake_case: `access_token`, `refresh_token`, `expires_in`, `token_type`, `scope` | `AuthController.Login` → `Ok(new TokenResponse{…})`; `TokenResponse` has `[JsonPropertyName("access_token")]` etc. |
| `POST /auth/refresh-token` | **raw** `TokenResponse` (snake_case) | `AuthController.RefreshToken` |
| `POST /auth/verify-otp` | **201** `OperationResult`, `data = { accessToken, refreshToken, expiresIn, tokenType, user: LoginResponse }` (camelCase anonymous object) | `AuthController.VerifyOtp` |
| `POST /auth/biometric/challenge` | **raw** `{ challengeId, nonce }` | B-BIO Task 4 Step 3: `=> Ok(await _biometricAuthService.ChallengeAsync(request))` |
| `POST /auth/biometric/verify` | `OperationResult`, `data = TokenResponse` (snake_case inside the envelope) | B-BIO Task 3 `VerifyAsync` → `OperationResult.Ok("…", new TokenResponse{…})` |
| everything else the app calls | `OperationResult { success, errorCode, message, data }` | `OperationResult.cs` |
| `/posts`, `/todos`, `/ability/rules` | unwrapped (B-AUTH §6) — **the app does not call them** | — |

Every **error** body (4xx/5xx) is an `OperationResult` with `errorCode` — including model-validation failures (`Program.cs` `InvalidModelStateResponseFactory` → 422 `ValidationError`) and rate-limit rejections (`RateLimitingSetup.OnRejected` → 429 `TooManyRequests`).

### 4.2 Client contract

- `apiClient.get/post/put/patch/delete<T>(path, body?, options?)`; `options.envelope` defaults to `true` (unwrap `data`); pass `envelope: false` for the raw endpoints above. `options.auth` (default `false`) attaches `Authorization: Bearer <access>`.
- Unwrapping: if `envelope` and the body has boolean `success`, return `body.data` when `success`, otherwise throw `ApiError`.
- `ApiError { status, code, message }`: `code = body.errorCode ?? 'http_<status>'`; network failure (fetch throws) → `ApiError(0, 'network', …)`.
- `normalizeTokens()` accepts both snake_case and camelCase token objects.

### 4.3 Refresh on 401 (single-flight)

Only requests sent with `auth: true` participate (a 401 from `/auth/login` is `InvalidCredentials`, not an expired session). On 401:

1. If a refresh is already in flight, await the same promise (module-level `refreshing: Promise<boolean> | null`).
2. Otherwise `POST /auth/refresh-token { refreshToken, deviceId, deviceName, platform }` (raw response). The backend **rotates** the refresh token (revokes the old one first), so concurrent refreshes would log the user out — hence single-flight.
3. Success → store the new pair, retry the original request **once**. Failure (`InvalidRefreshToken`/`UserInactive`/any 401) → `clearTokens('expired')`; listeners (authStore) drop the user; the original call rejects with `ApiError(401, 'session_expired')`.
4. Network error during refresh → do **not** clear tokens (offline ≠ logged out); reject with `network`.

Proactive refresh is not needed: opaque tokens carry no expiry claim, and `expires_in` is stored only to skip an obviously dead access token (refresh first if `now > expiresAt - 30s`).

## 5. Token storage and device identity

- `src/lib/tokenStore.ts`: one JSON item `aiokin.tokens = { accessToken, refreshToken, expiresAt }` in `expo-secure-store` with `keychainAccessible: AFTER_FIRST_UNLOCK` (background sync must read it while the phone is locked). Opaque tokens are ~88 chars, well under SecureStore's 2 KB value guidance, so `LargeSecureStore` is not needed here.
- `onTokensCleared(listener)` event (`reason: 'signout' | 'expired'`) replaces Supabase's `onAuthStateChange`.
- `src/lib/deviceIdentity.ts`: `deviceId = Crypto.randomUUID()` generated once, stored in SecureStore `aiokin.deviceId` (same accessibility). `deviceName = Device.deviceName ?? Device.modelName ?? 'Unknown device'`, `platform = Platform.OS` (`'android' | 'ios' | 'web'`, matching B-SES's documented values). Sent on login, verify-otp and refresh. **Safe today**: ASP.NET ignores unknown JSON properties, so these fields are harmless before B-SES lands.
- The same `deviceId` is used as `SyncPushRequest.deviceId` (B-SYN) and `RegisterBiometricRequest.deviceId` (B-BIO) — one identity, per B-MRG §6.5.

## 6. Auth flows, screen by screen

| Screen | Action | Endpoint (request → response) | Notes |
|---|---|---|---|
| `signup.tsx` | "Đăng ký" | `POST /auth/register {username, email, password}` → envelope, no data | `RegisterRequest` has **no name fields**. Full name travels as a route param to verify-email. Errors: `EmailExists`→email, `UsernameExists`→username, `EmailSendFailed`/`OtpGenerationFailed`→form. Registration is held in Redis for the OTP window; no user row exists until verify. |
| `verify-email.tsx` | "Tạo tài khoản" | `POST /auth/verify-otp {email, otpCode, deviceId, deviceName, platform}` → 201 envelope `{accessToken, refreshToken, expiresIn, tokenType, user}` | Store tokens; then best-effort `PATCH /account/me {firstName, lastName}` (exists today, `UpdateProfileRequest`); then `GET /account/me`. Errors: `InvalidOtp`→code, `RegistrationDataNotFound`→form "Phiên đăng ký đã hết hạn, vui lòng đăng ký lại", `Conflict`→form. |
| `verify-email.tsx` | "Gửi lại" | `POST /auth/resend-otp {email}` | Backend enforces the same 60 s cooldown as the UI (`TooManyRequests`). |
| `login.tsx` | "Đăng nhập" | `POST /auth/login {usernameOrPhoneOrEmail, password, deviceId, deviceName, platform}` → raw TokenResponse | Field label becomes "Email hoặc username" (backend accepts username/phone/email). Then `GET /account/me`. Errors: `InvalidCredentials`→password, `AccountLocked`/`UserInactive`→form (fixed Vietnamese messages; the server's are unaccented Vietnamese). The old `email_not_confirmed` branch is removed: unverified sign-ups have no user row, so they get `InvalidCredentials`. |
| `forgot-password.tsx` | "Gửi" | `POST /auth/forgot-password {email}` → always 200 | Then `push('resetPassword', {email})`. |
| **new** `reset-password.tsx` step 1 | enter 6-digit OTP | `POST /auth/forgot-password/verify-otp {email, otpCode}` | Backend e-mails an 8-char **temporary password** valid 3 min (`data.expiresInMinutes`). |
| `reset-password.tsx` step 2 | temp password + new password | `POST /auth/reset-password {email, temporaryPassword, newPassword}` | Then `replace('login', {email})`. Backend revokes all sessions. `InvalidTemporaryPassword`→field. |
| `profile.tsx` | "Đăng xuất" | `POST /auth/logout {refreshToken}` (auth) | Best-effort: tokens are cleared locally even if offline. Local data of synced spaces is wiped (§10.3). |
| root `_layout.tsx` | cold start | `GET /account/me` if tokens exist | `keepSignedIn === false` → logout + clear on cold start (preserves today's "Duy trì đăng nhập" semantics). |

`authStore.user` is built from `LoginResponse` (`userID`, `firstName`, `lastName`, `email`, `username`, …). `AuthUser` keeps its shape (`id, email, username, firstName, lastName`) so `format.ts`/profile screens don't change; it gains optional `userCode` (populated only once gap G2 is closed).

Password rule stays `MIN_PASSWORD_LENGTH = 6` (backend `LoginRequest`/`RegisterRequest` `MinLength(6)`).

### 6.1 OAuth (Google)

What the backend actually does (`AuthController`): `GET /auth/login/google` issues a cookie-based `Challenge`; Google redirects to the middleware callback; `GET /auth/finalize/google` returns an **HTML page that calls `window.opener.postMessage(payload, targetOrigin)` and closes itself**. There is no redirect to a caller-supplied URL and no token in a URL.

Consequences for Expo:
- `WebBrowser.openAuthSessionAsync` (ASWebAuthenticationSession / Custom Tabs) resolves only when the browser navigates to the app's redirect scheme (`propmtvaults://…`). The finalize page never navigates; `window.opener` is `null`, so the payload is lost. **Does not work.**
- Hosting the flow in a `react-native-webview` and shimming `window.opener` would technically capture the payload, but Google rejects OAuth in embedded WebViews (`disallowed_useragent`). **Not viable.**

**Decision:** remove the Supabase Google flow and **hide the Google buttons** on signup/login until gap G1 is closed. The client work for G1 (≈1 task: `openAuthSessionAsync(apiBase + '/auth/login/google?…', redirectUri)`, parse the returned URL, exchange if needed, store tokens) is written in a follow-up plan once the backend contract exists — it is deliberately not guessed here.

## 7. Sessions screen (depends on B-SES)

`src/app/sessions.tsx`, reached from Profile → "Thiết bị đăng nhập".
- `GET /account/sessions` (auth) → envelope `data: [{ id, deviceName, platform, issuedAt, isCurrent }]` (B-SES Task 3 `SessionResponse`; `issuedAt` is `IssuedAtUnix`, seconds).
- Row: device name (fallback "Thiết bị không rõ"), platform, "Đăng nhập lúc …", badge "Thiết bị này" when `isCurrent`.
- "Đăng xuất" on a non-current row → `DELETE /account/sessions/{id}` → reload. The current row offers the normal sign-out instead.
- Access sessions are not revoked on refresh, so one device may appear more than once until old access tokens expire (TTL `Jwt:ExpiryMinutes`). Shown as-is; see gap G7.

## 8. Biometric login (depends on B-BIO + gap G2)

Two distinct features, kept distinct in code and UI:

| | App lock (exists) | Biometric login (new) |
|---|---|---|
| Purpose | hide the UI when returning to the app | obtain fresh tokens without a password |
| Code | `appLock.ts` + `biometric.ts` (expo-local-authentication) | `biometricLogin.ts` + `biometricSignature.ts` |
| Server involvement | none | `/auth/biometric/register|challenge|verify|{deviceId}` |
| Settings row | "Khoá bằng vân tay / Face ID" | "Đăng nhập bằng vân tay / Face ID" (signed-in only) |

### 8.1 Library evaluation

Requirement (B-AUTH §5, §7): hardware-backed **ECDSA P-256** private key that requires biometrics per use; public key as **SPKI base64**; signature `SHA256withECDSA` over the **raw nonce bytes** (server does `Convert.FromBase64String(nonce)`), **DER** (`Rfc3279DerSequence`).

| Option | Verdict |
|---|---|
| `expo-local-authentication` | Only yes/no auth; no keys. ✗ |
| `expo-secure-store` (`requireAuthentication`) | Stores secrets, cannot generate or sign with a key. ✗ |
| `react-native-biometrics` (SelfLender) | `createKeys()` makes **RSA-2048** only. ✗ |
| Passkeys (`react-native-passkey`) | Signs `authenticatorData ‖ clientDataHash`, not the raw nonce; needs RP domain association. Incompatible with B-BIO's verify. ✗ |
| **`@sbaiahmed1/react-native-biometrics`** | `createKeys(alias, 'ec256', …)` → EC P-256 in Secure Enclave / Android Keystore (StrongBox when available); public key is "base64 X.509 SubjectPublicKeyInfo DER on both platforms"; `signWithOptions({ data, inputEncoding: 'base64', algorithm: 'SHA256withECDSA', disableDeviceFallback: true })` → base64 signature; ships an Expo config plugin; needs a dev build (app already uses `expo run:*`). **Signature encoding is not documented.** Native APIs underneath (`Signature.getInstance("SHA256withECDSA")`, `SecKeyCreateSignature(.ecdsaSignatureMessageX962SHA256)`) emit DER, but we don't rely on that. ✓ chosen |
| Local Expo Module (Kotlin + Swift, ~200 lines) | Full control, guaranteed DER; costs native code we must maintain. Fallback. |

**Decision:** use `@sbaiahmed1/react-native-biometrics`, wrapped behind `src/lib/biometricLogin.ts`, and normalise signatures in JS with `ensureDerSignature()` (64-byte raw `r‖s` → DER; DER passes through; anything else throws). This makes the undocumented encoding irrelevant, and is unit-tested against Node's `crypto` (sign with `dsaEncoding: 'ieee-p1363'`, convert, verify with `'der'`). If the library fails to build on RN 0.86 / Expo 57 (first step of the task is a device spike), switch to the local Expo Module behind the same `biometricLogin.ts` interface — no other file changes.

### 8.2 Flows

- **Enable** (signed in): `createKeys('aiokin.biometric', 'ec256')` → `POST /auth/biometric/register {deviceId, deviceName, platform, publicKey}` (auth). Save `{ userCode, email }` to SecureStore `aiokin.biometricLogin`.
- **Login** (login screen shows "Đăng nhập bằng vân tay / Face ID" when that item exists): `POST /auth/biometric/challenge {userCode, deviceId}` (raw) → sign `nonce` → `POST /auth/biometric/verify {challengeId, signature}` → envelope `TokenResponse` → store tokens → `GET /account/me`. Any failure the server reports is `InvalidCredentials` by design — show "Không đăng nhập được bằng sinh trắc học, hãy dùng mật khẩu." User cancelling the OS prompt is not an error.
- **Disable**: `DELETE /auth/biometric/{deviceId}` (auth, best-effort) + `deleteKeys` + remove the SecureStore item.
- A different account signing in on the device disables the previous account's biometric login (keys deleted locally).
- Normal sign-out keeps biometric login (that is its purpose).

`userCode` is required by `BiometricChallengeRequest` but **no endpoint returns it to the client today** (`LoginResponse` has no `UserCode`) → gap G2. The feature ships hidden until `/account/me` returns `userCode`.

## 9. Local SQLite schema (v2 → v3)

```
spaces        (id TEXT PK,                         -- spaceUuid, or LOCAL_SPACE_ID
               kind TEXT CHECK(kind IN ('local','personal','family','team')),
               name TEXT, can_manage INTEGER, created_at INTEGER)
prompts       (id TEXT PK, space_id TEXT REFERENCES spaces(id), title, content, category, tags,
               is_favorite, copy_count, created_at, updated_at, synced_at,
               version INTEGER NOT NULL DEFAULT 0,   -- last server version known; 0 = never pushed
               has_conflict INTEGER NOT NULL DEFAULT 0)
prompts_fts   (unchanged, rebuilt)
sync_outbox   (seq INTEGER PK AUTOINCREMENT, space_id, prompt_id,
               operation CHECK IN ('insert','update','delete'), base_version INTEGER,
               in_flight INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, last_error TEXT, created_at)
sync_state    (space_id TEXT PK, cursor INTEGER NOT NULL DEFAULT 0, last_pulled_at INTEGER)
sync_conflicts(conflict_id TEXT PK, space_id, prompt_id, local_payload TEXT NULL, remote_payload TEXT,
               remote_version INTEGER, created_at)
```

Migration (one transaction inside `migrate()`, `PRAGMA user_version = 3`):
1. `CREATE TABLE spaces`; copy the single `vaults` row as `kind='local'`, name "Trên máy này". `PERSONAL_VAULT_ID` is renamed `LOCAL_SPACE_ID` (same UUID value, so existing rows need no rewrite).
2. `vaults.type` has `CHECK(type IN ('personal','group'))` and `prompts.vault_id` has an FK to it, so the prompts table is **rebuilt**: create `prompts_v3`, `INSERT … SELECT rowid, …` (rowids preserved so FTS stays aligned), drop old triggers + table, rename, recreate the three triggers, `INSERT INTO prompts_fts(prompts_fts) VALUES('rebuild')`, drop `vaults`.
3. Create `sync_outbox`, `sync_state`, `sync_conflicts`.

All existing prompts land in the local space with `version = 0`. Nothing is uploaded by the migration itself.

**Categories.** The server wants `categoryId` (client-generated UUID) + `categoryName`; the app only offers the fixed `PROMPT_CATEGORIES`. The client derives `categoryId = uuidFromSha256(spaceId + ':' + name.toLowerCase())` (RFC 9562 v8 layout), so every device — and every re-install — produces the same id for "Marketing" in a given space, which satisfies B-SYN's Review Focus ("must not silently create a duplicate with a different id"). On pull, `category_id` is mapped back by recomputing the ids of `PROMPT_CATEGORIES`; an unknown id (created by another client) becomes `category = null` (gap G5).

**Favorites and copy count stay device-local.** `PromptPayload` has no `isFavorite`/`usageCount`, and the server's `is_favorite` is per-prompt, not per-user; applying it on pull would wipe local favourites. Pull never touches `is_favorite`/`copy_count` (gap G6).

## 10. Spaces

### 10.1 Model
- `LOCAL_SPACE_ID` ("Trên máy này") — always present; the only space for guests.
- Remote spaces mirror `GET /spaces/me` → envelope `data: SpaceResponse[] = [{ spaceUuid, spaceType: 'Personal'|'Family'|'Team', name, canManage, createdAtMillis }]` (B-SPC Task 3–4). The backend auto-creates the personal space on this call.
- `spaceStore` (zustand, persisted in AsyncStorage) holds `currentSpaceId` and `ownerUserId` (whose synced data is in SQLite). After login it switches to the personal space; after sign-out back to `LOCAL_SPACE_ID`.

### 10.2 Vault switcher → Space switcher
`vault-switcher.tsx` lists `spaces` from SQLite (instant) and refreshes from `/spaces/me` on focus. Personal is labelled "Kho cá nhân", family/team show their names with a group icon. "Tạo kho mới" → dialog → `POST /spaces/team {name}` → envelope `data: SpaceResponse` → insert, switch. Guests see only the local space and the "Tạo kho mới" row routes to login. Member management is out of scope (gap G3).

### 10.3 First login: adopting local prompts
`onboarding/sync.tsx` becomes the adoption screen, shown after every successful sign-in:
- `fetchAndStoreMySpaces()`; count prompts in `LOCAL_SPACE_ID`.
- If 0 → skip straight home.
- Else: "Đưa N prompt trên máy này vào Kho cá nhân của <email>?" → **"Đưa lên"**: in one transaction, `UPDATE prompts SET space_id = <personal>, version = 0` and insert one `sync_outbox` row `(insert, base_version 0)` per prompt; then `requestSync()`. **"Để sau"**: prompts stay local; the screen is reachable again from Settings → "Sao lưu & đồng bộ".
- Idempotent: an adopted prompt is no longer in the local space, so re-running adopts only newer local prompts.

**Sign-out** deletes rows of all non-local spaces (prompts, outbox, state, conflicts, spaces). If the outbox is non-empty the user is warned first ("Có N thay đổi chưa đồng bộ. Đăng xuất sẽ mất chúng.") and `requestSync()` is attempted. Local-space prompts are never touched.

## 11. Outbox, push, pull

### 11.1 Writes (all spaces except `local`)
`createPrompt/updatePrompt/deletePrompt` write the row **and** call `enqueue()` in the same SQLite transaction, then `requestSync()` (debounced 2 s). `setFavorite`/`recordCopy` do not enqueue (§9).

`enqueue(promptId, op)` coalesces against the prompt's pending row **with `in_flight = 0`**:

| pending | new | result |
|---|---|---|
| none | any | insert row; `base_version = prompts.version` (0 for new) |
| insert | update | keep insert |
| insert | delete | delete the outbox row (server never saw it) |
| update | update | keep update (original base) |
| update | delete | becomes delete (original base) |

A row already `in_flight` is never modified — a new row is added instead, so an edit made during a push is not lost.

Payloads are built **at push time** from the current row: `{ title, content, description: null, categoryId, categoryName, tags: [], variables: [] }` (B-SYN `PromptPayload`), `null` for delete.

### 11.2 Push — `POST /sync/push`
Per space, batches of 50 oldest rows: mark `in_flight = 1`, send `{ spaceUuid, deviceId, entities: [{ promptId, operation, baseVersion, payload }] }`. Response envelope `data: [{ promptId, status: 'applied'|'conflict', newVersion?, remote?, conflictId? }]` (B-SYN Task 2 `SyncPushResponse`, `remote` is `PromptDetailResponse { promptId, title, content, description, version, hasConflict, tags, variables }`).
- `applied` → delete outbox row; `prompts.version = newVersion` (when present), `synced_at = now`.
- `conflict` → delete outbox row; **if the remote content equals what we sent** (title+content+description) — the lost-response retry of an insert, which B-SYN answers with a conflict because the retried insert arrives with `baseVersion 0` — resolve it with `keep_remote` immediately and set `version = remote.version` (identical content, so no data is chosen over other data; no LWW). Otherwise store `sync_conflicts` row, set `prompts.has_conflict = 1`.
- HTTP/network error → `in_flight = 0`, `attempts += 1`, `last_error`. `Forbidden` (removed from space) → drop that space locally on next `/spaces/me` refresh.

### 11.3 Pull — `GET /sync/pull?spaceUuid=&since=`
Query names from B-SYN Task 3 Step 5 (`[FromQuery] Guid spaceUuid, [FromQuery] long since`). Response `data: { isSnapshot, snapshotUrl, changes: [{ syncLogId, entityType, entityId, operation, payloadJson, version }], resumeCursor }`.
- Incremental: for each `entityType === 'prompt'` change, `payloadJson` is `to_jsonb(vault.prompts row)` (B-SYN Task 1 trigger) — snake_case: `title, content, description, category_id, version, is_deleted, has_conflict, updated_date, …`. `space_id` inside it is the **internal** id; ignore it. Skip prompts that have a pending outbox row (the push will surface any conflict). `operation === 'delete'` or `is_deleted` → delete locally; else upsert (keeps local `is_favorite`/`copy_count`). Store `resumeCursor` in `sync_state` in the same transaction.
- Snapshot (`isSnapshot: true`): `snapshotUrl` is the object-storage **path** returned by `SupabaseStorageService.UploadAsync` and needs the service key — not downloadable by a client (gap G4). Fallback using existing endpoints: `GET /prompts?spaceUuid=` (ids) + `GET /prompts/{id}?spaceUuid=` (content, version) per prompt, replace all non-pending rows of that space, then `cursor = resumeCursor`. Category is lost on this path (`PromptDetailResponse` has no category, gap G5).

### 11.4 Triggers — background sync
`syncEngine.runSync()` is single-flight; for each non-local space: push until the outbox is empty (max 10 rounds), then pull. Triggers (B-MRG §7):
- after local writes (`requestSync`, 2 s debounce);
- app foreground (`AppState` → `active`) and after sign-in;
- connectivity regained (`expo-network` `addNetworkStateListener`, `isInternetReachable` false→true);
- periodic in background: `expo-background-task` + `expo-task-manager`, task `promptvault-sync`, `minimumInterval: 15` (minutes). The OS decides actual timing; this is best-effort.
- manual: pull-to-refresh / "Đồng bộ ngay".

Signed out → `runSync` is a no-op.

## 12. Conflict UI

- Prompt detail shows a "Prompt này có xung đột đồng bộ — Giải quyết" banner when `has_conflict = 1`.
- `src/app/conflict.tsx` (`promptId` param): side-by-side (stacked on narrow screens) "Bản của bạn" / "Bản trên máy chủ" reusing the `prompt-edit` field shell (B-MRG §6.3/§7). Actions:
  - **Giữ bản của tôi** → `POST /sync/conflicts/{conflictId}/resolve {resolution: 'keep_local'}`.
  - **Giữ bản máy chủ** → `{resolution: 'keep_remote'}`; local row := remote payload.
  - **Gộp** → opens the edit fields prefilled with the local version → `{resolution: 'merged', mergedPayload}`.
- After resolve: delete the `sync_conflicts` row, `has_conflict = 0`, then `runSync()` so the pull brings the server's new version (the resolve response carries none — gap G8).
- **Delete-vs-edit** (`local_payload` is null): the server's `keep_local` deserialises the stored `"null"` payload and returns `ValidationError` (B-SYN Task 4 Step 4). UI offers "Khôi phục bản máy chủ" (`keep_remote`, re-insert locally) or "Vẫn xoá" (`keep_remote`, then enqueue `delete` with `base_version = remote_version`). Composition of existing endpoints; gap G9 records it.

## 13. Error handling and offline behaviour

| Condition | Behaviour |
|---|---|
| No network | Local reads/writes always work; outbox accumulates; sync retries on reconnect. Auth screens show "Không có kết nối mạng." (`ApiError.code === 'network'`). |
| 401 on authed call | single-flight refresh (§4.3); refresh fails → `user = null`, alert "Phiên đăng nhập đã hết hạn". Unlike an explicit sign-out, synced-space rows and the outbox are **kept**, so signing in again with the same account resumes and pushes them. `spaceStore.ownerUserId` remembers whose data it is; signing in as a different account wipes synced spaces first (§10.3). |
| 403 `Forbidden` on sync | space removed from `/spaces/me` refresh; its local rows dropped. |
| 422 `ValidationError` | show `message` (server joins validation messages). |
| 429 `TooManyRequests` | show server message; sync backs off to next trigger. |
| 5xx / `EmailSendFailed` | generic "Có lỗi xảy ra, thử lại sau." |
| Pull apply throws mid-way | transaction rolls back, cursor unchanged, next pull repeats (idempotent upserts). |

Error-code → field mapping lives in `authForm.ts` (`toAuthError`), keyed by `ApiError.code`.

## 14. Testing

Jest (`jest-expo`) as today. Pure logic and SQLite code are unit-tested against the `better-sqlite3` mock; HTTP by stubbing `globalThis.fetch`. Native modules (`expo-secure-store`, `expo-device`, `expo-network`, `expo-background-task`, `@sbaiahmed1/react-native-biometrics`) are `jest.mock`ed. Every task leaves `npx jest src` and `npx tsc --noEmit` green. Device checks (biometric spike, background task) are manual steps in the plan.

## 15. Backend gaps

None of these is client-specific; each is needed by any mobile client (including the paused Kotlin app).

| # | Gap | Impact on this app | Suggested backend change |
|---|---|---|---|
| G1 | OAuth finalize only `postMessage`s to `window.opener` (`AuthController.BuildOAuthPopupHtml`) | Google sign-in impossible from native (system browser has no opener; Google blocks WebViews) | Allow-listed native redirect: `GET /auth/login/google?redirectUri=` → finalize 302s to `redirectUri?code=<one-time>`; `POST /auth/oauth/exchange {code, deviceId, deviceName, platform}` → TokenResponse. Also thread `DeviceInfo` (B-SES Task 2 Step 6 explicitly leaves OAuth as `DeviceInfo.Unknown`). |
| G2 | No endpoint returns the caller's `UserCode` (`LoginResponse` lacks it), yet `/auth/biometric/challenge` and `/spaces/{uuid}/members` require it | biometric login and team invites unusable | Add `userCode` to `LoginResponse` (`/account/me`, verify-otp). |
| G3 | Team spaces: no list-members / remove-member / leave endpoints | only "create team" is built | `GET/DELETE /spaces/{uuid}/members…` |
| G4 | `/sync/pull` snapshot returns a storage **path** that requires the service key | snapshot path unusable; client falls back to N+1 `/prompts` calls | Signed URL, or `GET /sync/snapshots/{id}` streaming the gzip JSON |
| G5 | Categories: no `GET` for a space's categories; `PromptDetailResponse` has no category; pull payload has only `category_id` | categories from other clients show as none | `GET /prompts/categories?spaceUuid=` or `categoryName` in pull/detail |
| G6 | `isFavorite`/`usageCount` not in `PromptPayload`; `is_favorite` is per prompt, not per user | favourites and copy counts stay device-local | per-user favourite table + push field, or document as local-only |
| G7 | Access sessions are not revoked on refresh | sessions list shows duplicates per device | revoke the previous access session of the same `deviceId` on refresh, or group by `deviceId` in `GET /account/sessions` |
| G8 | Resolve response has no new `version` | extra pull required after resolve | return `newVersion` |
| G9 | Delete-vs-edit conflict: `keep_local` fails (`LocalPayloadJson` is `"null"`) | client composes keep_remote + re-delete | support delete resolution |
| G10 | Retried `insert` (lost response) is answered as a conflict (existing row, `Version 1 != baseVersion 0`) although B-SYN Review Focus says inserts are idempotent | client auto-resolves identical-content conflicts | treat `insert` with identical payload as `applied` |
| G11 | `ResolveConflictAsync` does not check that the conflict's prompt belongs to a space the caller is a member of | security (IDOR on resolve) | resolve via `ISpaceContext` |
| G12 | Push `update` replaces tags/variables wholesale; clients without tag/variable UI (this app) send `[]` and wipe them; `GET /prompts/{id}` returns tag names without ids, so they can't be round-tripped | editing a prompt created elsewhere drops its tags/variables | omit-means-unchanged semantics for `tags`/`variables`, or return `TagRef`s |

## 16. Rollout order

1. Today's endpoints: API client, token/device storage, email auth, password reset, profile/logout, Supabase Auth removed, Google hidden.
2. Local schema v3 (no backend needed).
3. After B-SPC: spaces + switcher.
4. After B-SYN: outbox, push, pull, adoption, background sync, conflicts.
5. After B-SES: sessions screen.
6. After B-BIO **and G2**: biometric login.
7. Remove the Supabase dependency and env vars.
