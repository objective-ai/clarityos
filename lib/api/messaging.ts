import type {
  MessageLog,
  MessageTemplate,
  InboundMessage,
  ChannelPreference,
  BulkSendRequest,
  RecallCandidate,
  MessagingSettings,
} from "@/types/messaging";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail),
    );
  }
  return res.json() as Promise<T>;
}

export const messagingApi = {
  getHistory: (patientId: string) =>
    jsonFetch<MessageLog[]>(`/api/messaging/history/${patientId}`),
  getInbox: (filter?: string) =>
    jsonFetch<InboundMessage[]>(
      `/api/messaging/inbox${filter ? `?filter_classification=${filter}` : ""}`,
    ),
  getPreferences: (patientId: string) =>
    jsonFetch<ChannelPreference>(`/api/messaging/preferences/${patientId}`),
  updatePreferences: (patientId: string, body: Partial<ChannelPreference>) =>
    jsonFetch<ChannelPreference>(`/api/messaging/preferences/${patientId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getTemplates: () =>
    jsonFetch<MessageTemplate[]>(`/api/messaging/templates`),
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
    jsonFetch<MessageLog>(`/api/messaging/send`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  bulkSend: (body: BulkSendRequest) =>
    jsonFetch<{
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
    jsonFetch<{ body: string }>(`/api/messaging/ai-draft`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRecallQueue: () =>
    jsonFetch<{ candidates: RecallCandidate[] }>(`/api/messaging/recall-queue`),
  sendRecallBatch: (body: {
    candidate_patient_ids: string[];
    template_id: string;
    channel: string;
  }) =>
    jsonFetch<{
      runId: string;
      sent: number;
      failed: number;
      excluded: number;
    }>(`/api/messaging/recall-queue/send-all`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getAnalytics: (rangeDays = 30) =>
    jsonFetch<unknown>(`/api/messaging/analytics?range_days=${rangeDays}`),
  getSettings: () =>
    jsonFetch<MessagingSettings>(`/api/messaging/settings`),
  updateSettings: (body: Partial<MessagingSettings>) =>
    jsonFetch<MessagingSettings>(`/api/messaging/settings`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};
