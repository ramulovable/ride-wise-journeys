/** Common route wording must still reach the provider if model extraction is unavailable. */
export function routeFromQuestion(text: string) {
  const normal = text.toLowerCase().replace(/[?.!,]/g, " ").trim();
  const match = /(?:from\s+)?([a-z][a-z ]{1,40}?)\s+(?:se|to)\s+([a-z][a-z ]{1,40}?)(?=\s+(?:ke liye|tak|kaun|kon|ki|ke|train|which|on|today|tomorrow|aaj|kal|check|bata)|$)/.exec(normal);
  if (!match?.[1] || !match[2]) return null;
  return { from: match[1].replace(/^(?:please|check|trains? from|trains?|mujhe)\s+/, "").trim(), to: match[2].trim() };
}