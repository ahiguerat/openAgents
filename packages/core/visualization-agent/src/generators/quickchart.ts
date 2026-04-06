import QuickChart from 'quickchart-js';
import { VisualizationPlan, ChartConfig } from '../types.js';
import { IChartGenerator, ChartGenerationResult } from './index.js';

/**
 * Implementación de QuickChart como proveedor de gráficas
 * Genera gráficas usando la API de QuickChart (genera URLs de imágenes)
 */
export class QuickChartGenerator implements IChartGenerator {
  readonly name = 'quickchart';

  async generate(
    plan: VisualizationPlan,
    data: any[],
    config: ChartConfig
  ): Promise<ChartGenerationResult> {
    console.error(`[QUICKCHART] Generating ${plan.chartType}`);
    console.error(`[QUICKCHART] Data points: ${data.length}`);
    
    // IMPORTANTE: QuickChart tiene límite de URL, reducir datos si son muchos
    // EXCEPTO para histogramas, que necesitan todos los valores para calcular frecuencias
    const MAX_POINTS = 50;
    let processedData = data;
    
    if (plan.chartType !== 'histogram' && data.length > MAX_POINTS) {
      console.error(`[QUICKCHART] Too many points (${data.length}), sampling to ${MAX_POINTS}`);
      processedData = this.sampleData(data, MAX_POINTS);
    } else if (plan.chartType === 'histogram') {
      console.error(`[QUICKCHART] Histogram: using all ${data.length} data points for frequency calculation`);
    }

    // Preparar datos según el tipo de gráfica
    let chartConfig: any;
    let isCSV = false;
    let csvContent = '';
    let isHTML = false;
    let htmlContent = '';

    if (plan.chartType === 'table') {
      // Las tablas generan CSV directamente
      csvContent = this.generateCSV(processedData);
      isCSV = true;
    } else if (plan.chartType === 'pie_chart') {
      chartConfig = this.generatePieChartConfig(plan, processedData);
    } else if (plan.chartType === 'bar_chart') {
      chartConfig = this.generateBarChartConfig(plan, processedData);
    } else if (plan.chartType === 'scatter') {
      chartConfig = this.generateScatterChartConfig(plan, processedData);
    } else if (plan.chartType === 'radar') {
      chartConfig = this.generateRadarChartConfig(plan, processedData);
    } else if (plan.chartType === 'histogram') {
      chartConfig = this.generateHistogramChartConfig(plan, processedData);
    } else if (plan.chartType === 'heatmap') {
      chartConfig = this.generateHeatmapChartConfig(plan, processedData);
      // Check if it's HTML heatmap
      if (chartConfig.type === 'heatmap_html') {
        htmlContent = chartConfig.htmlContent;
        isHTML = true;
      }
    } else {
      // line_chart, area_chart
      chartConfig = this.generateLineChartConfig(plan, processedData);
    }

    // Si es CSV, retornar directamente
    if (isCSV) {
      console.error(`[QUICKCHART] CSV generated with ${processedData.length} rows`);
      return {
        csvContent: csvContent,
        isCSV: true
      };
    }
    
    // Si es HTML interactivo, retornar directamente
    if (isHTML) {
      console.error(`[QUICKCHART] HTML heatmap generated, size: ${htmlContent.length} bytes`);
      return {
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
    
    // Debug: log URL length
    console.error(`[QUICKCHART] ${plan.chartType} URL length: ${imageUrl.length} chars`);
    console.error(`[QUICKCHART] URL preview (first 500 chars): ${imageUrl.substring(0, 500)}`);
    
    if (imageUrl.length > 16000) {
      console.error(`[QUICKCHART] ⚠️  WARNING: URL too long (${imageUrl.length}), QuickChart limit is ~16384`);
    }
    
    console.error(`[QUICKCHART] Chart generated successfully`);
    
    return {
      url: imageUrl,
      chartConfig,
    };
  }

  // ============================================================================
  // Helper methods - Chart config generators
  // ============================================================================

  private generateLineChartConfig(plan: VisualizationPlan, data: any[]): any {
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
      borderColor: plan.colors?.[idx] || this.getDefaultColor(idx),
      backgroundColor: plan.colors?.[idx] || this.getDefaultColor(idx),
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

  private generateBarChartConfig(plan: VisualizationPlan, data: any[]): any {
    const labels = data.map(item => item[plan.xField]);
    const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
    
    const datasets = yFields.map((field, idx) => ({
      label: field,
      data: data.map(item => item[field]),
      backgroundColor: plan.colors?.[idx] || this.getDefaultColor(idx),
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

  private generatePieChartConfig(plan: VisualizationPlan, data: any[]): any {
    const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
    
    // Detectar si los datos tienen estructura temporal
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
      console.error('[QUICKCHART][PIE] Detected temporal data, aggregating by time periods');
      
      const aggregated = new Map<string, number>();
      
      data.forEach(item => {
        const dateValue = item[plan.xField];
        let dateKey: string;
        
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
          dateKey = dateValue.split('T')[0]; // YYYY-MM-DD
        } else {
          dateKey = String(dateValue);
        }
        
        const value = Number(item[yField]) || 0;
        aggregated.set(dateKey, (aggregated.get(dateKey) || 0) + value);
      });
      
      const sortedEntries = Array.from(aggregated.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      labels = sortedEntries.map(([date]) => {
        try {
          const d = new Date(date);
          return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
        } catch {
          return date;
        }
      });
      values = sortedEntries.map(([, value]) => value);
      
      console.error(`[QUICKCHART][PIE] Aggregated ${data.length} points into ${labels.length} time periods`);
    } else if (plan.xField) {
      // Para datos categóricos, agrupar por categoría y sumar valores
      console.error('[QUICKCHART][PIE] Processing categorical data');
      
      const aggregated = new Map<string, number>();
      
      data.forEach(item => {
        const category = String(item[plan.xField]);
        const value = Number(item[yField]) || 0;
        aggregated.set(category, (aggregated.get(category) || 0) + value);
      });
      
      labels = Array.from(aggregated.keys());
      values = Array.from(aggregated.values());
      
      console.error(`[QUICKCHART][PIE] Aggregated ${data.length} points into ${labels.length} categories`);
    } else {
      console.error('[QUICKCHART][PIE] Using data as-is (no xField specified)');
      labels = data.map((item, idx) => item[plan.xField] || `Item ${idx + 1}`);
      values = data.map(item => Number(item[yField]) || 0);
    }
    
    // Filtrar valores cero o negativos
    const validEntries = labels.map((label, idx) => ({ label, value: values[idx] }))
      .filter(entry => entry.value > 0);
    
    if (validEntries.length === 0) {
      console.error('[QUICKCHART][PIE] WARNING: No valid positive values found');
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
    
    console.error(`[QUICKCHART][PIE] Final pie chart has ${finalLabels.length} slices`);

    return {
      type: 'pie',
      data: {
        labels: finalLabels,
        datasets: [{
          data: finalValues,
          backgroundColor: plan.colors || this.generateColors(finalLabels.length),
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

  private generateScatterChartConfig(plan: VisualizationPlan, data: any[]): any {
    const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
    
    const isTimeField = plan.xField.toLowerCase().includes('time') || 
                        plan.xField.toLowerCase().includes('date') ||
                        plan.xField.toLowerCase().includes('timestamp');
    
    const xAxisType = isTimeField ? 'time' : 'linear';
    
    const datasets = yFields.map((field, idx) => ({
      label: field,
      data: data.map(item => ({ 
        x: isTimeField ? item[plan.xField] : parseFloat(item[plan.xField]), 
        y: parseFloat(item[field]) 
      })),
      backgroundColor: plan.colors?.[idx] || this.getDefaultColor(idx),
      showLine: false,
      pointRadius: 3,
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

  private generateRadarChartConfig(plan: VisualizationPlan, data: any[]): any {
    const labels = data.map(item => item[plan.xField]);
    const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
    
    const datasets = yFields.map((field, idx) => ({
      label: field,
      data: data.map(item => item[field]),
      backgroundColor: `${plan.colors?.[idx] || this.getDefaultColor(idx)}33`,
      borderColor: plan.colors?.[idx] || this.getDefaultColor(idx),
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

  private generateHistogramChartConfig(plan: VisualizationPlan, data: any[]): any {
    const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
    
    const values = data
      .map(item => item[yField])
      .filter(v => v !== null && v !== undefined && !isNaN(Number(v)))
      .map(v => Number(v));
    
    if (values.length === 0) {
      throw new Error(`No valid numeric values found for histogram. Field '${yField}' does not contain numeric data.`);
    }

    // Contar frecuencias por valor único
    const frequencyMap = new Map<number, number>();
    values.forEach(value => {
      frequencyMap.set(value, (frequencyMap.get(value) || 0) + 1);
    });

    // Obtener valores únicos ordenados
    let uniqueValues = Array.from(frequencyMap.keys()).sort((a, b) => a - b);
    let frequencies = uniqueValues.map(val => frequencyMap.get(val) || 0);

    console.error(`[QUICKCHART][HISTOGRAM] Unique values: ${uniqueValues.length}`);

    // QuickChart tiene límite de tamaño de URL
    const MAX_UNIQUE_VALUES = 100;
    if (uniqueValues.length > MAX_UNIQUE_VALUES) {
      console.error(`[QUICKCHART][HISTOGRAM] Too many unique values (${uniqueValues.length}), showing top ${MAX_UNIQUE_VALUES} most frequent`);
      
      const valueFreqPairs = uniqueValues.map((val, idx) => ({ value: val, freq: frequencies[idx] }));
      valueFreqPairs.sort((a, b) => b.freq - a.freq);
      
      const topN = valueFreqPairs.slice(0, MAX_UNIQUE_VALUES);
      topN.sort((a, b) => a.value - b.value);
      
      uniqueValues = topN.map(p => p.value);
      frequencies = topN.map(p => p.freq);
    }

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

  private generateHeatmapChartConfig(plan: VisualizationPlan, data: any[]): any {
    const yField = Array.isArray(plan.yField) ? plan.yField[0] : plan.yField;
    const valueField = plan.valueField || 'value';
    
    console.error(`[QUICKCHART][HEATMAP] Generating interactive HTML heatmap`);
    
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
    
    console.error(`[QUICKCHART][HEATMAP] Unique X values: ${xValues.size}, Y values: ${yValues.size}`);
    
    // Convertir a arrays ordenados
    const xLabels = Array.from(xValues).sort();
    const yLabels = Array.from(yValues).sort();
    
    // Limitar para mantener visualización manejable
    const MAX_DIM = 100;
    const limitedXLabels = xLabels.slice(0, MAX_DIM);
    const limitedYLabels = yLabels.slice(0, MAX_DIM);
    
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
    
    // Generar HTML con Plotly
    const html = this.generateInteractiveHeatmap(plan, limitedXLabels, limitedYLabels, zMatrix);
    
    return {
      type: 'heatmap_html',
      htmlContent: html
    };
  }

  private generateInteractiveHeatmap(
    plan: VisualizationPlan, 
    xLabels: string[], 
    yLabels: string[], 
    zMatrix: number[][]
  ): string {
    const escapeJson = (str: string) => JSON.stringify(str);
    
    return `<!DOCTYPE html>
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
      colorscale: [
        [0, 'rgb(255, 255, 255)'],
        [0.2, 'rgb(255, 255, 200)'],
        [0.4, 'rgb(255, 255, 100)'],
        [0.6, 'rgb(255, 200, 0)'],
        [0.8, 'rgb(255, 100, 0)'],
        [1, 'rgb(200, 0, 0)']
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
  }

  private generateCSV(data: any[]): string {
    if (!data || data.length === 0) {
      return '';
    }

    console.error(`[QUICKCHART][CSV] Generating CSV with ${data.length} rows`);

    const headers = Object.keys(data[0]);
    
    const escapeCSVValue = (value: any): string => {
      if (value === null || value === undefined) {
        return '';
      }
      
      const stringValue = String(value);
      
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      
      return stringValue;
    };

    const headerLine = headers.map(h => escapeCSVValue(h)).join(',');
    const dataLines = data.map(row => {
      return headers.map(header => escapeCSVValue(row[header])).join(',');
    });

    const csvContent = [headerLine, ...dataLines].join('\n');
    
    console.error(`[QUICKCHART][CSV] CSV generated successfully, size: ${csvContent.length} bytes`);
    
    return csvContent;
  }

  // ============================================================================
  // Utility methods
  // ============================================================================

  private getDefaultColor(index: number): string {
    const colors = [
      '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099',
      '#3B3EAC', '#0099C6', '#DD4477', '#66AA00', '#B82E2E'
    ];
    return colors[index % colors.length];
  }

  private generateColors(count: number): string[] {
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      colors.push(this.getDefaultColor(i));
    }
    return colors;
  }

  private sampleData(data: any[], targetSize: number): any[] {
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
}
