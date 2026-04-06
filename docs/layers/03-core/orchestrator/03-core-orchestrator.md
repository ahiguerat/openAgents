# Orchestrator Agent

## Descripción

El Orchestrator es el agente coordinador central del sistema OpenAgents. Actúa como hub inteligente que recibe solicitudes en lenguaje natural, las interpreta usando un LLM, y coordina múltiples agentes especializados (data-agent, visualization-agent) para cumplir con la petición del usuario. Utiliza Model Context Protocol (MCP) para la comunicación entre agentes.

## Arquitectura

El orchestrator implementa un patrón de hub-and-spoke donde actúa como nodo central. Los agentes especializados NUNCA se comunican directamente entre ellos, solo con el orchestrator.

```
         ┌─────────────────┐
         │  USER REQUEST   │
         │ (natural lang.) │
         └────────┬────────┘
                  │
                  v
         ┌─────────────────┐
         │  ORCHESTRATOR   │ ← Hub Central
         │  (MCP Server)   │
         └────────┬────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        v                   v
  ┌──────────┐       ┌──────────┐
  │  DATA    │       │   VIZ    │
  │  AGENT   │       │  AGENT   │
  │(MCP Svr) │       │(MCP Svr) │
  └──────────┘       └──────────┘
```

### Flujo de Trabajo

```
User Request
     |
     v
[PLANNER]
- Analiza prompt con LLM
- Identifica intención (data, visualización, ambos)
- Genera plan estructurado
     |
     v
[DATA FETCHER] (si necesita datos)
- Llama a data-agent vía MCP
- Obtiene datos de la API CTI
- Almacena en estado
     |
     v
[VISUALIZER] (si necesita gráfica)
- Llama a viz-agent vía MCP
- Pasa datos + prompt
- Recibe path de imagen generada
     |
     v
[FORMATTER]
- Consolida resultados
- Genera mensaje amigable
- Incluye estadísticas y paths
     |
     v
User Response
```

## Componentes

### 1. MCP Server (`src/mcp-server.ts`)

Punto de entrada del orchestrator. Expone el tool `process_user_request` vía Model Context Protocol.

**Interfaz:**
- Input: Prompt en lenguaje natural
- Output: Mensaje formateado + metadatos (dataRecordCount, visualizationPath)

### 2. Graph (`src/graph.ts`)

Orquestador basado en LangGraph con 4 nodos principales:

**Nodos:**
- `plannerNode`: Interpreta el prompt y decide qué agentes invocar
- `dataFetcherNode`: Coordina llamadas al data-agent
- `visualizerNode`: Coordina llamadas al viz-agent
- `formatterNode`: Consolida y formatea resultados finales

**Estado compartido:**
```typescript
{
  userPrompt: string;           // Prompt original
  plan: Plan | null;            // Plan generado por LLM
  dataAgentResponse: any;       // Respuesta del data-agent
  vizAgentResponse: any;        // Respuesta del viz-agent
  finalMessage: string;         // Mensaje final al usuario
  error: string | null;         // Error si ocurre
  dataRecordCount?: number;     // Cantidad de registros obtenidos
  visualizationPath?: string;   // Path de la imagen generada
}
```

### 3. Planner (`src/prompts.ts`)

Sistema de prompts para el LLM que define:
- Agentes disponibles y sus capacidades
- Reglas de coordinación
- Estructura del plan de ejecución
- Palabras clave para detección de intención

**Plan Structure:**
```typescript
{
  needsData: boolean;           // Si necesita consultar datos
  needsVisualization: boolean;  // Si necesita crear gráfica
  dataQuery?: string;           // Query para data-agent
  vizInstructions?: string;     // Instrucciones para viz-agent
}
```

### 4. MCP Clients (`src/clients/`)

Clientes MCP para comunicarse con agentes especializados:

**data-agent-mcp-client.ts**
- Conecta con data-agent vía MCP
- Invoca tool `query_cti_measurements`
- Maneja timeout y errores

**viz-agent-mcp-client.ts**
- Conecta con viz-agent vía MCP
- Invoca tool `visualize_data`
- Pasa datos + prompt del usuario

### 5. Agent Callers (`src/agents/`)

Wrappers de alto nivel para invocar agentes:

**data-agent-caller.ts**
- Abstracción sobre el cliente MCP de data-agent
- Maneja inicialización y cierre de conexión
- Propaga errores con contexto

### 6. LLM Abstraction (`src/llm-flexible.ts`)

Capa de abstracción para providers LLM:
- Soporta GitHub Copilot SDK
- Soporta OpenRouter
- Configuración vía variables de entorno

### 7. Utils (`src/utils.ts`)

Utilidades compartidas:
- Formateo de fechas
- Parsing de respuestas
- Validaciones

## Flujo de Ejecución

### Ejemplo: "Dame una gráfica del voltaje del contador LGZ0011605102 de los últimos 30 días"

#### 1. Recepción del prompt
```json
{
  "tool": "process_user_request",
  "arguments": {
    "prompt": "Dame una gráfica del voltaje del contador LGZ0011605102..."
  }
}
```

#### 2. Planner analiza con LLM
```json
{
  "needsData": true,
  "needsVisualization": true,
  "dataQuery": "voltaje del contador LGZ0011605102 de los últimos 30 días",
  "vizInstructions": "gráfica de líneas del voltaje"
}
```

#### 3. Data Fetcher invoca data-agent
```
Orchestrator --[MCP call: query_cti_measurements]-->  Data Agent
             <--[returns: JSON array of measurements]--
```

Respuesta:
```json
{
  "success": true,
  "apiResponse": [
    {"time": "2026-03-01T00:00:00Z", "field": "V_A", "value": "235"},
    ...
  ]
}
```

#### 4. Visualizer invoca viz-agent
```
Orchestrator --[MCP call: visualize_data]-->  Viz Agent
             <--[returns: imagePath]--------
```

Respuesta:
```json
{
  "success": true,
  "imagePath": "output/chart_1743320394582.png"
}
```

#### 5. Formatter consolida resultado
```
Datos obtenidos: 720 registros
Visualización generada: output/chart_1743320394582.png

Se ha generado una gráfica de líneas mostrando el voltaje del contador
LGZ0011605102 durante los últimos 30 días.
```

## Configuración

### Variables de Entorno (.env)

```env
# LLM Provider
LLM_PROVIDER=copilot|openrouter
COPILOT_MODEL=claude-sonnet-4.5
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=nvidia/nemotron-3-nano-30b-a3b:free

# MCP Agent Paths
DATA_AGENT_MCP_PATH=../data-agent/dist/mcp-server.js
VIZ_AGENT_MCP_PATH=../visualization-agent/dist/mcp-server.js
```

## Uso

### Como MCP Server

```bash
# 1. Compilar
npm run build

# 2. Ejecutar como servidor MCP
npm run mcp
```

### Modo Interactivo (Desarrollo)

```bash
# Ejecutar script interactivo
npx tsx scripts/interactive.ts
```

Luego ingresar prompts directamente:
```
> Dame el voltaje del contador LGZ0011605102
> Dame una gráfica del voltaje de los últimos 7 días
> Muéstrame la temperatura del transformador TR001
```

### Como módulo

```typescript
import { buildGraph } from './graph.js';

const graph = buildGraph();
const result = await graph.invoke({
  userPrompt: "Dame una gráfica del voltaje del contador LGZ0011605102",
  plan: null,
  dataAgentResponse: null,
  vizAgentResponse: null,
  finalMessage: "",
  error: null
});

console.log(result.finalMessage);
```

## Diagrama de Arquitectura Detallado

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP CLIENT (External)                    │
│  (e.g., GitHub Copilot, VS Code, CLI Client)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Tool: process_user_request
                       │ Input: { prompt: string }
                       │
┌──────────────────────┴──────────────────────────────────────┐
│               ORCHESTRATOR (MCP Server)                     │
│                                                             │
│  ┌──────────────────────────────────────────────┐          │
│  │           LANGGRAPH PIPELINE                 │          │
│  │                                              │          │
│  │  ┌─────────┐   ┌─────────┐   ┌──────────┐  │          │
│  │  │PLANNER  │──>│  DATA   │──>│VISUALIZER│  │          │
│  │  │         │   │ FETCHER │   │          │  │          │
│  │  │ - LLM   │   │         │   │          │  │          │
│  │  │ - Parse │   │         │   │          │  │          │
│  │  │ - Decide│   │         │   │          │  │          │
│  │  └─────────┘   └────┬────┘   └────┬─────┘  │          │
│  │                     │             │         │          │
│  │                     │             │         │          │
│  │                     v             v         │          │
│  │               ┌──────────────────────┐     │          │
│  │               │    FORMATTER         │     │          │
│  │               │  - Consolidate       │     │          │
│  │               │  - Format message    │     │          │
│  │               │  - Add metadata      │     │          │
│  │               └──────────────────────┘     │          │
│  └──────────────────────────────────────────────┘          │
│                       │                                    │
│              ┌────────┴─────────┐                         │
│              │                  │                         │
│         [MCP Client]       [MCP Client]                   │
│              │                  │                         │
└──────────────┼──────────────────┼─────────────────────────┘
               │                  │
               v                  v
     ┌──────────────┐    ┌──────────────┐
     │  DATA AGENT  │    │  VIZ AGENT   │
     │ (MCP Server) │    │ (MCP Server) │
     │              │    │              │
     │ Tool:        │    │ Tool:        │
     │ query_cti_   │    │ visualize_   │
     │ measurements │    │ data         │
     └──────────────┘    └──────────────┘
            │                    │
            v                    v
      ┌─────────┐         ┌──────────┐
      │ CTI API │         │QuickChart│
      └─────────┘         └──────────┘
```

## Estructura de Directorios

```
orchestrator/
├── src/
│   ├── mcp-server.ts          # Punto de entrada MCP
│   ├── graph.ts               # LangGraph pipeline
│   ├── prompts.ts             # Sistema de prompts
│   ├── types.ts               # Definiciones de tipos
│   ├── utils.ts               # Utilidades
│   ├── llm-flexible.ts        # Abstracción LLM
│   ├── llm-provider.ts        # Copilot SDK provider
│   ├── agents/
│   │   └── data-agent-caller.ts    # Wrapper data-agent
│   ├── clients/
│   │   ├── data-agent-mcp-client.ts # Cliente MCP data-agent
│   │   └── viz-agent-mcp-client.ts  # Cliente MCP viz-agent
│   └── providers/
│       ├── copilot.ts         # GitHub Copilot integration
│       └── openrouter.ts      # OpenRouter integration
├── scripts/
│   └── interactive.ts         # Script interactivo de prueba
├── dist/                      # Código compilado
├── output/                    # Archivos generados
├── .env                       # Variables de entorno
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencias Principales

- `@langchain/langgraph`: Orquestación de flujo
- `@langchain/core`: Primitivos de LangChain
- `@modelcontextprotocol/sdk`: Protocolo MCP (cliente y servidor)
- `@github/copilot-sdk`: GitHub Copilot integration
- `zod`: Validación de schemas
- `readline`: CLI interactivo

## Desarrollo

### Build

```bash
npm run build
```

### Ejecutar como MCP Server

```bash
npm run mcp
```

### Modo Interactivo

```bash
npx tsx scripts/interactive.ts
```

### Agregar nuevo agente

1. Crear cliente MCP en `src/clients/nuevo-agente-mcp-client.ts`:
```typescript
export async function callNuevoAgente(prompt: string) {
  const client = new Client(...);
  // ... implementación
}
```

2. Crear wrapper en `src/agents/nuevo-agente-caller.ts`

3. Actualizar `src/prompts.ts` para que el planner sepa del nuevo agente

4. Agregar nuevo nodo en `src/graph.ts` si es necesario

5. Actualizar `.env` con path del nuevo agente

## Manejo de Errores

El orchestrator implementa múltiples capas de manejo de errores:

1. **Validación del plan**: Si el LLM genera un plan inválido, se rechaza y se reintenta
2. **Timeout de agentes**: Cada llamada MCP tiene timeout de 60 segundos
3. **Fallback gracioso**: Si un agente falla, el orchestrator retorna los datos parciales
4. **Error propagation**: Errores se propagan con contexto claro al usuario
5. **Logging**: Todos los pasos se loggean para debugging

## Limitaciones

- Depende de la disponibilidad de agentes especializados (data-agent, viz-agent)
- Requiere que los agentes estén compilados y accesibles vía paths en .env
- No implementa retry automático en llamadas MCP (se hace en los agentes)
- No cachea resultados de agentes (cada llamada es independiente)
- Comunicación síncrona (no hay streaming de respuestas)

## Extensibilidad

El diseño modular permite:

- **Agregar nuevos agentes**: Simplemente crear cliente MCP y actualizar prompts
- **Cambiar LLM provider**: Configurar via .env sin cambiar código
- **Pipeline personalizado**: Agregar nodos en el graph para lógica específica
- **Validación avanzada**: Agregar nodos de validación entre planner y executors
- **Cache**: Implementar cache de planes o respuestas de agentes
- **Streaming**: Agregar soporte para streaming de respuestas progresivas
- **Multi-tenancy**: Agregar contexto de usuario/tenant al estado

## Palabras Clave de Detección

El planner identifica intenciones basado en palabras clave:

### Datos
- dame, muestra, obtener, consultar, datos, valores, mediciones

### Visualización
- gráfica, gráfico, chart, plot, visualiza, dibuja, muestra gráficamente
- líneas, barras, pie, scatter, radar, área

### Análisis
- estadísticas, promedio, media, máximo, mínimo, tendencia
- anomalías, outliers, desviaciones

## Casos de Uso Típicos

### 1. Solo Datos
```
Prompt: "Dame el voltaje del contador LGZ0011605102"
Plan: { needsData: true, needsVisualization: false }
Flujo: Planner → DataFetcher → Formatter
```

### 2. Solo Visualización (con datos previos)
```
Prompt: "Crea una gráfica de barras con estos datos: [...]"
Plan: { needsData: false, needsVisualization: true }
Flujo: Planner → Visualizer → Formatter
```

### 3. Datos + Visualización
```
Prompt: "Dame una gráfica del voltaje del contador LGZ0011605102"
Plan: { needsData: true, needsVisualization: true }
Flujo: Planner → DataFetcher → Visualizer → Formatter
```

### 4. Consulta Compleja
```
Prompt: "Muéstrame una gráfica de líneas del voltaje de todos los
        contadores DC en el transformador TR001 de la última semana,
        y dime si hay anomalías"
        
Plan: {
  needsData: true,
  needsVisualization: true,
  dataQuery: "voltaje DC transformador TR001 última semana",
  vizInstructions: "gráfica líneas + detectar anomalías"
}
```

## Ventajas del Patrón Hub-and-Spoke

1. **Desacoplamiento**: Agentes no se conocen entre sí
2. **Escalabilidad**: Fácil agregar nuevos agentes sin afectar existentes
3. **Mantenimiento**: Cada agente se desarrolla y despliega independientemente
4. **Testing**: Se pueden mockear agentes individuales fácilmente
5. **Resiliencia**: Si un agente falla, el orchestrator puede continuar con otros
6. **Trazabilidad**: Todo el flujo pasa por el orchestrator (logging centralizado)
