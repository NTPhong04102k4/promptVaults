# PromptVault → AioKin Backend Integration — Design Spec

**Date:** 2026-09-25 · **Revised:** 2026-09-26 (contracts re-verified against the real backend, see §0)
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
| B-CODE | `AioKin/Controllers/**`, `AioKin/Services/**`, `AioKin/Models/**`, `AioKin/Common/OperationResultHttpExtensions.cs` | **the implemented code — wins over every plan above when they disagree** |

## 0. Backend contract corrections (as of 2026-09-26)

The first draft of this spec (and plan Tasks 11–19, 22–23) was written from the B-SPC / B-SYN / B-BIO **plans**. Those plans were implemented and went through several review rounds; the shipped contracts differ. Everything below was re-read from backend branch `feat/promptvault-merge` at `49299e0`. Paths are relative to the backend repo root; line numbers are at that commit. Where this section and a later section disagree, this section wins.

| # | Topic | Old assumption (first draft) | Actual contract | Verified in |
|---|---|---|---|---|
| C1 | Push response shape | envelope `data` = bare `SyncPushResponse[]` | envelope `data` = `SyncPushBatchResponse { results: SyncPushResponse[], appliedCount, conflictCount, rejectedCount, hasFailures }`. HTTP is 200 / `success: true` even when entries fail — the client **must** read each `results[i].status`. | `Models/ViewModel/Vault/SyncPushBatchResponse.cs:9-18`; `Services/Vault/SyncService.cs:83-91` |
| C2 | Per-entry status | `'applied' \| 'conflict'` | `'applied' \| 'conflict' \| 'rejected'`; `rejected` carries a free-text `error` (unaccented Vietnamese), no code. | `Models/ViewModel/Vault/SyncPushResponse.cs:7-22`; `SyncService.cs:1254` |
| C3 | `rejected` semantics | n/a | Covers **permanent** causes (payload validation `SyncService.cs:1261-1334`; author/manager check `:599-600`, `:723-724`; cross-space ids `:505-507`, `:1079-1080`, `:1121-1122`) **and transient server faults** reported with the same generic message `"Khong the ap dung thay doi nay."` (any unexpected exception `:469-490`, `DbUpdateException` `:566-570`, `:703-707`). The client cannot tell transient from permanent except by message text (gap G14) → it must not drop an outbox row on a generic `rejected` without a retry policy (§11.2). |
| C4 | Push request fields | `{ spaceUuid, deviceId, entities }` | `{ spaceUuid, entities }` — **no `deviceId`**. The writing device is taken from the caller's own session (`session_token` claim), never from the body. Extra `deviceId` is ignored by ASP.NET, so sending it is harmless but meaningless. | `Models/InputModel/Vault/SyncPushRequest.cs:4-16`; `Controllers/Vault/SyncController.cs:29-40` |
| C5 | Category in payload | `categoryId: null` clears the category | Omitting `categoryId` (or `null`) = **leave unchanged**. `clearCategory: true` = clear. `categoryId` + `categoryName` = set; an unknown id with a name that already exists in the space **reuses the existing category's id** (exact, case-sensitive name match), otherwise creates it. | `SyncPushRequest.cs:46-58`; `SyncService.cs:639-640`, `:1061-1104` |
| C6 | Tags/variables in payload | client sends `tags: [], variables: []` | Omitted/`null` = **leave unchanged**; explicit `[]` = **clear all** (opposite convention to category). This app has no tag/variable UI, so it **must omit both fields** — sending `[]` on every push would wipe tags/variables authored elsewhere. Tags are `TagRef { tagId, name }` (ids available from `GET /prompts/tags`). | `SyncPushRequest.cs:60-79`; `SyncService.cs:646-654` |
| C7 | Description in payload | n/a | `title`, `content`, `description` are **always replaced** on update (`description: null` clears it). The app has no local description column (schema v3), so editing a prompt that another client gave a description **erases that description**. Client decision required — see §9 and drift D1. | `SyncService.cs:632-634` |
| C8 | Pull response shape | `{ isSnapshot, snapshotUrl, changes: [{ …, payloadJson }], resumeCursor }`, `payloadJson` = snake_case `to_jsonb(prompts row)` | `{ isSnapshot, snapshotJson, changes: SyncChangeItem[], resumeCursor }`. `SyncChangeItem = { syncLogId, entityType: 'prompt', entityId, operation, version, tagsVariablesOnly, prompt: { title, content, description, categoryId, isDeleted, tags: string[], variables: [{ varKey, label, defaultValue }] } \| null }` — a typed camelCase DTO; no internal ids. `prompt` is `null` only for `operation === 'delete'`. | `Models/ViewModel/Vault/SyncPullResponse.cs:8-77`; `SyncService.cs:328-421` |
| C9 | Snapshot delivery | `snapshotUrl` = storage path needing the service key (gap G4) | Snapshot content is **inline** in `snapshotJson` (a JSON **string**). It is produced with default `JsonSerializer` options, so its keys are **PascalCase**: `{ SpaceUuid, GeneratedAt, Prompts: [{ PromptId, Title, Content, Description, CategoryId, Version, Tags, Variables: [{ VarKey, Label, DefaultValue }] }] }`. Deleted prompts are excluded. The storage upload is audit-only and best-effort. | `SyncPullResponse.cs:12-20`, `:79-97`; `SyncService.cs:221-226`, `:252-269`, `:313-318` |
| C10 | When a snapshot is returned | only when retention is exceeded | `since == 0` **always** returns a snapshot (first sync, reinstall, or `since` omitted). With `since > 0` a snapshot is also returned when the cursor is older than the space's oldest retained `sync_log` row, or when more than 500 rows are pending. The client must handle a snapshot on any pull. `resumeCursor` of a snapshot may be `0` for a space with no history. | `SyncService.cs:113-142` |
| C11 | Pull cursor | opaque long | `since`/`resumeCursor` = internal `sync_log_id` (a global identity column, not per space). Only rows older than a 10 s safety window (`Sync:PullSafetyWindowSeconds`) are returned, so a change pushed by another device a few seconds ago appears on a later pull. | `Controllers/Vault/SyncController.cs:46-55`; `SyncService.cs:30-60`, `:147-157` |
| C12 | Echo suppression | not specified | Rows written by the **same (user, device) pair** as the caller's current session are filtered out (device alone is not trusted); the cursor still advances past them. No client work needed — but the client never sees its own pushes/resolves in a pull, so it must apply `newVersion` from push/resolve responses itself. | `SyncController.cs:49-54`; `SyncService.cs:170-172`; `Data/Entities/Vault/Prompt.cs:64-73` |
| C13 | Tag/variable-only changes & versions | n/a | There is **no** `MetaSig`-style field; a tag/variable-only change does **not** bump `prompts.version` (the DB trigger only fires on title/content/description/category_id/is_deleted). The service writes a manual `sync_log` row with the **unchanged** version and the pull marks it `tagsVariablesOnly: true` (its title/content are the live row, not history — never overwrite text from it). Consequence: two change items for one prompt can share a version; version gating must use `>=`, not `>`. This app ignores `tagsVariablesOnly` items (it stores no tags). | `Data/Migrations/20260925194111_AddSyncEngine.cs:147-157`; `SyncService.cs:668-682`, `:1229-1251`; `SyncPullResponse.cs:47-54` |
| C14 | Soft delete in pull | `operation === 'delete'` | A push `delete` is a **soft delete** = `operation: 'update'` with `prompt.isDeleted: true` (and a bumped version). `operation: 'delete'` (with `prompt: null`) only appears for hard deletes, which no current write path performs. Handle both. | `SyncPullResponse.cs:38-43`; `SyncService.cs:729-736` |
| C15 | Resolve response | no data (gap G8) | envelope `data = ResolveConflictResponse { promptId, newVersion, isDeleted }`. No follow-up pull needed. | `Models/ViewModel/Vault/ResolveConflictResponse.cs:7-15`; `SyncService.cs:946-951` |
| C16 | Resolve on delete conflicts | `keep_local` fails for a local delete (gap G9) | Server records `LocalOperation` and `RemoteIsDeleted`. `keep_local` on a local delete **soft-deletes** (`isDeleted: true`); `keep_local`/`merged` on a remotely-deleted prompt **undelete** it; `keep_remote` never writes. | `Data/Entities/Sync/SyncConflict.cs:23,37,50`; `SyncService.cs:880-913`, `:973-1032` |
| C17 | Resolve errors | n/a | `422 ValidationError` (bad resolution / missing `mergedPayload` / invalid payload), `404 NotFound` (conflict already resolved or prompt gone), `403 Forbidden` (not a member, **or** `keep_local`/`merged` by a non-author non-manager), `409 Conflict` (the live row changed since the conflict was recorded — the stored conflict can no longer be resolved; re-sync and let the next push raise a fresh one). | `SyncService.cs:829-874`, `:931-944`; `Common/OperationResultHttpExtensions.cs:33,38,43,53` |
| C18 | Authorization | any member may edit anything | Any member may **read** and **create**. Only the prompt's **author** or a member with `CanManage` may **update/delete** someone else's prompt or resolve its conflict with `keep_local`/`merged`; otherwise the push entry is `rejected` ("Ban khong co quyen sua/xoa prompt nay.") or the resolve is `403`. `keep_remote` is always allowed. `CanManage` = personal owner; family owner (`IFamilyContext.IsOwner`); team `Owner`/`Admin`. The check runs **before** the conflict check, so a non-author never receives the remote content. No endpoint exposes a prompt's author (gap G13). | `SyncService.cs:592-600`, `:721-724`, `:866-874`; `Services/Vault/SpaceContext.cs:55-100` |
| C19 | Conflict remote payload | `PromptDetailResponse { promptId, title, content, description, version, hasConflict, tags, variables }` | Same plus `categoryId`, `categoryName` (**always null in push conflicts** — only `categoryId` is filled) and `isDeleted` (true when the remote row was soft-deleted, e.g. an update raced a delete). | `Models/ViewModel/Vault/PromptDetailResponse.cs:7-23`; `SyncService.cs:602-612`, `:788-808` |
| C20 | Retried insert | answered as conflict (gap G10) | An `insert` whose row already exists with identical title/content/description/category (and tags/variables when sent) returns `applied` with the existing `newVersion`. Non-identical → normal update/conflict path. | `SyncService.cs:512-516`, `:575-588`, `:1163-1187` |
| C21 | Delete of an unknown prompt | n/a | `applied` with **no** `newVersion` (idempotent; also for a prompt that lives in another space). | `SyncService.cs:714-719` |
| C22 | Push/pull as non-member | 403 | `403 Forbidden` for the whole request (push/pull/browse). Pull may also return `503 SyncUnavailable` when the snapshot cannot be read. | `SyncService.cs:70-72`, `:96-98`, `:243-249`; `OperationResultHttpExtensions.cs:66` |
| C23 | Spaces | `GET /spaces/me`, `POST /spaces/team` only | As assumed, plus `GET /spaces/{uuid}/members` (any team member) → `SpaceMemberResponse[] { userUuid, userCode, fullName, role, joinedAtMillis }`, `POST /spaces/{uuid}/members { userCode }` (Owner/Admin), `DELETE /spaces/{uuid}/members/{userUuid}` (self = leave; others need Owner/Admin). Team-only (`404` for personal/family). The auto-created personal space is named `"Personal"`; `POST /spaces/team` always returns `canManage: true`. | `Controllers/Vault/SpacesController.cs:27-65`; `Services/Vault/SpaceService.cs:32`, `:68`; `Models/ViewModel/Vault/SpaceMemberResponse.cs` |
| C24 | Browse endpoints | no categories endpoint (gap G5) | `GET /prompts/categories?spaceUuid=` → `[{ id, name }]`, `GET /prompts/tags?spaceUuid=` → `[{ id, name }]`; `PromptSummaryResponse`/`PromptDetailResponse` carry `categoryId` + `categoryName`. `GET /prompts/{id}?spaceUuid=` returns `404` for soft-deleted prompts. | `Controllers/Vault/PromptsController.cs:30-48`; `Services/Vault/PromptBrowseService.cs:44-107`; `PromptSummaryResponse.cs:8-18` |
| C25 | Biometric challenge | **raw** `{ challengeId, nonce }` | **Envelope** `OperationResult`, `data = { challengeId, nonce }` (32-byte base64 nonce). Always 200 whether or not the device is enrolled; `500 InternalError` if Redis is down; rate-limited (`auth`). | `Controllers/Auth/BiometricController.cs:58-64`; `Services/Auth/Biometric/BiometricAuthService.cs:82-102` |
| C26 | Biometric register | any `deviceId` | `deviceId` **must equal the deviceId of the caller's current session** (the one sent at login) or `403 Forbidden`. `publicKey` = base64 **SPKI** of a **P-256** key (other curves → `400 InvalidPublicKey`), max 256 chars; `deviceName` max 120, `platform` max 20, `deviceId` max 100. Success = envelope, no data. | `BiometricController.cs:31-56`; `Models/InputModel/Auth/Biometric/BiometricRequests.cs`; `BiometricAuthService.cs:303-330` |
| C27 | Biometric verify | as assumed | `{ challengeId, signature }` → envelope `data = TokenResponse` (snake_case). Signature = base64 **DER** (`Rfc3279DerSequence`) ECDSA-SHA256 over the raw nonce bytes. Every failure = `401 InvalidCredentials`. On success the device's previous access/refresh tokens are revoked. | `BiometricController.cs:66-71`; `BiometricAuthService.cs:105-185`; `Services/Auth/Biometric/BiometricSignature.cs:25-47` |
| C28 | Biometric revoke | best-effort | `DELETE /auth/biometric/{deviceId}` → `404 NotFound` if no active credential; revoking the **caller's own** device does not sign it out, revoking another device also kills that device's sessions. | `BiometricController.cs:73-93`; `BiometricAuthService.cs:214-241` |
| C29 | `userCode` | not returned (gap G2) | `LoginResponse.userCode` is returned by `GET /account/me` and verify-otp's `user`. | `Models/ViewModel/Auth/User/LoginResponse.cs:7`; `Models/Transfers/ProfileUser/UserMapper.cs:18` |
| C30 | Refresh and duplicate sessions | duplicates per device (gap G7) | `POST /auth/refresh-token` revokes the device's previous access session before issuing a new one, and prefers the device stored in the refresh payload over body fields. | `Controllers/Auth/AuthController.cs:389-424` |

### 0.1 Drift that touches already-implemented tasks (flagged, not silently edited)

Plan Tasks 1–10, 13, 20–21 are implemented on `feat/aiokin-backend`. These items need a follow-up decision; the implemented code was **not** changed by this revision.

| # | Where | Drift | Impact | Suggested follow-up |
|---|---|---|---|---|
| D1 | Task 9 (`src/lib/db.ts`, schema v3) | `prompts` has no `description` column, but the server replaces `description` on every update (C7). | Editing, on the app, a prompt that the web/Kotlin client gave a description silently deletes the description. | Decide before Task 14 ships: add a schema v4 migration (`ALTER TABLE prompts ADD COLUMN description TEXT`) and round-trip it in push/pull — recommended; or accept the loss for now (plan Task 14 currently sends `description: null`, see its note). |
| D2 | Task 1 (`src/services/apiClient.ts` comment) and plan Global Constraints | `/auth/biometric/challenge` listed as a raw endpoint; it is an envelope now (C25). | Comment only; the code path is chosen per call (`envelope: false` was only planned in Task 22, now corrected there). | Fix the comment when Task 22 is implemented. |
| D3 | Task 4 (`src/lib/authApi.ts` comment "userCode is not returned today — spec gap G2") | G2 is closed (C29). | None — `toAuthUser` already reads `userCode` with `readString`, so `user.userCode` is now populated automatically. | Drop the stale comment when convenient. |
| D4 | Task 10 (`src/lib/categoryId.ts`, `categoryNameFor` comment "no category endpoint (spec gap G5)") | G5 is closed (C24). | None for the function itself; Task 15 now resolves unknown ids through `GET /prompts/categories` before falling back to it. | Comment only. |
| D5 | Task 13 plan text vs code | Plan text shows `completeRow(db, seq)`; the implemented `completeRow(db, seq, newVersion?)` also rebases queued rows, and `claimBatch` skips prompts with `has_conflict = 1` and returns one row per prompt (commit `b4ae55d`). | Tasks 14/18 were written against the old signature. | Tasks 14 and 18 now call the implemented `completeRow(db, seq, newVersion)`. Task 13's interface line is annotated. |
| D6 | Task 20 (sessions screen) | G7 closed (C30). | The "duplicates per device" caveat in §7 no longer applies; no code change needed. | None. |

## 1. Goal

The Expo app stops talking to Supabase. All auth goes through the AioKin ASP.NET Core API (opaque bearer tokens), and prompts sync two-way with the backend's Space/Prompt domain through the offline-first outbox → `/sync/push` / `/sync/pull` engine, with Git-style conflicts resolved by the user in a side-by-side screen. When the work is done the app has **no Supabase client, dependency or env var**.

## 2. Binding decisions (from the user) and non-goals

1. Auth moves entirely to AioKin. No Supabase Auth, no `supabase.from(...)`. Supabase remains only the backend's database host.
2. Android Kotlin app is paused — out of scope.
3. One backend for all clients. The app requests **no client-specific endpoints**; anything missing is listed in §15 "Backend gaps" instead of being designed around silently.

Non-goals: tags/variables UI, prompt version history, AI enrichment, team member management UI (the endpoints now exist — C23 — but the UI is a follow-up), Facebook login.

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

### 4.1 Response shapes the client must handle (verified in B-CODE)

| Endpoint | Success body | Source |
|---|---|---|
| `POST /auth/login` | **raw** `TokenResponse` — snake_case: `access_token`, `refresh_token`, `expires_in`, `token_type`, `scope` | `AuthController.Login` → `Ok(new TokenResponse{…})`; `TokenResponse` has `[JsonPropertyName("access_token")]` etc. |
| `POST /auth/refresh-token` | **raw** `TokenResponse` (snake_case) | `AuthController.RefreshToken` |
| `POST /auth/verify-otp` | **201** `OperationResult`, `data = { accessToken, refreshToken, expiresIn, tokenType, user: LoginResponse }` (camelCase anonymous object) | `AuthController.VerifyOtp` |
| `POST /auth/biometric/challenge` | `OperationResult`, `data = { challengeId, nonce }` (**envelope** — corrected, C25) | `BiometricController.Challenge` → `ToActionResult(...)` |
| `POST /auth/biometric/verify` | `OperationResult`, `data = TokenResponse` (snake_case inside the envelope) | `BiometricAuthService.VerifyAsync` |
| everything else the app calls | `OperationResult { success, errorCode, message, data }` | `OperationResult.cs` |
| `/posts`, `/todos`, `/ability/rules` | unwrapped (B-AUTH §6) — **the app does not call them** | — |

Every **error** body (4xx/5xx) is an `OperationResult` with `errorCode` — including model-validation failures (`Program.cs` `InvalidModelStateResponseFactory` → 422 `ValidationError`) and rate-limit rejections (`RateLimitingSetup.OnRejected` → 429 `TooManyRequests`). HTTP status is derived from `errorCode` in `OperationResultHttpExtensions.MapErrorCodeToStatusCode` (unknown codes → 400).

### 4.2 Client contract

- `apiClient.get/post/put/patch/delete<T>(path, body?, options?)`; `options.envelope` defaults to `true` (unwrap `data`); pass `envelope: false` for the raw endpoints above (only `/auth/login` and `/auth/refresh-token`). `options.auth` (default `false`) attaches `Authorization: Bearer <access>`.
- Unwrapping: if `envelope` and the body has boolean `success`, return `body.data` when `success`, otherwise throw `ApiError`.
- `ApiError { status, code, message }`: `code = body.errorCode ?? 'http_<status>'`; network failure (fetch throws) → `ApiError(0, 'network', …)`.
- `normalizeTokens()` accepts both snake_case and camelCase token objects.

### 4.3 Refresh on 401 (single-flight)

Only requests sent with `auth: true` participate (a 401 from `/auth/login` is `InvalidCredentials`, not an expired session). On 401:

1. If a refresh is already in flight, await the same promise (module-level `refreshing: Promise<boolean> | null`).
2. Otherwise `POST /auth/refresh-token { refreshToken, deviceId, deviceName, platform }` (raw response). The backend **rotates** the refresh token (revokes the old one first), so concurrent refreshes would log the user out — hence single-flight. The backend prefers the device stored in the refresh token over the body fields (C30).
3. Success → store the new pair, retry the original request **once**. Failure (`InvalidRefreshToken`/`UserInactive`/any 401) → `clearTokens('expired')`; listeners (authStore) drop the user; the original call rejects with `ApiError(401, 'session_expired')`.
4. Network error during refresh → do **not** clear tokens (offline ≠ logged out); reject with `network`.

Proactive refresh is not needed: opaque tokens carry no expiry claim, and `expires_in` is stored only to skip an obviously dead access token (refresh first if `now > expiresAt - 30s`).

## 5. Token storage and device identity

- `src/lib/tokenStore.ts`: one JSON item `aiokin.tokens = { accessToken, refreshToken, expiresAt }` in `expo-secure-store` with `keychainAccessible: AFTER_FIRST_UNLOCK` (background sync must read it while the phone is locked). Opaque tokens are ~88 chars, well under SecureStore's 2 KB value guidance, so `LargeSecureStore` is not needed here.
- `onTokensCleared(listener)` event (`reason: 'signout' | 'expired'`) replaces Supabase's `onAuthStateChange`.
- `src/lib/deviceIdentity.ts`: `deviceId = Crypto.randomUUID()` generated once, stored in SecureStore `aiokin.deviceId` (same accessibility). `deviceName = Device.deviceName ?? Device.modelName ?? 'Unknown device'`, `platform = Platform.OS` (`'android' | 'ios' | 'web'`). Sent on login, verify-otp and refresh.
- The server binds this `deviceId` to every access session issued at login. **Sync never sends it** — push/pull/resolve read the device from the session (C4, C12). Biometric `register` sends it and the server checks it equals the session's device (C26). One identity, per B-MRG §6.5.

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

`authStore.user` is built from `LoginResponse` (`userID`, `userCode`, `firstName`, `lastName`, `email`, `username`, …). `AuthUser` keeps its shape (`id, email, username, firstName, lastName`) so `format.ts`/profile screens don't change, plus `userCode` (now always populated — G2 closed, C29).

Password rule stays `MIN_PASSWORD_LENGTH = 6` (backend `LoginRequest`/`RegisterRequest` `MinLength(6)`).

### 6.1 OAuth (Google)

What the backend actually does (`AuthController`): `GET /auth/login/google` issues a cookie-based `Challenge`; Google redirects to the middleware callback; `GET /auth/finalize/google` returns an **HTML page that calls `window.opener.postMessage(payload, targetOrigin)` and closes itself** (`AuthController.BuildOAuthPopupHtml`, unchanged at `49299e0`). There is no redirect to a caller-supplied URL and no token in a URL.

Consequences for Expo:
- `WebBrowser.openAuthSessionAsync` (ASWebAuthenticationSession / Custom Tabs) resolves only when the browser navigates to the app's redirect scheme (`propmtvaults://…`). The finalize page never navigates; `window.opener` is `null`, so the payload is lost. **Does not work.**
- Hosting the flow in a `react-native-webview` and shimming `window.opener` would technically capture the payload, but Google rejects OAuth in embedded WebViews (`disallowed_useragent`). **Not viable.**

**Decision:** remove the Supabase Google flow and **hide the Google buttons** on signup/login until gap G1 is closed. The client work for G1 is written in a follow-up plan once the backend contract exists — it is deliberately not guessed here.

## 7. Sessions screen (depends on B-SES)

`src/app/sessions.tsx`, reached from Profile → "Thiết bị đăng nhập".
- `GET /account/sessions` (auth) → envelope `data: [{ id, deviceName, platform, issuedAt, isCurrent }]` (`issuedAt` is `IssuedAtUnix`, seconds).
- Row: device name (fallback "Thiết bị không rõ"), platform, "Đăng nhập lúc …", badge "Thiết bị này" when `isCurrent`.
- "Đăng xuất" on a non-current row → `DELETE /account/sessions/{id}` → reload. The current row offers the normal sign-out instead. Deleting a session also revokes that device's biometric credential (backend `faa2e0e`).
- Refresh now revokes the device's previous access session (C30, G7 closed), so a device appears once.

## 8. Biometric login (depends on B-BIO; G2 closed)

Two distinct features, kept distinct in code and UI:

| | App lock (exists) | Biometric login (new) |
|---|---|---|
| Purpose | hide the UI when returning to the app | obtain fresh tokens without a password |
| Code | `appLock.ts` + `biometric.ts` (expo-local-authentication) | `biometricLogin.ts` + `biometricSignature.ts` |
| Server involvement | none | `/auth/biometric/register|challenge|verify|{deviceId}` |
| Settings row | "Khoá bằng vân tay / Face ID" | "Đăng nhập bằng vân tay / Face ID" (signed-in only) |

### 8.1 Library evaluation

Requirement (B-AUTH §5, §7; confirmed in `BiometricSignature.cs` and `BiometricAuthService.TryImportP256PublicKey`): hardware-backed **ECDSA P-256** private key that requires biometrics per use; public key as **SPKI base64** (≤ 256 chars; P-256 SPKI is 91 bytes → 124 chars); signature `SHA256withECDSA` over the **raw nonce bytes** (server does `Convert.FromBase64String(nonce)`), **DER** (`Rfc3279DerSequence`).

| Option | Verdict |
|---|---|
| `expo-local-authentication` | Only yes/no auth; no keys. ✗ |
| `expo-secure-store` (`requireAuthentication`) | Stores secrets, cannot generate or sign with a key. ✗ |
| `react-native-biometrics` (SelfLender) | `createKeys()` makes **RSA-2048** only. ✗ |
| Passkeys (`react-native-passkey`) | Signs `authenticatorData ‖ clientDataHash`, not the raw nonce; needs RP domain association. Incompatible with B-BIO's verify. ✗ |
| **`@sbaiahmed1/react-native-biometrics`** | `createKeys(alias, 'ec256', …)` → EC P-256 in Secure Enclave / Android Keystore (StrongBox when available); public key is "base64 X.509 SubjectPublicKeyInfo DER on both platforms"; `signWithOptions({ data, inputEncoding: 'base64', algorithm: 'SHA256withECDSA', disableDeviceFallback: true })` → base64 signature; ships an Expo config plugin; needs a dev build (app already uses `expo run:*`). **Signature encoding is not documented.** Native APIs underneath emit DER, but we don't rely on that. ✓ chosen |
| Local Expo Module (Kotlin + Swift, ~200 lines) | Full control, guaranteed DER; costs native code we must maintain. Fallback. |

**Decision:** use `@sbaiahmed1/react-native-biometrics`, wrapped behind `src/lib/biometricLogin.ts`, and normalise signatures in JS with `ensureDerSignature()` (implemented in Task 21). If the library fails to build on RN 0.86 / Expo 57 (first step of the task is a device spike), switch to the local Expo Module behind the same `biometricLogin.ts` interface — no other file changes.

### 8.2 Flows

- **Enable** (signed in): `createKeys('aiokin.biometric', 'ec256')` → `POST /auth/biometric/register {deviceId, deviceName, platform, publicKey}` (auth, envelope, no data). `deviceId` must be this device's id — the same one sent at login — or the server answers `403 Forbidden` (C26); `deviceName` is truncated to 120 chars. On `InvalidPublicKey` (400) the key is not P-256 SPKI → delete the key and surface a generic error. Save `{ userCode, email }` to SecureStore `aiokin.biometricLogin`.
- **Login** (login screen shows "Đăng nhập bằng vân tay / Face ID" when that item exists): `POST /auth/biometric/challenge {userCode, deviceId}` → **envelope** `data = { challengeId, nonce }` (C25) → sign `nonce` → `POST /auth/biometric/verify {challengeId, signature}` → envelope `TokenResponse` → store tokens → `GET /account/me`. Every verify failure is `InvalidCredentials` by design — show "Không đăng nhập được bằng sinh trắc học, hãy dùng mật khẩu." User cancelling the OS prompt is not an error.
- **Disable**: `DELETE /auth/biometric/{deviceId}` (auth, best-effort; `404` = already revoked, treated as success) + `deleteKeys` + remove the SecureStore item. Revoking this device does not sign it out (C28).
- A different account signing in on the device disables the previous account's biometric login (keys deleted locally).
- Normal sign-out keeps biometric login (that is its purpose). Logout-all, password reset and deleting this device's session revoke the credential server-side; the next verify then fails with `InvalidCredentials` and the app should offer to disable.

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

Migration (one transaction inside `migrate()`, `PRAGMA user_version = 3`) — implemented (Task 9):
1. `CREATE TABLE spaces`; copy the single `vaults` row as `kind='local'`, name "Trên máy này". `PERSONAL_VAULT_ID` is renamed `LOCAL_SPACE_ID` (same UUID value, so existing rows need no rewrite).
2. The prompts table is **rebuilt** (rowids preserved so FTS stays aligned), triggers recreated, FTS rebuilt, `vaults` dropped.
3. Create `sync_outbox`, `sync_state`, `sync_conflicts`.

All existing prompts land in the local space with `version = 0`. Nothing is uploaded by the migration itself.

**Description (drift D1).** The server replaces `description` on every update (C7) and schema v3 has no `description` column, so the app pushes `description: null`. Until a v4 migration adds the column, editing on the app erases a description written by another client. This is a client decision recorded in §0.1, not a backend gap.

**Categories.** The server wants `categoryId` (client-generated UUID) + `categoryName`. For the app's fixed `PROMPT_CATEGORIES` the client derives `categoryId = uuidFromSha256(spaceId + ':' + name.toLowerCase())` (RFC 9562 v8 layout, Task 10), so every device and re-install produces the same id for "Marketing" in a space. If another client already created "Marketing" in that space with a different id, the server reuses that category by name (C5), so no duplicate is created either way. On pull, `categoryId` is mapped back to a name by: (1) recomputing the ids of `PROMPT_CATEGORIES`; (2) otherwise looking it up in `GET /prompts/categories?spaceUuid=` (C24, fetched at most once per pull); the resulting name — even one outside `PROMPT_CATEGORIES` — is stored as-is in `prompts.category`. If both fail the local category is left unchanged rather than set to null (so a later edit can't clear a category the app merely failed to name).

Push category rules (C5): category set → `{ categoryId, categoryName }`; category empty on **insert** → omit both; category empty on **update / merged** → `clearCategory: true`.

**Tags and variables** are never sent (fields omitted = unchanged, C6); pull items with `tagsVariablesOnly: true` are skipped (nothing the app stores changed, C13).

**Favorites and copy count stay device-local.** `PromptPayload` has no `isFavorite`/`usageCount`, and the server's `is_favorite` is per-prompt, not per-user; applying it on pull would wipe local favourites. Pull never touches `is_favorite`/`copy_count` (gap G6).

## 10. Spaces

### 10.1 Model
- `LOCAL_SPACE_ID` ("Trên máy này") — always present; the only space for guests.
- Remote spaces mirror `GET /spaces/me` → envelope `data: SpaceResponse[] = [{ spaceUuid, spaceType: 'Personal'|'Family'|'Team', name, canManage, createdAtMillis }]`. The backend auto-creates the personal space (named `"Personal"`, shown as "Kho cá nhân") on this call.
- `canManage` (C18) decides whether the user may edit/delete **other members'** prompts. The app cannot know a prompt's author (gap G13), so it does not pre-hide edit buttons; a forbidden edit comes back as a `rejected` push entry and the prompt is restored from the server (§11.2).
- `spaceStore` (zustand, persisted in AsyncStorage) holds `currentSpaceId` and `ownerUserId` (whose synced data is in SQLite). After login it switches to the personal space; after sign-out back to `LOCAL_SPACE_ID`.

### 10.2 Vault switcher → Space switcher
`vault-switcher.tsx` lists `spaces` from SQLite (instant) and refreshes from `/spaces/me` on focus. Personal is labelled "Kho cá nhân", family/team show their names with a group icon. "Tạo kho mới" → dialog → `POST /spaces/team {name}` (1–120 chars) → envelope `data: SpaceResponse` (always `canManage: true`) → insert, switch. Guests see only the local space and the "Tạo kho mới" row routes to login. Member management UI is out of scope for this plan even though the endpoints exist (C23, G3 closed).

### 10.3 First login: adopting local prompts
`onboarding/sync.tsx` becomes the adoption screen, shown after every successful sign-in:
- `fetchAndStoreMySpaces()`; count prompts in `LOCAL_SPACE_ID`.
- If 0 → skip straight home.
- Else: "Đưa N prompt trên máy này vào Kho cá nhân của <email>?" → **"Đưa lên"**: in one transaction, `UPDATE prompts SET space_id = <personal>, version = 0` and insert one `sync_outbox` row `(insert, base_version 0)` per prompt; then `requestSync()`. **"Để sau"**: prompts stay local; the screen is reachable again from Settings → "Sao lưu & đồng bộ".
- Idempotent: an adopted prompt is no longer in the local space, so re-running adopts only newer local prompts.

**Sign-out** deletes rows of all non-local spaces (prompts, outbox, state, conflicts, spaces). If the outbox is non-empty the user is warned first ("Có N thay đổi chưa đồng bộ. Đăng xuất sẽ mất chúng.") and `requestSync()` is attempted. Local-space prompts are never touched.

## 11. Outbox, push, pull

### 11.1 Writes (all spaces except `local`)
`createPrompt/updatePrompt/deletePrompt` write the row **and** call `enqueue()` in the same SQLite transaction, then `requestSync()` (debounced 2 s). `setFavorite`/`recordCopy` do not enqueue (§9). Implemented in Task 13, including coalescing:

| pending | new | result |
|---|---|---|
| none | any | insert row; `base_version = prompts.version` (0 for new) |
| insert | update | keep insert |
| insert | delete | delete the outbox row (server never saw it) |
| update | update | keep update (original base) |
| update | delete | becomes delete (original base) |

A row already `in_flight` is never modified — a new row is added instead, so an edit made during a push is not lost. `claimBatch` returns at most one row per prompt, never a second row while one is in flight, and skips prompts with `has_conflict = 1`; `completeRow(db, seq, newVersion)` rebases queued rows of the same prompt.

Payloads are built **at push time** from the current row (C5–C7): `{ title, content, description: null, categoryId?, categoryName?, clearCategory? }` — **no `tags`/`variables` keys**; `null` payload for delete.

### 11.2 Push — `POST /sync/push`
Per space, batches of up to 50 rows: mark `in_flight = 1`, send `{ spaceUuid, entities: [{ promptId, operation, baseVersion, payload }] }` (no `deviceId`, C4). Response envelope `data: SyncPushBatchResponse { results, appliedCount, conflictCount, rejectedCount, hasFailures }` (C1); each result is `{ promptId, status: 'applied'|'conflict'|'rejected', newVersion?, remote?, conflictId?, error? }` with `remote` = `PromptDetailResponse` (C19).

- `applied` → `completeRow(seq, newVersion)`; `prompts.version = newVersion`, `synced_at = now`, `has_conflict = 0`. `newVersion` is absent for a delete of an unknown prompt (C21) — just complete the row. A retried identical insert is `applied` (C20).
- `conflict` → complete the outbox row, then:
  - our `delete` vs `remote.isDeleted` (both sides want it gone) → auto `keep_remote`;
  - remote content equal to what we sent (title, content, description, category id) and `!remote.isDeleted` → auto `keep_remote` (identical data, nothing is chosen over anything; e.g. the same edit made on two devices);
  - the auto path uses the resolve response's `newVersion` (C15); if the auto-resolve call fails, fall through;
  - otherwise store a `sync_conflicts` row (remote JSON includes `isDeleted`), set `prompts.has_conflict = 1`.
- `rejected` (C3) → two cases, decided by the `error` text until gap G14 gives a code:
  - **permission** (`error` starts with `"Ban khong co quyen"`, C18) → permanent: drop the outbox row and reset the space's pull cursor to 0, so the pull that follows in the same run returns a snapshot (C10) that **restores the server copy** (or removes the prompt locally if it no longer exists). The local edit is discarded; the prompt was not the user's to change.
  - **anything else** → possibly transient: keep the row, `releaseRows(seq, 'rejected: <error>')` (`attempts += 1`); it is skipped for the rest of this run and retried on every **later** run. `attempts`/`last_error` record the history; the row keeps counting in `pendingCount`, so sign-out warns — it is never silently deleted.
- Whole-request failure: HTTP/network error → release all rows (`attempts += 1`, `last_error`) and rethrow. `403 Forbidden` (removed from space) → the engine refreshes `/spaces/me`, which drops that space locally.

### 11.3 Pull — `GET /sync/pull?spaceUuid=&since=`
`since` = local `sync_state.cursor` (0 when never synced → the server always answers with a snapshot, C10). Response `data: { isSnapshot, snapshotJson, changes, resumeCursor }` (C8).

Rules common to both paths:
- Never touch a prompt that has a pending outbox row **or** an open `sync_conflicts` row (the local row is "your version" in the conflict screen, §12). The push surfaces any divergence.
- Never touch `is_favorite`/`copy_count`.
- Apply content only when `incoming.version >= local.version` (`>=`, not `>`, C13).
- Store `resumeCursor` in `sync_state` in the same transaction as the applied rows.

Incremental (`isSnapshot: false`): for each item with `entityType === 'prompt'`:
- `tagsVariablesOnly` → skip (C13).
- `operation === 'delete'` or `prompt.isDeleted` → delete locally (C14).
- otherwise upsert `title`, `content`, category (mapped per §9), `version = item.version`.

Snapshot (`isSnapshot: true`): `JSON.parse(snapshotJson)` — **PascalCase keys** (C9); read keys case-insensitively. Replace the space: delete local rows of that space that are not in `Prompts` (and have no pending row / open conflict), upsert the rest (`version = Prompt.Version`), `cursor = resumeCursor`. No per-prompt browse calls are needed any more (G4 closed).

`503 SyncUnavailable` / network errors → no local change, cursor unchanged, retried on the next trigger.

### 11.4 Triggers — background sync
`syncEngine.runSync()` is single-flight; for each non-local space: push until the outbox has nothing claimable (max 10 rounds; rows rejected earlier in the run are skipped), then pull. Triggers (B-MRG §7):
- after local writes (`requestSync`, 2 s debounce);
- app foreground (`AppState` → `active`) and after sign-in;
- connectivity regained (`expo-network` `addNetworkStateListener`, `isInternetReachable` false→true);
- periodic in background: `expo-background-task` + `expo-task-manager`, task `promptvault-sync`, `minimumInterval: 15` (minutes). The OS decides actual timing; this is best-effort.
- manual: pull-to-refresh / "Đồng bộ ngay".

Signed out → `runSync` is a no-op. A `403` from push or pull triggers one `fetchAndStoreMySpaces()` so a space the user lost access to disappears.

## 12. Conflict UI

- Prompt detail shows a "Prompt này có xung đột đồng bộ — Giải quyết" banner when `has_conflict = 1`.
- `src/app/conflict.tsx` (`promptId` param): side-by-side (stacked on narrow screens) "Bản của bạn" / "Bản trên máy chủ". Actions map to `POST /sync/conflicts/{conflictId}/resolve` (C15–C17):

| Situation | "Bản của bạn" | "Bản trên máy chủ" | Buttons → resolution |
|---|---|---|---|
| edit vs edit | local row | `remote` | **Giữ bản của tôi** → `keep_local` (or `merged` with the current row if it was edited after the conflict) · **Giữ bản máy chủ** → `keep_remote` · **Gộp** → `merged` |
| local delete vs remote edit | "Bạn đã xoá prompt này." | `remote` | **Vẫn xoá** → `keep_local` (server soft-deletes, G9 closed) · **Khôi phục bản máy chủ** → `keep_remote` (re-insert locally) |
| local edit vs remote delete (`remote.isDeleted`) | local row | "Prompt đã bị xoá trên thiết bị khác." | **Giữ bản của tôi** → `keep_local` (server undeletes) · **Chấp nhận xoá** → `keep_remote` (delete locally) · **Gộp** → `merged` (undeletes) |

- After a successful resolve: drop the prompt's outbox rows, delete the `sync_conflicts` row, `has_conflict = 0`, `version = response.newVersion`; if `response.isDeleted` delete the local row, otherwise write the chosen content. Then `runSync()` (to flush other queued work — no pull is needed for this prompt, G8 closed).
- `403 Forbidden` on `keep_local`/`merged` (C18) → "Bạn chỉ có thể giữ bản trên máy chủ vì prompt này do thành viên khác tạo." and only `keep_remote` stays enabled.
- `409 Conflict` or `404 NotFound` (the server moved on / the conflict was resolved elsewhere, C17) → drop the local conflict record; for a `keep_remote` choice reset the space's pull cursor to 0 so the next pull's snapshot restores the server copy; for `keep_local`/`merged`/`Vẫn xoá` re-enqueue the chosen state (`update` or `delete`) with `base_version = remote_version`, so the next push either applies it or raises a fresh conflict against the current server state. The stale server-side conflict row is abandoned (harmless).

## 13. Error handling and offline behaviour

| Condition | Behaviour |
|---|---|
| No network | Local reads/writes always work; outbox accumulates; sync retries on reconnect. Auth screens show "Không có kết nối mạng." (`ApiError.code === 'network'`). |
| 401 on authed call | single-flight refresh (§4.3); refresh fails → `user = null`, alert "Phiên đăng nhập đã hết hạn". Unlike an explicit sign-out, synced-space rows and the outbox are **kept**, so signing in again with the same account resumes and pushes them. `spaceStore.ownerUserId` remembers whose data it is; signing in as a different account wipes synced spaces first (§10.3). |
| 403 `Forbidden` on push/pull | space refreshed from `/spaces/me`; if gone, its local rows are dropped. |
| push entry `rejected` | §11.2 (permission → drop edit, snapshot restores the server copy; other → retry on later runs). |
| 403 / 404 / 409 on resolve | §12. |
| 422 `ValidationError` | show `message` (server joins validation messages). |
| 429 `TooManyRequests` | show server message; sync backs off to next trigger. |
| 503 `SyncUnavailable` | pull skipped for that space this run. |
| 5xx / `EmailSendFailed` | generic "Có lỗi xảy ra, thử lại sau." |
| Pull apply throws mid-way | transaction rolls back, cursor unchanged, next pull repeats (idempotent upserts). |

Error-code → field mapping lives in `authForm.ts` (`toAuthError`), keyed by `ApiError.code`.

## 14. Testing

Jest (`jest-expo`) as today. Pure logic and SQLite code are unit-tested against the `better-sqlite3` mock; HTTP by stubbing `globalThis.fetch` or mocking `apiClient`. Native modules (`expo-secure-store`, `expo-device`, `expo-network`, `expo-background-task`, `@sbaiahmed1/react-native-biometrics`) are `jest.mock`ed. Every task leaves `npx jest src` and `npx tsc --noEmit` green. Device checks (biometric spike, background task) are manual steps in the plan. Mocked backend responses in tests must use the shapes in §0 (batch wrapper, `snapshotJson` PascalCase, typed change items).

## 15. Backend gaps

None of these is client-specific; each is needed by any mobile client (including the paused Kotlin app). Status re-verified 2026-09-26 against backend `49299e0`.

| # | Gap | Status | Evidence / remaining impact | Suggested backend change (open items) |
|---|---|---|---|---|
| G1 | OAuth finalize only `postMessage`s to `window.opener` | **Open** | `AuthController.BuildOAuthPopupHtml` unchanged; Google sign-in stays hidden. | Allow-listed native redirect: `GET /auth/login/google?redirectUri=` → finalize 302s to `redirectUri?code=<one-time>`; `POST /auth/oauth/exchange {code, deviceId, deviceName, platform}` → TokenResponse; thread `DeviceInfo` through OAuth. |
| G2 | No endpoint returns the caller's `UserCode` | **Closed** | `LoginResponse.UserCode` (`LoginResponse.cs:7`, `UserMapper.cs:18`), backend commit `8b00155`. | — |
| G3 | Team spaces: no list-members / remove-member / leave | **Closed** | `GET/POST /spaces/{uuid}/members`, `DELETE /spaces/{uuid}/members/{userUuid}` (self = leave), commits `abfc225`, `fe02bd7`. UI still out of scope here. | — |
| G4 | Pull snapshot returned a storage path needing the service key | **Closed** | `SyncPullResponse.SnapshotJson` inline (commits `b184435`, `5e7e28d`). | — |
| G5 | No categories endpoint / no category in detail | **Closed** | `GET /prompts/categories`, `GET /prompts/tags`, `categoryId`+`categoryName` in summary/detail (commit `8e8e44e`). Residual: pull items and push-conflict `remote` carry `categoryId` only (`categoryName` null) — the client maps ids via `/prompts/categories`. | Optional: `categoryName` in `SyncPromptChangePayload` / conflict `remote`. |
| G6 | `isFavorite`/`usageCount` not in `PromptPayload`; `is_favorite` is per prompt | **Open** | Unchanged; favourites and copy counts stay device-local. | per-user favourite table + push field, or document as local-only |
| G7 | Access sessions not revoked on refresh | **Closed** | `AuthController.RefreshToken` revokes the device's previous access session (`AuthController.cs:417-420`, commits `cd42055`, `bd98284`). | — |
| G8 | Resolve response has no new `version` | **Closed** | `ResolveConflictResponse { promptId, newVersion, isDeleted }` (commit `59d97f7`). | — |
| G9 | Delete-vs-edit: `keep_local` failed | **Closed** | `SyncConflict.LocalOperation`/`RemoteIsDeleted`; delete-aware resolve (commits `59d97f7`, `995c3a0`). | — |
| G10 | Retried identical `insert` answered as a conflict | **Closed** | `PushRetriedInsertAsync` + `IsIdenticalRetry` → `applied` (commit `bfe33f3`). | — |
| G11 | Resolve IDOR (no membership check) | **Closed** | Space derived from `SyncConflict.SpaceID` + `ISpaceContext` (commit `59d97f7`). | — |
| G12 | Push replaced tags/variables wholesale | **Closed** | `null` = unchanged, `[]` = clear; `TagRef` ids via `/prompts/tags` (commit `1922255`). Category got matching omit-means-unchanged + `ClearCategory` in the same round. | — |
| G13 | **New.** No endpoint exposes a prompt's author or a per-prompt "can edit" flag, while update/delete of other members' prompts is restricted to author/`CanManage` (C18) | **Open** | The app can't pre-disable edit/delete for a non-author member in a family/team space; it learns only after the fact via a `rejected` push entry or a `403` resolve, then restores the server copy. | Add `authorUserUuid` (or `canEdit`) to `PromptSummaryResponse`, `PromptDetailResponse`, `SyncPromptChangePayload` and snapshot prompts. |
| G14 | **New.** `rejected` push entries carry only a free-text message; transient server faults (`DbUpdateException`, unexpected exceptions) are reported as `rejected` with the same text as permanent reference errors (C3) | **Open** | Client keys off message text for the permission case and must retry every other `rejected` entry blindly (§11.2). | Add a machine-readable `errorCode` per entry (`validation` / `forbidden` / `invalid_reference` / `transient`), or report transient failures as a distinct status / whole-request 5xx so the client retries. |

## 16. Rollout order

1. Today's endpoints: API client, token/device storage, email auth, password reset, profile/logout, Supabase Auth removed, Google hidden. *(done: Tasks 1–8)*
2. Local schema v3 (no backend needed). *(done: Tasks 9–10, 13)*
3. After B-SPC (merged): spaces + switcher.
4. After B-SYN (merged): push, pull, adoption, background sync, conflicts — decide drift D1 (description) before shipping push.
5. After B-SES (merged): sessions screen. *(done: Task 20)*
6. After B-BIO (merged; G2 closed): biometric login.
7. Remove the Supabase dependency and env vars.
