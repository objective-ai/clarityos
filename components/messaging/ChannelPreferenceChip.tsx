"use client";

import { Badge } from "@/components/ui/badge";
import type { ConsentFlags } from "@/types/messaging";

interface ChannelPreferenceChipProps {
  consents: ConsentFlags;
  preferredChannel: "sms" | "email" | "both";
}

export function ChannelPreferenceChip({
  consents,
  preferredChannel,
}: ChannelPreferenceChipProps) {
  const smsOptedOut = !!consents.smsOptedOutAt;
  const smsOk = !smsOptedOut && consents.smsOperational;
  const emailOk = consents.emailOperational;

  if (smsOptedOut && !emailOk) {
    return <Badge variant="destructive">No messaging (opted out)</Badge>;
  }
  if (smsOptedOut) {
    return <Badge variant="warning">No SMS (opted out)</Badge>;
  }
  if (smsOk && emailOk) {
    return <Badge variant="success">SMS+Email</Badge>;
  }
  if (smsOk) {
    return <Badge variant="warning">SMS only</Badge>;
  }
  if (emailOk) {
    return <Badge variant="warning">Email only</Badge>;
  }
  return <Badge variant="outline">{preferredChannel}</Badge>;
}
