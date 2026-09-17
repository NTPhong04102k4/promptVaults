# Onboarding + Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional onboarding/auth flow (email+password and Google SSO via Supabase Auth) that, after login, pushes the user's local prompts to Supabase for backup, without ever blocking the guest/local-only path.

**Architecture:** A local-first Expo Router app (SQLite via `expo-sqlite`) gains a thin Supabase layer (`src/lib/supabase.ts`, `src/lib/auth.ts`, `src/lib/sync.ts`) and three new screens (Welcome, Auth, Sync). The existing local-only home screen is untouched as the default entry point; auth is reached only through an explicit "Đăng nhập để đồng bộ" action.

**Tech Stack:** Expo SDK ~57 (`expo-sqlite` async API, `expo-router`, `expo-web-browser`), `@supabase/supabase-js`, `@react-native-async-storage/async-storage` (new dependency).

**Spec:** `docs/superpowers/specs/2026-09-18-onboarding-auth-design.md`

## Global Constraints

- Guest/local-only flow must never be blocked or gated behind login (spec §2).
- No custom auth backend — call `@supabase/supabase-js` directly (spec §2, §6).
- Google SSO only in this plan; no Apple Sign-In (spec §2).
- Sync is a one-time push per login (local → cloud), not bidirectional/realtime (spec §2).
- Use only Expo SDK ~57 APIs: `SQLite.openDatabaseAsync`, `db.execAsync`/`db.runAsync`/`db.getFirstAsync`, `WebBrowser.openAuthSessionAsync(url, redirectUrl)` (verified against https://docs.expo.dev/versions/v57.0.0/).
- Env vars already present in `.env`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **Note:** the current `.env` file is missing a newline between the first two variable lines (`...ElGQhjTsEXPO_PUBLIC_SUPABASE_URL=...` runs together) — Task 1 includes a step to fix this before it's read anywhere.
- No local prompts CRUD exists yet in this repo. This plan creates the minimal local schema (`vaults`, `prompts`, FTS5) needed to have something to sync — it does not build prompt CRUD UI (save/search/copy screens are a separate, already-noted future spec).

---

### Task 0: Fix `.env` formatting and install new dependency

**Files:**
- Modify: `.env`
- Modify: `package.json`

**Interfaces:**
- Produces: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as two cleanly separated lines, readable by `expo-constants`/`process.env` at build time.

- [ ] **Step 1: Fix the `.env` file**

Open `.env` and make sure it reads as exactly two lines (keep the real values already in the file, just separate them):

```
EXPO_PUBLIC_SUPABASE_URL=<existing url value>
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing publishable key value>
```

Remove the stray duplicate `EXPO_PUBLIC_SUPABASE_URL=` fragment that's currently concatenated onto the key value.

- [ ] **Step 2: Install AsyncStorage**

Run: `yarn add @react-native-async-storage/async-storage`

- [ ] **Step 3: Verify install**

Run: `yarn why @react-native-async-storage/async-storage`
Expected: prints the resolved version, no error.

- [ ] **Step 4: Commit**

```bash
git add .env package.json yarn.lock
git commit -m "chore: fix env formatting, add AsyncStorage dependency"
```

---

### Task 1: Local SQLite schema (`vaults`, `prompts`, FTS5)

**Files:**
- Create: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

**Interfaces:**
- Produces: `getDb(): Promise<SQLite.SQLiteDatabase>` — opens (once, memoized) and migrates `promptvaults.db`.
- Produces: `PERSONAL_VAULT_ID: string` — a fixed UUID constant used as the default local vault's id (no UI to create vaults yet, so one implicit personal vault always exists).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/db.test.ts
import { getDb, PERSONAL_VAULT_ID } from './db';

describe('getDb', () => {
  it('creates the vaults and prompts tables and seeds the personal vault', async () => {
    const db = await getDb();
    const vault = await db.getFirstAsync<{ id: string; type: string }>(
      'SELECT id, type FROM vaults WHERE id = ?',
      PERSONAL_VAULT_ID
    );
    expect(vault?.type).toBe('personal');

    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info('prompts')");
    const colNames = cols.map((c) => c.name);
    expect(colNames).toEqual(
      expect.arrayContaining([
        'id', 'vault_id', 'title', 'content', 'category', 'tags',
        'is_favorite', 'created_at', 'updated_at', 'synced_at',
      ])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn jest src/lib/db.test.ts`
Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/db.ts
import * as SQLite from 'expo-sqlite';

export const PERSONAL_VAULT_ID = '00000000-0000-4000-8000-000000000001';

const DATABASE_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('promptvaults.db').then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS vaults (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('personal','group')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL REFERENCES vaults(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
      title, content, category, tags,
      content='prompts', content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
      INSERT INTO prompts_fts(rowid, title, content, category, tags)
      VALUES (new.rowid, new.title, new.content, new.category, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
      INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
      VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
      INSERT INTO prompts_fts(prompts_fts, rowid, title, content, category, tags)
      VALUES ('delete', old.rowid, old.title, old.content, old.category, old.tags);
      INSERT INTO prompts_fts(rowid, title, content, category, tags)
      VALUES (new.rowid, new.title, new.content, new.category, new.tags);
    END;
  `);

  await db.runAsync(
    'INSERT OR IGNORE INTO vaults (id, name, type, created_at) VALUES (?, ?, ?, ?)',
    PERSONAL_VAULT_ID,
    'Kho cá nhân',
    'personal',
    Date.now()
  );

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn jest src/lib/db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: add local SQLite schema for vaults and prompts"
```

---

### Task 2: Supabase client module

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `src/lib/supabase.test.ts`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `process.env` (Task 0).
- Produces: `supabase: SupabaseClient` — the shared client used by every other `src/lib/*` module in this plan.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/supabase.test.ts
import { supabase } from './supabase';

describe('supabase client', () => {
  it('is configured with auth persistence enabled', () => {
    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn jest src/lib/supabase.test.ts`
Expected: FAIL — `Cannot find module './supabase'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn jest src/lib/supabase.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts
git commit -m "feat: add Supabase client with AsyncStorage session persistence"
```

---

### Task 3: Supabase-side tables and RLS (manual SQL, not app code)

**Files:**
- Create: `supabase/migrations/20260918000000_profiles_and_prompts.sql`

**Interfaces:**
- Produces: `public.profiles` and `public.prompts` tables with RLS, consumed by Task 4 (`profiles` insert) and Task 9 (`prompts` upsert).

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260918000000_profiles_and_prompts.sql
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

create table public.prompts (
  id text primary key,
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

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (requires the project to already be linked with `npx supabase link`; if not yet linked, run the SQL directly in the Supabase dashboard's SQL editor instead).
Expected: `profiles` and `prompts` tables exist in the Supabase project, visible under Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260918000000_profiles_and_prompts.sql
git commit -m "feat: add Supabase profiles and prompts tables with RLS"
```

---

### Task 4: Email/password auth functions

**Files:**
- Create: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (Task 2).
- Produces: `signUpWithEmail(input: SignUpInput): Promise<void>`, `signInWithEmail(input: SignInInput): Promise<void>`, `getSession(): Promise<Session | null>`, `onAuthStateChange(cb: (session: Session | null) => void): () => void` — all consumed by the Auth screen (Task 5) and root layout (Task 6).
- Types: `SignUpInput = { email: string; password: string; firstName: string; lastName: string; username: string }`, `SignInInput = { email: string; password: string }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/auth.test.ts
jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { supabase } from './supabase';
import { signUpWithEmail, signInWithEmail } from './auth';

describe('signUpWithEmail', () => {
  it('signs up then inserts a profile row for the new user', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const insert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ insert });

    await signUpWithEmail({
      email: 'a@b.com',
      password: 'secret123',
      firstName: 'An',
      lastName: 'Nguyen',
      username: 'annguyen',
    });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
    });
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(insert).toHaveBeenCalledWith({
      id: 'user-1',
      username: 'annguyen',
      first_name: 'An',
      last_name: 'Nguyen',
    });
  });

  it('throws when sign up fails', async () => {
    (supabase.auth.signUp as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'user_already_exists' },
    });

    await expect(
      signUpWithEmail({
        email: 'a@b.com',
        password: 'secret123',
        firstName: 'An',
        lastName: 'Nguyen',
        username: 'annguyen',
      })
    ).rejects.toThrow('user_already_exists');
  });
});

describe('signInWithEmail', () => {
  it('calls supabase signInWithPassword', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });

    await signInWithEmail({ email: 'a@b.com', password: 'secret123' });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret123',
    });
  });

  it('throws on invalid credentials', async () => {
    (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: 'invalid_credentials' },
    });

    await expect(signInWithEmail({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      'invalid_credentials'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn jest src/lib/auth.test.ts`
Expected: FAIL — `Cannot find module './auth'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/auth.ts
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type SignUpInput = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export async function signUpWithEmail(input: SignUpInput): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('sign_up_failed');

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id,
    username: input.username,
    first_name: input.firstName,
    last_name: input.lastName,
  });
  if (profileError) throw new Error(profileError.message);
}

export async function signInWithEmail(input: SignInInput): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) throw new Error(error.message);
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn jest src/lib/auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: add email/password sign up and sign in"
```

---

### Task 5: Auth screen (email/password forms)

**Files:**
- Create: `src/app/onboarding/auth.tsx`
- Test: manual (see Task 5 Step 4) — component tests are out of scope for this plan; RN component testing setup isn't present in the repo yet, so this task's screens are verified manually per the spec's §8 test plan.

**Interfaces:**
- Consumes: `signUpWithEmail`, `signInWithEmail` from `src/lib/auth.ts` (Task 4).
- Produces: route `/onboarding/auth`, navigated to from the Welcome screen (Task 6) with an optional `?mode=signup|signin` param.

- [ ] **Step 1: Implement the screen**

```typescript
// src/app/onboarding/auth.tsx
import { useState } from 'react';
import { View, TextInput, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { signInWithEmail, signUpWithEmail } from '@/lib/auth';

const ERROR_MESSAGES: Record<string, string> = {
  user_already_exists: 'Email này đã được đăng ký.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
};

function friendlyError(message: string): string {
  if (message.includes('duplicate key') && message.includes('username')) {
    return 'Username đã được sử dụng.';
  }
  return ERROR_MESSAGES[message] ?? 'Có lỗi xảy ra, thử lại sau.';
}

export default function AuthScreen() {
  const { mode: initialMode } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<'signup' | 'signin'>(
    initialMode === 'signup' ? 'signup' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail({ email, password, firstName, lastName, username });
      } else {
        await signInWithEmail({ email, password });
      }
      router.replace('/onboarding/sync');
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === 'signup' ? 'Đăng ký' : 'Đăng nhập'}</Text>

      {mode === 'signup' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Username"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder="Tên"
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={styles.input}
            placeholder="Họ"
            value={lastName}
            onChangeText={setLastName}
          />
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mật khẩu"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'signup' ? 'Đăng ký' : 'Đăng nhập'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        <Text style={styles.switchText}>
          {mode === 'signup' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D14343' },
  switchText: { color: '#208AEF', textAlign: 'center', marginTop: 8 },
});
```

- [ ] **Step 2: Start the dev server and navigate manually**

Run: `yarn start`, open the app, navigate to `/onboarding/auth` (temporarily, e.g. by typing the path in Expo Router's dev menu or a temporary link on the home screen from Task 6).
Expected: form renders; submitting with an existing email shows "Email này đã được đăng ký." if in sign-up mode; submitting valid new credentials navigates to `/onboarding/sync` (route created in Task 10 — until then, expect a "Unmatched Route" screen, which confirms navigation fired correctly).

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/auth.tsx
git commit -m "feat: add email/password auth screen"
```

---

### Task 6: Welcome screen + entry point wiring

**Files:**
- Create: `src/app/onboarding/welcome.tsx`
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `getSession`, `onAuthStateChange` from `src/lib/auth.ts` (Task 4).
- Produces: route `/onboarding/welcome`; modifies the home screen to show either "Đăng nhập để đồng bộ" (no session) or "Đã đồng bộ với <email>" (session present).

- [ ] **Step 1: Implement the Welcome screen**

```typescript
// src/app/onboarding/welcome.tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';

export default function WelcomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PromptVault</Text>
      <Text style={styles.subtitle}>
        Lưu trữ gọn gàng – Tìm kiếm thần tốc – Copy 1 chạm cho content creator.
      </Text>

      <Pressable style={styles.primaryButton} onPress={() => router.push('/onboarding/auth?mode=signup')}>
        <Text style={styles.primaryButtonText}>Đăng ký / Đăng nhập để đồng bộ</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.secondaryText}>Dùng ngay, không cần tài khoản</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555' },
  primaryButton: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { color: '#208AEF', textAlign: 'center', marginTop: 8 },
});
```

- [ ] **Step 2: Wire the entry point in the home screen**

```typescript
// src/app/index.tsx
import { useEffect, useState } from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '@/lib/auth';

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, []);

  return (
    <View style={styles.container}>
      <Text>Edit src/app/index.tsx to edit this screen.</Text>

      <Pressable onPress={() => router.push('/onboarding/welcome')} style={styles.accountRow}>
        <Text style={styles.accountText}>
          {session ? `Đã đồng bộ với ${session.user.email}` : 'Đăng nhập để đồng bộ'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  accountRow: { padding: 12 },
  accountText: { color: '#208AEF' },
});
```

- [ ] **Step 3: Manual verification**

Run: `yarn start`, confirm the home screen loads with no session and shows "Đăng nhập để đồng bộ"; tapping it opens Welcome; "Dùng ngay" returns to home with no navigation errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/welcome.tsx src/app/index.tsx
git commit -m "feat: add welcome screen and session-aware home entry point"
```

---

### Task 7: Google SSO

**Files:**
- Modify: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: `supabase` (Task 2), `WebBrowser.openAuthSessionAsync` (`expo-web-browser`, already a dependency).
- Produces: `signInWithGoogle(): Promise<void>`, added to the exports from Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/auth.test.ts
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'promptvaults://onboarding/sync'),
}));

import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogle } from './auth';

describe('signInWithGoogle', () => {
  it('opens the OAuth URL from supabase and sets the session on success', async () => {
    (supabase.auth.signInWithOAuth as jest.Mock) = jest.fn().mockResolvedValue({
      data: { url: 'https://supabase.example/oauth/google' },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'promptvaults://onboarding/sync#access_token=abc&refresh_token=def',
    });
    (supabase.auth as any).setSession = jest.fn().mockResolvedValue({ error: null });

    await signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'promptvaults://onboarding/sync', skipBrowserRedirect: true },
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://supabase.example/oauth/google',
      'promptvaults://onboarding/sync'
    );
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'abc',
      refresh_token: 'def',
    });
  });

  it('does nothing when the user cancels', async () => {
    (supabase.auth.signInWithOAuth as jest.Mock) = jest.fn().mockResolvedValue({
      data: { url: 'https://supabase.example/oauth/google' },
      error: null,
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });
    (supabase.auth as any).setSession = jest.fn();

    await signInWithGoogle();

    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn jest src/lib/auth.test.ts`
Expected: FAIL — `signInWithGoogle is not a function`

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to src/lib/auth.ts
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL('onboarding/sync');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error('missing_oauth_url');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;

  const params = new URLSearchParams(result.url.split('#')[1] ?? '');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) throw new Error('missing_tokens');

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) throw new Error(sessionError.message);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn jest src/lib/auth.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: add Google SSO via Supabase OAuth"
```

---

### Task 8: Wire the Google button into the Auth screen

**Files:**
- Modify: `src/app/onboarding/auth.tsx`

**Interfaces:**
- Consumes: `signInWithGoogle` from `src/lib/auth.ts` (Task 7).

- [ ] **Step 1: Add the button and handler**

```typescript
// src/app/onboarding/auth.tsx — add alongside the existing imports
import { signInWithGoogle } from '@/lib/auth';

// inside AuthScreen, add a new handler next to handleSubmit
async function handleGoogleSignIn() {
  setError(null);
  setLoading(true);
  try {
    await signInWithGoogle();
    router.replace('/onboarding/sync');
  } catch (e) {
    setError(friendlyError(e instanceof Error ? e.message : String(e)));
  } finally {
    setLoading(false);
  }
}

// in the JSX, after the mode-switch Pressable:
<Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading}>
  <Text style={styles.googleButtonText}>Tiếp tục với Google</Text>
</Pressable>
```

```typescript
// add to the styles object
googleButton: { borderWidth: 1, borderColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
googleButtonText: { color: '#208AEF', fontWeight: '600' },
```

- [ ] **Step 2: Manual verification**

Run: `yarn start`, tap "Tiếp tục với Google" on the Auth screen, confirm the system browser opens Google's consent screen and returns to the app on completion (or shows no error dialog on cancel).

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/auth.tsx
git commit -m "feat: wire Google sign-in button into auth screen"
```

---

### Task 9: Push local prompts to Supabase

**Files:**
- Create: `src/lib/sync.ts`
- Test: `src/lib/sync.test.ts`

**Interfaces:**
- Consumes: `getDb` (Task 1), `supabase` (Task 2).
- Produces: `pushLocalPromptsToCloud(): Promise<{ synced: number; failed: number }>`, consumed by the Sync screen (Task 10).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/sync.test.ts
jest.mock('./db', () => ({
  getDb: jest.fn(),
}));
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { getDb } from './db';
import { supabase } from './supabase';
import { pushLocalPromptsToCloud } from './sync';

describe('pushLocalPromptsToCloud', () => {
  it('upserts unsynced rows and marks them synced', async () => {
    const rows = [
      { id: 'p1', vault_id: 'v1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ];
    const runAsync = jest.fn();
    const db = { getAllAsync: jest.fn().mockResolvedValue(rows), runAsync };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const result = await pushLocalPromptsToCloud();

    expect(upsert).toHaveBeenCalledWith([
      { id: 'p1', user_id: 'user-1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ]);
    expect(runAsync).toHaveBeenCalledWith('UPDATE prompts SET synced_at = ? WHERE id = ?', expect.any(Number), 'p1');
    expect(result).toEqual({ synced: 1, failed: 0 });
  });

  it('counts a failed upsert without throwing', async () => {
    const rows = [
      { id: 'p1', vault_id: 'v1', title: 'T1', content: 'C1', category: null, tags: null, is_favorite: 0, created_at: 1, updated_at: 2 },
    ];
    const db = { getAllAsync: jest.fn().mockResolvedValue(rows), runAsync: jest.fn() };
    (getDb as jest.Mock).mockResolvedValue(db);
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'network error' } });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const result = await pushLocalPromptsToCloud();

    expect(result).toEqual({ synced: 0, failed: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn jest src/lib/sync.test.ts`
Expected: FAIL — `Cannot find module './sync'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/sync.ts
import { getDb } from './db';
import { supabase } from './supabase';

type LocalPromptRow = {
  id: string;
  vault_id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string | null;
  is_favorite: number;
  created_at: number;
  updated_at: number;
};

export async function pushLocalPromptsToCloud(): Promise<{ synced: number; failed: number }> {
  const db = await getDb();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('not_authenticated');

  const rows = await db.getAllAsync<LocalPromptRow>(
    'SELECT id, vault_id, title, content, category, tags, is_favorite, created_at, updated_at FROM prompts WHERE synced_at IS NULL OR updated_at > synced_at'
  );

  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const { error } = await supabase.from('prompts').upsert([
      {
        id: row.id,
        user_id: userId,
        title: row.title,
        content: row.content,
        category: row.category,
        tags: row.tags,
        is_favorite: row.is_favorite,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    ]);

    if (error) {
      failed += 1;
      continue;
    }

    await db.runAsync('UPDATE prompts SET synced_at = ? WHERE id = ?', Date.now(), row.id);
    synced += 1;
  }

  return { synced, failed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn jest src/lib/sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/sync.test.ts
git commit -m "feat: add one-time local-to-cloud prompt sync"
```

---

### Task 10: Sync screen

**Files:**
- Create: `src/app/onboarding/sync.tsx`

**Interfaces:**
- Consumes: `pushLocalPromptsToCloud` from `src/lib/sync.ts` (Task 9).

- [ ] **Step 1: Implement the screen**

```typescript
// src/app/onboarding/sync.tsx
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { pushLocalPromptsToCloud } from '@/lib/sync';

export default function SyncScreen() {
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [result, setResult] = useState<{ synced: number; failed: number } | null>(null);

  async function handleSync() {
    setStatus('syncing');
    const r = await pushLocalPromptsToCloud();
    setResult(r);
    setStatus('done');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đồng bộ dữ liệu?</Text>
      <Text style={styles.subtitle}>
        Đẩy các prompt hiện có trên máy lên tài khoản của bạn để không bị mất khi đổi thiết bị.
      </Text>

      {status === 'done' && result && (
        <Text style={styles.resultText}>
          Đã đồng bộ {result.synced} prompt{result.failed > 0 ? `, ${result.failed} lỗi` : ''}.
        </Text>
      )}

      <Pressable style={styles.primaryButton} onPress={handleSync} disabled={status === 'syncing'}>
        {status === 'syncing' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Đồng bộ ngay</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.replace('/')}>
        <Text style={styles.secondaryText}>Để sau</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#555' },
  resultText: { textAlign: 'center', color: '#208AEF' },
  primaryButton: { backgroundColor: '#208AEF', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '600' },
  secondaryText: { color: '#208AEF', textAlign: 'center', marginTop: 8 },
});
```

- [ ] **Step 2: Manual verification (full flow, per spec §8)**

Run: `yarn start`. Confirm: guest flow never sees onboarding screens unless "Đăng nhập để đồng bộ" is tapped; sign-up creates a `profiles` row (check Supabase Table Editor); sign-in with a wrong password shows the inline error; Google SSO round-trips back to `/onboarding/sync`; tapping "Đồng bộ ngay" with local prompts present (insert a test row manually via `db.runAsync` in a debug script if none exist yet) upserts them into Supabase's `prompts` table and sets `synced_at` locally.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/sync.tsx
git commit -m "feat: add sync screen to complete onboarding flow"
```

---

## Stage Summary

- **Stage 1 (Tasks 0-3):** env fix, local schema, Supabase client, Supabase tables/RLS. No user-visible change.
- **Stage 2 (Tasks 4-6):** working email/password auth end-to-end, session-aware home screen.
- **Stage 3 (Tasks 7-8):** Google SSO added to the same Auth screen.
- **Stage 4 (Tasks 9-10):** first-login sync of local prompts to Supabase.

Each stage's tasks can ship and be demoed independently; later stages only add to what's already working.
