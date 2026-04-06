import { streamStructuredPlan } from './llm-flexible.js';
import { VisualizationRequest, VisualizationPlan } from './types.js';

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Intentar limpiar markdown code blocks
    let cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    
    try {
      return JSON.parse(cleaned);
    } catch {
      // Buscar JSON object entre texto (Copilot genera explicaciones)
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error("No se pudo extraer JSON válido del texto");
    }
  }
}

export async function planVisualization(request: VisualizationRequest): Promise<VisualizationPlan> {
  console.error('[VIZ_AGENT][PLANNER] Starting visualization planning');
  
  const dataPreview = generateDataPreview(request.data);
  const dataFields = extractDataFields(request.data);
  
  const systemPrompt = `You are a data visualization expert. Analyze the user's request and the data structure to determine the best visualization approach.

Available chart types: line_chart, bar_chart, pie, scatter, table, area_chart, radar, histogram, heatmap

CRITICAL DISTINCTIONS - READ CAREFULLY:

1. **histogram**: Use ONLY when user explicitly asks for:
   - "histograma" / "histogram"
   - "distribución de frecuencias" / "frequency distribution"
   - "distribución de valores" / "value distribution"
   
   In histogram:
   - X-axis = VALUE RANGES (bins like 100-110, 110-120, etc.)
   - Y-axis = FREQUENCY COUNT (how many times each range appears)
   - NO dates/timestamps on X-axis
   - Purpose: Show how values are distributed

2. **bar_chart**: Use when:
   - X-axis = dates/timestamps or categories
   - Y-axis = measured values
   - Purpose: Compare values over time or across categories

3. **heatmap**: Use when user asks for:
   - "mapa de calor" / "heatmap"
   - "heat map" / "calendar heatmap"
   - Showing intensity/density patterns across two dimensions
   - Correlation matrices
   
   In heatmap:
   - X-axis = One categorical/temporal dimension
   - Y-axis = Another categorical/temporal dimension
   - Color intensity = Value/frequency at each (x,y) intersection
   - Purpose: Show patterns, correlations, or intensity across 2D grid
   
DECISION RULE:
- If user says "histograma" or "distribución" → USE HISTOGRAM
- If user says "mapa de calor" or "heatmap" → USE HEATMAP
- If user asks for time series or "por día"/"por fecha" → USE bar_chart
- When in doubt and user said "histograma" → USE HISTOGRAM

User Request: ${request.prompt}
${request.suggestedType ? `Suggested Type: ${request.suggestedType}` : ''}

Data Structure:
${dataPreview}

Available Fields: ${dataFields.join(', ')}

Respond ONLY with a valid JSON object (no markdown, no explanations):
{
  "chartType": "line_chart|bar_chart|pie_chart|scatter|table|area_chart|radar|histogram|heatmap",
  "title": "Chart title",
  "xLabel": "X-axis label (if applicable)",
  "yLabel": "Y-axis label (if applicable)",
  "xField": "field name for X-axis (for histogram: the field to analyze distribution)",
  "yField": "field name(s) for Y-axis - MUST be an ARRAY when comparing multiple fields (e.g., [\"AE\", \"AI\"] for comparing AE vs AI)",
  "valueField": "field for heatmap intensity/color (only for heatmap)",
  "colors": ["#color1", "#color2", ...] (optional),
  "bins": 10 (optional, only for histogram - number of bins/ranges),
  "options": {} (optional chart-specific options),
  "rationale": "Explanation of why this chart type is best"
}

IMPORTANT RULES FOR yField:
- When user asks to "compare" or mentions multiple fields (e.g., "AE and AI", "AE y AI"), yField MUST be an array: ["field1", "field2"]
- When comparing different measurements, each should be a separate line/series in the chart
- Single field queries: yField can be a string or single-element array
- Example: "compare AE and AI" → yField: ["AE", "AI"]
- Example: "energy over time" → yField: "value" or ["value"]`;

  try {
    console.error('[VIZ_AGENT][PLANNER] Calling LLM for plan generation');
    
    const response = await streamStructuredPlan({
      systemPrompt,
      userPrompt: 'Generate the visualization plan based on the request and data structure.',
    });

    console.error('[VIZ_AGENT][PLANNER] Parsing LLM response');
    const plan: VisualizationPlan = safeJsonParse(response.rawText);

    // Normalizar chartType para compatibilidad con versiones antiguas
    plan.chartType = normalizeChartType(plan.chartType);

    // OVERRIDE: Si el usuario dice explícitamente "histograma", forzar histogram
    const userPromptLower = request.prompt.toLowerCase();
    if ((userPromptLower.includes('histograma') || userPromptLower.includes('histogram') || 
         userPromptLower.includes('distribución de frecuencias') || userPromptLower.includes('distribucion de frecuencias')) 
        && plan.chartType !== 'histogram') {
      console.error(`[VIZ_AGENT][PLANNER] OVERRIDE: User requested histogram but LLM chose ${plan.chartType}, forcing histogram`);
      plan.chartType = 'histogram';
    }
    
    // OVERRIDE: Si el usuario dice explícitamente "mapa de calor", forzar heatmap
    if ((userPromptLower.includes('mapa de calor') || userPromptLower.includes('heatmap') || 
         userPromptLower.includes('heat map')) 
        && plan.chartType !== 'heatmap') {
      console.error(`[VIZ_AGENT][PLANNER] OVERRIDE: User requested heatmap but LLM chose ${plan.chartType}, forcing heatmap`);
      plan.chartType = 'heatmap';
    }

    console.error(`[VIZ_AGENT][PLANNER] Plan generated: ${plan.chartType} chart for ${plan.title}`);
    console.error(`[VIZ_AGENT][PLANNER] Rationale: ${plan.rationale}`);
    
    return plan;
  } catch (error) {
    console.error('[VIZ_AGENT][PLANNER] Error during planning:', error);
    throw new Error(`Planning failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Normaliza el chartType para asegurar compatibilidad
 * Convierte valores sin underscore a valores con underscore
 */
function normalizeChartType(chartType: string): any {
  const mapping: Record<string, string> = {
    'bar': 'bar_chart',
    'line': 'line_chart',
    'area': 'area_chart',
    'pie': 'pie_chart',
  };
  
  const normalized = mapping[chartType] || chartType;
  console.error(`[VIZ_AGENT][PLANNER] Normalized chartType: ${chartType} -> ${normalized}`);
  return normalized;
}

function generateDataPreview(data: any): string {
  // Si data es un array
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return 'Empty array - no data provided';
    }
    const preview = data.slice(0, 3).map((item, idx) => {
      return `Row ${idx + 1}: ${JSON.stringify(item)}`;
    }).join('\n');
    return `${preview}\n... (${data.length} total rows)`;
  }
  
  // Si data es un objeto (como respuesta del data-agent)
  if (data && typeof data === 'object') {
    return `Data object: ${JSON.stringify(data, null, 2)}`;
  }
  
  // Otro tipo
  return 'No valid data provided';
}

function extractDataFields(data: any): string[] {
  // Si data es un array
  if (Array.isArray(data) && data.length > 0) {
    const firstRow = data[0];
    if (typeof firstRow !== 'object' || firstRow === null) {
      return [];
    }
    return Object.keys(firstRow);
  }
  
  // Si data es un objeto con propiedad data que es array
  if (data && typeof data === 'object' && Array.isArray(data.data) && data.data.length > 0) {
    const firstRow = data.data[0];
    if (typeof firstRow !== 'object' || firstRow === null) {
      return [];
    }
    return Object.keys(firstRow);
  }
  
  // Si data es un objeto, sus keys
  if (data && typeof data === 'object') {
    return Object.keys(data);
  }
  
  return [];
}
