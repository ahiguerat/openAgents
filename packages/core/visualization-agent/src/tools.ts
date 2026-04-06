import { VisualizationPlan, ChartConfig } from './types.js';
import { ChartGeneratorFactory } from './generators/index.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Tool: Generate Chart
 * Crea la gráfica en memoria y retorna la URL o configuración
 * Soporta: line, bar, pie, scatter, radar, area
 */
export async function generateChartTool(
  plan: VisualizationPlan,
  data: any[],
  config: ChartConfig,
  chartProvider?: string
): Promise<{ url?: string; chartConfig?: any; csvContent?: string; isCSV?: boolean; htmlContent?: string; isHTML?: boolean }> {
  const provider = chartProvider || 'quickchart';
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Creating ${plan.chartType} with provider: ${provider}`);
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Data points: ${data.length}`);
  
  // Obtener el generador apropiado (ahora es async)
  const generator = await ChartGeneratorFactory.getGenerator(provider);
  
  if (!generator) {
    throw new Error(`Chart generator not found: ${provider}. Available: ${(await ChartGeneratorFactory.listGenerators()).join(', ')}`);
  }
  
  // Delegar la generación al proveedor seleccionado
  try {
    const result = await generator.generate(plan, data, config);
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Chart generated successfully with ${provider}`);
    return result;
  } catch (error) {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Error with provider ${provider}: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Tool: Save Image to PNG, CSV, or HTML
 * Descarga la imagen de la URL y la guarda en una carpeta local
 * O guarda CSV/HTML directamente si se proporciona
 */
export async function saveImageTool(
  imageUrl: string,
  outputDir: string = './output',
  filename?: string,
  csvContent?: string,
  htmlContent?: string
): Promise<{ filePath: string; size: number }> {
  console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] Saving chart to ${outputDir}`);
  
  // Crear directorio si no existe
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] Created directory: ${outputDir}`);
  }

  // Si es CSV, guardarlo directamente
  if (csvContent) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
    const finalFilename = filename || `table_data_${timestamp}.csv`;
    const filePath = join(outputDir, finalFilename);
    
    try {
      writeFileSync(filePath, csvContent, 'utf8');
      const size = Buffer.byteLength(csvContent, 'utf8');
      
      console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] CSV file saved: ${filePath}`);
      console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] File size: ${size} bytes`);
      
      return {
        filePath: filePath,
        size: size,
      };
    } catch (error) {
      throw new Error(`Failed to save CSV file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Si es HTML, guardarlo directamente
  if (htmlContent) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
    const finalFilename = filename || `heatmap_${timestamp}.html`;
    const filePath = join(outputDir, finalFilename);
    
    try {
      writeFileSync(filePath, htmlContent, 'utf8');
      const size = Buffer.byteLength(htmlContent, 'utf8');
      
      console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] HTML file saved: ${filePath}`);
      console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] File size: ${size} bytes`);
      
      return {
        filePath: filePath,
        size: size,
      };
    } catch (error) {
      throw new Error(`Failed to save HTML file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generar nombre de archivo PNG si no se proporciona
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
  const finalFilename = filename || `chart_${timestamp}.png`;
  const filePath = join(outputDir, finalFilename);

  try {
    // Descargar la imagen
    console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] Downloading from URL...`);
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Guardar a archivo
    writeFileSync(filePath, buffer);
    
    console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] Image saved: ${filePath} (${buffer.length} bytes)`);
    
    return {
      filePath,
      size: buffer.length,
    };
  } catch (error) {
    console.error(`[VIZ_AGENT][TOOL][SAVE_IMAGE] Error saving image:`, error);
    throw new Error(`Failed to save image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Tool: Export to CSV
 * Exporta los datos a formato CSV
 */
export async function exportToCSVTool(
  data: any[],
  outputDir: string = './output',
  filename?: string
): Promise<{ filePath: string; rows: number }> {
  console.error(`[VIZ_AGENT][TOOL][EXPORT_CSV] Exporting ${data.length} rows to CSV`);
  
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
  const finalFilename = filename || `data_${timestamp}.csv`;
  const filePath = join(outputDir, finalFilename);

  try {
    // Obtener headers de las keys del primer objeto
    if (data.length === 0) {
      throw new Error('No data to export');
    }

    const headers = Object.keys(data[0]);
    const csvLines: string[] = [];
    
    // Header
    csvLines.push(headers.join(','));
    
    // Rows
    for (const row of data) {
      const values = headers.map(header => {
        let value = row[header];
        // Escapar comillas y comas
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? '';
      });
      csvLines.push(values.join(','));
    }

    const csvContent = csvLines.join('\n');
    writeFileSync(filePath, csvContent, 'utf-8');
    
    console.error(`[VIZ_AGENT][TOOL][EXPORT_CSV] CSV saved: ${filePath} (${data.length} rows)`);
    
    return {
      filePath,
      rows: data.length,
    };
  } catch (error) {
    console.error(`[VIZ_AGENT][TOOL][EXPORT_CSV] Error:`, error);
    throw new Error(`Failed to export CSV: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Tool: Calculate Statistics
 * Calcula estadísticas básicas de un campo numérico
 */
export async function calculateStatsTool(
  data: any[],
  field: string
): Promise<{
  field: string;
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}> {
  console.error(`[VIZ_AGENT][TOOL][CALC_STATS] Calculating statistics for field: ${field}`);
  
  const values = data
    .map(item => parseFloat(item[field]))
    .filter(val => !isNaN(val))
    .sort((a, b) => a - b);

  if (values.length === 0) {
    throw new Error(`No valid numeric values found for field: ${field}`);
  }

  const count = values.length;
  const min = values[0];
  const max = values[count - 1];
  const sum = values.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;
  
  const median = count % 2 === 0
    ? (values[count / 2 - 1] + values[count / 2]) / 2
    : values[Math.floor(count / 2)];

  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  console.error(`[VIZ_AGENT][TOOL][CALC_STATS] Stats: min=${min}, max=${max}, mean=${mean.toFixed(2)}, median=${median}`);

  return { field, count, min, max, mean, median, stdDev };
}

/**
 * Tool: Aggregate Data
 * Agrupa datos por un campo y aplica agregación
 */
export async function aggregateDataTool(
  data: any[],
  groupBy: string,
  aggregateField: string,
  aggregationType: 'sum' | 'avg' | 'min' | 'max' | 'count' = 'avg'
): Promise<any[]> {
  console.error(`[VIZ_AGENT][TOOL][AGGREGATE] Grouping by ${groupBy}, ${aggregationType} of ${aggregateField}`);
  
  const groups = new Map<string, number[]>();
  
  for (const item of data) {
    const key = String(item[groupBy]);
    const value = parseFloat(item[aggregateField]);
    
    if (!isNaN(value)) {
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(value);
    }
  }

  const result: any[] = [];
  
  for (const [key, values] of groups.entries()) {
    let aggregatedValue: number;
    
    switch (aggregationType) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        aggregatedValue = Math.min(...values);
        break;
      case 'max':
        aggregatedValue = Math.max(...values);
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
    }

    result.push({
      [groupBy]: key,
      [aggregateField]: aggregatedValue.toFixed(2),
      count: values.length,
    });
  }

  console.error(`[VIZ_AGENT][TOOL][AGGREGATE] Created ${result.length} groups`);
  
  return result;
}

/**
 * Tool: Detect Anomalies
 * Detecta valores anómalos usando método de desviación estándar
 */
export async function detectAnomaliesTool(
  data: any[],
  field: string,
  threshold: number = 2
): Promise<{ anomalies: any[]; normalRange: { min: number; max: number } }> {
  console.error(`[VIZ_AGENT][TOOL][ANOMALIES] Detecting anomalies in ${field} (threshold: ${threshold} std devs)`);
  
  const stats = await calculateStatsTool(data, field);
  const lowerBound = stats.mean - (threshold * stats.stdDev);
  const upperBound = stats.mean + (threshold * stats.stdDev);

  const anomalies = data.filter(item => {
    const value = parseFloat(item[field]);
    return !isNaN(value) && (value < lowerBound || value > upperBound);
  });

  console.error(`[VIZ_AGENT][TOOL][ANOMALIES] Found ${anomalies.length} anomalies`);
  
  return {
    anomalies,
    normalRange: { min: lowerBound, max: upperBound },
  };
}
