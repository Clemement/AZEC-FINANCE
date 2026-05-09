import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  productName: z.string().min(1).max(120),
  productPrice: z.number().min(0).max(1_000_000),
  walletBalance: z.number(),
  debtRemaining: z.number(),
  weeklyFoodBudget: z.number(),
  weeklyFoodSpent: z.number(),
  context: z.string().max(200).optional(),
});

const FALLBACK =
  "Pause and reflect: do you really need this right now? Consider whether this purchase brings you closer to being debt-free.";

export const generateAIWarning = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    // Read secret inside handler (server-only). Never expose to client.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured");
      return { message: FALLBACK };
    }

    const prompt = `You are a calm, empathetic financial coach for Malaysian university students.
Write ONE short reflective intervention (max 50 words, plain text, no markdown) to help the student reconsider an impulse purchase.
Be kind but firm. Mention 1 concrete trade-off relative to their debt or food budget. Use Malaysian Ringgit (RM).

Student data:
- Product: ${data.productName} at RM${data.productPrice.toFixed(2)}
- Wallet: RM${data.walletBalance.toFixed(2)}
- Debt remaining: RM${data.debtRemaining.toFixed(2)}
- Weekly food budget: RM${data.weeklyFoodBudget.toFixed(2)} (spent RM${data.weeklyFoodSpent.toFixed(2)})
${data.context ? `- Note: ${data.context}` : ""}

Return only the message text.`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 120 },
          }),
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        console.error("Gemini API error", res.status, await res.text().catch(() => ""));
        return { message: FALLBACK };
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      return { message: text || FALLBACK };
    } catch (err) {
      console.error("Gemini request failed", err);
      return { message: FALLBACK };
    }
  });
