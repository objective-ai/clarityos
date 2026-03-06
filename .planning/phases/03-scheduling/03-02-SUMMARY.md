---
plan: "03-02"
phase: "03-scheduling"
status: complete
---

# Plan 03-02 Summary: Schedule Frontend

## Delivered Files

| File | Status | Purpose |
|------|--------|---------|
| `types/appointment.ts` | Created | TypeScript types, enums, labels, colors for appointments |
| `store/appointmentStore.ts` | Created | Zustand store — fetch, create, update, cancel, check-in, start-exam |
| `app/api/appointments/route.ts` | Created | BFF proxy: GET (list by date) + POST (create) |
| `app/api/appointments/[appointmentId]/route.ts` | Created | BFF proxy: GET (detail) + PATCH (update) |
| `app/api/appointments/[appointmentId]/check-in/route.ts` | Created | BFF proxy: POST check-in |
| `app/api/appointments/[appointmentId]/start-exam/route.ts` | Created | BFF proxy: POST start-exam |
| `app/api/appointments/[appointmentId]/cancel/route.ts` | Created | BFF proxy: POST cancel |
| `app/(tenant)/[tenantId]/schedule/page.tsx` | Replaced | Full schedule page with day view, booking, check-in, start-exam |

## Requirements Covered

- **SCHED-03**: Schedule page displays real appointment data from API
- **SCHED-04**: Check-in workflow transitions appointment status, visible to provider
- **SCHED-05**: Start Exam creates linked encounter, navigates to encounter view

## Key Decisions

- Schedule page uses day view with date navigation (prev/next/today/picker)
- Status summary counters at top showing counts by status
- AppointmentCard shows time, patient name, type, provider, chief complaint, status badge
- Check-in and Start Exam buttons appear contextually based on appointment status
- Start Exam navigates to encounter page after creating linked encounter
- Book Appointment modal with patient/provider UUID inputs, type selector, date/time
- Cancel modal requires reason (min 3 chars) matching backend validation
- All BFF routes follow established pattern: getUser() auth, getSession() token forwarding, 10s timeout
- Zustand store uses apiFetch() for automatic camelCase/snake_case conversion
