export interface WizardState {
  currentStep: number;
  step1AcknowledgedAt: string | null;
  step3PhoneNumber: string | null;
  step3AreaCode: string | null;
  step4ReminderPreset: "3-touch" | null;
  step5RecallPreset: "staff-approved" | null;
  step6PracticeType: "optometry" | "ophthalmology" | "general" | null;
  step6SeededCount: number | null;
  step7TestSentAt: string | null;
  activatedAt: string | null;
  ownerPhone: string;
  ownerEmail: string;
}

export type UpdateFn = (partial: Partial<WizardState>) => void;
