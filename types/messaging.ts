/**
 * types/messaging.ts — Phase 12 CRM messaging shared types.
 *
 * Server returns snake_case; apiFetch camelizes on load.
 * IMPORTANT: token dict keys must NOT be camelized (RESEARCH.md Pitfall 9).
 */

export type MessageChannel = "sms" | "email";
export type MessagePurpose = "operational" | "marketing" | "manual";
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "deferred"
  | "cancelled";
export type TemplateKind =
  | "reminder_7d"
  | "reminder_72h"
  | "reminder_24h"
  | "recall_m12"
  | "recall_m14"
  | "manual"
  | "bounce_fallback_notice";
export type InboundClassification =
  | "reschedule_request"
  | "cancellation"
  | "question_clinical"
  | "question_billing"
  | "thank_you"
  | "spam";

export interface MessageLog {
  id: string;
  tenantId: string;
  patientId: string;
  appointmentId: string | null;
  channel: MessageChannel;
  purpose: MessagePurpose;
  templateKind: TemplateKind | null;
  templateId: string | null;
  recipientE164: string | null;
  recipientEmail: string | null;
  recipientKind: "patient" | "guardian";
  body: string;
  subject: string | null;
  language: "en" | "es";
  status: MessageStatus;
  statusPriority: number;
  failureReason: string | null;
  retryCount: number;
  providerMessageId: string | null;
  providerSegments: number | null;
  providerCostCents: number | null;
  batchId: string | null;
  scheduledFor: string | null;
  deferredUntil: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
  actorUserId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface MessageTemplate {
  id: string;
  tenantId: string;
  kind: TemplateKind;
  channel: MessageChannel;
  language: "en" | "es";
  subject: string | null;
  body: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InboundMessage {
  id: string;
  tenantId: string;
  patientId: string | null;
  fromE164: string;
  body: string;
  classification: InboundClassification | null;
  classificationConfidence: "high" | "medium" | "low" | null;
  isRead: boolean;
  repliedMessageId: string | null;
  providerMessageId: string;
  receivedAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ConsentFlags {
  smsMarketing: boolean;
  smsOperational: boolean;
  emailMarketing: boolean;
  emailOperational: boolean;
  smsMarketingAt: string | null;
  smsOperationalAt: string | null;
  emailMarketingAt: string | null;
  emailOperationalAt: string | null;
  smsOptedOutAt: string | null;
  pausedUntil: string | null;
}

export interface ChannelPreference {
  patientId: string;
  preferredChannel: MessageChannel | "both";
  preferredLanguage: "en" | "es";
  consents: ConsentFlags;
  guardianRouting: boolean;
  guardianName: string | null;
  guardianPhoneE164: string | null;
  guardianEmail: string | null;
  guardianRelationship: string | null;
  recallExhausted: boolean;
}

export interface RecallCandidate {
  patientId: string;
  firstName: string;
  lastName: string;
  lastFinalizedAt: string;
  phoneE164: string | null;
  email: string | null;
  hasMarketingConsentSms: boolean;
  hasMarketingConsentEmail: boolean;
}

export interface BulkRecipient {
  patientId: string;
  /** Token keys MUST stay snake_case — apiFetch's camelizeKeys must skip this dict. */
  tokens: Record<string, string>;
}

export interface BulkSendRequest {
  recipients: BulkRecipient[]; // max 50 — enforced server-side
  templateId: string;
  channel: MessageChannel;
  forceOutsideQuietHours?: boolean;
}

export interface MessagingSettings {
  messagingEnabled: boolean;
  dailySmsCapCents: number;
  twilioPhoneNumber: string | null;
  twilioMessagingServiceSid: string | null;
  resendFromEmail: string | null;
}
