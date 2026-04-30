import type { LucideIcon } from "lucide-react";
import { Sparkles, Building2 } from "lucide-react";

export type PricingTier = {
  id: "standard" | "premium";
  name: string;
  tagline: string;
  icon: LucideIcon;
  priceLabel: string;
  priceHint: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlight?: boolean;
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "standard",
    name: "Standard",
    tagline: "Core EHR for everyday optometry practice",
    icon: Building2,
    priceLabel: "$199/mo",
    priceHint: "+$149/mo per additional practice",
    features: [
      "Integrated scheduling & patient intake",
      "Clinical exam & SOAP workflow",
      "Superbill + CMS-1500 PDF",
      "Optical handoff & Rx PDF",
      "Per-payer fee schedules",
      "Email support",
    ],
    ctaLabel: "Schedule a Demo",
    ctaHref: "mailto:hello@clarityos.com?subject=Pricing%20-%20Standard",
  },
  {
    id: "premium",
    name: "Premium with AI",
    tagline: "Standard plus AI clinical scribe & analytics",
    icon: Sparkles,
    priceLabel: "$259/mo",
    priceHint: "+$209/mo per additional practice",
    features: [
      "Everything in Standard",
      "AI Clinical Scribe (real-time SOAP)",
      "AI-assisted assessment & plan",
      "Analytics dashboard",
      "Priority support + onboarding",
    ],
    ctaLabel: "Schedule a Demo",
    ctaHref: "mailto:hello@clarityos.com?subject=Pricing%20-%20Premium",
    highlight: true,
  },
];
