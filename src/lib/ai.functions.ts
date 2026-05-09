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

export const generateAIWarning = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        message:
          "Pause and reflect: do you really need this right now? Consider whether this purchase brings you closer to being debt-free.",
      };
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
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        return { message: "Take a breath. This isn't an emergency. Sleep on it for 30 minutes — your future debt-free self will thank you." };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const message = json.choices?.[0]?.message?.content?.trim() ||
        "Take a breath. This isn't an emergency. Sleep on it for 30 minutes.";
      return { message };
    } catch {
      return { message: "Take a moment. Is this purchase a need, or a craving for novelty? Your debt-free goal is closer than you think." };
    }
  });
