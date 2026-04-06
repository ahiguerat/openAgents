# Visualization Agent

## Descripción

El Visualization Agent es un agente especializado en la generación de visualizaciones de datos. Recibe datos estructurados y un prompt en lenguaje natural, y crea gráficos profesionales adaptándose al contexto de los datos. Utiliza **LangGraph** para orquestar un pipeline de 3 etapas y un **LLM** para decidir inteligentemente qué tipo de visualización es más apropiada.

## Arquitectura

El agente implementa un **grafo de estado basado en LangGraph** con tres nodos secuenciales:

```
Input: Data + User Prompt
         |
         v
    [PLANNER NODE]
    - Analiza prompt y datos con LLM
    - Decide tipo de gráfica óptima
    - Define campos X/Y, título, etiquetas
    - Genera VisualizationPlan
         |
         v
    [GENERATOR NODE]
    - Construye configuración de gráfica
    - Usa QuickChart API para imágenes
    - Maneja casos especiales (CSV/HTML)
    - Retorna URL o contenido
         |
         v
    [SAVER NODE]
    - Descarga imagen desde URL
    - Guarda PNG/CSV/HTML en disco
    - Retorna path y tamaño del archivo
         |
         v
    Output: { filePath, fileSize, imageUrl, plan }
```

**Tipos de visualización soportados:**
- `line_chart`: Series temporales y tendencias
- `bar_chart`: Comparaciones categóricas o temporales
- `pie_chart`: Distribuciones porcentuales
- `scatter`: Correlaciones entre variables
- `area_chart`: Series temporales apiladas
- `radar`: Comparación multivariable
- `histogram`: Distribución de frecuencias
- `heatmap`: Patrones de intensidad 2D
- `table`: Datos tabulares en CSV

## Componentes

### 1. MCP Server (`src/mcp-server.ts`)

**Descripción:** Servidor MCP que expone el agente como herramienta `create_visualization`.

**Clase principal:** `VisualizationMCPServer`
- Inicializa servidor MCP sobre transporte stdio
- Registra handlers para `tools/list` y `tools/call`
- Maneja ciclo de vida del servidor (SIGINT, SIGTERM)
- Gestiona cleanup de recursos LLM

**Tool expuesto:**
```typescript
{
  name: 'create_visualization',
  description: 'Create data visualizations (charts, tables) based on natural language prompts',
  inputSchema: {
    prompt: string,           // Descripción en lenguaje natural
    data: Array<object>,      // Datos a visualizar
    suggestedType?: string,   // Tipo sugerido (opcional)
    outputDir?: string        // Directorio de salida (default: ./output)
  }
}
```

**Response:**
```typescript
{
  success: boolean,
  imagePath?: string,
  imageUrl?: string,
  format?: 'png' | 'html',
  plan?: VisualizationPlan,
  error?: string,
  metadata: {
    timestamp: string,
    dataPoints: number,
    generationTimeMs: number
  }
}
```

### 2. Graph (`src/graph.ts`)

**Descripción:** Implementación del pipeline de visualización usando LangGraph.

**Estado del grafo:**
```typescript
{
  request: VisualizationRequest,  // Prompt + datos + tipo sugerido
  plan: VisualizationPlan | null, // Plan generado por planner
  imageUrl: string | null,        // URL de QuickChart
  csvContent: string | null,      // Contenido CSV (si aplica)
  isCSV: boolean,                 // Flag para tablas
  htmlContent: string | null,     // Contenido HTML (si aplica)
  isHTML: boolean,                // Flag para heatmaps interactivos
  filePath: string | null,        // Path del archivo guardado
  fileSize: number | null,        // Tamaño del archivo en bytes
  config: ChartConfig,            // Configuración de dimensiones/estilos
  outputDir: string,              // Directorio de salida
  error: string | null            // Error si ocurrió
}
```

**Nodos:**
- **plannerNode**: Invoca `planVisualization()` con LLM para generar plan
- **generatorNode**: Invoca `generateChartTool()` para crear gráfica
- **saverNode**: Invoca `saveImageTool()` para persistir resultado

**Flujo:**
```
START → planner → generator → saver → END
```

**Función auxiliar:**
```typescript
executeVisualization(
  request: VisualizationRequest,
  config?: ChartConfig,
  outputDir?: string
): Promise<GraphResult>
```

### 3. Planner (`src/planner.ts`)

**Descripción:** Módulo que usa LLM para analizar datos y decidir la mejor visualización.

**Función principal:**
```typescript
planVisualization(request: VisualizationRequest): Promise<VisualizationPlan>
```

**Sistema de prompts:**
- Describe 9 tipos de gráficas con casos de uso específicos
- Incluye reglas de decisión críticas para histogram vs bar_chart
- Define distinción clara entre histogram (distribución de frecuencias) y heatmap (patrones 2D)
- Proporciona vista previa de datos y campos disponibles
- Solicita respuesta en formato JSON estructurado

**Características especiales:**
- **Override inteligente**: Si el usuario dice "histograma" pero el LLM elige otro tipo, fuerza histogram
- **Override de heatmap**: Si el usuario dice "mapa de calor" pero el LLM elige otro tipo, fuerza heatmap
- **Normalización de tipos**: Convierte `bar` → `bar_chart`, `line` → `line_chart`, etc.
- **Safe JSON parsing**: Maneja respuestas con markdown code blocks o texto adicional

**Output:**
```typescript
{
  chartType: 'line_chart' | 'bar_chart' | 'pie_chart' | 'scatter' | 'table' | 'area_chart' | 'radar' | 'histogram' | 'heatmap',
  title: string,
  xLabel?: string,
  yLabel?: string,
  xField: string,
  yField: string | string[],
  valueField?: string,  // Solo para heatmap
  colors?: string[],
  bins?: number,        // Solo para histogram
  options?: Record<string, any>,
  rationale: string
}
```

### 4. Tools (`src/tools.ts`)

**Descripción:** Implementaciones de herramientas para generar y guardar visualizaciones.

#### generateChartTool()
```typescript
generateChartTool(
  plan: VisualizationPlan,
  data: any[],
  config: ChartConfig
): Promise<{
  url: string;
  chartConfig: any;
  csvContent?: string;
  isCSV?: boolean;
  htmlContent?: string;
  isHTML?: boolean;
}>
```

**Funcionalidad:**
- **Sampling automático**: Reduce datos a 100 puntos si hay más (excepto histograms que necesitan todos los valores)
- **Routing por tipo**: Delega a función específica según `plan.chartType`
- **Generación de CSV**: Para `table`, genera CSV directamente
- **Generación de HTML**: Para `heatmap` complejos, genera HTML interactivo
- **QuickChart integration**: Construye URL de imagen para tipos estándar
- **Validación de límites**: Detecta URLs muy largas (>16KB) que pueden fallar

**Tipos soportados:** line_chart, bar_chart, pie_chart, scatter, radar, area_chart, histogram, heatmap, table

#### saveImageTool()
```typescript
saveImageTool(
  imageUrl: string,
  outputDir?: string,
  filename?: string,
  csvContent?: string,
  htmlContent?: string
): Promise<{ filePath: string; size: number }>
```

**Funcionalidad:**
- Crea directorio de salida si no existe
- **Para CSV**: Guarda como `table_data_YYYY-MM-DD_timestamp.csv`
- **Para HTML**: Guarda como `heatmap_YYYY-MM-DD_timestamp.html`
- **Para imágenes**: Descarga desde URL de QuickChart y guarda como `chart_YYYY-MM-DD_timestamp.png`
- Retorna path absoluto y tamaño del archivo

#### Funciones internas de generación

**generateLineChartConfig(plan, data)**
- Líneas con múltiples series (multi-yField)
- Colores por serie, sin fill
- Labels en ejes X e Y

**generateBarChartConfig(plan, data)**
- Barras verticales con múltiples series
- Soporte para stacking opcional

**generatePieChartConfig(plan, data)**
- Agregación automática por campo X
- Suma de valores en Y
- Colores diferenciados por categoría

**generateScatterChartConfig(plan, data)**
- Puntos sin líneas
- Útil para correlaciones

**generateRadarChartConfig(plan, data)**
- Gráfica circular multivariable
- Útil para comparar perfiles

**generateHistogramChartConfig(plan, data)**
- Calcula bins (rangos) automáticos
- Cuenta frecuencias por bin
- Visualiza distribución de valores

**generateHeatmapChartConfig(plan, data)**
- Construye matriz 2D de intensidades
- Para datasets pequeños: usa QuickChart con bubbles
- Para datasets grandes: genera HTML interactivo con Plotly.js

#### Utilidades adicionales

**exportToCSVTool(data, outputDir, filename)**
- Exporta cualquier array a CSV con headers automáticos
- Escapa comillas y comas correctamente

**calculateStatsTool(data, field)**
- Calcula: count, min, max, mean, median, stdDev
- Filtra valores no numéricos

**aggregateDataTool(data, groupBy, aggregateField, aggregationType)**
- Agrupa por campo y aplica sum/avg/min/max/count

**detectAnomaliesTool(data, field, threshold)**
- Detecta outliers usando Z-score
- Retorna anomalías y rango normal

### 5. Types (`src/types.ts`)

**Definiciones de tipos TypeScript:**

```typescript
interface VisualizationPlan {
  chartType: 'line_chart' | 'bar_chart' | 'pie_chart' | 'scatter' | 
             'table' | 'area_chart' | 'radar' | 'histogram' | 'heatmap';
  title: string;
  xLabel?: string;
  yLabel?: string;
  xField: string;
  yField: string | string[];
  colors?: string[];
  options?: Record<string, any>;
  rationale: string;
  bins?: number;        // Histograms
  valueField?: string;  // Heatmaps
}

interface VisualizationRequest {
  prompt: string;
  data: any[];
  suggestedType?: string;
}

interface ChartConfig {
  width: number;      // Default: 800
  height: number;     // Default: 600
  backgroundColor?: string;  // Default: #ffffff
  fontFamily?: string;       // Default: Arial
  fontSize?: number;         // Default: 12
}
```

### 6. LLM Flexible (`src/llm-flexible.ts`)

**Descripción:** Factory pattern para proveedores LLM con singleton.

**Clase LLMFactory:**
```typescript
static async getProvider(): Promise<LLMProvider>
static createProvider(config: ProviderConfig): LLMProvider
static reset(): void
static async dispose(): Promise<void>
```

**Proveedores soportados:**
- **CopilotProvider**: Usa GitHub Copilot SDK (`@github/copilot-sdk`)
- **OpenRouterProvider**: Usa OpenRouter API compatible con OpenAI

**Configuración desde .env:**
```bash
LLM_PROVIDER=copilot|openrouter
COPILOT_MODEL=claude-sonnet-4.5  # Opcional
OPENROUTER_API_KEY=sk-or-v1-...  # Si provider=openrouter
OPENROUTER_MODEL=...              # Opcional
```

**Función helper:**
```typescript
streamStructuredPlan({
  systemPrompt: string,
  userPrompt: string
}): Promise<{ rawText: string }>
```

### 7. LLM Provider (`src/llm-provider.ts`)

**Interfaz abstracta:**
```typescript
interface LLMProvider {
  initialize(): Promise<void>;
  stream(prompt: string): AsyncIterable<string>;
  dispose?(): Promise<void>;
}
```

**Implementaciones:**
- `src/providers/copilot.ts`: CopilotProvider
- `src/providers/openrouter.ts`: OpenRouterProvider

## Flujo de Ejecución Detallado

### Ejemplo 1: "Crea una gráfica de líneas del voltaje"

**1. Request llega al MCP Server:**
```json
{
  "prompt": "Crea una gráfica de líneas del voltaje",
  "data": [
    {"timestamp": "2024-01-01T00:00:00Z", "voltage": 230.5},
    {"timestamp": "2024-01-01T01:00:00Z", "voltage": 229.8},
    ...  // 150 puntos más
  ]
}
```

**2. Graph inicia con estado inicial:**
```typescript
{
  request: { prompt, data },
  plan: null,
  imageUrl: null,
  filePath: null,
  config: { width: 800, height: 600 },
  outputDir: './output',
  error: null
}
```

**3. Planner Node:**
- Analiza estructura de datos: detecta campos `timestamp` y `voltage`
- Envía prompt a LLM con contexto de datos
- LLM genera plan:
```json
{
  "chartType": "line_chart",
  "title": "Evolución de Voltaje",
  "xLabel": "Tiempo",
  "yLabel": "Voltaje (V)",
  "xField": "timestamp",
  "yField": "voltage",
  "rationale": "Serie temporal simple requiere line chart"
}
```

**4. Generator Node:**
- Detecta 152 puntos > 100, aplica sampling a 100 puntos
- Construye configuración QuickChart:
```javascript
{
  type: 'line',
  data: {
    labels: ['2024-01-01T00:00:00Z', ...],
    datasets: [{
      label: 'voltage',
      data: [230.5, 229.8, ...],
      borderColor: '#3366CC',
      fill: false
    }]
  },
  options: { title: { text: 'Evolución de Voltaje' }, ... }
}
```
- Genera URL de QuickChart (codifica JSON en URL)
- Retorna: `imageUrl: "https://quickchart.io/chart?c=..."`

**5. Saver Node:**
- Descarga imagen desde URL
- Crea directorio `output/` si no existe
- Guarda como `output/chart_2024-01-01_1704067200000.png`
- Retorna: `{ filePath: "...", size: 45231 }`

**6. Respuesta final MCP:**
```json
{
  "success": true,
  "imagePath": "output/chart_2024-01-01_1704067200000.png",
  "imageUrl": "https://quickchart.io/chart?c=...",
  "format": "png",
  "plan": { "chartType": "line_chart", ... },
  "metadata": {
    "timestamp": "2024-01-01T12:00:00Z",
    "dataPoints": 152,
    "generationTimeMs": 1847
  }
}
```

### Ejemplo 2: "Muestra distribución de frecuencias del voltaje en un histograma"

**1. Request:**
```json
{
  "prompt": "Muestra distribución de frecuencias del voltaje en un histograma",
  "data": [
    {"voltage": 228.5}, {"voltage": 231.2}, {"voltage": 229.8}, ...
  ]  // 500 puntos
}
```

**2. Planner Node:**
- **Override detectado**: Prompt contiene "histograma"
- Incluso si LLM elige otro tipo, se fuerza `chartType: 'histogram'`
- Plan resultante:
```json
{
  "chartType": "histogram",
  "title": "Distribución de Voltaje",
  "xField": "voltage",
  "yField": "voltage",
  "bins": 10,
  "xLabel": "Rango de Voltaje",
  "yLabel": "Frecuencia"
}
```

**3. Generator Node:**
- **No aplica sampling** (histogramas necesitan todos los datos)
- Calcula bins automáticos:
  - Min: 225.0, Max: 235.0, Range: 10.0
  - Bin width: 1.0
  - Bins: [225-226, 226-227, ..., 234-235]
- Cuenta frecuencias por bin:
  - [225-226]: 12 ocurrencias
  - [226-227]: 45 ocurrencias
  - ...
- Construye bar chart con bins en X y frecuencias en Y

**4. Saver & Response:**
```json
{
  "success": true,
  "imagePath": "output/chart_2024-01-01_1704067500000.png",
  "plan": { "chartType": "histogram", "bins": 10 }
}
```

### Ejemplo 3: "Crea mapa de calor de consumo por día y hora"

**1. Request:**
```json
{
  "prompt": "Crea mapa de calor de consumo por día y hora",
  "data": [
    {"day": "Lunes", "hour": 0, "consumption": 120.5},
    {"day": "Lunes", "hour": 1, "consumption": 105.2},
    ...  // 7 días × 24 horas = 168 puntos
  ]
}
```

**2. Planner Node:**
```json
{
  "chartType": "heatmap",
  "xField": "day",
  "yField": "hour",
  "valueField": "consumption",
  "title": "Consumo por Día y Hora"
}
```

**3. Generator Node:**
- Construye matriz 2D: días × horas
- Dataset pequeño (168 puntos), usa QuickChart con bubbles
- Si fuera >1000 puntos, generaría HTML con Plotly

**4. Output:**
```json
{
  "success": true,
  "imagePath": "output/chart_2024-01-01_1704067800000.png",
  "format": "png"
}
```

### Ejemplo 4: "Exporta los datos a tabla"

**1. Request:**
```json
{
  "prompt": "Exporta los datos a tabla",
  "data": [
    {"sensor": "S1", "value": 120.5, "status": "OK"},
    {"sensor": "S2", "value": 115.3, "status": "OK"}
  ]
}
```

**2. Planner Node:**
```json
{
  "chartType": "table"
}
```

**3. Generator Node:**
- No genera imagen, genera CSV:
```csv
sensor,value,status
S1,120.5,OK
S2,115.3,OK
```
- Retorna: `{ csvContent: "...", isCSV: true }`

**4. Saver Node:**
- Guarda CSV directamente
- Path: `output/table_data_2024-01-01_1704068000000.csv`

**5. Response:**
```json
{
  "success": true,
  "imagePath": "output/table_data_2024-01-01_1704068000000.csv",
  "format": "csv"
}
```

## Configuración

### Variables de Entorno

Crear archivo `.env` en la raíz del paquete:

```bash
# Proveedor LLM (obligatorio)
LLM_PROVIDER=copilot  # o "openrouter"

# GitHub Copilot (si LLM_PROVIDER=copilot)
COPILOT_MODEL=claude-sonnet-4.5  # Opcional, modelo por defecto

# OpenRouter (si LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxx  # Obligatorio
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet  # Opcional
```

### Instalación

```bash
cd packages/core/visualization-agent
npm install
npm run build
```

### Ejecución

**Modo MCP Server (para integración con Copilot):**
```bash
npm run mcp
# o
node dist/mcp-server.js
```

**Modo desarrollo (con hot reload):**
```bash
npm run dev
```

## Tipos de Visualización Detallados

### 1. Line Chart (Gráfica de Líneas)
**Uso:** Series temporales, tendencias, evolución de valores

**Características:**
- Múltiples series (multi-yField)
- Sin relleno (fill: false)
- Colores diferenciados por serie
- Labels en ejes X e Y

**Ejemplo de uso:**
```javascript
{
  prompt: "Voltaje en las últimas 24 horas",
  data: [
    { time: "00:00", voltage: 230.5 },
    { time: "01:00", voltage: 229.8 },
    ...
  ]
}
// → Plan: { chartType: 'line_chart', xField: 'time', yField: 'voltage' }
```

### 2. Bar Chart (Gráfica de Barras)
**Uso:** Comparaciones categóricas, valores por periodo

**Características:**
- Barras verticales
- Soporte para múltiples series
- Opcional: stacking para mostrar totales
- Ideal para datos discretos

**Ejemplo de uso:**
```javascript
{
  prompt: "Consumo por día de la semana",
  data: [
    { day: "Lunes", consumption: 450 },
    { day: "Martes", consumption: 420 },
    ...
  ]
}
// → Plan: { chartType: 'bar_chart', xField: 'day', yField: 'consumption' }
```

### 3. Pie Chart (Gráfica Circular)
**Uso:** Distribución porcentual, proporciones

**Características:**
- Agrega valores automáticamente por categoría
- Suma total visible
- Colores diferenciados
- Muestra porcentajes y valores absolutos

**Ejemplo de uso:**
```javascript
{
  prompt: "Distribución de consumo por edificio",
  data: [
    { building: "A", consumption: 1200 },
    { building: "B", consumption: 800 },
    { building: "C", consumption: 1500 }
  ]
}
// → Plan: { chartType: 'pie_chart', xField: 'building', yField: 'consumption' }
```

### 4. Scatter (Diagrama de Dispersión)
**Uso:** Correlaciones, relaciones entre variables

**Características:**
- Puntos sin líneas conectoras
- Útil para detectar patrones o clusters
- Permite identificar outliers visualmente

**Ejemplo de uso:**
```javascript
{
  prompt: "Relación entre temperatura y consumo",
  data: [
    { temperature: 25, consumption: 450 },
    { temperature: 30, consumption: 520 },
    ...
  ]
}
// → Plan: { chartType: 'scatter', xField: 'temperature', yField: 'consumption' }
```

### 5. Area Chart (Gráfica de Área)
**Uso:** Series temporales con énfasis en volumen

**Características:**
- Líneas con relleno debajo
- Ideal para múltiples series apiladas
- Muestra contribución de cada serie al total

**Ejemplo de uso:**
```javascript
{
  prompt: "Consumo por zona apilado",
  data: [
    { hour: "00:00", zone1: 100, zone2: 80, zone3: 120 },
    ...
  ]
}
// → Plan: { chartType: 'area_chart', xField: 'hour', yField: ['zone1','zone2','zone3'] }
```

### 6. Radar Chart (Gráfica de Radar)
**Uso:** Comparación multivariable, perfiles

**Características:**
- Gráfica circular con múltiples ejes
- Ideal para comparar perfiles o características
- Muestra fortalezas/debilidades en múltiples dimensiones

**Ejemplo de uso:**
```javascript
{
  prompt: "Perfil de sensores",
  data: [
    { metric: "Precision", sensor1: 95, sensor2: 88 },
    { metric: "Speed", sensor1: 75, sensor2: 92 },
    ...
  ]
}
// → Plan: { chartType: 'radar', xField: 'metric', yField: ['sensor1','sensor2'] }
```

### 7. Histogram (Histograma)
**Uso:** Distribución de frecuencias, análisis estadístico

**Características:**
- Divide valores en bins (rangos)
- Cuenta frecuencias por bin
- NO usa fechas en X (usa rangos de valores)
- Útil para ver distribución normal, sesgos

**Ejemplo de uso:**
```javascript
{
  prompt: "Histograma de voltaje",
  data: [
    { voltage: 228.5 },
    { voltage: 231.2 },
    { voltage: 229.8 },
    ...  // 500 valores
  ]
}
// → Plan: { 
//     chartType: 'histogram', 
//     xField: 'voltage', 
//     yField: 'voltage',
//     bins: 10
//   }
// → Output: Bins [225-226, 226-227, ...] con frecuencias [12, 45, ...]
```

**IMPORTANTE:** El planner tiene lógica especial para forzar histogram si el usuario dice "histograma" o "distribución de frecuencias".

### 8. Heatmap (Mapa de Calor)
**Uso:** Patrones 2D, correlaciones, densidad

**Características:**
- Matriz bidimensional con colores de intensidad
- X e Y son dimensiones categóricas/temporales
- Color representa valor/frecuencia en cada intersección
- Para datasets grandes (>1000 puntos): genera HTML interactivo con Plotly
- Para datasets pequeños: usa QuickChart con bubbles

**Ejemplo de uso:**
```javascript
{
  prompt: "Mapa de calor de consumo por día y hora",
  data: [
    { day: "Lunes", hour: 0, consumption: 120 },
    { day: "Lunes", hour: 1, consumption: 105 },
    ...  // 7 días × 24 horas
  ]
}
// → Plan: { 
//     chartType: 'heatmap', 
//     xField: 'day', 
//     yField: 'hour',
//     valueField: 'consumption'
//   }
```

### 9. Table (Tabla CSV)
**Uso:** Exportación de datos crudos

**Características:**
- No genera imagen, genera archivo CSV
- Headers automáticos desde keys del primer objeto
- Escapa comillas y comas correctamente
- Útil para análisis externo en Excel/Python

**Ejemplo de uso:**
```javascript
{
  prompt: "Exporta los datos a tabla",
  data: [
    { sensor: "S1", value: 120.5, status: "OK" },
    { sensor: "S2", value: 115.3, status: "WARN" }
  ]
}
// → Output: table_data_YYYY-MM-DD_timestamp.csv
```

## Herramientas de Análisis Avanzadas

El agente incluye herramientas adicionales para análisis de datos (actualmente no expuestas directamente pero disponibles en el código):

### calculateStatsTool()
Calcula estadísticas descriptivas de un campo numérico.

```typescript
const stats = await calculateStatsTool(data, 'voltage');
// {
//   field: "voltage",
//   count: 720,
//   min: 220.5,
//   max: 239.8,
//   mean: 230.2,
//   median: 230.5,
//   stdDev: 3.2
// }
```

### aggregateDataTool()
Agrupa datos por un campo y aplica función de agregación.

```typescript
const aggregated = await aggregateDataTool(
  data, 
  'sensor',      // Agrupar por
  'value',       // Campo a agregar
  'avg'          // Función: sum|avg|min|max|count
);
// [
//   { sensor: "S1", value: "125.50", count: 48 },
//   { sensor: "S2", value: "118.30", count: 48 }
// ]
```

### detectAnomaliesTool()
Detecta valores anómalos usando método Z-score (desviación estándar).

```typescript
const result = await detectAnomaliesTool(data, 'voltage', 3);
// {
//   anomalies: [
//     { timestamp: "2024-01-15T14:30:00Z", voltage: 250.0 },
//     { timestamp: "2024-01-20T03:15:00Z", voltage: 210.5 }
//   ],
//   normalRange: { min: 223.0, max: 237.4 }
// }
```

## Uso Programático

### Como MCP Server (Recomendado)

El agente está diseñado para ejecutarse como servidor MCP y ser llamado por un orchestrator o cliente MCP:

```bash
# Terminal 1: Iniciar servidor
cd packages/core/visualization-agent
npm run mcp

# Terminal 2: Llamar desde cliente MCP
# (Ver documentación del orchestrator)
```

### Como Módulo Node.js

```typescript
import { executeVisualization } from './graph.js';
import { DEFAULT_CHART_CONFIG } from './types.js';

const result = await executeVisualization(
  {
    prompt: "Crea una gráfica de líneas del voltaje",
    data: [
      { time: "2024-01-01T00:00:00Z", voltage: 230.5 },
      { time: "2024-01-01T01:00:00Z", voltage: 229.8 },
      // ...
    ]
  },
  DEFAULT_CHART_CONFIG,  // Opcional: { width: 800, height: 600 }
  './output'             // Opcional: directorio de salida
);

console.log('Success:', result.error === null);
console.log('Image saved at:', result.filePath);
console.log('File size:', result.fileSize, 'bytes');
console.log('Chart type:', result.plan?.chartType);
```

### Integración con Orchestrator

El orchestrator puede invocar el visualization agent vía MCP:

```typescript
// En el orchestrator
const vizClient = new MCPClient();
await vizClient.connect('node', ['packages/core/visualization-agent/dist/mcp-server.js']);

const result = await vizClient.callTool('create_visualization', {
  prompt: "Dame una gráfica de barras del consumo por día",
  data: fetchedData,
  outputDir: './reports'
});

console.log(JSON.parse(result.content[0].text));
```

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP SERVER                              │
│         (mcp-server.ts - stdio transport)                   │
│                                                             │
│  Tool: create_visualization                                 │
│  Input: { prompt, data[], suggestedType?, outputDir? }     │
│  Output: { success, imagePath, imageUrl, plan, metadata }  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       v
┌─────────────────────────────────────────────────────────────┐
│                   LANGGRAPH PIPELINE                        │
│                    (graph.ts)                               │
│                                                             │
│   START                                              END    │
│     ↓                                                  ↑     │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐    │     │
│  │ PLANNER  │─────→│GENERATOR │─────→│  SAVER   │────┘     │
│  └──────────┘      └──────────┘      └──────────┘          │
│       │                  │                  │               │
│   LLM call         Chart/CSV/HTML      File write          │
│  (planner.ts)        (tools.ts)        (tools.ts)          │
└─────────────────────────────────────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
         v                            v
┌────────────────┐          ┌──────────────────┐
│ LLM PROVIDERS  │          │   QUICKCHART     │
│  (llm-*.ts)    │          │   External API   │
│                │          │  chart rendering │
│ - Copilot SDK  │          └──────────────────┘
│ - OpenRouter   │
└────────────────┘
```

## Estructura de Directorios

```
visualization-agent/
├── src/
│   ├── mcp-server.ts           # Entrada MCP, maneja tools/list y tools/call
│   ├── graph.ts                # Pipeline LangGraph (planner→generator→saver)
│   ├── planner.ts              # Análisis con LLM, genera VisualizationPlan
│   ├── tools.ts                # Implementación de generación y guardado
│   ├── types.ts                # Interfaces TypeScript
│   ├── llm-flexible.ts         # Factory de LLM providers
│   ├── llm-provider.ts         # Interfaz abstracta LLMProvider
│   ├── generators/
│   │   └── charts.ts           # [DEPRECATED - funcionalidad movida a tools.ts]
│   └── providers/
│       ├── copilot.ts          # Implementación GitHub Copilot
│       └── openrouter.ts       # Implementación OpenRouter
├── dist/                       # Código TypeScript compilado
├── output/                     # Gráficas, CSVs, HTMLs generados
├── .env                        # Configuración LLM provider
├── package.json                # Dependencias y scripts
├── tsconfig.json               # Configuración TypeScript
└── README.md
```

**Nota:** El directorio `generators/` contiene implementaciones legacy que han sido refactorizadas dentro de `tools.ts`. Se mantiene por compatibilidad pero la funcionalidad activa está en `tools.ts`.

## Dependencias Principales

```json
{
  "@github/copilot-sdk": "^0.2.0",
  "@langchain/core": "^0.3.40",
  "@langchain/langgraph": "^0.2.74",
  "@modelcontextprotocol/sdk": "^1.0.4",
  "quickchart-js": "^3.1.3",
  "dotenv": "^16.4.5",
  "openai": "^6.0.0"
}
```

**Descripción:**
- **@langchain/langgraph**: Orquestación del pipeline con estado compartido
- **@langchain/core**: Primitivos de LangChain (Annotation, etc.)
- **@modelcontextprotocol/sdk**: Servidor MCP sobre stdio
- **@github/copilot-sdk**: Integración con GitHub Copilot
- **quickchart-js**: Cliente para QuickChart API (generación de gráficas)
- **openai**: Cliente OpenAI-compatible (usado por OpenRouter provider)

## Scripts de NPM

```bash
# Desarrollo con hot reload
npm run dev

# Compilar TypeScript a dist/
npm run build

# Ejecutar como MCP server (requiere build)
npm run start
npm run mcp  # Alias de start

# Ejecutar tests (si existen)
npm test
```

## Manejo de Errores

El agente implementa múltiples capas de resiliencia:

### 1. Validación de entrada
```typescript
if (!request.params.arguments.prompt || !request.params.arguments.data) {
  throw new Error('Missing required parameters: prompt and data');
}
```

### 2. Safe JSON parsing
El planner tiene lógica para parsear JSON incluso si el LLM retorna:
- Markdown code blocks (```json ... ```)
- Texto explicativo antes/después del JSON
- JSON embebido en texto

### 3. Sampling automático
Para datasets grandes, reduce automáticamente a 100 puntos:
```typescript
if (plan.chartType !== 'histogram' && data.length > 100) {
  processedData = sampleData(data, 100);
}
```

**Excepción:** Histogramas NO se samplen porque necesitan todos los valores para calcular frecuencias correctamente.

### 4. Override de tipo de gráfica
Si el usuario dice "histograma" pero el LLM decide otro tipo, se fuerza:
```typescript
if (userPrompt.includes('histograma') && plan.chartType !== 'histogram') {
  console.error('OVERRIDE: forcing histogram');
  plan.chartType = 'histogram';
}
```

### 5. Límites de URL
QuickChart tiene límite de ~16KB en URLs. El agente detecta URLs largas:
```typescript
if (imageUrl.length > 16000) {
  console.error(`WARNING: URL too long (${imageUrl.length})`);
}
```

### 6. Propagación de errores
Cada nodo del graph captura errores y los propaga en el estado:
```typescript
try {
  // ... lógica del nodo
} catch (error) {
  return {
    error: error instanceof Error ? error.message : String(error)
  };
}
```

## Limitaciones Conocidas

### Técnicas
- **QuickChart dependencia**: Requiere servicio externo, puede fallar si está caído
- **Límite de URL**: URLs muy largas (>16KB) pueden fallar en QuickChart
- **Sampling lossy**: Datasets >100 puntos pierden resolución (excepto histograms)
- **No caching**: Regenera imágenes idénticas cada vez
- **Gráficas estáticas**: Solo PNG, no interactivas

### Funcionales
- **Sin validación de datos**: No valida tipos ni rangos de valores
- **Sin sugerencias proactivas**: No sugiere tipos alternativos si el elegido falla
- **Sin agregación automática**: No detecta necesidad de agregación temporal
- **Sin comparación multi-dataset**: No puede combinar múltiples fuentes de datos

## Extensibilidad

### Agregar nuevo tipo de gráfica

1. Actualizar tipo en `types.ts`:
```typescript
export type ChartType = 'line_chart' | 'bar_chart' | ... | 'NEW_TYPE';
```

2. Agregar generador en `tools.ts`:
```typescript
function generateNewTypeChartConfig(plan: VisualizationPlan, data: any[]): any {
  // ... configuración de QuickChart
  return { type: 'NEW_TYPE', data: {...}, options: {...} };
}
```

3. Routing en `generateChartTool()`:
```typescript
else if (plan.chartType === 'NEW_TYPE') {
  chartConfig = generateNewTypeChartConfig(plan, processedData);
}
```

4. Actualizar prompt del planner en `planner.ts`:
```typescript
Available chart types: line_chart, bar_chart, ..., NEW_TYPE

NEW_TYPE: Use when user asks for ...
```

### Cambiar provider de gráficas

Reemplazar QuickChart por Plotly/D3/etc.:

1. Instalar nueva dependencia: `npm install plotly.js`
2. Crear nuevo generador en `tools.ts`:
```typescript
async function generateChartWithPlotly(plan, data, config) {
  const Plotly = await import('plotly.js');
  // ... generar HTML interactivo
  return { htmlContent, isHTML: true };
}
```
3. Actualizar `generateChartTool()` para usar el nuevo generador

### Agregar herramienta de análisis

1. Implementar en `tools.ts`:
```typescript
export async function newAnalysisTool(data: any[], params: any): Promise<any> {
  // ... lógica de análisis
  return result;
}
```

2. Opcional: Exponer como tool separado en MCP server si se necesita acceso directo

## Casos de Uso

### Visualización de datos IoT
```javascript
{
  prompt: "Temperatura de los últimos 7 días",
  data: sensorReadings.map(r => ({ time: r.timestamp, temp: r.temperature }))
}
// → Line chart temporal
```

### Análisis de distribución
```javascript
{
  prompt: "Histograma de tiempos de respuesta",
  data: requests.map(r => ({ responseTime: r.duration }))
}
// → Histogram con bins automáticos
```

### Comparación de categorías
```javascript
{
  prompt: "Ventas por región en gráfica de barras",
  data: [
    { region: "Norte", sales: 45000 },
    { region: "Sur", sales: 38000 },
    { region: "Este", sales: 52000 }
  ]
}
// → Bar chart
```

### Exportación para análisis
```javascript
{
  prompt: "Exporta estos datos a CSV",
  data: rawSensorData
}
// → Archivo CSV en output/
```

### Patrones complejos
```javascript
{
  prompt: "Mapa de calor de actividad por hora y día",
  data: userActivity.map(a => ({
    day: a.dayOfWeek,
    hour: a.hourOfDay,
    count: a.activeUsers
  }))
}
// → Heatmap 2D (HTML si es grande, QuickChart si es pequeño)
```

## Mejoras Futuras

### Corto plazo
- [ ] Cache de imágenes para evitar regeneración
- [ ] Validación de esquema de datos con Zod
- [ ] Retry logic para llamadas a QuickChart
- [ ] Soporte para múltiples datasets en una misma gráfica
- [ ] Temas de color personalizables

### Medio plazo
- [ ] Gráficas interactivas con Plotly.js
- [ ] Exportación a PDF/Excel
- [ ] Agregación temporal automática
- [ ] Detección de outliers mejorada (IQR, DBSCAN)
- [ ] Sugerencias de tipo de gráfica alternativas

### Largo plazo
- [ ] ML para predecir tipo de gráfica óptimo
- [ ] Generación de dashboards multi-gráfica
- [ ] Streaming de datos en tiempo real
- [ ] Integración con BI tools (Tableau, Power BI)
- [ ] A/B testing de visualizaciones

## Troubleshooting

### Error: "LLM provider not configured"
**Causa:** Falta configurar `LLM_PROVIDER` en `.env`

**Solución:**
```bash
echo "LLM_PROVIDER=copilot" >> .env
# o
echo "LLM_PROVIDER=openrouter" >> .env
echo "OPENROUTER_API_KEY=sk-or-v1-..." >> .env
```

### Error: "QuickChart URL too long"
**Causa:** Dataset muy grande genera URL >16KB

**Solución:** El sampling automático debería evitarlo. Si persiste:
1. Reducir manualmente el dataset antes de enviar
2. O implementar generador alternativo (Plotly HTML)

### Error: "Invalid JSON response from LLM"
**Causa:** LLM retorna texto malformado

**Solución:** El `safeJsonParse` debería manejarlo. Si persiste:
1. Revisar logs del LLM provider
2. Probar con modelo diferente (COPILOT_MODEL o OPENROUTER_MODEL)

### Gráfica generada incorrecta
**Causa:** LLM eligió tipo o campos incorrectos

**Solución:**
1. Ser más específico en el prompt: "gráfica de líneas" en lugar de "gráfica"
2. Usar `suggestedType` parameter
3. Revisar estructura de datos (campos consistentes)

### No se genera archivo en output/
**Causa:** Permisos de escritura o directorio no existe

**Solución:**
```bash
mkdir -p output
chmod 755 output
```

## Contribución

Para contribuir al visualization agent:

1. Fork del repositorio
2. Crear rama feature: `git checkout -b feature/nueva-grafica`
3. Hacer cambios y testear
4. Commit: `git commit -m "feat: agregar soporte para violin plot"`
5. Push: `git push origin feature/nueva-grafica`
6. Crear Pull Request

### Convenciones de código
- TypeScript estricto (noImplicitAny, strictNullChecks)
- Nombres descriptivos de variables
- Logging con prefijo `[VIZ_AGENT][COMPONENTE]`
- Tipos explícitos en interfaces públicas

---

**Versión:** 2.0.0  
**Última actualización:** 2024  
**Autores:** OpenAgents Team
