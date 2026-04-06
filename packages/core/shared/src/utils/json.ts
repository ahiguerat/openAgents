/**
 * Parse JSON from text that may include markdown code blocks or explanations
 * Handles cases where LLMs wrap JSON in markdown or add text before/after
 * 
 * @param text - The text containing JSON
 * @returns Parsed JSON object
 * @throws Error if JSON cannot be extracted
 */
export function safeJsonParse<T = any>(text: string): T {
  try {
    return JSON.parse(text);
  } catch {
    // Try cleaning markdown code blocks
    let cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    
    try {
      return JSON.parse(cleaned);
    } catch {
      // Search for JSON object within text (LLMs may generate explanations)
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("No se pudo extraer JSON válido del texto");
    }
  }
}
