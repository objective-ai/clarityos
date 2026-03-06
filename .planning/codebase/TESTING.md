# ClarityOS EHR — Testing Reference

Derived from direct analysis of the codebase as of 2026-03-05.

---

## Summary

This project has **no test files**. There are no `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files anywhere in the project source (outside `node_modules`). There is no test runner configured.

The project relies on three validation mechanisms instead:
1. TypeScript type checking (`tsc --noEmit`)
2. ESLint (`next lint`)
3. Next.js build validation (`next build`)

---

## 1. Test Files

A recursive glob for `**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}` returns zero results in the project source. There is no `__tests__` directory in the project root, `components/`, `hooks/`, `store/`, `lib/`, or `types/`.

**No test framework is installed.** The `devDependencies` in `package.json` contains:
```json
{
  "@types/node": "^20.14.11",
  "@types/react": "^18.3.3",
  "@types/react-dom": "^18.3.0",
  "autoprefixer": "^10.4.19",
  "eslint": "^8.57.0",
  "eslint-config-next": "14.2.5",
  "postcss": "^8.4.39",
  "tailwindcss": "^3.4.6",
  "typescript": "^5.5.3"
}
```

There is no Jest, Vitest, Playwright, Cypress, Testing Library, or any other test framework present.

---

## 2. Type Checking

### Configuration
TypeScript is configured in `tsconfig.json` with `"strict": true` and `"noEmit": true`. This means `tsc` is used exclusively as a type checker, not a compiler.

### Script
```json
// package.json
"type-check": "tsc --noEmit"
```

Run with:
```
npm run type-check
```

### What It Catches
- Missing or incorrect prop types on components
- Incorrect Zustand store selector return types
- Mismatched API request/response shapes
- Incorrect use of union type members (e.g., `SaveStatus`, `StaffRole`)
- Missing cases in exhaustive switch statements (when the return type makes it necessary)
- Type mismatches between the frontend type mirrors and what the stores expect

### Known Type Suppression
ESLint `// eslint-disable-next-line react-hooks/exhaustive-deps` comments appear in a few places in the encounter page to suppress intentional run-once mount effects.

---

## 3. Linting

### Configuration
The project uses the new flat ESLint config format (`eslint.config.mjs`):
```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
```

This applies:
- `eslint-config-next/core-web-vitals` — Next.js recommended rules + Core Web Vitals rules
- `eslint-config-next/typescript` — TypeScript-aware linting rules via `@typescript-eslint`

### Script
```json
"lint": "next lint"
```

Run with:
```
npm run lint
```

### What It Enforces
- React hooks rules (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`)
- Next.js-specific rules (no `<img>` without `next/image`, no `<a>` without `next/link`, etc.)
- TypeScript type-aware rules (no `any` in strict mode, no unused variables, etc.)
- JSX accessibility rules via `eslint-plugin-jsx-a11y`

### Lint Suppressions in the Codebase
Two instances of `// eslint-disable-next-line react-hooks/exhaustive-deps` appear in the encounter page (`app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx`) where run-once mount effects intentionally exclude dependencies that would cause infinite re-initialization loops.

---

## 4. Build Validation

### Script
```json
"build": "next build"
```

Run with:
```
npm run build
```

Next.js build performs:
- TypeScript compilation and type checking (equivalent to `tsc --noEmit`)
- ESLint run (unless disabled in `next.config.mjs`)
- Static analysis of page and layout exports
- Bundle optimization and code splitting

The `next.config.mjs` is minimal with no overrides:
```js
const nextConfig = {};
export default nextConfig;
```

This means default Next.js 14 build behavior applies, including failing the build on TypeScript errors and ESLint errors.

---

## 5. Manual Validation Strategy

In the absence of automated tests, the project uses several design patterns to maintain correctness:

### Type-Level Correctness
- Every store, hook, and component is fully typed. The type system enforces correct usage at the call site.
- Union types for enums (e.g., `SaveStatus`, `StaffRole`, `RefractionType`) provide exhaustiveness guarantees.
- The `satisfies` operator is used to validate constant objects without widening their types.

### Mock Persona System as Integration Smoke Test
The persona system (`lib/mock/personas.ts`) provides five realistic clinical scenarios that exercise the full data flow from store initialization through component rendering. Loading the app with a different `MockScenario` (e.g., switching `sessionStore.ts` from `"premium_doctor"` to `"technician"`) acts as a manual integration test for role-gating and entitlement flows.

### Dev-Only Safety Valves
The encounter page includes a dev-only "Unlock Encounter" button gated by `process.env.NODE_ENV === "development"`. This allows manually exercising the finalize/sign flow repeatedly without needing test infrastructure.

### API Fallbacks as Resilience Testing
All API calls fall back to local mock data when the backend is unavailable. This means the frontend can be fully exercised in any environment without a running FastAPI server, and the mock behavior itself acts as a form of contract documentation.

---

## 6. Recommended Next Steps for Testing

When adding tests to this project, the following approach would fit the existing conventions:

### Suggested Stack
- **Unit tests:** Vitest (aligns with the Vite-era TypeScript ecosystem; works with Next.js projects)
- **Component tests:** `@testing-library/react` with Vitest
- **E2E tests:** Playwright (Next.js native integration)

### Priority Test Targets
1. `lib/rx-format.ts` — Rx formatting, rounding, and validation logic (pure functions, no side effects)
2. `lib/color-utils.ts` — Hex/RGB/HSL conversion and WCAG contrast ratio calculations (pure functions)
3. `store/refractionStore.ts` — Draft/committed state transitions, debounce lifecycle
4. `hooks/useEntitlements.ts` — Feature gating logic for all role/entitlement combinations
5. `lib/auth/mock-session.ts` — Session hydration logic for each MockScenario

### Suggested `package.json` Additions
```json
"devDependencies": {
  "vitest": "^1.x",
  "@testing-library/react": "^14.x",
  "@testing-library/jest-dom": "^6.x",
  "jsdom": "^24.x"
}
```

### Suggested Scripts
```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage"
```
