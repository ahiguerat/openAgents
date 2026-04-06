/**
 * Utilidades para el orchestrator
 */

/**
 * Obtiene la fecha/hora actual en formato RFC3339
 */
export function getTimeRFC3339(): string {
  return new Date().toISOString();
}

/**
 * Parsea JSON con manejo de errores mejorado
 */
export function safeJsonParse<T = any>(text: string): T {
  try {
    return JSON.parse(text);
  } catch {
    // Intentar limpiar el texto
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  }
}
