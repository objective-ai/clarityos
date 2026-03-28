// ─── API Route: Generate Reply Draft ─────────────────────────────────────────
// App Router  →  app/api/generate-reply/route.ts
// Pages Router → pages/api/generate-reply.ts  (swap export below)
//
// Env var required:
//   ANTHROPIC_API_KEY  (server-side only, no NEXT_PUBLIC_ prefix)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";

// ── App Router export (default) ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { postText, keyword, group, author } = await req.json();

  const reply = await generateReply({ postText, keyword, group, author });
  return NextResponse.json({ reply });
}

// ── Pages Router export — uncomment and replace the above if using /pages ─────
// import type { NextApiRequest, NextApiResponse } from "next";
// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   if (req.method !== "POST") return res.status(405).end();
//   const { postText, keyword, group, author } = req.body;
//   const reply = await generateReply({ postText, keyword, group, author });
//   res.json({ reply });
// }

// ── Core generation logic ─────────────────────────────────────────────────────

async function generateReply({
  postText,
  keyword,
  group,
  author,
}: {
  postText: string;
  keyword: string;
  group: string;
  author: string;
}) {
  const systemPrompt = `You are a helpful optometry practice owner who uses Clarity EHR.
You're responding to posts in Facebook groups where optometrists discuss practice management, EHR software, billing, and running their practices.

Your goal is to:
1. Give genuinely helpful, specific advice based on the person's actual question
2. Naturally mention Clarity EHR as a solution you personally use (not as a salesperson)
3. Keep the tone conversational, warm, and peer-to-peer — not corporate
4. End with a soft mention of clarityehr.com if relevant
5. Keep replies to 3-4 short paragraphs maximum

Important rules:
- Never sound like an advertisement or bot
- Lead with actual helpful content before mentioning Clarity
- Use first-person ("I switched to...", "We found that...")
- Match the tone of the original post`;

  const userPrompt = `Facebook group: ${group}
Posted by: ${author}
Triggered keyword: "${keyword}"

Post content:
"${postText}"

Write a helpful reply that naturally introduces Clarity EHR as a solution.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", // cheap + fast for drafts
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}
