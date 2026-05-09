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

export type AIWarningResult = {
  questions: string[];
  warning: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
  message: string; // backward-compatible single string for existing UI
};

const FALLBACK: AIWarningResult = {
  questions: [
    "Do you truly need this right now, or is it an impulse?",
    "How many days of food budget does this purchase cost?",
    "Will this bring you closer to being debt-free?",
  ],
  warning:
    "Pause and reflect — this purchase may set back your debt-free goal.",
  riskLevel: "MEDIUM",
  recommendation:
    "Sleep on it for 24 hours. If it still feels essential tomorrow, reconsider then.",
  message:
    "Pause and reflect: do you really need this right now? Consider whether this purchase brings you closer to being debt-free.",
};

function deriveRisk(
  price: number,
  wallet: number,
  debt: number,
  budgetRemaining: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (price > wallet || price > budgetRemaining * 2 || (debt > 0 && price > debt * 0.1)) return "HIGH";
  if (price > wallet * 0.3 || price > budgetRemaining) return "MEDIUM";
  return "LOW";
}

export const generateAIWarning = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AIWarningResult> => {
    // Read secret inside handler — server-only, never exposed to client.
    const apiKey = process.env.GEMINI_API_KEY;
    const budgetRemaining = Math.max(0, data.weeklyFoodBudget - data.weeklyFoodSpent);
    const heuristicRisk = deriveRisk(
      data.productPrice,
      data.walletBalance,
      data.debtRemaining,
      budgetRemaining,
    );

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured");
      return { ...FALLBACK, riskLevel: heuristicRisk };
    }

    const prompt = `You are an AI financial discipline assistant helping Malaysian university students avoid impulsive spending.

The user wants to purchase:
- Product: ${data.productName}
- Price: RM${data.productPrice.toFixed(2)}
- Current debt: RM${data.debtRemaining.toFixed(2)}
- Wallet balance: RM${data.walletBalance.toFixed(2)}
- Weekly food budget remaining: RM${budgetRemaining.toFixed(2)}
${data.context ? `- Note: ${data.context}` : ""}

Return ONLY a compact JSON object (no markdown, no code fences) with this exact shape:
{
  "questions": [string, string, string],   // 3 short reflective awareness questions, student-friendly
  "warning": string,                        // 1-2 sentence spending warning
  "riskLevel": "LOW" | "MEDIUM" | "HIGH",
  "recommendation": string                  // short motivational recommendation, kind but firm
}

Keep all strings concise and use Malaysian Ringgit (RM) where relevant.`;

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
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 400,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        console.error("Gemini API error", res.status, await res.text().catch(() => ""));
        return { ...FALLBACK, riskLevel: heuristicRisk };
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();

      if (!text) return { ...FALLBACK, riskLevel: heuristicRisk };

      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned) as Partial<AIWarningResult>;

      const questions = Array.isArray(parsed.questions)
        ? parsed.questions.filter((q): q is string => typeof q === "string").slice(0, 3)
        : [];
      const warning = typeof parsed.warning === "string" ? parsed.warning : FALLBACK.warning;
      const recommendation =
        typeof parsed.recommendation === "string" ? parsed.recommendation : FALLBACK.recommendation;
      const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
        parsed.riskLevel === "LOW" || parsed.riskLevel === "MEDIUM" || parsed.riskLevel === "HIGH"
          ? parsed.riskLevel
          : heuristicRisk;

      return {
        questions: questions.length === 3 ? questions : FALLBACK.questions,
        warning,
        riskLevel,
        recommendation,
        message: warning, // keep `message` for existing callers
      };
    } catch (err) {
      console.error("Gemini request failed", err);
      return { ...FALLBACK, riskLevel: heuristicRisk };
    }
  });

// ============================================================
// Food budget advisor
// ============================================================

const FoodInput = z.object({
  weeklyBudget: z.number().min(0).max(1_000_000),
  currentSpent: z.number().min(0).max(1_000_000),
  foodPrice: z.number().min(0).max(1_000_000),
  context: z.string().max(200).optional(),
});

export type FoodBudgetAdvice = {
  safe: boolean;
  projectedRemaining: number;
  warning: string;
  alternatives: string[];
  summary: string;
};

const FOOD_FALLBACK_ALTS = [
  "Economy rice (nasi campur) at a kopitiam — ~RM6-8",
  "Roti canai + teh tarik combo — ~RM4-6",
  "Maggi goreng or fried rice from a mamak — ~RM7-9",
];

export const generateFoodBudgetAdvice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FoodInput.parse(d))
  .handler(async ({ data }): Promise<FoodBudgetAdvice> => {
    const apiKey = process.env.GEMINI_API_KEY;
    const projectedRemaining = +(data.weeklyBudget - data.currentSpent - data.foodPrice).toFixed(2);
    const safe = projectedRemaining >= 0 && data.foodPrice <= Math.max(0, data.weeklyBudget - data.currentSpent);

    if (!apiKey) {
      console.error("GEMINI_API_KEY is not configured");
      return {
        safe,
        projectedRemaining,
        warning: safe
          ? "Within budget — but track every ringgit."
          : "This purchase pushes you over your weekly food budget.",
        alternatives: FOOD_FALLBACK_ALTS,
        summary: safe ? "Safe spend." : "Overspending risk — consider a cheaper option.",
      };
    }

    const prompt = `You are an AI budgeting assistant helping Malaysian university students manage food spending wisely.

- Weekly food budget: RM${data.weeklyBudget.toFixed(2)}
- Already spent this week: RM${data.currentSpent.toFixed(2)}
- Current food item price: RM${data.foodPrice.toFixed(2)}
- Projected remaining if purchased: RM${projectedRemaining.toFixed(2)}
${data.context ? `- Note: ${data.context}` : ""}

Return ONLY a compact JSON object (no markdown, no code fences) with this exact shape:
{
  "safe": boolean,                          // true if financially safe
  "warning": string,                        // short overspending warning, or empty if safe
  "alternatives": [string, string, string], // 3 cheaper Malaysian meal alternatives with rough RM price
  "summary": string                         // 1-sentence practical recommendation
}

Be concise, student-friendly, and use Malaysian Ringgit (RM).`;

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
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 400,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        console.error("Gemini API error", res.status, await res.text().catch(() => ""));
        return {
          safe,
          projectedRemaining,
          warning: safe ? "" : "This purchase exceeds your remaining food budget.",
          alternatives: FOOD_FALLBACK_ALTS,
          summary: safe ? "Safe spend." : "Try a cheaper option below.",
        };
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      const cleaned = (text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = (cleaned ? JSON.parse(cleaned) : {}) as Partial<FoodBudgetAdvice>;

      const alternatives = Array.isArray(parsed.alternatives)
        ? parsed.alternatives.filter((a): a is string => typeof a === "string").slice(0, 3)
        : [];

      return {
        safe: typeof parsed.safe === "boolean" ? parsed.safe : safe,
        projectedRemaining,
        warning: typeof parsed.warning === "string" ? parsed.warning : "",
        alternatives: alternatives.length === 3 ? alternatives : FOOD_FALLBACK_ALTS,
        summary:
          typeof parsed.summary === "string" && parsed.summary.length > 0
            ? parsed.summary
            : safe
              ? "Safe spend — keep tracking."
              : "Overspending risk — consider a cheaper option.",
      };
    } catch (err) {
      console.error("Gemini food advice failed", err);
      return {
        safe,
        projectedRemaining,
        warning: safe ? "" : "Heads up — you'd go over your weekly food budget.",
        alternatives: FOOD_FALLBACK_ALTS,
        summary: safe ? "Safe spend." : "Try a cheaper option below.",
      };
    }
  });
