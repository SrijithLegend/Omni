import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const TARGETS = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Microsoft Copilot",
  "Perplexity",
  "Grok",
  "DeepSeek",
] as const;

const Input = z.object({
  conversation: z.string().min(20).max(120_000),
  sourceModel: z.string().min(1).max(60),
  targetModel: z.enum(TARGETS),
  intent: z.string().max(500).optional(),
});

const targetGuidance: Record<(typeof TARGETS)[number], string> = {
  ChatGPT:
    "Use a clear system-style preamble. ChatGPT responds well to numbered context blocks, explicit role framing, and concrete next-step instructions.",
  Claude:
    "Use XML-style tags like <context>, <decisions>, <task>. Claude excels with structured tags, careful reasoning prompts, and natural language.",
  Gemini:
    "Use a structured markdown layout with headings. Gemini handles long context well; be explicit about which sources to trust.",
  "Microsoft Copilot":
    "Be concise and business-oriented. Frame the continuation in terms of deliverables and action items.",
  Perplexity:
    "Frame as a research continuation. Specify which facts are already established and what new information is needed.",
  Grok:
    "Direct, conversational tone. State the context plainly and ask the next question or task.",
  DeepSeek:
    "Technical, precise framing. Use code-fenced blocks for any code-related context and explicit task statements.",
};

export const transferConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = (typeof process !== "undefined" ? process.env.LOVABLE_API_KEY : undefined) || "fallback";
    if (!key || key === "fallback") throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system = `You are the Context Engine inside ThreadShift AI. Your job is to take a raw conversation a user had with one AI assistant and produce an optimized continuation prompt for a different AI assistant, so the new model can pick up exactly where the previous one left off.

Rules:
- Preserve all material facts, decisions, constraints, code snippets, file names, identifiers, and unresolved questions.
- Drop pleasantries, restated questions, model refusals, repetition, and ungrounded speculation.
- Compress aggressively without losing reasoning continuity.
- Never invent facts that are not in the source conversation.
- Output ONLY the final prompt the user will paste into the new AI. No meta commentary, no "Here is the prompt", no markdown code fences around the whole output.

The continuation prompt MUST contain these sections, tuned to the target model's preferred style:
1. A brief framing line stating this is a continued conversation transferred from ${data.sourceModel}.
2. Project / topic summary (2-5 sentences).
3. Key decisions and constraints already agreed upon (bulleted).
4. Relevant artifacts: code, file names, data, links (only those present in the source).
5. Open questions / what was being worked on when the conversation paused.
6. The explicit next task for the new AI to perform.

Target model: ${data.targetModel}.
Style guidance for ${data.targetModel}: ${targetGuidance[data.targetModel]}`;

    const userIntent = data.intent?.trim()
      ? `\n\nUser's stated next step (prioritize this): ${data.intent.trim()}`
      : "";

    const { text, usage } = await generateText({
      model,
      system,
      prompt: `Source AI: ${data.sourceModel}\nTarget AI: ${data.targetModel}${userIntent}\n\n--- BEGIN SOURCE CONVERSATION ---\n${data.conversation}\n--- END SOURCE CONVERSATION ---\n\nProduce the optimized continuation prompt now.`,
    });

    const sourceChars = data.conversation.length;
    const outputChars = text.length;
    const compression =
      sourceChars > 0 ? Math.max(0, Math.round((1 - outputChars / sourceChars) * 100)) : 0;

    return {
      prompt: text.trim(),
      stats: {
        sourceChars,
        outputChars,
        compressionPercent: compression,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      },
      targetModel: data.targetModel,
    };
  });
