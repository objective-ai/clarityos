/**
 * Messaging store: composer draft state, send state, inbox unread count, bulk recipients.
 *
 * Composer draft is per-patient — keyed by patient_id so navigation away
 * preserves what staff was typing.
 *
 * bulkRecipients is set by the schedule bulk-select toolbar (Plan 12-08) BEFORE
 * calling openComposer(`bulk:<id>`, "bulk"). Composer reads this list when in
 * bulk mode. NOT persisted (clears on page reload — bulk sends should not
 * survive a refresh).
 */
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { MessageChannel, MessagePurpose } from "@/types/messaging";

export interface BulkRecipientStub {
  patientId: string;
  appointmentId?: string;
  firstName: string;
  lastName?: string;
  preferredChannel: MessageChannel;
}

interface ComposerDraft {
  body: string;
  channel: MessageChannel;
  purpose: MessagePurpose;
  templateId: string | null;
  appointmentId: string | null;
}

type ComposerEntryPoint =
  | "patient_header"
  | "schedule_kebab"
  | "inbox_reply"
  | "bulk"
  | null;

interface MessagingState {
  isComposerOpen: boolean;
  composerPatientId: string | null;
  composerEntryPoint: ComposerEntryPoint;
  drafts: Record<string, ComposerDraft>;

  bulkRecipients: BulkRecipientStub[];

  isSending: boolean;
  lastError: string | null;

  inboxUnreadCount: number;

  openComposer: (
    patientId: string | null,
    entryPoint: NonNullable<ComposerEntryPoint>
  ) => void;
  closeComposer: () => void;
  setDraft: (patientId: string, partial: Partial<ComposerDraft>) => void;
  clearDraft: (patientId: string) => void;
  setBulkRecipients: (refs: BulkRecipientStub[]) => void;
  clearBulkRecipients: () => void;
  setSending: (value: boolean) => void;
  setError: (error: string | null) => void;
  setInboxUnreadCount: (count: number) => void;
}

const DEFAULT_DRAFT: ComposerDraft = {
  body: "",
  channel: "sms",
  purpose: "manual",
  templateId: null,
  appointmentId: null,
};

export const useMessagingStore = create<MessagingState>()(
  devtools(
    persist(
      (set) => ({
        isComposerOpen: false,
        composerPatientId: null,
        composerEntryPoint: null,
        drafts: {},
        bulkRecipients: [],
        isSending: false,
        lastError: null,
        inboxUnreadCount: 0,

        openComposer: (patientId, entryPoint) =>
          set({
            isComposerOpen: true,
            composerPatientId: patientId,
            composerEntryPoint: entryPoint,
          }),
        closeComposer: () =>
          set({
            isComposerOpen: false,
            composerPatientId: null,
            composerEntryPoint: null,
            lastError: null,
            bulkRecipients: [],
          }),
        setDraft: (patientId, partial) =>
          set((s) => ({
            drafts: {
              ...s.drafts,
              [patientId]: {
                ...DEFAULT_DRAFT,
                ...s.drafts[patientId],
                ...partial,
              },
            },
          })),
        clearDraft: (patientId) =>
          set((s) => {
            const next = { ...s.drafts };
            delete next[patientId];
            return { drafts: next };
          }),
        setBulkRecipients: (refs) => set({ bulkRecipients: refs }),
        clearBulkRecipients: () => set({ bulkRecipients: [] }),
        setSending: (value) => set({ isSending: value }),
        setError: (error) => set({ lastError: error }),
        setInboxUnreadCount: (count) => set({ inboxUnreadCount: count }),
      }),
      {
        name: "messaging-store",
        partialize: (s) => ({ drafts: s.drafts }),
      }
    ),
    { name: "messagingStore", enabled: process.env.NODE_ENV !== "production" }
  )
);
