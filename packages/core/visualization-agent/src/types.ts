export interface VisualizationPlan {
  chartType: 'line_chart' | 'bar_chart' | 'pie_chart' | 'scatter' | 'table' | 'area_chart' | 'radar' | 'histogram' | 'heatmap';
  title: string;
  xLabel?: string;
  yLabel?: string;
  xField: string;
  yField: string | string[];
  colors?: string[];
  options?: Record<string, any>;
  rationale: string;
  bins?: number; // Para histogramas: número de bins/rangos
  valueField?: string; // Para heatmaps: campo que representa la intensidad/valor
}

export interface VisualizationRequest {
  prompt: string;
  data: any[];
  suggestedType?: string;
}

export interface VisualizationResponse {
  success: boolean;
  imagePath?: string;
  imageUrl?: string;
  imageBase64?: string;
  format?: 'png' | 'html';
  plan?: VisualizationPlan;
  error?: string;
  metadata?: {
    timestamp: string;
    dataPoints: number;
    generationTimeMs: number;
  };
}

export interface ChartConfig {
  width: number;
  height: number;
  backgroundColor?: string;
  fontFamily?: string;
  fontSize?: number;
}

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  width: 800,
  height: 600,
  backgroundColor: '#ffffff',
  fontFamily: 'Arial',
  fontSize: 12,
};
