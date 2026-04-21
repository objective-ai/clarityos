import type { LucideIcon } from "lucide-react";
import { Sparkles, Building2, Rocket } from "lucide-react";

export type PricingTier = {
  id: "solo" | "practice" | "scale";
  name: string;
  tagline: string;
  icon: LucideIcon;
  priceLabel: string;  // e.g. "Contact us" — no real prices
  priceHint: string;   // e.g. "1 provider"
  features: string[];
  ctaLabel: string;    // always "Schedule a Demo"
  ctaHref: string;     // mailto:hello@clarityos.com?subject=Pricing%20-%20<tier>
  highlight?: boolean; // Practice = true
};

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "solo",
    name: "Solo",
    tagline: "For independent optometrists",
    icon: Sparkles,
    priceLabel: "Contact us",
    priceHint: "1 provider",
    features: [
      "AI Clinical Scribe",
      "Integrated scheduling & patient intake",
      "Superbill + CMS-1500 PDF",
      "Optical handoff & Rx PDF",
      "Email support",
    ],
    ctaLabel: "Schedule a Demo",
    ctaHref: "mailto:hello@clarityos.com?subject=Pricing%20-%20Solo",
  },
  {
    id: "practice",
    name: "Practice",
    tagline: "For growing multi-provider practices",
    icon: Building2,
    priceLabel: "Contact us",
    priceHint: "Up to 5 providers",
    features: [
      "Everything in Solo",
      "Analytics dashboard",
      "Multi-provider scheduling",
      "Per-payer fee schedules",
      "Priority support + onboarding",
    ],
    ctaLabel: "Schedule a Demo",
    ctaHref: "mailto:hello@clarityos.com?subject=Pricing%20-%20Practice",
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For multi-location groups",
    icon: Rocket,
    priceLabel: "Custom",
    priceHint: "Unlimited providers",
    features: [
      "Everything in Practice",
      "Dedicated CSM",
      "SLA + uptime guarantees",
      "SSO + custom integrations",
      "Advanced audit exports",
    ],
    ctaLabel: "Schedule a Demo",
    ctaHref: "mailto:hello@clarityos.com?subject=Pricing%20-%20Scale",
  },
];
