/**
 * Centralised AI model selection.
 *
 * Models are chosen via env vars with sensible defaults so we can swap them
 * across all three AI entry points (vision parsing, text parsing,
 * categorisation) by changing an env var in Vercel — no code deploy needed.
 *
 * Defaults as of April 2026:
 *   - Vision + text parsing: gpt-5.4-mini (OpenAI's recommended doc model,
 *     cheaper and more accurate for tables than gpt-4o)
 *   - Categorisation: gpt-5.4-nano (tiny, fast, cheap; categorisation is a
 *     pattern-matching task that doesn't need a large reasoning budget)
 *
 * Kill-switch: set FINTRK_AI_VISION_MODEL=gpt-4o (etc.) in Vercel to roll
 * back without a redeploy if we hit a problem.
 */

const fromEnv = (key: string, fallback: string): string => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
};

// SAFETY: reverted defaults to gpt-4o after a production regression where
// the chat.completions.create({model:"gpt-5.4-mini", response_format:..., reasoning_effort:...})
// call failed (likely: gpt-5.x reasoning models require the Responses API
// or don't accept json_object response_format in the legacy chat endpoint).
// Env vars stay wired so we can opt into gpt-5.4 once we migrate to the
// Responses API in a separate branch.

/** Vision-based PDF statement parser (ai-pdf-vision.ts) */
export const AI_VISION_MODEL = () => fromEnv("FINTRK_AI_VISION_MODEL", "gpt-4o");

/** Text-based statement parser fallback (ai-import.ts) */
export const AI_PARSE_MODEL = () => fromEnv("FINTRK_AI_PARSE_MODEL", "gpt-4o");

/** Transaction categorisation (ai.ts) */
export const AI_CATEGORIZE_MODEL = () => fromEnv("FINTRK_AI_CATEGORIZE_MODEL", "gpt-4o-mini");

/**
 * True when the configured model is a GPT-5.x family model (supports reasoning
 * effort parameter, better instruction following, etc.). Used to gate params
 * that older models don't understand.
 */
export function isGPT5Family(model: string): boolean {
  return /^gpt-5/.test(model);
}
