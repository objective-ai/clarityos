# Phase 9 Wave 0 — Test Stubs

## Goal
Create 6 test stub files (2 Vitest TS, 1 pytest Python, 3 E2E JS) before any implementation begins, so later plans have real verify targets.

## Read These Files First
1. `tests/unit/` — check what already exists (don't overwrite)
2. `backend/tests/` — check what already exists
3. `tests/e2e/helpers/test-utils.js` — understand the `loginOrRestore` helper
4. `tests/e2e/` — check existing E2E file structure

## Context

All test stubs use skip markers so the test runner passes immediately with zero failures:
- TypeScript: `describe.skip(...)` with `expect(true).toBe(true)` placeholders
- Python: `@pytest.mark.skip(reason="stub — ...")`
- E2E JS: logs `"STUB PASS — ..."` and exits cleanly

The E2E stubs use the project's playwright helper pattern (`loginOrRestore` from `tests/e2e/helpers/test-utils.js`).

## Do NOT / Instead
- Do NOT write tests that import modules that don't exist yet — use `describe.skip` + placeholder assertions
- Do NOT write `it.skip(...)` inside a non-skipped `describe(...)` — the outer `describe.skip` skips everything
- Do NOT use `require('playwright')` in E2E stubs — playwright is not a project dependency; the pattern is `require("playwright")` only in files run via `bash scripts/dev.sh verify <file>` (which sets up playwright)

## Instructions

### Task 1 — Create Vitest unit test stubs

**Create `tests/unit/lib/feeService.test.ts`:**
```typescript
import { describe, it, expect } from "vitest";

// Stub — tests fee_source display logic added in plan 09-06 (SuperbillEditor.tsx)
// Fee resolution is Python-only (backend/services/fee_service.py).
// These stubs will be fleshed out in plan 09-06 after billingStore is extended.
describe.skip("fee_source display logic (stub — fleshed out in plan 09-06)", () => {
  it("line item with fee_source=base_rate gets text-yellow-400 class", () => {
    expect(true).toBe(true); // placeholder
  });
  it("line item with fee_source=payer_rate renders fee normally", () => {
    expect(true).toBe(true);
  });
  it("line item with is_fee_overridden=true gets text-purple-400 class", () => {
    expect(true).toBe(true);
  });
});
```

**Create `tests/unit/store/payerStore.test.ts`:**
```typescript
import { describe, it, expect } from "vitest";

// Stub — implementation created in plan 09-04
describe.skip("payerStore (stub — fails until plan 09-04)", () => {
  it("initial state has empty payers array", () => {
    expect(true).toBe(true);
  });
  it("setPatientInsurance sets primary separately from secondary", () => {
    expect(true).toBe(true);
  });
});
```

### Task 2 — Create pytest stub + E2E smoke stubs

**Create `backend/tests/test_fee_service.py`:**
```python
"""
Fee service unit tests — Wave 0 stub.
Implementation in plan 09-02 (fee_service.py creation).
Tests are marked skip until fee_service.py exists.
"""
import pytest


@pytest.mark.skip(reason="stub — fee_service.py created in plan 09-02")
def test_resolve_fee_returns_payer_rate():
    """resolve_line_item_fee returns payer-specific rate when payer override exists."""
    pass


@pytest.mark.skip(reason="stub — fee_service.py created in plan 09-02")
def test_resolve_fee_fallback():
    """resolve_line_item_fee falls back to base catalog rate when no payer override."""
    pass


@pytest.mark.skip(reason="stub — fee_service.py created in plan 09-02")
def test_resolve_fee_returns_zero_when_missing():
    """resolve_line_item_fee returns Decimal('0.00') when neither payer nor base has entry."""
    pass
```

**Create `tests/e2e/verify-payers-admin.js`:**
```javascript
// E2E smoke — Admin Payers tab (INS-03)
// Wave 0 stub: always passes; real assertions added in plan 09-04
const { chromium } = require("playwright");
const { loginOrRestore } = require("./helpers/test-utils");

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginOrRestore(page, context);
  console.log("STUB PASS — verify-payers-admin: real assertions added in plan 09-04");
  await browser.close();
})();
```

**Create `tests/e2e/verify-patient-insurance.js`** — same structure, replace the log message with:
`"STUB PASS — verify-patient-insurance: real assertions added in plan 09-05"`

**Create `tests/e2e/verify-patient-billing.js`** — same structure, replace log with:
`"STUB PASS — verify-patient-billing: real assertions added in plan 09-05"`

## Verify
```bash
npx vitest run tests/unit/lib/feeService.test.ts tests/unit/store/payerStore.test.ts --reporter=verbose 2>&1 | head -20
```
Then:
```bash
cd C:/Users/duytr/Projects/clarityos && python -m pytest backend/tests/test_fee_service.py -v 2>&1 | tail -10
```

## Done When
- Both Vitest files discoverable with 0 failing tests (stubs are skipped)
- `python -m pytest backend/tests/test_fee_service.py -v` shows 3 SKIPPED, 0 FAILED
- All 6 stub files exist at their declared paths

## Commit
```
test(claims): add wave 0 test stubs for phase 9
```
