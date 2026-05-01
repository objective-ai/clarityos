import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";
import { messagingApi } from "@/lib/api/messaging";

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({});
});

describe("messagingApi GET endpoints", () => {
  test("getHistory hits /api/messaging/history/:patientId", async () => {
    await messagingApi.getHistory("p-123");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/messaging/history/p-123");
  });

  test("getInbox without filter omits query string", async () => {
    await messagingApi.getInbox();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/messaging/inbox");
  });

  test("getInbox with filter appends filter_classification", async () => {
    await messagingApi.getInbox("reschedule_request");
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/messaging/inbox?filter_classification=reschedule_request",
    );
  });

  test("getPreferences hits /api/messaging/preferences/:patientId", async () => {
    await messagingApi.getPreferences("p-9");
    expect(mockApiFetch).toHaveBeenCalledWith("/api/messaging/preferences/p-9");
  });

  test("getTemplates hits /api/messaging/templates", async () => {
    await messagingApi.getTemplates();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/messaging/templates");
  });

  test("getRecallQueue hits /api/messaging/recall-queue", async () => {
    await messagingApi.getRecallQueue();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/messaging/recall-queue");
  });

  test("getAnalytics defaults to 30-day range", async () => {
    await messagingApi.getAnalytics();
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/messaging/analytics?range_days=30",
    );
  });

  test("getAnalytics passes custom range", async () => {
    await messagingApi.getAnalytics(7);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/messaging/analytics?range_days=7",
    );
  });

  test("getSettings hits /api/messaging/settings", async () => {
    await messagingApi.getSettings();
    expect(mockApiFetch).toHaveBeenCalledWith("/api/messaging/settings");
  });
});

describe("messagingApi mutations", () => {
  test("sendMessage POSTs to /api/messaging/send with serialized body", async () => {
    await messagingApi.sendMessage({
      patient_id: "p-1",
      channel: "sms",
      body: "Hi there",
      template_id: "t-1",
    });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/send");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      patient_id: "p-1",
      channel: "sms",
      body: "Hi there",
      template_id: "t-1",
    });
  });

  test("updateTemplate PATCHes /api/messaging/templates/:id", async () => {
    await messagingApi.updateTemplate("t-42", { body: "new body" });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/templates/t-42");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ body: "new body" });
  });

  test("updatePreferences PATCHes /api/messaging/preferences/:patientId", async () => {
    await messagingApi.updatePreferences("p-5", { preferredChannel: "email" });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/preferences/p-5");
    expect(init.method).toBe("PATCH");
  });

  test("bulkSend POSTs to /api/messaging/bulk-send", async () => {
    await messagingApi.bulkSend({
      recipients: [{ patientId: "p-1", tokens: { first_name: "Jane" } }],
      templateId: "t-1",
      channel: "sms",
    });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/bulk-send");
    expect(init.method).toBe("POST");
  });

  test("sendRecallBatch POSTs to /api/messaging/recall-queue/send-all", async () => {
    await messagingApi.sendRecallBatch({
      candidate_patient_ids: ["p-1", "p-2"],
      template_id: "t-recall",
      channel: "sms",
    });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/recall-queue/send-all");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      candidate_patient_ids: ["p-1", "p-2"],
      template_id: "t-recall",
      channel: "sms",
    });
  });

  test("draftWithAi POSTs to /api/messaging/ai-draft", async () => {
    await messagingApi.draftWithAi({
      patient_id: "p-1",
      intent: "remind",
      channel: "sms",
    });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/ai-draft");
    expect(init.method).toBe("POST");
  });

  test("updateSettings PATCHes /api/messaging/settings", async () => {
    await messagingApi.updateSettings({
      messagingEnabled: true,
      dailySmsCapCents: 5000,
    });
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe("/api/messaging/settings");
    expect(init.method).toBe("PATCH");
  });
});

describe("messagingApi auth routing", () => {
  test("all endpoints route through apiFetch (not raw fetch)", async () => {
    await messagingApi.getHistory("p-1");
    await messagingApi.getInbox();
    await messagingApi.getTemplates();
    await messagingApi.getRecallQueue();
    await messagingApi.getAnalytics();
    await messagingApi.getSettings();
    expect(mockApiFetch).toHaveBeenCalledTimes(6);
  });

  test("propagates rejected promises from apiFetch", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("401 Unauthorized"));
    await expect(messagingApi.getHistory("p-1")).rejects.toThrow(
      "401 Unauthorized",
    );
  });
});
