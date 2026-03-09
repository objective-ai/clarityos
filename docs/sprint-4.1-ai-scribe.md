# Specification: Sprint 4.1 — AI Scribe & Dirty State Guard

**Status:** ✅ COMPLETED
**Objective:** Build the SSE pipeline for the AI Scribe using Anthropic Claude, and implement dirty-state exit guards to protect unsaved clinical data (ePHI).

## Part 1: Backend — AI Scribe Pipeline (FastAPI) ✅

**File:** `backend/api/routes/ai_scribe.py`
**Router:** Mounted at `/api/encounters` in `backend/main.py`

1. **Endpoint:** `POST /encounters/{id}/ai-scribe`
   - Accepts JSON body: `transcript` (string) + `encounter_context` (vitals, diagnoses, chief complaint).
   - Returns `StreamingResponse` with SSE (no external `sse-starlette` needed).
   - Auth: `ClinicalAction.GENERATE_AI_SCRIBE` — doctors & owners only.
2. **Anthropic Integration:**
   - Model: `claude-sonnet-4-6-20250514` via `anthropic` SDK (`client.messages.stream()`).
   - System prompt instructs Claude to act as an expert optometric scribe.
   - Dual-stream protocol: SOAP narrative text → `___JSON_START___` delimiter → structured JSON matching clinical stores.
   - Saves SOAP text to `enc.ai_summary_text` + timestamp to `enc.ai_summary_generated_at`.
3. **Fallback:** If `ANTHROPIC_API_KEY` is missing, backend returns 503. The frontend hook (`hooks/useAiScribe.ts`) provides a mock SSE stream for development.
4. **Accept Endpoint:** `POST /encounters/{id}/ai-scribe/accept`
   - Logs `AuditAction.AI_SCRIBE_AUTOFILL` with change metadata for audit trail.

## Part 2: Frontend — Dirty State & Exit Guards ✅

**Files:** `store/*Store.ts`, encounter `page.tsx`

1. **Store `saveStatus` Tracking:**
   - `vitalsStore`, `refractionStore`, and `examFindingsStore` track save state via `saveStatus` field.
   - States: `idle` → `dirty` → `saving` → `saved` → (2s) → `idle`.
   - On keystroke: `saveStatus = "dirty"`. After 1.5s debounced auto-save succeeds: `saveStatus = "saved"`.
2. **Exit Guards:**
   - **AI Scribe transcript guard** (in `AiScribeWidget`): warns if unsaved transcript on `beforeunload`.
   - **Cross-store clinical guard** (in main encounter component): warns if any clinical store has `saveStatus === "dirty"` — covers vitals, refraction, and exam findings.

## Part 3: Frontend — AI Scribe UI Widget ✅

**Files:** `hooks/useAiScribe.ts`, encounter `page.tsx` (inline widget, lines ~128–474)

1. **The Hook (`useAiScribe.ts`):**
   - SSE streaming via fetch + readable streams with `AbortController` support.
   - Dual-stream parsing: accumulates SOAP text, then buffers JSON after `___JSON_START___`.
   - Mock fallback when backend unreachable (realistic SOAP + structured JSON over 3s).
   - Returns: `{ generate, soapText, structuredData, isStreaming, isDone, error, reset }`.
2. **The UI (inline in `page.tsx`):**
   - Glass-card component in the Assessment & Plan section.
   - Textarea for transcript input with localStorage auto-recovery.
   - "Generate Note" button triggers SSE stream with real-time SOAP rendering.
   - Entitlement gating (`Entitlement.AI_SCRIBE`) with upsell modal for locked plans.
   - Accept handler dispatches structured data to all clinical stores (vitals, exam findings, diagnoses, refraction).
   - Diff snapshot captured before/after for audit trail.

## BFF Proxy Routes ✅

- **SSE Streaming:** `app/api/encounters/[encounterId]/ai-scribe/route.ts` — custom handler that pipes SSE without buffering (does NOT use `proxyToFastAPI()`).
- **Accept:** `app/api/ai-scribe/accept/route.ts` — standard `proxyToFastAPI()` proxy.

## Execution Constraints
- Do NOT build Encounter Finalization (signing/locking) in this sprint. That is Sprint 4.2.
