/**
 * lib/mock-staff-data.ts
 *
 * Mock staff roster for the demo clinic.
 * Matches the mock session users in lib/auth/mock-session.ts.
 */

import type { StaffRole } from "@/types/session";

export interface MockStaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  /** Set when an owner also has clinical duties (e.g. owner-OD in a small clinic) */
  clinicalRole?: StaffRole;
  isActive: boolean;
  email: string;
  phone?: string;
  npi?: string;
  createdAt: string;
}

export const MOCK_STAFF: MockStaffMember[] = [
  {
    id: "staff-001",
    firstName: "Alex",
    lastName: "Morgan",
    role: "doctor",
    isActive: true,
    email: "alex.morgan@clarityclinic.com",
    phone: "(555) 201-4400",
    npi: "1234567890",
    createdAt: "2024-06-15",
  },
  {
    id: "staff-002",
    firstName: "Sam",
    lastName: "Rivera",
    role: "technician",
    isActive: true,
    email: "sam.rivera@clarityclinic.com",
    phone: "(555) 201-4401",
    npi: "1234567891",
    createdAt: "2024-07-01",
  },
  {
    id: "staff-003",
    firstName: "Jordan",
    lastName: "Lee",
    role: "receptionist",
    isActive: true,
    email: "jordan.lee@clarityclinic.com",
    phone: "(555) 201-4402",
    createdAt: "2024-08-10",
  },
  {
    id: "staff-004",
    firstName: "Taylor",
    lastName: "Kim",
    role: "admin",
    isActive: true,
    email: "taylor.kim@clarityclinic.com",
    phone: "(555) 201-4403",
    createdAt: "2024-06-15",
  },
  {
    id: "staff-005",
    firstName: "Casey",
    lastName: "Patel",
    role: "owner",
    clinicalRole: "doctor",
    isActive: true,
    email: "casey.patel@clarityclinic.com",
    phone: "(555) 201-4404",
    npi: "1234567893",
    createdAt: "2024-01-01",
  },
  {
    id: "staff-006",
    firstName: "Riley",
    lastName: "Chen",
    role: "technician",
    isActive: false,
    email: "riley.chen@clarityclinic.com",
    phone: "(555) 201-4405",
    npi: "1234567892",
    createdAt: "2024-03-20",
  },
];

export function getAllStaff(): MockStaffMember[] {
  return MOCK_STAFF;
}

export function getStaffById(id: string): MockStaffMember | undefined {
  return MOCK_STAFF.find((s) => s.id === id);
}
