# ClarityOS EHR — Code Conventions

Derived from direct analysis of the codebase as of 2026-03-05.

---

## 1. TypeScript Conventions

### Strict Mode
TypeScript is configured with `"strict": true` in `tsconfig.json`. Target is `ES2017`, module resolution is `bundler`. `noEmit` is set, so `tsc` is used for type-checking only, never compilation.

### `interface` vs `type`
Both are used, with a clear split by purpose:

- **`interface`** for object shapes (props, store states, API response bodies, hook return objects):
  ```ts
  // types/session.ts
  export interface AppSession {
    user: UserSession;
    tenant: TenantSession;
    accessToken: string;
    expiresAt: Date;
  }

  // hooks/useEntitlements.ts
  export interface UseEntitlementsReturn {
    has: (key: EntitlementKey) => boolean;
    hasAll: (...keys: EntitlementKey[]) => boolean;
    // ...
  }
  ```

- **`type`** for union types, discriminated unions, and aliased primitives:
  ```ts
  // types/session.ts
  export type StaffRole = "doctor" | "technician" | "receptionist" | "admin" | "owner";
  export type PlanName = "Core" | "Plus" | "Premium" | (string & {}); // open-ended union trick

  // types/refraction.ts
  export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
  export type RefractionType = "habitual" | "auto" | "manifest" | "cycloplegic" | "final";
  ```

- Store types are composed by intersecting a State interface and an Actions interface:
  ```ts
  // store/refractionStore.ts
  interface RefractionStoreState { ... }
  interface RefractionStoreActions { ... }
  type RefractionStore = RefractionStoreState & RefractionStoreActions;
  ```

### Type Import Syntax
Type-only imports use the `import type` syntax consistently:
```ts
import type { AppSession } from "@/types/session";
import type { EntitlementKey, StaffRole } from "@/types/session";
```
Value imports and type imports are separated where both are needed.

### Generics and `satisfies`
The `satisfies` operator is used to validate constant objects against a known type while preserving literal types:
```ts
// lib/entitlements.ts
export const Entitlement = {
  AI_SCRIBE: "ai_scribe" as const,
  // ...
} satisfies Record<string, EntitlementKey>;
```

### Null Handling
The pattern `value | null` (not `undefined`) is the standard for optional database fields. In-component optional props use `?:` (which allows `undefined`). API/type boundary fields always explicitly use `| null`.

### Exhaustive Switch / Record Patterns
Switch statements over union types are used for exhaustive dispatch (e.g., in `getDraftValue`/`setDraftValue` in `types/refraction.ts`). Record types with union keys are used for lookup tables:
```ts
export const REFRACTION_COLUMN_LABELS: Record<RefractionType, string> = { ... };
```

---

## 2. Component Patterns

### `"use client"` Directive
Every component file that uses React hooks, browser APIs, or Zustand stores has `"use client"` as the first line. Server components (Next.js default) are only used for layouts and page shells that do not need interactivity directly. The tenant layout (`app/(tenant)/[tenantId]/layout.tsx`) is `"use client"` because it reads Zustand state. Encounter pages are `"use client"`.

Pages that are purely server-rendered (no hooks) do not carry the directive, but in practice most pages in this app do carry it.

### Named Exports (Components)
All production components use **named exports**, not default exports — with one exception: Next.js page and layout files use `export default` as required by the framework.
```ts
// components/Sidebar.tsx
export function Sidebar({ tenantId, isCollapsed, onToggle }: SidebarProps) { ... }

// components/auth/PermissionGate.tsx
export function PermissionGate({ roles, children, fallback, mode = "hide" }: PermissionGateProps) { ... }
```

### Prop Type Pattern
Props are declared as local `interface` definitions immediately above the component function, not inline or in a separate file:
```ts
interface SidebarProps {
  tenantId: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ tenantId, isCollapsed, onToggle }: SidebarProps) { ... }
```

### Hook Usage in Components
Hooks are called at the top of the component body. Zustand selectors are used via inline arrow functions to select only the needed slice:
```ts
const isFinalized = useEncounterStore(
  (s) => s.encounters[encounterId]?.isFinalized ?? false
);
const user = useCurrentUser(); // pre-built selector hook
```

Store actions are retrieved as stable references (Zustand actions are stable by default):
```ts
const initEncounter = useEncounterStore((s) => s.initEncounter);
const advanceStatus = useEncounterStore((s) => s.advanceStatus);
```

### `useCallback` and `useMemo`
`useCallback` is applied to all event handler functions passed as props or captured in `useEffect` dependency arrays:
```ts
const handleGenerate = useCallback(() => { ... }, [hasAiScribe, transcript, generate]);
const handleAccept = useCallback(() => { ... }, [...deps]);
```

`useMemo` is used for expensive derived computations that depend on session state or complex object graphs:
```ts
// hooks/useEntitlements.ts
return useMemo((): UseEntitlementsReturn => {
  if (!session) { return { has: () => false, ... }; }
  // ...
}, [session]);
```

### Small Sub-Components
Internal-only sub-components are defined in the same file as the parent page, above the main export. They are not exported. Examples include `UpsellModal`, `AiScribeWidget`, and `EncounterWorkflowHeader` in the encounter page file.

### PermissionGate Pattern
Role-based UI gating uses the `<PermissionGate>` component for declarative wrapping, or the `requireRole(...)` function from `useEntitlements()` for imperative gating:
```tsx
// Declarative
<PermissionGate roles={["doctor", "owner"]}>
  <DiagnosisPicker ... />
</PermissionGate>

// Imperative
const canEditClinical = requireRole("doctor", "technician", "owner");
```

---

## 3. Zustand Store Patterns

### Store File Structure
Each store follows this structure, in this order:
1. JSDoc block explaining the store's purpose, architecture, and usage
2. Imports
3. State interface
4. Actions interface
5. Combined type alias (`type FooStore = FooStoreState & FooStoreActions`)
6. Helper functions (e.g., `emptySlice()`)
7. Store creation with `create<FooStore>()()`
8. Selector hook exports

### Middleware Stack
- `devtools` is used on **every store**, wrapping the entire store. The `name` option always uses the `"ClarityOS/StoreName"` convention:
  ```ts
  devtools((set, get) => ({ ... }), { name: "ClarityOS/Refraction" })
  ```
- `persist` is used on stores that need localStorage persistence (theme, tenant customization). It is composed inside `devtools`:
  ```ts
  create<ThemeState>()(
    devtools(
      persist((set) => ({ ... }), { name: "clarity-theme" }),
      { name: "ClarityOS/Theme" }
    )
  )
  ```
- `subscribeWithSelector` is used on stores where cross-store subscriptions or fine-grained subscriptions are needed (refraction, diagnosis). It is composed inside `devtools`:
  ```ts
  create<DiagnosisStore>()(
    devtools(
      subscribeWithSelector((set, get) => ({ ... })),
      { name: "ClarityOS/Diagnoses" }
    )
  )
  ```

### `set` Calls
All `set` calls use the three-argument form for devtools labeling:
```ts
set({ session, isLoading: false }, false, "setSession");
set((state) => ({ ... }), false, "actionName");
```
The second argument is always `false` (do not replace — merge).

### `init` Functions
Stores that are scoped to an encounter use an `init` action that is idempotent (safe to call multiple times):
```ts
init(encounterId, initial) {
  const existing = get().encounters[encounterId];
  if (existing) return; // idempotent guard
  set((state) => ({ encounters: { ...state.encounters, [encounterId]: { ... } } }), false, "init");
},
```
Components call `init` inside a `useEffect` with the encounter ID in the dependency array.

### Encounter-Keyed State
Multi-encounter stores (diagnosis, vitals, exam findings) key their state by `encounterId`:
```ts
interface DiagnosisStoreState {
  encounters: Record<string, DiagnosisSlice>;
}
```
This allows multiple encounter windows to coexist in Zustand without state collision.

### Selector Hooks
Each store exports named selector hooks below the store definition to prevent re-renders from unrelated state changes:
```ts
// store/sessionStore.ts
export const useSession = () => useSessionStore((s) => s.session);
export const useCurrentUser = () => useSessionStore((s) => s.session?.user ?? null);
export const useCurrentTenant = () => useSessionStore((s) => s.session?.tenant ?? null);

// store/refractionStore.ts
export const useColumnState = (colIndex: number) =>
  useRefractionStore((s) => s.columns[colIndex]);
export const useFocusedCell = () =>
  useRefractionStore((s) => s.focusedCell);
```

### Private Actions Convention
Internal helper actions that should not be called directly by components are prefixed with an underscore:
```ts
// store/diagnosisStore.ts
_addLocal: (encounterId: string, dx: Diagnosis) => void;
_removeLocal: (encounterId: string, diagnosisId: string) => void;

// store/refractionStore.ts
_setStatus: (colIndex: number, status: SaveStatus) => void;
```

### Debounce Outside Store State
Debounce timer IDs are stored in a module-level `Record` outside the Zustand state to avoid triggering re-renders on timer changes:
```ts
// store/refractionStore.ts
const debounceTimers: Record<number, ReturnType<typeof setTimeout>> = {};
const DEBOUNCE_MS = 1500;
```

---

## 4. CSS/Styling Patterns

### CSS Variables First
All design tokens are defined as CSS custom properties in `app/globals.css`. Tailwind utility classes reference these variables through the `tailwind.config.ts` mapping, and inline `style` props also reference them directly:
```tsx
style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--glass-border)" }}
```

### Class Composition with `cn()`
The `cn()` utility (`lib/utils.ts`) combines `clsx` and `tailwind-merge` and is used for all conditional class composition:
```ts
import { cn } from "@/lib/utils";
// Usage:
className={cn(badgeVariants({ variant }), className)}
```

### Glassmorphism System Classes
A set of semantic CSS classes defined in globals.css are used throughout rather than duplicating backdrop/border/shadow values:
- `.glass-card` — standard glass container
- `.glass-card-hover` — glass container with hover transition
- `.glass-card-accent` — glass container with accent border glow
- `.glass-input` — form input with glass styling
- `.ambient-bg` — layered gradient background for the tenant shell
- `.nav-item` and `.nav-item.active` — sidebar nav states

### Typography Utility Classes
Semantic text size classes are defined in globals.css and used in JSX instead of raw Tailwind size utilities:
- `.text-display`, `.text-heading`, `.text-subhead`
- `.text-body`, `.text-caption`, `.text-overline`

### Animation Classes
- `.stagger` — applied to the top-level container of a page; children animate in sequence via CSS `nth-child` delays
- `.animate-glow` / `.animate-enter` — entrance animations

### `cva` for Component Variants
shadcn/ui components use `class-variance-authority` for variant management:
```ts
// components/ui/badge.tsx
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all",
  {
    variants: {
      variant: {
        default: "border-[var(--mono-border)] bg-[var(--accent-dim)] text-[var(--accent)]",
        destructive: "border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.10)] text-[var(--state-critical)]",
        // ...
      },
    },
  }
);
```
All color values in `cva` variants use CSS variable references via the `[var(--...)]` Tailwind arbitrary-value syntax.

### Tailwind Arbitrary Values for CSS Variables
Rather than hard-coding colors, Tailwind's arbitrary value syntax is used for CSS variable references throughout JSX:
```tsx
className="text-[var(--text-secondary)]"
className="bg-[var(--accent-dim)]"
className="border-[var(--glass-border)]"
```

### Inline Styles for Dynamic/Non-Tailwind Values
CSS variables that need to be dynamically composed (accent color derivation, sidebar width transitions) are applied as inline `style` props:
```tsx
style={{ width: isCollapsed ? "60px" : "var(--sidebar-width)", transition: "width 200ms var(--ease-out-expo)" }}
```

---

## 5. Import Conventions

### Path Alias
All imports within the project use the `@/` path alias, which maps to the project root. No relative imports (`../`) are used except potentially within node_modules:
```ts
import { cn } from "@/lib/utils";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement } from "@/lib/entitlements";
import type { AppSession } from "@/types/session";
```

### Import Grouping Order (within a file)
1. React/Next.js framework imports
2. Third-party library imports (lucide-react, class-variance-authority, etc.)
3. Internal `@/` imports — hooks
4. Internal `@/` imports — stores
5. Internal `@/` imports — components
6. Internal `@/` imports — lib utilities
7. Internal `@/` imports — types (often with `import type`)

### Type vs Value Imports
`import type` is used for TypeScript-only imports (interfaces, type aliases) to ensure they are erased at compile time. Value imports are plain `import`.

---

## 6. Error Handling Patterns

### API Calls — Try/Catch with Mock Fallback
All API calls use `try/catch`. When the backend is unavailable (development or Vercel preview), a local mock fallback is executed rather than showing an error:
```ts
// store/refractionStore.ts
try {
  const json = await apiFetch<{ id: string }>(...);
  savedDraft = { ...draft, id: json.id ?? draft.id };
} catch {
  // Fallback to mock when backend is unavailable
  await new Promise((resolve) => setTimeout(resolve, 400));
  savedDraft = { ...draft, id: draft.id ?? `mock-rx-${draft.refraction_type}-${Date.now()}` };
}
```

### Error State in Stores
Stores carry explicit `error: string | null` or `errors: FieldError[]` fields. Errors are set on failure and cleared on the next successful operation:
```ts
interface DiagnosisSlice {
  diagnoses: Diagnosis[];
  saveStatus: SaveStatus;
  error: string | null;
}
```

### `err instanceof Error` Guard
When catching unknown errors, `err instanceof Error` is used to safely extract the message:
```ts
error: err instanceof Error ? err.message : "Failed to save",
```

### `console.error` for Non-Recoverable Failures
Unexpected errors in async handlers use `console.error` for developer visibility without crashing the UI:
```ts
console.error("AI Scribe JSON parse error:", e);
```

### `apiFetch` Throws on Non-OK Responses
The central `apiFetch` utility in `lib/api-client.ts` reads `body.detail` (Pydantic error format) on non-OK responses and throws a typed `Error`:
```ts
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  throw new Error(body.detail ?? `API error ${res.status}`);
}
```

### eslint-disable-next-line for Intentional Hook Dependency Omissions
When a `useEffect` intentionally omits a dependency (run-once mount behavior), the ESLint suppression comment is used inline:
```ts
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

---

## 7. Mock Data Patterns

### Persona System
Mock data is organized around **personas** — rich, clinically realistic patient + encounter states — rather than minimal stub objects. Personas are defined in `lib/mock/personas.ts` and keyed by both `encounterId` and `patientId`.

The `getInitialStoreState(encounterId, patientId)` function is the single entry point for resolving mock state, with three priority levels:
1. Encounter-specific demo (keyed by `encounterId`)
2. Patient-specific legacy (keyed by `patientId`)
3. Generic default

### MockScenario Type for Auth Personas
Auth personas use a `MockScenario` union type with named string literals:
```ts
export type MockScenario =
  | "premium_doctor"
  | "technician"
  | "core_plan"
  | "receptionist"
  | "owner";
```
The `getMockSession(scenario)` factory returns a fully hydrated `AppSession` for any scenario. The default is `"premium_doctor"`.

### Mock Session Initialization
The `sessionStore.ts` initializes with `getMockSession("premium_doctor")` in development. This is clearly commented with a `PRODUCTION:` note explaining what to change for real auth:
```ts
// DEVELOPMENT: Pre-populate with a mock session
session: getMockSession("premium_doctor"),
// PRODUCTION: Change this to `null` and initialize via setSession()
```

### Mock API Fallbacks in Stores
When an API call fails, stores silently fall back to a locally constructed mock object using `crypto.randomUUID()` for IDs. This allows the UI to function fully without a backend running.

### Named Mock ID Convention
Mock IDs follow a predictable naming scheme: `"mock-dx-001-1"`, `"mock-rx-p01-habitual"`, `"mock-prb-002-3"`, etc. This makes mock data visually distinguishable from real UUIDs in devtools.

### Unicode Escapes in String Literals
Due to an earlier fix, Unicode characters in JSX string attributes that would cause issues are represented as `\uXXXX` escape sequences inside template strings or regular strings, not as raw Unicode in JSX attributes. Literal special characters are acceptable in JSX text content nodes.

---

## 8. File and Naming Conventions

### File Naming
- Component files: PascalCase matching the export name (`Sidebar.tsx`, `PermissionGate.tsx`)
- Hook files: camelCase with `use` prefix (`useEntitlements.ts`, `useAiScribe.ts`)
- Store files: camelCase with `Store` suffix (`sessionStore.ts`, `diagnosisStore.ts`)
- Type files: kebab-case matching the domain (`exam-findings.ts`, `patient-problem.ts`)
- Lib utility files: kebab-case (`api-client.ts`, `color-utils.ts`, `rx-format.ts`)
- Mock data files: kebab-case with `mock-` prefix (`mock-session.ts`, `mock-patient-data.ts`)

### Directory Structure
```
app/                    Next.js App Router pages and layouts
components/
  ui/                   shadcn/ui primitives (Badge, Button, Card, etc.)
  encounter/            Encounter-specific components
  patient/              Patient-specific components
  auth/                 Auth/permission components
hooks/                  Custom React hooks
store/                  Zustand stores
types/                  TypeScript type definitions
lib/
  auth/                 Auth utilities and mock sessions
  mock/                 Rich mock data (personas)
```

### Constants as Typed `const` Objects
Feature key constants, entitlement metadata, plan feature lists, and column/row labels are all exported as `const` objects or arrays with explicit typing rather than as enum values:
```ts
export const REFRACTION_COLUMNS: RefractionType[] = ["habitual", "auto", "manifest", "final"];
export const Entitlement = { AI_SCRIBE: "ai_scribe" as const, ... } satisfies Record<string, EntitlementKey>;
```
