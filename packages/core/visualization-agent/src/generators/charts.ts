import QuickChart from 'quickchart-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { VisualizationPlan, ChartConfig, DEFAULT_CHART_CONFIG } from '../types.js';

export async function generateLineChart(
  plan: VisualizationPlan,
  data: any[],
  config: ChartConfig = DEFAULT_CHART_CONFIG
): Promise<string> {
  console.error('[VIZ_AGENT][GENERATOR] Generating line chart');
  console.error(`[VIZ_AGENT][GENERATOR] Input data points: ${data.length}`);
  
  // Limitar datos para evitar URLs demasiado largas en QuickChart (máx 100 puntos)
  let processedData = data;
  if (data.length > 100) {
    const step = Math.ceil(data.length / 100);
    processedData = data.filter((_, idx) => idx % step === 0);
    console.error(`[VIZ_AGENT][GENERATOR] Data sampled: ${data.length} -> ${processedData.length} points (every ${step} points)`);
  }
  
  const labels = processedData.map(item => item[plan.xField]);
  const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
  
  const datasets = yFields.map((field, idx) => ({
    label: field,
    data: processedData.map(item => item[field]),
    borderColor: plan.colors?.[idx] || getDefaultColor(idx),
    backgroundColor: plan.colors?.[idx] || getDefaultColor(idx),
    fill: false,
  }));

  const chart = new QuickChart();
  chart
    .setConfig({
      type: 'line',
      data: { labels, datasets },
      options: {
        title: {
          display: true,
          text: plan.title,
        },
        scales: {
          yAxes: [{
            scaleLabel: {
              display: !!plan.yLabel,
              labelString: plan.yLabel,
            }
          }],
          xAxes: [{
            scaleLabel: {
              display: !!plan.xLabel,
              labelString: plan.xLabel,
            }
          }]
        }
      }
    })
    .setWidth(config.width)
    .setHeight(config.height)
    .setBackgroundColor(config.backgroundColor || '#ffffff');

  const imageUrl = chart.getUrl();
  console.error(`[VIZ_AGENT][GENERATOR] Chart URL length: ${imageUrl.length} chars`);
  
  return imageUrl;
}

export async function generateBarChart(
  plan: VisualizationPlan,
  data: any[],
  config: ChartConfig = DEFAULT_CHART_CONFIG
): Promise<string> {
  console.error('[VIZ_AGENT][GENERATOR] Generating bar chart');
  console.error(`[VIZ_AGENT][GENERATOR] Input data points: ${data.length}`);
  
  // Limitar datos para evitar URLs demasiado largas en QuickChart (máx 100 puntos)
  let processedData = data;
  if (data.length > 100) {
    const step = Math.ceil(data.length / 100);
    processedData = data.filter((_, idx) => idx % step === 0);
    console.error(`[VIZ_AGENT][GENERATOR] Data sampled: ${data.length} -> ${processedData.length} points (every ${step} points)`);
  }
  
  const labels = processedData.map(item => item[plan.xField]);
  const yFields = Array.isArray(plan.yField) ? plan.yField : [plan.yField];
  
  const datasets = yFields.map((field, idx) => ({
    label: field,
    data: processedData.map(item => item[field]),
    backgroundColor: plan.colors?.[idx] || getDefaultColor(idx),
  }));

  const chart = new QuickChart();
  chart
    .setConfig({
      type: 'bar',
      data: { labels, datasets },
      options: {
        title: {
          display: true,
          text: plan.title,
        },
        scales: {
          yAxes: [{
            scaleLabel: {
              display: !!plan.yLabel,
              labelString: plan.yLabel,
            }
          }],
          xAxes: [{
            scaleLabel: {
              display: !!plan.xLabel,
              labelString: plan.xLabel,
            }
          }]
        }
      }
    })
    .setWidth(config.width)
    .setHeight(config.height)
    .setBackgroundColor(config.backgroundColor || '#ffffff');

  const imageUrl = chart.getUrl();
  console.error(`[VIZ_AGENT][GENERATOR] Chart URL length: ${imageUrl.length} chars`);
  
  return imageUrl;
}

export function generateTable(plan: VisualizationPlan, data: any[]): string {
  console.error('[VIZ_AGENT][GENERATOR] Generating HTML table');
  
  if (!data || data.length === 0) {
    return '<html><body><p>No data to display</p></body></html>';
  }

  const fields = [plan.xField, ...(Array.isArray(plan.yField) ? plan.yField : [plan.yField])];
  
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${plan.title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>${plan.title}</h1>
  <table>
    <thead>
      <tr>
        ${fields.map(field => `<th>${field}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr>
          ${fields.map(field => `<td>${row[field] !== undefined ? row[field] : ''}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>
  <p style="margin-top: 20px; color: #666;">Total records: ${data.length}</p>
</body>
</html>
  `;

  // Guardar tabla como HTML
  const outputDir = process.env.OUTPUT_DIR || './output';
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `table_${timestamp}.html`;
  const filePath = join(outputDir, fileName);
  
  writeFileSync(filePath, html);
  console.error(`[VIZ_AGENT][GENERATOR] Table saved to: ${filePath}`);
  
  return filePath;
}

export async function generateVisualization(
  plan: VisualizationPlan,
  data: any[],
  config: ChartConfig = DEFAULT_CHART_CONFIG
): Promise<{ url?: string; filePath?: string }> {
  console.error(`[VIZ_AGENT][GENERATOR] Generating ${plan.chartType} visualization`);
  
  try {
    switch (plan.chartType) {
      case 'line_chart':
      case 'area_chart':
        const lineUrl = await generateLineChart(plan, data, config);
        return { url: lineUrl };
      
      case 'bar_chart':
        const barUrl = await generateBarChart(plan, data, config);
        return { url: barUrl };
      
      case 'table':
        const tablePath = generateTable(plan, data);
        return { filePath: tablePath };
      
      default:
        console.error(`[VIZ_AGENT][GENERATOR] Unknown chart type: ${plan.chartType}, defaulting to line chart`);
        const defaultUrl = await generateLineChart(plan, data, config);
        return { url: defaultUrl };
    }
  } catch (error) {
    console.error(`[VIZ_AGENT][GENERATOR] Error: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

function getDefaultColor(index: number): string {
  const colors = [
    'rgba(75, 192, 192, 1)',
    'rgba(255, 99, 132, 1)',
    'rgba(54, 162, 235, 1)',
    'rgba(255, 206, 86, 1)',
    'rgba(153, 102, 255, 1)',
  ];
  return colors[index % colors.length];
}
