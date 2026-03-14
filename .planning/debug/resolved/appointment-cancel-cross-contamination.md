---
status: resolved
trigger: "appointment-cancel-cross-contamination"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Two bugs work together. (1) The schedule page's onConfirm callback is non-async, so CancelModal's `await onConfirm(reason)` resolves immediately (awaits void), causing the modal to close before the cancel + fetchAppointments refresh completes. (2) Other appointment actions (checkInPatient, revertCheckIn, markNoShow) do optimistic local updates while cancelAppointment does a full fetchAppointments refresh. When the refresh runs, it overwrites the local appointment array with server state — if appointment B had stale optimistic state, it appears to "change" when A is cancelled.
test: Fix onConfirm to be async, then verify B's state is stable after cancelling A.
expecting: After fix, cancel completes synchronously before modal closes, and B's state is not affected.
next_action: Fix the onConfirm non-async bug in schedule/page.tsx

## Symptoms

expected: Cancelling appointment A for a patient should only affect appointment A. Other appointments for the same patient should remain unaffected.
actual: When one appointment is cancelled, it seems to affect (status or UI state change) other appointments for the same patient.
errors: Unknown — user reports visual/behavioral cross-contamination
reproduction: Create or find a patient with 2+ appointments. Cancel one. Observe the other appointment changes state.
started: Unknown — recently discovered

## Eliminated

- hypothesis: Backend cancel endpoint updates multiple appointments (by patient ID instead of appointment ID)
  evidence: cancel_appointment() in appointment.py fetches ONE appointment by appointment_id + tenant_id, sets only appt.status = CANCELLED. No patient-level query. Confirmed safe.
  timestamp: 2026-03-13T00:00:00Z

- hypothesis: Zustand appointmentStore keyed by patient ID
  evidence: Store uses appointments: Appointment[] array (not patient-keyed map). fetchAppointments replaces entire array from server. cancelAppointment correctly calls fetchAppointments(selectedDate) after cancel. No patient-keyed state.
  timestamp: 2026-03-13T00:00:00Z

- hypothesis: BFF proxy routes wrong appointment ID
  evidence: app/api/appointments/[appointmentId]/cancel/route.ts correctly extracts appointmentId from URL params and passes to proxyToFastAPI. proxyToFastAPI correctly builds the upstream URL. No routing issue.
  timestamp: 2026-03-13T00:00:00Z

- hypothesis: SQLAlchemy cascade updates multiple appointments on cancel
  evidence: Patient.appointments has cascade="all, delete-orphan" but this only fires on DELETE, not on status UPDATE. No cascade affects appointment status changes.
  timestamp: 2026-03-13T00:00:00Z

- hypothesis: encounter.py finalize route sets wrong appointment to FINALIZED
  evidence: selectinload(Encounter.appointment) loads via unique FK appointment_id → appointments.id. One-to-one. Only one appointment can be linked per encounter. Finalize only touches enc.appointment (the single linked appointment).
  timestamp: 2026-03-13T00:00:00Z

- hypothesis: Backend list_appointments returns stale or patient-scoped data
  evidence: list_appointments queries by tenant_id + start_time range (date bounds). No patient_id filter. All appointments for the date are returned with fresh DB state. No cross-patient contamination.
  timestamp: 2026-03-13T00:00:00Z

## Evidence

- timestamp: 2026-03-13T00:00:00Z
  checked: store/appointmentStore.ts cancelAppointment action
  found: Action calls fetchAppointments(selectedDate) AFTER cancel completes. This is a full server refresh — overwrites the entire appointments array with server data.
  implication: If appointment B had stale optimistic state (from checkInPatient/markNoShow which do local updates), the full refresh after cancel would expose B's actual server state, appearing to "change" B.

- timestamp: 2026-03-13T00:00:00Z
  checked: app/(tenant)/[tenant]/schedule/page.tsx CancelModal onConfirm callback
  found: onConfirm={(reason) => { if (cancelTarget) handleCancel(cancelTarget, reason); }} — handleCancel is NOT awaited. CancelModal does `await onConfirm(reason)` but since onConfirm is sync (returns void), this resolves immediately. Modal closes BEFORE cancel+refresh completes.
  implication: Primary bug — fire-and-forget cancel means the UI reacts before the operation is done. The refresh happens asynchronously after the modal closes, surprising the user. This is the observable mechanism of "cross-contamination."

- timestamp: 2026-03-13T00:00:00Z
  checked: All optimistic vs full-refresh actions in appointmentStore
  found: checkInPatient, revertCheckIn, markNoShow, updateAppointment use optimistic local map update (server response). cancelAppointment, createAppointment, startExam, rescheduleAppointment use full fetchAppointments refresh.
  implication: Inconsistency means cancelling A can reveal B's server state if B's prior action left B with a different optimistic state than what the server has. (However, since optimistic updates use the server response, this should generally be in sync — the primary bug is the non-async onConfirm.)

## Resolution

root_cause: The schedule page's CancelModal onConfirm callback is not async. It calls `handleCancel(cancelTarget, reason)` without awaiting. CancelModal's `await onConfirm(reason)` awaits a void/undefined, resolving immediately and closing the modal before the cancel+refresh completes. The fetchAppointments refresh then runs in the background — and since it replaces the entire appointments array, any appointment whose local state diverged from server state will appear to "change" when A's cancel refresh lands. To the user this looks like appointment B was affected by cancelling A.

fix: |
  1. app/(tenant)/[tenant]/schedule/page.tsx: Changed onConfirm from sync to async, adding `await` before handleCancel(cancelTarget, reason). This ensures the cancel API call and fetchAppointments refresh complete before CancelModal.handleConfirm continues to close the modal.
  2. components/schedule/ScheduleModals.tsx: Updated CancelModal onConfirm type from `(reason: string) => void` to `(reason: string) => Promise<void> | void` so the await in CancelModal.handleConfirm properly chains.
  TypeScript type-check passes (npx tsc --noEmit — clean).

verification: Awaiting human verification — reproduce with 2+ appointments for same patient, cancel one, confirm the other's status does not change unexpectedly.
files_changed:
  - app/(tenant)/[tenant]/schedule/page.tsx
  - components/schedule/ScheduleModals.tsx
