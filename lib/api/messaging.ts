import { apiFetch } from "@/lib/api-client";
import type {
  MessageLog,
  MessageTemplate,
  InboundMessage,
  ChannelPreference,
  BulkSendRequest,
  RecallCandidate,
  MessagingSettings,
} from "@/types/messaging";

export const messagingApi = {
  getHistory: (patientId: string) =>
    apiFetch<MessageLog[]>(`/api/messaging/history/${patientId}`),
  getInbox: (filter?: string) =>
    apiFetch<InboundMessage[]>(
      `/api/messaging/inbox${filter ? `?filter_classification=${filter}` : ""}`,
    ),
  getPreferences: (patientId: string) =>
    apiFetch<ChannelPreference>(`/api/messaging/preferences/${patientId}`),
  updatePreferences: (patientId: string, body: Partial<ChannelPreference>) =>
    apiFetch<ChannelPreference>(`/api/messaging/preferences/${patientId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getTemplates: () =>
    apiFetch<MessageTemplate[]>(`/api/messaging/templates`),
  updateTemplate: (id: string, body: Partial<MessageTemplate>) =>
    apiFetch<MessageTemplate>(`/api/messaging/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  sendMessage: (body: {
    patient_id: string;
    channel: string;
    purpose?: string;
    body?: string;
    template_id?: string;
    tokens?: Record<string, string>;
    appointment_id?: string;
    force_outside_quiet_hours?: boolean;
    language?: string;
  }) =>
    apiFetch<MessageLog>(`/api/messaging/send`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkSend: (body: BulkSendRequest) =>
    apiFetch<{
      batchId: string;
      sentCount: number;
      failedCount: number;
      excludedCount: number;
      errors: unknown[];
    }>(`/api/messaging/bulk-send`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  draftWithAi: (body: {
    patient_id: string;
    intent: string;
    channel: string;
    purpose?: string;
  }) =>
    apiFetch<{ body: string }>(`/api/messaging/ai-draft`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRecallQueue: () =>
    apiFetch<{ candidates: RecallCandidate[] }>(`/api/messaging/recall-queue`),
  sendRecallBatch: (body: {
    candidate_patient_ids: string[];
    template_id: string;
    channel: string;
  }) =>
    apiFetch<{
      runId: string;
      sent: number;
      failed: number;
      excluded: number;
    }>(`/api/messaging/recall-queue/send-all`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getAnalytics: (rangeDays = 30) =>
    apiFetch<unknown>(`/api/messaging/analytics?range_days=${rangeDays}`),
  getSettings: () =>
    apiFetch<MessagingSettings>(`/api/messaging/settings`),
  updateSettings: (body: Partial<MessagingSettings>) =>
    apiFetch<MessagingSettings>(`/api/messaging/settings`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
