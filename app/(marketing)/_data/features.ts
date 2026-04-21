import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  Calendar,
  Eye,
  Receipt,
  BarChart3,
  ClipboardList,
  ShieldCheck,
  FileText,
  Users,
  Zap,
} from "lucide-react";
import { COLORS } from "./marketingTokens";

export type Feature = {
  id: string;
  icon: LucideIcon;
  title: string;
  tag: string;
  tagColor: string;  // hex
  tagBg: string;     // hex
  desc: string;
};

export type FeatureGroup = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  bg?: string;       // optional section bg override
  features: Feature[];
};

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "clinical",
    eyebrow: "Clinical Workflow",
    title: "Built for the exam room",
    subtitle: "Every clinical surface in ClarityOS was designed by and for optometrists.",
    features: [
      {
        id: "ai-scribe",
        icon: Sparkles,
        title: "AI Clinical Scribe",
        tag: "AI",
        tagColor: COLORS.primary,
        tagBg: COLORS.primaryTint,
        desc: "Dictate during the exam. Claude writes complete SOAP notes, populates exam findings, and suggests E&M codes.",
      },
      {
        id: "pre-test-flow",
        icon: Zap,
        title: "Pre-test → Doctor flow",
        tag: "WORKFLOW",
        tagColor: "#047857",
        tagBg: "#ECFDF5",
        desc: "Role-based modes route technicians to vitals + CC/HPI and doctors into the full exam — no clutter, no context switching.",
      },
      {
        id: "refraction",
        icon: Eye,
        title: "Refraction + Rx",
        tag: "OPTOMETRY",
        tagColor: "#7C3AED",
        tagBg: "#F5F3FF",
        desc: "OD/OS sphere, cylinder, axis, ADD, and prism capture with habitual-vs-final comparison and Rx PDF generation.",
      },
      {
        id: "optical-handoff",
        icon: ClipboardList,
        title: "Optical handoff",
        tag: "HANDOFF",
        tagColor: "#B45309",
        tagBg: "#FEF3C7",
        desc: "Finalized encounters push patients into the optical queue with Rx change alerts built in.",
      },
      {
        id: "audit",
        icon: ShieldCheck,
        title: "HIPAA audit trail",
        tag: "COMPLIANCE",
        tagColor: "#BE123C",
        tagBg: "#FFF1F2",
        desc: "Every PHI view, edit, and finalize logged with user, timestamp, and action — tamper-evident and exportable.",
      },
      {
        id: "problem-list",
        icon: FileText,
        title: "Problem list & diagnoses",
        tag: "CLINICAL",
        tagColor: COLORS.primary,
        tagBg: COLORS.primaryTint,
        desc: "ICD-10 diagnosis capture linked to CPT codes for instant superbill generation.",
      },
    ],
  },
  {
    id: "operations",
    eyebrow: "Operations",
    title: "Your practice, one screen",
    subtitle: "Scheduling, billing, analytics, and patient intake — in one system, not seven.",
    bg: COLORS.surfaceAlt,
    features: [
      {
        id: "scheduling",
        icon: Calendar,
        title: "Smart scheduling",
        tag: "OPS",
        tagColor: COLORS.primary,
        tagBg: COLORS.primaryTint,
        desc: "5 views (List, Timeline, Clinic, Flow, Week), drag-to-book drawer, and a Flow Kanban board for the front desk.",
      },
      {
        id: "billing",
        icon: Receipt,
        title: "Superbill & CMS-1500",
        tag: "BILLING",
        tagColor: "#047857",
        tagBg: "#ECFDF5",
        desc: "Auto-suggested CPT codes, per-payer fee schedules, and clearinghouse-ready CMS-1500 PDF generation.",
      },
      {
        id: "analytics",
        icon: BarChart3,
        title: "Analytics dashboard",
        tag: "INSIGHT",
        tagColor: "#7C3AED",
        tagBg: "#F5F3FF",
        desc: "Revenue by payer, wait times, exam duration, and patient volume — all in one dashboard with 7d/30d/90d filters.",
      },
      {
        id: "intake",
        icon: Users,
        title: "Digital patient intake",
        tag: "PATIENT",
        tagColor: "#B45309",
        tagBg: "#FEF3C7",
        desc: "Mobile-first public intake pre-seeds demographics, chief complaint, and ROS before the patient walks in.",
      },
    ],
  },
];
