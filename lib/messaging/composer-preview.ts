/**
 * Composer preview — token replacement + segment count + PHI scan + consent gate.
 * Pure function; safe for useMemo.
 */

import type {
  ConsentFlags,
  MessageChannel,
  MessagePurpose,
} from "@/types/messaging";
import { countSmsSegments, type SmsSegmentResult } from "./sms-segments";
import { scanForPhi, type PhiScanResult } from "./phi-scan";

export interface PreviewInput {
  body: string;
  tokens: Record<string, string>;
  channel: MessageChannel;
  purpose: MessagePurpose;
  consents: ConsentFlags;
}

export interface PreviewResult {
  rendered: string;
  segments: SmsSegmentResult | null;
  phiResult: PhiScanResult | null;
  blocked: boolean;
  blockReason?: "OPT_OUT" | "PAUSED" | "INVALID_INPUT";
  softWarn: boolean;
}

const TOKEN_RE = /\{\{([a-z_]+)\}\}/g;

export function previewMessage(input: PreviewInput): PreviewResult {
  const rendered = input.body.replace(TOKEN_RE, (_m, k: string) =>
    input.tokens[k] ?? `{{${k}}}`
  );

  const isOp = input.purpose === "operational" || input.purpose === "manual";
  const isMkt = input.purpose === "marketing";
  const c = input.consents;

  const block = (reason: NonNullable<PreviewResult["blockReason"]>): PreviewResult => ({
    rendered,
    segments: null,
    phiResult: null,
    blocked: true,
    blockReason: reason,
    softWarn: false,
  });

  if (input.channel === "sms" && c.smsOptedOutAt) return block("OPT_OUT");
  if (c.pausedUntil) return block("PAUSED");
  if (input.channel === "sms") {
    if (isMkt && !c.smsMarketing) return block("OPT_OUT");
    if (isOp && !c.smsOperational) return block("OPT_OUT");
  } else {
    if (isMkt && !c.emailMarketing) return block("OPT_OUT");
    if (isOp && !c.emailOperational) return block("OPT_OUT");
  }

  const segments = input.channel === "sms" ? countSmsSegments(rendered) : null;
  const phiResult =
    input.channel === "sms" && isOp ? scanForPhi(rendered) : null;

  return {
    rendered,
    segments,
    phiResult,
    blocked: false,
    softWarn: !!phiResult?.hasPhi,
  };
}
