import { VisualizationPlan, ChartConfig } from './types.js';
import QuickChart from 'quickchart-js';
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
  config: ChartConfig
): Promise<{ url: string; chartConfig: any; csvContent?: string; isCSV?: boolean; htmlContent?: string; isHTML?: boolean }> {
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Creating ${plan.chartType}`);
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Data points: ${data.length}`);
  
  // IMPORTANTE: QuickChart tiene límite de URL, reducir datos si son muchos
  // EXCEPTO para histogramas, que necesitan todos los valores para calcular frecuencias
  const MAX_POINTS = 50; // Reducido de 100 a 50 para evitar URLs largas
  let processedData = data;
  
  if (plan.chartType !== 'histogram' && data.length > MAX_POINTS) {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Too many points (${data.length}), sampling to ${MAX_POINTS}`);
    processedData = sampleData(data, MAX_POINTS);
  } else if (plan.chartType === 'histogram') {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Histogram: using all ${data.length} data points for frequency calculation`);
  }

  // Preparar datos según el tipo de gráfica
  let chartConfig: any;
  let isCSV = false;
  let csvContent = '';
  let isHTML = false;
  let htmlContent = '';

  if (plan.chartType === 'table') {
    // Las tablas generan CSV directamente
    csvContent = generateCSV(processedData);
    isCSV = true;
  } else if (plan.chartType === 'pie_chart') {
    chartConfig = generatePieChartConfig(plan, processedData);
  } else if (plan.chartType === 'bar_chart') {
    chartConfig = generateBarChartConfig(plan, processedData);
  } else if (plan.chartType === 'scatter') {
    chartConfig = generateScatterChartConfig(plan, processedData);
  } else if (plan.chartType === 'radar') {
    chartConfig = generateRadarChartConfig(plan, processedData);
  } else if (plan.chartType === 'histogram') {
    chartConfig = generateHistogramChartConfig(plan, processedData);
  } else if (plan.chartType === 'heatmap') {
    chartConfig = generateHeatmapChartConfig(plan, processedData);
    // Check if it's HTML heatmap
    if (chartConfig.type === 'heatmap_html') {
      htmlContent = chartConfig.htmlContent;
      isHTML = true;
    }
  } else {
    // line_chart, area_chart
    chartConfig = generateLineChartConfig(plan, processedData);
  }

  // Si es CSV, retornar directamente
  if (isCSV) {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] CSV generated with ${processedData.length} rows`);
    return {
      url: '',
      chartConfig: null,
      csvContent: csvContent,
      isCSV: true
    };
  }
  
  // Si es HTML interactivo, retornar directamente
  if (isHTML) {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] HTML heatmap generated, size: ${htmlContent.length} bytes`);
    return {
      url: '',
      chartConfig: null,
      htmlContent: htmlContent,
      isHTML: true
    };
  }

  const chart = new QuickChart();
  chart
    .setConfig(chartConfig)
    .setWidth(config.width)
    .setHeight(config.height)
    .setBackgroundColor(config.backgroundColor || '#ffffff');

  const imageUrl = chart.getUrl();
  
  // Debug: log URL length for ALL chart types to diagnose QuickChart errors
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] ${plan.chartType} URL length: ${imageUrl.length} chars`);
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] URL preview (first 500 chars): ${imageUrl.substring(0, 500)}`);
  
  if (imageUrl.length > 16000) {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] ⚠️  WARNING: URL too long (${imageUrl.length}), QuickChart limit is ~16384`);
  }
  
  // Check for invalid data in chart config
  const hasInvalidData = JSON.stringify(chartConfig).match(/NaN|Infinity|-Infinity|null/);
  if (hasInvalidData) {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] ⚠️  WARNING: Chart config contains invalid values: ${hasInvalidData[0]}`);
  }
  
  // Debug: log URL length and preview for heatmaps
  if (plan.chartType === 'heatmap') {
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Chart config datasets: ${chartConfig.data?.datasets?.length || 0}`);
    console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Total data points: ${chartConfig.data?.datasets?.reduce((sum: number, d: any) => sum + (d.data?.length || 0), 0) || 0}`);
  }
  
  console.error(`[VIZ_AGENT][TOOL][GENERATE_CHART] Chart generated successfully`);
  
  return {
    url: imageUrl,
    chartConfig,
  };
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

// ============================================================================
// Helper functions
// ============================================================================

function generateLineChartConfig(plan: VisualizationPlan, data: any[]): any {
  // Simplificar labels de timestamps para URLs más cortas
  const labels = data.map(item => {
    const value = item[plan.xField];
    // Si es timestamp ISO, simplificar a fecha/hora
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return value.substring(5, 16); // "03-25 10:30" en lugar de "2026-03-25T10:30:00.000Z"
    }
    return value;
  });
  
  const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
  
  const datasets = yFields.map((field, idx) => ({
    label: field,
    data: data.map(item => item[field]),
    borderColor: plan.colors?.[idx] || getDefaultColor(idx),
    backgroundColor: plan.colors?.[idx] || getDefaultColor(idx),
    fill: plan.chartType === 'area_chart',
  }));

  return {
    type: 'line',
    data: { labels, datasets },
    options: {
      title: { display: true, text: plan.title },
      scales: {
        yAxes: [{ scaleLabel: { display: !!plan.yLabel, labelString: plan.yLabel } }],
        xAxes: [{ scaleLabel: { display: !!plan.xLabel, labelString: plan.xLabel } }]
      },
      ...plan.options,
    }
  };
}

function generateBarChartConfig(plan: VisualizationPlan, data: any[]): any {
  const labels = data.map(item => item[plan.xField]);
  const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
  
  const datasets = yFields.map((field, idx) => ({
    label: field,
    data: data.map(item => item[field]),
    backgroundColor: plan.colors?.[idx] || getDefaultColor(idx),
  }));

  return {
    type: 'bar',
    data: { labels, datasets },
    options: {
      title: { display: true, text: plan.title },
      scales: {
        yAxes: [{ scaleLabel: { display: !!plan.yLabel, labelString: plan.yLabel } }],
        xAxes: [{ scaleLabel: { display: !!plan.xLabel, labelString: plan.xLabel } }]
      },
      ...plan.options,
    }
  };
}

function generatePieChartConfig(plan: VisualizationPlan, data: any[]): any {
  const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
  
  // Detectar si los datos tienen estructura temporal (timestamp, date, time, fecha, etc.)
  const hasTimestamp = data.length > 0 && data[0] && (
    'timestamp' in data[0] || 
    'date' in data[0] || 
    'time' in data[0] ||
    'fecha' in data[0] ||
    'datetime' in data[0]
  );
  
  let labels: string[];
  let values: number[];
  
  if (hasTimestamp && plan.xField && (plan.xField.includes('time') || plan.xField.includes('date') || plan.xField.includes('fecha'))) {
    // Para datos temporales, agregar por categorías o períodos
    console.error('[VIZ_AGENT][PIE_CHART] Detected temporal data, aggregating by time periods');
    
    // Agrupar datos por fecha/período
    const aggregated = new Map<string, number>();
    
    data.forEach(item => {
      const dateValue = item[plan.xField];
      let dateKey: string;
      
      // Extraer solo la fecha (sin hora) si es ISO timestamp
      if (typeof dateValue === 'string' && dateValue.includes('T')) {
        dateKey = dateValue.split('T')[0]; // YYYY-MM-DD
      } else {
        dateKey = String(dateValue);
      }
      
      const value = Number(item[yField]) || 0;
      aggregated.set(dateKey, (aggregated.get(dateKey) || 0) + value);
    });
    
    // Convertir a arrays ordenados
    const sortedEntries = Array.from(aggregated.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    labels = sortedEntries.map(([date]) => {
      // Formatear fecha para mejor legibilidad
      try {
        const d = new Date(date);
        return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
      } catch {
        return date;
      }
    });
    values = sortedEntries.map(([, value]) => value);
    
    console.error(`[VIZ_AGENT][PIE_CHART] Aggregated ${data.length} points into ${labels.length} time periods`);
  } else if (plan.xField) {
    // Para datos categóricos, agrupar por categoría y sumar valores
    console.error('[VIZ_AGENT][PIE_CHART] Processing categorical data');
    
    const aggregated = new Map<string, number>();
    
    data.forEach(item => {
      const category = String(item[plan.xField]);
      const value = Number(item[yField]) || 0;
      aggregated.set(category, (aggregated.get(category) || 0) + value);
    });
    
    // Convertir a arrays
    labels = Array.from(aggregated.keys());
    values = Array.from(aggregated.values());
    
    console.error(`[VIZ_AGENT][PIE_CHART] Aggregated ${data.length} points into ${labels.length} categories`);
  } else {
    // Fallback: usar datos tal cual
    console.error('[VIZ_AGENT][PIE_CHART] Using data as-is (no xField specified)');
    labels = data.map((item, idx) => item[plan.xField] || `Item ${idx + 1}`);
    values = data.map(item => Number(item[yField]) || 0);
  }
  
  // Filtrar valores cero o negativos para pie charts
  const validEntries = labels.map((label, idx) => ({ label, value: values[idx] }))
    .filter(entry => entry.value > 0);
  
  if (validEntries.length === 0) {
    console.error('[VIZ_AGENT][PIE_CHART] WARNING: No valid positive values found for pie chart');
    // Retornar configuración con datos vacíos pero válidos
    return {
      type: 'pie',
      data: {
        labels: ['Sin datos'],
        datasets: [{
          data: [1],
          backgroundColor: ['#CCCCCC'],
        }]
      },
      options: {
        title: { display: true, text: plan.title + ' (Sin datos válidos)' },
        ...plan.options,
      }
    };
  }
  
  const finalLabels = validEntries.map(e => e.label);
  const finalValues = validEntries.map(e => e.value);
  
  console.error(`[VIZ_AGENT][PIE_CHART] Final pie chart has ${finalLabels.length} slices`);

  return {
    type: 'pie',
    data: {
      labels: finalLabels,
      datasets: [{
        data: finalValues,
        backgroundColor: plan.colors || generateColors(finalLabels.length),
      }]
    },
    options: {
      title: { display: true, text: plan.title },
      plugins: {
        legend: {
          display: true,
          position: 'right',
        },
        tooltip: {
          callbacks: {
            label: function(context: any) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value.toFixed(2)} (${percentage}%)`;
            }
          }
        }
      },
      ...plan.options,
    }
  };
}

function generateScatterChartConfig(plan: VisualizationPlan, data: any[]): any {
  const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
  
  console.error(`[VIZ_AGENT][SCATTER] xField: ${plan.xField}, yField: ${yFields.join(', ')}`);
  console.error(`[VIZ_AGENT][SCATTER] Sample data[0]: ${JSON.stringify(data[0])}`);
  
  // Detectar si el campo X es temporal (time, date, timestamp)
  const isTimeField = plan.xField.toLowerCase().includes('time') || 
                      plan.xField.toLowerCase().includes('date') ||
                      plan.xField.toLowerCase().includes('timestamp');
  
  const xAxisType = isTimeField ? 'time' : 'linear';
  
  console.error(`[VIZ_AGENT][SCATTER] Detected xAxis type: ${xAxisType} (isTimeField: ${isTimeField})`);
  
  const datasets = yFields.map((field, idx) => ({
    label: field,
    data: data.map(item => ({ 
      x: isTimeField ? item[plan.xField] : parseFloat(item[plan.xField]), 
      y: parseFloat(item[field]) 
    })),
    backgroundColor: plan.colors?.[idx] || getDefaultColor(idx),
    showLine: false, // Critical: no conectar puntos en scatter
    pointRadius: 3,  // Tamaño de los puntos
  }));

  return {
    type: 'scatter',
    data: { datasets },
    options: {
      title: { display: true, text: plan.title },
      scales: {
        xAxes: [{ 
          type: xAxisType,
          position: 'bottom', 
          scaleLabel: { display: !!plan.xLabel, labelString: plan.xLabel },
          ...(isTimeField && {
            time: {
              parser: 'YYYY-MM-DDTHH:mm:ssZ',
              tooltipFormat: 'll HH:mm',
              displayFormats: {
                hour: 'MMM D HH:mm'
              }
            }
          })
        }],
        yAxes: [{ 
          scaleLabel: { display: !!plan.yLabel, labelString: plan.yLabel },
          ticks: {
            beginAtZero: false
          }
        }]
      },
      ...plan.options,
    }
  };
}

function generateRadarChartConfig(plan: VisualizationPlan, data: any[]): any {
  const labels = data.map(item => item[plan.xField]);
  const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
  
  const datasets = yFields.map((field, idx) => ({
    label: field,
    data: data.map(item => item[field]),
    backgroundColor: `${plan.colors?.[idx] || getDefaultColor(idx)}33`,
    borderColor: plan.colors?.[idx] || getDefaultColor(idx),
  }));

  return {
    type: 'radar',
    data: { labels, datasets },
    options: {
      title: { display: true, text: plan.title },
      ...plan.options,
    }
  };
}

/**
 * Genera configuración para histograma (distribución de frecuencias)
 * X: Valores únicos ordenados de menor a mayor
 * Y: Frecuencia (conteo de cada valor)
 */
function generateHistogramChartConfig(plan: VisualizationPlan, data: any[]): any {
  console.error(`[VIZ_AGENT][HISTOGRAM] Input data length: ${data.length}`);
  console.error(`[VIZ_AGENT][HISTOGRAM] yField: ${plan.yField}`);
  
  const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
  console.error(`[VIZ_AGENT][HISTOGRAM] Using field: ${yField}`);
  
  // Debug: mostrar primeros elementos
  if (data.length > 0) {
    console.error(`[VIZ_AGENT][HISTOGRAM] Sample data[0]:`, JSON.stringify(data[0]).substring(0, 200));
    console.error(`[VIZ_AGENT][HISTOGRAM] Fields available:`, Object.keys(data[0]).join(', '));
    console.error(`[VIZ_AGENT][HISTOGRAM] data[0][${yField}] =`, data[0][yField]);
  }
  
  const rawValues = data.map(item => item[yField]);
  console.error(`[VIZ_AGENT][HISTOGRAM] Raw values count: ${rawValues.length}`);
  console.error(`[VIZ_AGENT][HISTOGRAM] First 5 raw values:`, rawValues.slice(0, 5));
  
  const values = rawValues.filter(v => v !== null && v !== undefined && !isNaN(Number(v))).map(v => Number(v));
  console.error(`[VIZ_AGENT][HISTOGRAM] Valid numeric values: ${values.length}`);
  
  if (values.length === 0) {
    console.error(`[VIZ_AGENT][HISTOGRAM] ERROR: No valid numeric values found`);
    console.error(`[VIZ_AGENT][HISTOGRAM] yField: ${yField}`);
    console.error(`[VIZ_AGENT][HISTOGRAM] Available fields:`, data.length > 0 ? Object.keys(data[0]).join(', ') : 'No data');
    throw new Error(`No valid numeric values found for histogram. Field '${yField}' does not contain numeric data.`);
  }

  // Contar frecuencias por valor único
  const frequencyMap = new Map<number, number>();
  values.forEach(value => {
    frequencyMap.set(value, (frequencyMap.get(value) || 0) + 1);
  });

  // Obtener valores únicos ordenados de menor a mayor
  let uniqueValues = Array.from(frequencyMap.keys()).sort((a, b) => a - b);
  let frequencies = uniqueValues.map(val => frequencyMap.get(val) || 0);

  console.error(`[VIZ_AGENT][HISTOGRAM] Unique values: ${uniqueValues.length}`);
  console.error(`[VIZ_AGENT][HISTOGRAM] Value range: ${uniqueValues[0]} to ${uniqueValues[uniqueValues.length - 1]}`);

  // IMPORTANTE: QuickChart tiene límite de tamaño de URL
  // Si hay demasiados valores únicos, mostrar solo los N más frecuentes
  const MAX_UNIQUE_VALUES = 100;
  if (uniqueValues.length > MAX_UNIQUE_VALUES) {
    console.error(`[VIZ_AGENT][HISTOGRAM] Too many unique values (${uniqueValues.length}), showing top ${MAX_UNIQUE_VALUES} most frequent`);
    
    // Crear array de [valor, frecuencia] y ordenar por frecuencia descendente
    const valueFreqPairs = uniqueValues.map((val, idx) => ({ value: val, freq: frequencies[idx] }));
    valueFreqPairs.sort((a, b) => b.freq - a.freq); // Ordenar por frecuencia descendente
    
    // Tomar los top N más frecuentes
    const topN = valueFreqPairs.slice(0, MAX_UNIQUE_VALUES);
    
    // Volver a ordenar por valor para mantener orden ascendente en el gráfico
    topN.sort((a, b) => a.value - b.value);
    
    uniqueValues = topN.map(p => p.value);
    frequencies = topN.map(p => p.freq);
    
    console.error(`[VIZ_AGENT][HISTOGRAM] Showing values: ${uniqueValues[0]} to ${uniqueValues[uniqueValues.length - 1]}`);
    console.error(`[VIZ_AGENT][HISTOGRAM] Top 10 by frequency:`, 
      valueFreqPairs.slice(0, 10).map(p => `${p.value}(${p.freq})`).join(', '));
  }

  console.error(`[VIZ_AGENT][HISTOGRAM] First 10 values:`, uniqueValues.slice(0, 10).join(', '));
  console.error(`[VIZ_AGENT][HISTOGRAM] First 10 frequencies:`, frequencies.slice(0, 10).join(', '));

  // Ajustar título si se mostró versión reducida
  const originalValueCount = Array.from(frequencyMap.keys()).length;
  const finalTitle = originalValueCount > MAX_UNIQUE_VALUES 
    ? `${plan.title} (Top ${uniqueValues.length} valores más frecuentes de ${originalValueCount})`
    : plan.title;

  return {
    type: 'bar',
    data: {
      labels: uniqueValues.map(v => v.toString()),
      datasets: [{
        label: `Frecuencia de ${yField}`,
        data: frequencies,
        backgroundColor: plan.colors?.[0] || '#3366CC',
        borderColor: '#1a1a1a',
        borderWidth: 1,
      }]
    },
    options: {
      title: { display: true, text: finalTitle },
      scales: {
        yAxes: [{
          scaleLabel: {
            display: true,
            labelString: plan.yLabel || 'Frecuencia'
          },
          ticks: {
            beginAtZero: true,
            stepSize: 1,
          }
        }],
        xAxes: [{
          scaleLabel: {
            display: true,
            labelString: plan.xLabel || `Valores de ${yField}`
          }
        }]
      },
      legend: {
        display: true
      },
      ...plan.options,
    }
  };
}

/**
 * Genera configuración para mapa de calor (heatmap)
 * Genera HTML interactivo con Plotly.js para verdadero heatmap 2D
 */
function generateHeatmapChartConfig(plan: VisualizationPlan, data: any[]): any {
  console.error(`[VIZ_AGENT][HEATMAP] Input data length: ${data.length}`);
  console.error(`[VIZ_AGENT][HEATMAP] xField: ${plan.xField}, yField: ${plan.yField}`);
  
  const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
  const valueField = plan.valueField || 'value';
  
  console.error(`[VIZ_AGENT][HEATMAP] valueField: ${valueField}`);
  console.error(`[VIZ_AGENT][HEATMAP] Generating interactive HTML heatmap`);
  
  if (data.length > 0) {
    console.error(`[VIZ_AGENT][HEATMAP] Sample data[0]:`, JSON.stringify(data[0]));
  }
  
  // Recopilar valores únicos de X e Y para crear la matriz
  const xValues = new Set<string>();
  const yValues = new Set<string>();
  const dataMap = new Map<string, {sum: number, count: number}>();
  
  data.forEach(item => {
    const xVal = String(item[plan.xField]);
    const yVal = String(item[yField]);
    const value = parseFloat(item[valueField]) || 0;
    
    xValues.add(xVal);
    yValues.add(yVal);
    
    const key = `${xVal}|||${yVal}`;
    const existing = dataMap.get(key) || {sum: 0, count: 0};
    dataMap.set(key, {
      sum: existing.sum + value,
      count: existing.count + 1
    });
  });
  
  console.error(`[VIZ_AGENT][HEATMAP] Unique X values: ${xValues.size}, Y values: ${yValues.size}`);
  
  // Convertir a arrays ordenados
  const xLabels = Array.from(xValues).sort();
  const yLabels = Array.from(yValues).sort();
  
  // Limitar para mantener visualización manejable
  const MAX_DIM = 100;
  const limitedXLabels = xLabels.slice(0, MAX_DIM);
  const limitedYLabels = yLabels.slice(0, MAX_DIM);
  
  if (xLabels.length > MAX_DIM || yLabels.length > MAX_DIM) {
    console.error(`[VIZ_AGENT][HEATMAP] Matrix large (${xLabels.length}x${yLabels.length}), limiting to ${MAX_DIM}x${MAX_DIM}`);
  }
  
  // Crear matriz de valores (z)
  const zMatrix: number[][] = [];
  
  limitedYLabels.forEach(yVal => {
    const row: number[] = [];
    limitedXLabels.forEach(xVal => {
      const key = `${xVal}|||${yVal}`;
      const cell = dataMap.get(key);
      const avgValue = cell ? cell.sum / cell.count : 0;
      row.push(avgValue);
    });
    zMatrix.push(row);
  });
  
  console.error(`[VIZ_AGENT][HEATMAP] Matrix size: ${zMatrix.length}x${zMatrix[0]?.length || 0}`);
  
  // Generar HTML con Plotly
  const html = generateInteractiveHeatmap(plan, limitedXLabels, limitedYLabels, zMatrix);
  
  // Retornar con flag especial para indicar que es HTML
  return {
    type: 'heatmap_html',
    htmlContent: html
  };
}

/**
 * Genera HTML interactivo con Plotly.js para heatmap 2D
 */
function generateInteractiveHeatmap(
  plan: VisualizationPlan, 
  xLabels: string[], 
  yLabels: string[], 
  zMatrix: number[][]
): string {
  
  // Escapar strings para JSON
  const escapeJson = (str: string) => JSON.stringify(str);
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${plan.title}</title>
  <script src="https://cdn.plot.ly/plotly-2.26.0.min.js"></script>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: Arial, sans-serif;
      background: #ffffff;
    }
    #heatmap {
      width: 100%;
      height: 90vh;
    }
  </style>
</head>
<body>
  <div id="heatmap"></div>
  <script>
    const data = [{
      type: 'heatmap',
      z: ${JSON.stringify(zMatrix)},
      x: ${JSON.stringify(xLabels)},
      y: ${JSON.stringify(yLabels)},
      // Escala de colores: Blanco -> Amarillo -> Naranja -> Rojo (clásica de calor)
      // Alternativas disponibles:
      // 'Hot': Plotly predefinido (negro -> rojo -> amarillo -> blanco)
      // 'YlOrRd': Amarillo -> Naranja -> Rojo
      // 'Reds': Blanco -> Rojo directo
      colorscale: [
        [0, 'rgb(255, 255, 255)'],    // Blanco (low)
        [0.2, 'rgb(255, 255, 200)'],  // Blanco-amarillo
        [0.4, 'rgb(255, 255, 100)'],  // Amarillo claro
        [0.6, 'rgb(255, 200, 0)'],    // Amarillo-naranja
        [0.8, 'rgb(255, 100, 0)'],    // Naranja-rojo
        [1, 'rgb(200, 0, 0)']         // Rojo oscuro (high)
      ],
      colorbar: {
        title: '${plan.yLabel || 'Valor'}',
        titleside: 'right'
      },
      hoverongaps: false,
      hovertemplate: 'X: %{x}<br>Y: %{y}<br>Valor: %{z:.2f}<extra></extra>'
    }];
    
    const layout = {
      title: {
        text: ${escapeJson(plan.title)},
        font: { size: 18 }
      },
      xaxis: {
        title: ${escapeJson(plan.xLabel || plan.xField)},
        tickangle: -45
      },
      yaxis: {
        title: ${escapeJson(plan.yLabel || 'Category')}
      },
      margin: { l: 120, r: 120, t: 80, b: 120 }
    };
    
    const config = {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'heatmap',
        height: 800,
        width: 1200,
        scale: 2
      }
    };
    
    Plotly.newPlot('heatmap', data, layout, config);
  </script>
</body>
</html>`;

  return html;
}

/**
 * Genera archivo CSV a partir de datos JSON
 * Convierte array de objetos a formato CSV
 */
function generateCSV(data: any[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  console.error(`[VIZ_AGENT][CSV] Generating CSV with ${data.length} rows`);

  // Extraer headers de las keys del primer objeto
  const headers = Object.keys(data[0]);
  console.error(`[VIZ_AGENT][CSV] Columns: ${headers.join(', ')}`);

  // Función helper para escapar valores CSV
  const escapeCSVValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // Si contiene coma, comillas o salto de línea, envolver en comillas
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      // Escapar comillas dobles duplicándolas
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  };

  // Generar línea de headers
  const headerLine = headers.map(h => escapeCSVValue(h)).join(',');

  // Generar líneas de datos
  const dataLines = data.map(row => {
    return headers.map(header => escapeCSVValue(row[header])).join(',');
  });

  // Combinar todo
  const csvContent = [headerLine, ...dataLines].join('\n');
  
  console.error(`[VIZ_AGENT][CSV] CSV generated successfully, size: ${csvContent.length} bytes`);
  
  return csvContent;
}

/**
 * Genera HTML interactivo con Plotly para histograma
 * Permite zoom y navegación con todos los valores únicos
 */
function generateInteractiveHistogram(plan: VisualizationPlan, data: any[]): string {
  const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
  
  // Extraer valores
  const values = data
    .map(item => item[yField])
    .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
    .map(v => Number(v));

  if (values.length === 0) {
    throw new Error(`No valid numeric values found for histogram. Field '${yField}' does not contain numeric data.`);
  }

  // Contar frecuencias
  const frequencyMap = new Map<number, number>();
  values.forEach(value => {
    frequencyMap.set(value, (frequencyMap.get(value) || 0) + 1);
  });

  // Ordenar valores
  const uniqueValues = Array.from(frequencyMap.keys()).sort((a, b) => a - b);
  const frequencies = uniqueValues.map(val => frequencyMap.get(val) || 0);

  console.error(`[VIZ_AGENT][HISTOGRAM] Interactive HTML: ${uniqueValues.length} unique values`);
  console.error(`[VIZ_AGENT][HISTOGRAM] Value range: ${uniqueValues[0]} to ${uniqueValues[uniqueValues.length - 1]}`);

  // Generar HTML con Plotly
  const htmlTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${plan.title}</title>
    <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
        }
        #chart {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .info {
            margin-bottom: 15px;
            padding: 10px;
            background-color: #e3f2fd;
            border-left: 4px solid #2196f3;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="info">
        <strong>📊 Histograma Interactivo</strong><br>
        Valores únicos: ${uniqueValues.length} | Rango: ${uniqueValues[0]} - ${uniqueValues[uniqueValues.length - 1]}<br>
        💡 Usa el scroll para hacer zoom, arrastra para navegar
    </div>
    <div id="chart"></div>
    <script>
        var trace = {
            x: ${JSON.stringify(uniqueValues)},
            y: ${JSON.stringify(frequencies)},
            type: 'bar',
            marker: {
                color: '${plan.colors?.[0] || '#3366CC'}',
                line: {
                    color: '#1a1a1a',
                    width: 1
                }
            },
            text: ${JSON.stringify(frequencies.map((f, i) => `Valor: ${uniqueValues[i]}<br>Frecuencia: ${f}`))},
            hovertemplate: '%{text}<extra></extra>'
        };

        var layout = {
            title: {
                text: '${plan.title}',
                font: { size: 18 }
            },
            xaxis: {
                title: '${plan.xLabel || `Valores de ${yField}`}',
                type: 'linear',
                rangeslider: { visible: true }
            },
            yaxis: {
                title: '${plan.yLabel || 'Frecuencia'}',
                type: 'linear'
            },
            height: 700,
            margin: { t: 80, b: 150 },
            hovermode: 'closest'
        };

        var config = {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToAdd: ['select2d', 'lasso2d'],
            modeBarButtonsToRemove: ['toImage'],
            displaylogo: false
        };

        Plotly.newPlot('chart', [trace], layout, config);
    </script>
</body>
</html>`;

  return htmlTemplate;
}

function getDefaultColor(index: number): string {
  const colors = [
    '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099',
    '#3B3EAC', '#0099C6', '#DD4477', '#66AA00', '#B82E2E'
  ];
  return colors[index % colors.length];
}

function generateColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(getDefaultColor(i));
  }
  return colors;
}

/**
 * Helper: Sample data to reduce number of points
 * Usa muestreo uniforme para mantener la forma de los datos
 */
function sampleData(data: any[], targetSize: number): any[] {
  if (data.length <= targetSize) {
    return data;
  }
  
  const step = data.length / targetSize;
  const sampled: any[] = [];
  
  for (let i = 0; i < targetSize; i++) {
    const index = Math.floor(i * step);
    sampled.push(data[index]);
  }
  
  // Asegurar que siempre incluimos el último punto
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled[sampled.length - 1] = data[data.length - 1];
  }
  
  return sampled;
}
