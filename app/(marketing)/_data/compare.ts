export type CompetitorId = "clarity" | "revolutionehr" | "barti" | "eyecloudpro";

export type Competitor = {
  id: CompetitorId;
  name: string;
  sourceUrl?: string; // vendor marketing site — cite when we say yes/no/partial
};

export type SupportLevel = "yes" | "no" | "partial" | "unknown";

export type CompareRow = {
  id: string;
  label: string;
  support: Record<CompetitorId, SupportLevel>;
};

export const COMPETITORS: Competitor[] = [
  { id: "clarity",        name: "ClarityOS" },
  { id: "revolutionehr",  name: "RevolutionEHR", sourceUrl: "https://www.revolutionehr.com" },
  { id: "barti",          name: "Barti",         sourceUrl: "https://barti-emr.com" },
  { id: "eyecloudpro",    name: "EyeCloudPro",   sourceUrl: "https://eyecloudpro.com" },
];

export const COMPARE_ROWS: CompareRow[] = [
  // source: all four vendors market exclusively to optometry practices
  { id: "optometry-native",   label: "Purpose-built for optometry",            support: { clarity: "yes", revolutionehr: "yes", barti: "yes", eyecloudpro: "yes" } },
  // source: ClarityOS built-in; RevolutionEHR has ScribeLink partnership (partial); Barti unverified; EyeCloudPro has AI assist mention — flagged for manual review before publish
  { id: "ai-scribe",           label: "Integrated AI clinical scribe",          support: { clarity: "yes", revolutionehr: "partial", barti: "unknown", eyecloudpro: "partial" } },
  // source: all four vendors list online scheduling on their marketing sites
  { id: "patient-booking",     label: "Online patient self-booking",            support: { clarity: "yes", revolutionehr: "yes", barti: "yes", eyecloudpro: "yes" } },
  // source: RevolutionEHR partial — limited to basic intake forms; Barti and EyeCloudPro list digital intake features
  { id: "digital-intake",      label: "Digital patient intake (pre-visit)",     support: { clarity: "yes", revolutionehr: "partial", barti: "yes", eyecloudpro: "yes" } },
  // source: standard clearinghouse output supported by all four per their billing feature pages
  { id: "cms1500",             label: "Integrated CMS-1500 PDF generation",     support: { clarity: "yes", revolutionehr: "yes", barti: "yes", eyecloudpro: "yes" } },
  // source: RevolutionEHR and EyeCloudPro list fee schedules; Barti unverified — flagged for manual review before publish
  { id: "fee-schedules",       label: "Per-payer fee schedules",                support: { clarity: "yes", revolutionehr: "yes", barti: "unknown", eyecloudpro: "yes" } },
  // source: RevolutionEHR and EyeCloudPro have optical integration; Barti partial per feature list
  { id: "optical-handoff",     label: "Optical handoff workflow",               support: { clarity: "yes", revolutionehr: "yes", barti: "partial", eyecloudpro: "yes" } },
  // source: ClarityOS Flow board is custom Kanban; RevolutionEHR no Kanban-style board; Barti unverified; EyeCloudPro has a patient flow view (partial) — flagged for manual review before publish
  { id: "flow-board",          label: "Flow board (Kanban practice view)",      support: { clarity: "yes", revolutionehr: "no", barti: "unknown", eyecloudpro: "partial" } },
  // source: none of the four vendors list public pricing on their marketing sites as of April 2026
  { id: "transparent-pricing", label: "Transparent public pricing",             support: { clarity: "no", revolutionehr: "no", barti: "no", eyecloudpro: "no" } },
  // source: ClarityOS and Barti have post-2020 UI; RevolutionEHR UI is dated (partial); EyeCloudPro has modern cloud UI — flagged for manual review before publish
  { id: "modern-ui",           label: "Modern cloud-native UI (post-2020 design)", support: { clarity: "yes", revolutionehr: "partial", barti: "yes", eyecloudpro: "yes" } },
];

export const COMPARE_FOOTNOTE =
  "Based on publicly documented features as of April 2026. Please verify with each vendor.";
