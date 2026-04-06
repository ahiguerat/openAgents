# OpenAgents - Módulo Core

**Fecha**: 2026-04-06
**Versión**: 1.0.0

Sistema modular basado en agentes para consultar datos de mediciones eléctricas y generar visualizaciones utilizando una arquitectura hub-and-spoke.

## Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura](#arquitectura)
  2.1. [Patrón Hub-and-Spoke](#patrón-hub-and-spoke)
  2.2. [Agentes del Sistema](#agentes-del-sistema)
  2.3. [Flujo de Comunicación](#flujo-de-comunicación)
  2.4. [Estructura de Componentes por Agente](#estructura-de-componentes-por-agente)
3. [Patrones de Diseño Implementados](#patrones-de-diseño-implementados)
  3.1. [Strategy Pattern - Chart Providers](#strategy-pattern---chart-providers)
4. [Model Context Protocol (MCP)](#model-context-protocol-mcp)
5. [Instalación Rápida](#instalación-rápida)
6. [Configuración](#configuración)
7. [Uso](#uso)
8. [Estructura del Proyecto](#estructura-del-proyecto)
9. [Ejemplo de Caso Real](#ejemplo-de-caso-real)


---

## 1. Descripción General

OpenAgents Core implementa un sistema distribuido donde **agentes especializados se coordinan a través del Model Context Protocol (MCP)** para entregar capacidades inteligentes de procesamiento de datos y visualización.

El sistema OpenAgents es una arquitectura multi-agente donde cada agente:
- **Es un servidor MCP independiente** (Model Context Protocol)
- **Expone tools específicas** que pueden ser invocadas por otros agentes
- **Se comunica únicamente con el orchestrator** (patrón hub-and-spoke)
- **Usa LangGraph** para orquestar su flujo interno

```mermaid
graph TB

  subgraph Cliente
        User[Usuario/IDE/CLI]
    end

    subgraph Orchestrator["ORCHESTRATOR (MCP Server)"]
        OrchestratorMCP[MCP Server]
        OrchestratorGraph[LangGraph Pipeline]
        Planner[Planner Node<br/>LLM]
        DataFetcher[Data Fetcher Node]
        Visualizer[Visualizer Node]
        Formatter[Formatter Node]
        
        OrchestratorMCP --> OrchestratorGraph
        OrchestratorGraph --> Planner
        Planner --> DataFetcher
        DataFetcher --> Visualizer
        Visualizer --> Formatter
    end
    
    subgraph VizAgent["VISUALIZATION AGENT (MCP Server)"]
        VizMCP[MCP Server]
        VizGraph[LangGraph Pipeline]
        VizPlanner[Planner Node<br/>LLM]
        Generator[Generator Node]
        Saver[Saver Node]
        Factory[Chart Factory]
        QuickChart[QuickChart Provider]
        
        VizMCP --> VizGraph
        VizGraph --> VizPlanner
        VizPlanner --> Generator
        Generator --> Factory
        Factory --> QuickChart
        Generator --> Saver
    end
    
    subgraph External["External APIs"]
        CTIAPI[(CTI API<br/>HTTP)]
        QuickChartAPI[(QuickChart API<br/>HTTP)]
    end

    subgraph DataAgent["DATA AGENT (MCP Server)"]
        DataMCP[MCP Server]
        DataGraph[LangGraph Pipeline]
        DataPlanner[Planner Node<br/>LLM]
        Fetcher[Fetcher Node]
        Parser[Parser Node]
        
        DataMCP --> DataGraph
        DataGraph --> DataPlanner
        DataPlanner --> Fetcher
        Fetcher --> Parser
    end

    Visualizer -.->|"MCP Client<br/>create_visualization"| VizMCP
    User -->|"MCP: process_user_request"| OrchestratorMCP
    DataFetcher -.->|"MCP Client<br/>query_cti_measurements"| DataMCP
    
    
    QuickChart -->|HTTP GET| QuickChartAPI
    Fetcher -->|HTTP GET| CTIAPI
    
    style User fill:#e1f5ff
    style OrchestratorMCP fill:#fff9c4
    style DataMCP fill:#c8e6c9
    style VizMCP fill:#f8bbd0
    style CTIAPI fill:#ffe0b2
    style QuickChartAPI fill:#ffe0b2
```
---

## 2. Arquitectura

### 2.1. Patrón Hub-and-Spoke

El sistema implementa una **arquitectura hub-and-spoke** donde el Orchestrator actúa como hub central, coordinando agentes especializados (spokes):

```mermaid
graph TD
    Client["Cliente Externo<br/>(Copilot/CLI)"]
    Orchestrator["ORCHESTRATOR<br/>(Hub Central)"]
    DataAgent["DATA AGENT<br/>(Spoke)"]
    VizAgent["VIZ AGENT<br/>(Spoke)"]
    API["API CTI"]
    
    Client -->|Protocolo MCP<br/>stdio| Orchestrator
    Orchestrator -->|Cliente MCP<br/>spawn| DataAgent
    Orchestrator -->|Cliente MCP<br/>spawn| VizAgent
    DataAgent --> API
    
    style Client fill:#e1f5ff
    style Orchestrator fill:#fff4e6
    style DataAgent fill:#e8f5e9
    style VizAgent fill:#f3e5f5
    style API fill:#fce4ec
```

**Principios clave:**
1. **Comunicación Centralizada**: Los agentes especializados NUNCA se comunican directamente entre ellos
2. **Aislamiento de Agentes**: Cada agente opera de forma independiente
3. **Protocolo Estándar**: Toda comunicación usa MCP (JSON-RPC sobre stdio)
4. **Spawning Dinámico**: El orchestrator inicia agentes bajo demanda

### 2.2. Agentes del Sistema

#### Orchestrator (Hub Central)

**Rol**: Coordinar data-agent y visualization-agent para cumplir con requests del usuario.ç

**Responsabilidades**:
- Analizar y comprender solicitudes del usuario usando LLM
- Crear planes de ejecución multi-paso
- Coordinar agentes especializados vía MCP
- Agregar y presentar resultados al usuario

**Documentación completa**: [`orchestrator/03-core-orchestrator.md`](./orchestrator/03-core-orchestrator.md)

---

#### Data Agent (Spoke)

**Rol**: Especialista en obtención y procesamiento de datos.

**Responsabilidades**:
- Consultar API de mediciones eléctricas
- Filtrar y transformar datos según parámetros
- Validar y normalizar información
- Proporcionar datos estructurados al orchestrator

**Documentación completa**: [`data-agent/03-core-data-agent.md`](./data-agent/03-core-data-agent.md)

---

#### Visualization Agent (Spoke)

**Rol**: Especialista en generación de visualizaciones y análisis de datos

**Responsabilidades**:
- Analizar datos y prompts con LLM para decidir tipo de visualización óptima
- Generar gráficas usando **proveedores intercambiables** vía Strategy Pattern
  - QuickChart (por defecto): line, bar, pie, scatter, radar, area, histogram, heatmap
  - Extensible a ChartJS, Plotly, etc.
- Crear tablas exportadas a CSV
- Generar HTML interactivo para visualizaciones complejas (heatmaps grandes)
- Pipeline basado en LangGraph con 3 etapas: Planner → Generator → Saver

**Arquitectura**:
- **Planner Node**: Usa LLM para generar plan de visualización
- **Generator Node**: Usa ChartGeneratorFactory para obtener proveedor adecuado (QuickChart, etc.)
- **Saver Node**: Persiste resultado en disco (PNG/CSV/HTML)
- **Strategy Pattern**: Providers implementan IChartGenerator interface

**Tipos de visualización soportados**: 9 tipos - line_chart, bar_chart, pie_chart, scatter, table, area_chart, radar, histogram, heatmap

**Chart Providers**:
- QuickChart - API externa para gráficas simples

**Documentación completa**: [`visualization-agent/03-core-viz-agent.md`](./visualization-agent/03-core-viz-agent.md)

---

### 2.3. Flujo de Comunicación

**Secuencia típica de operación:**

```mermaid
sequenceDiagram
    participant U as Usuario
    participant O as Orchestrator
    participant D as Data Agent
    participant V as Viz Agent
    participant CTI as CTI API
    participant QC as QuickChart API
    
    U->>+O: MCP: process_user_request<br/>("Dame gráfica voltaje")
    
    Note over O: 1. Planner Node<br/>LLM analiza prompt
    O->>O: Plan: needsData=true<br/>needsVisualization=true
    
    Note over O: 2. Data Fetcher Node
    O->>+D: MCP: query_cti_measurements<br/>("voltaje contador X")
    
    Note over D: Planner Node<br/>LLM extrae params
    D->>D: measurement="voltage"<br/>meterId="X"<br/>timeRange=...
    
    Note over D: Fetcher Node
    D->>+CTI: HTTP GET /measurements/voltage?...
    CTI-->>-D: JSON data (5618 records)
    
    Note over D: Parser Node<br/>Normaliza respuesta
    D-->>-O: {success, data: [...], metadata}
    
    Note over O: 3. Visualizer Node
    O->>+V: MCP: create_visualization<br/>(prompt, data, "quickchart")
    
    Note over V: Planner Node<br/>LLM decide gráfica
    V->>V: chartType="line_chart"<br/>xField="timestamp"<br/>yField="value"
    
    Note over V: Generator Node<br/>Factory → QuickChart
    V->>V: QuickChartGenerator.generate()
    V->>+QC: HTTP GET /chart?c={...}
    QC-->>-V: PNG Image
    
    Note over V: Saver Node
    V->>V: Save to output/chart_xxx.png
    
    V-->>-O: {success, imagePath, plan}
    
    Note over O: 4. Formatter Node<br/>Consolida resultados
    O-->>-U: {success, message,<br/>dataRecordCount: 5618,<br/>visualization: {...}}
```

---


## 2.4. Estructura de Componentes por Agente

```mermaid
graph LR
    subgraph DataAgent["DATA AGENT"]
        direction TB
        DA_MCP[mcp-server.ts<br/>MCP Interface]
        DA_Graph[graph.ts<br/>LangGraph]
        DA_Planner[planner.ts<br/>LLM Planning]
        DA_Tools[tools.ts<br/>API Calls]
        DA_Schema[cti-schema.ts<br/>Domain Model]
        DA_LLM[llm-flexible.ts<br/>LLM Abstraction]
        
        DA_MCP --> DA_Graph
        DA_Graph --> DA_Planner
        DA_Graph --> DA_Tools
        DA_Planner --> DA_LLM
        DA_Tools --> DA_Schema
    end

    subgraph Orchestrator["ORCHESTRATOR"]
        direction TB
        O_MCP[mcp-server.ts<br/>MCP Interface]
        O_Graph[graph.ts<br/>LangGraph Hub]
        O_Prompts[prompts.ts<br/>LLM Prompts]
        O_DataClient[clients/data-agent-mcp-client.ts<br/>MCP Client]
        O_VizClient[clients/viz-agent-mcp-client.ts<br/>MCP Client]
        O_LLM[llm-flexible.ts<br/>LLM Abstraction]
        
        O_MCP --> O_Graph
        O_Graph --> O_Prompts
        O_Graph --> O_DataClient
        O_Graph --> O_VizClient
        O_Prompts --> O_LLM
    end
    
    subgraph VizAgent["VISUALIZATION AGENT"]
        direction TB
        VA_MCP[mcp-server.ts<br/>MCP Interface]
        VA_Graph[graph.ts<br/>LangGraph]
        VA_Planner[planner.ts<br/>LLM Planning]
        VA_Tools[tools.ts<br/>Generate & Save]
        VA_Factory[generators/index.ts<br/>Factory]
        VA_QuickChart[generators/quickchart.ts<br/>Provider]
        VA_LLM[llm-flexible.ts<br/>LLM Abstraction]
        
        VA_MCP --> VA_Graph
        VA_Graph --> VA_Planner
        VA_Graph --> VA_Tools
        VA_Planner --> VA_LLM
        VA_Tools --> VA_Factory
        VA_Factory --> VA_QuickChart
    end
  

    O_VizClient -.->|MCP Protocol| VA_MCP
    O_DataClient -.->|MCP Protocol| DA_MCP
    
    style DA_MCP fill:#c8e6c9
    style VA_MCP fill:#f8bbd0
    style O_MCP fill:#fff9c4
```

---

## 3. Patrones de Diseño Implementados

### 3.1. Strategy Pattern - Chart Providers

El Visualization Agent implementa el **patrón Strategy** para desacoplar la generación de gráficas de la implementación específica de cada proveedor.

**Componentes clave:**

```typescript
// Interface común para todos los proveedores
interface IChartGenerator {
  generate(data: any[], plan: VisualizationPlan, config: ChartConfig): Promise<string>;
  validateData(data: any[]): boolean;
  getMaxDataPoints(): number;
  getName(): string;
  sampleData(data: any[], maxPoints: number): any[];
}

// Factory que selecciona el proveedor apropiado
class ChartGeneratorFactory {
  private static generators = new Map<string, IChartGenerator>();
  
  static async initialize() { /* carga dinámica de providers */ }
  static async getGenerator(provider: string): Promise<IChartGenerator> { /* ... */ }
  static registerGenerator(name: string, generator: IChartGenerator) { /* ... */ }
}
```

**Patrón Strategy - Chart Generator Factory**

```mermaid
classDiagram
    class IChartGenerator {
        <<interface>>
        +string name
        +generate(plan, data, config) Promise~ChartGenerationResult~
    }
    
    class ChartGeneratorFactory {
        -Map~string, IChartGenerator~ generators
        -boolean initialized
        +async getGenerator(provider?) Promise~IChartGenerator~
        +register(name, generator) void
        +listGenerators() Promise~string[]~
    }
    
    class QuickChartGenerator {
        +string name = "quickchart"
        +generate(plan, data, config) Promise~ChartGenerationResult~
        -generateLineChartConfig()
        -generateBarChartConfig()
        -generatePieChartConfig()
        -sampleData()
    }
    
    class ChartJSGenerator {
        <<future>>
        +string name = "chartjs"
        +generate(plan, data, config) Promise~ChartGenerationResult~
    }
    
    class PlotlyGenerator {
        <<future>>
        +string name = "plotly"
        +generate(plan, data, config) Promise~ChartGenerationResult~
    }
    
    class ChartGenerationResult {
        +string? url
        +any? chartConfig
        +string? csvContent
        +boolean? isCSV
        +string? htmlContent
        +boolean? isHTML
    }
    
    IChartGenerator <|.. QuickChartGenerator : implements
    IChartGenerator <|.. ChartJSGenerator : implements
    IChartGenerator <|.. PlotlyGenerator : implements
    
    ChartGeneratorFactory --> IChartGenerator : uses
    IChartGenerator --> ChartGenerationResult : returns
    
    note for ChartGeneratorFactory "Factory Pattern\nRegistry-based\nAsync initialization"
    note for IChartGenerator "Strategy Pattern\nPluggable providers"
```


**Flujo de selección de proveedor:**

```mermaid
graph LR
    A[User Prompt] --> B{detectChartProvider}
    B -->|"usa quickchart"| C[QuickChart]
    B -->|"usa chartjs"| D[ChartJS]
    B -->|"usa plotly"| E[Plotly]
    B -->|sin especificar| F[QuickChart Default]
    
    C --> G[ChartGeneratorFactory]
    D --> G
    E --> G
    F --> G
    
    G --> H[IChartGenerator.generate]
    H --> I[Imagen PNG / HTML]
    
    style F fill:#ffffcc
    style G fill:#e1f5ff
```

**Detección automática:**
- El orchestrator analiza el prompt del usuario
- Si contiene "quickchart", "chartjs", "plotly" → usa ese proveedor
- Si no se especifica → usa QuickChart por defecto

**Providers actuales:**
- **QuickChart**: API externa, rápido, límite de 2500 puntos por URL

---

## 4. Model Context Protocol (MCP)

MCP es el protocolo estándar que permite la comunicación entre el orchestrator y los agentes especializados.

### Conceptos Clave

**¿Qué es MCP?**
- Protocolo JSON-RPC 2.0 para comunicación entre LLMs y herramientas
- Transporte sobre stdio (entrada/salida estándar)
- Permite descubrimiento dinámico de capacidades

**Componentes principales:**

```typescript
// Servidor MCP (Data Agent, Viz Agent)
interface MCPServer {
  tools: Tool[];          // Herramientas disponibles
  resources?: Resource[]; // Recursos opcionales
  prompts?: Prompt[];     // Prompts opcionales
}

// Cliente MCP (Orchestrator)
interface MCPClient {
  connect(): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: any): Promise<any>;
  close(): Promise<void>;
}
```

**Ejemplo de mensaje MCP:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "fetchData",
    "arguments": {
      "endpoint": "/carga",
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    }
  }
}
```

### MCP Protocol Stack

```mermaid
graph TB
    subgraph Client["MCP CLIENT (Orchestrator)"]
        C1[Application Code]
        C2[MCP SDK Client]
        C3[StdioClientTransport]
        C4[stdin/stdout]
        
        C1 --> C2
        C2 --> C3
        C3 --> C4
    end
    
    subgraph Protocol["MCP PROTOCOL LAYER"]
        P1[JSON-RPC 2.0]
        P2[Tool Call Messages]
        P3[Tool Response Messages]
        
        P1 --> P2
        P1 --> P3
    end
    
    subgraph Server["MCP SERVER (Data/Viz Agent)"]
        S1[stdin/stdout]
        S2[StdioServerTransport]
        S3[MCP SDK Server]
        S4[Tool Handlers]
        S5[Application Logic]
        
        S1 --> S2
        S2 --> S3
        S3 --> S4
        S4 --> S5
    end
    
    C4 -.->|stdio| S1
    S1 -.->|stdio| C4
    
    C3 -.->|serialize| P1
    P1 -.->|deserialize| S2
    
    style C2 fill:#fff9c4
    style S3 fill:#c8e6c9
    style P1 fill:#e1f5ff
```

### Resumen de Tools MCP

```mermaid
mindmap
    root((MCP Tools))
        Orchestrator
            process_user_request
                Input: prompt string
                Output: success, message, data, viz
        DataAgent
            query_cti_measurements
                Input: query string
                Output: success, data array, metadata
            list_measurement_types
                Output: measurement types
            list_sensor_types
                Output: sensor types
        VizAgent
            create_visualization
                Input: prompt, data, type, provider
                Output: success, imagePath, plan
```

**Más información**: [Documentación oficial MCP](https://modelcontextprotocol.io/)

---

## 5. Instalación Rápida

### Requisitos Previos

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **Proveedor LLM**: GitHub Copilot o OpenRouter con API key

### Instalación

```bash
# Clonar repositorio
git clone <repository-url>
cd openAgents/packages/core

# Instalar dependencias en todos los agentes
npm install
cd orchestrator && npm install && cd ..
cd data-agent && npm install && cd ..
cd visualization-agent && npm install && cd ..

# Compilar todos los agentes
npm run build
```

### Verificación

```bash
# Verificar cada agente individualmente
node orchestrator/dist/index.js
node data-agent/dist/index.js
node visualization-agent/dist/index.js
```

**Instalación detallada por agente**:
- [`orchestrator/03-core-orchestrator.md`](./orchestrator/03-core-orchestrator.md#instalación)
- [`data-agent/03-core-data-agent.md`](./data-agent/03-core-data-agent.md#instalación)
- [`visualization-agent/03-core-viz-agent.md`](./visualization-agent/03-core-viz-agent.md#instalación)

---

## 6. Configuración

### Variables de Entorno Globales

**Configuración compartida por todos los agentes:**

```bash
# .env (en cada carpeta de agente)

# Proveedor LLM (obligatorio)
LLM_PROVIDER=copilot  # o "openrouter"

# GitHub Copilot (si LLM_PROVIDER=copilot)
# No requiere API key adicional - usa autenticación de GitHub CLI

# OpenRouter (si LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet  # opcional
```

### Configuración Específica por Agente

Cada agente tiene variables adicionales específicas:

| Agente | Variables Específicas | Documentación |
|--------|----------------------|---------------|
| **Orchestrator** | `DATA_AGENT_PATH`, `VIZ_AGENT_PATH` | [Ver detalles →](./orchestrator/03-core-orchestrator.md#configuración) |
| **Data Agent** | `CTI_BASE_URL`, `CTI_AUTH_HEADER` | [Ver detalles →](./data-agent/03-core-data-agent.md#configuración) |
| **Visualization Agent** | Ninguna adicional requerida | [Ver detalles →](./visualization-agent/03-core-viz-agent.md#configuración) |


---

## 7. Uso

### 1. Modo Servidor MCP (Recomendado)

**Uso con GitHub Copilot CLI:**

```json
// En tu configuración de GitHub Copilot
{
  "mcpServers": {
    "openagents": {
      "command": "node",
      "args": ["packages/core/orchestrator/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "copilot"
      }
    }
  }
}
```

**Interacción:**
```bash
# El orchestrator se ejecuta como servidor MCP
# GitHub Copilot CLI se comunica automáticamente via stdio
```

### 2. Modo Interactivo (Desarrollo/Testing)

```bash
cd orchestrator
node dist/index.js

# Escribe tu solicitud:
> "Muestra la carga eléctrica de enero 2024 en un gráfico de líneas"
```

### 3. Uso como Módulo (Integración)

```typescript
import { Orchestrator } from './orchestrator';

const orchestrator = new Orchestrator();
await orchestrator.initialize();

const result = await orchestrator.processRequest(
  "Visualiza consumo eléctrico del último mes"
);
console.log(result);
```

---

## 8. Estructura del Proyecto

```
packages/core/
├── orchestrator/              # Hub central
│   ├── src/
│   │   ├── index.ts          # Entry point + MCP server
│   │   ├── graph.ts          # LangGraph orchestration flow
│   │   ├── clients/          # Clientes MCP para agentes
│   │   │   ├── data-agent-mcp-client.ts
│   │   │   └── viz-agent-mcp-client.ts
│   │   ├── llm/              # Capa de abstracción LLM
│   │   │   ├── copilot.ts
│   │   │   └── openrouter.ts
│   │   └── types.ts          # Tipos e interfaces
│   ├── dist/                 # Código compilado
│   ├── package.json
│
├── data-agent/                # Spoke - Obtención de datos
│   ├── src/
│   │   ├── index.ts          # Entry point + MCP server
│   │   ├── graph.ts          # LangGraph data processing
│   │   ├── tools.ts          # Implementación fetchData
│   │   └── llm/              # Abstracción LLM
│   ├── dist/
│   ├── package.json
│
├── visualization-agent/       # Spoke - Generación de gráficos
│   ├── src/
│   │   ├── index.ts          # Entry point + MCP server
│   │   ├── graph.ts          # LangGraph pipeline (Planner→Generator→Saver)
│   │   ├── planner.ts        # LLM para decisión de visualización
│   │   ├── tools.ts          # Herramientas de generación y guardado
│   │   ├── generators/       # Chart providers (Strategy Pattern)
│   │   │   ├── index.ts      # Factory + IChartGenerator interface
│   │   │   └── quickchart.ts # QuickChart implementation
│   │   └── llm/              # Abstracción LLM (Copilot/OpenRouter)
│   ├── dist/
│   ├── package.json
```

---


## 9. Ejemplo de Caso Real

**Prompt de Usuario:**
```
Dame un gráfico de líneas de la energía activa del contador LGZ0011605100 del DC ORM1151800825 de las últimas dos semanas
```

**Flujo de Ejecución Completo:**

```mermaid
sequenceDiagram
    autonumber
    participant User as Usuario
    participant Orch as Orchestrator<br/>(Hub)
    participant DataA as Data Agent<br/>(Spoke)
    participant CTI as CTI API<br/>(Ormazabal)
    participant VizA as Viz Agent<br/>(Spoke)
    participant QC as QuickChart API
    
    %% === FASE 1: RECEPCIÓN Y ANÁLISIS ===
    User->>+Orch: "Dame un gráfico de líneas de la energía activa<br/>del contador LGZ0011605100 del DC ORM1151800825<br/>de las últimas dos semanas"
    
    rect rgb(255, 245, 230)
        Note over Orch: PLANNER NODE<br/> LLM analiza el prompt
        Orch->>Orch: detectChartProvider(prompt)<br/>→ null (usa default: quickchart)
        Orch->>Orch: detectDataProvider(prompt)<br/>→ null (usa default: cti)
        Orch->>Orch: LLM genera plan:<br/>{<br/>  taskType: "visualize_data",<br/>  dataAgentPrompt: "energía activa contador...",<br/>  needsVisualization: true,<br/>  visualizationType: "line_chart"<br/>}
    end
    
    %% === FASE 2: OBTENCIÓN DE DATOS ===
    rect rgb(232, 245, 233)
        Note over Orch: DATA-FETCHER NODE<br/> Obtiene datos vía MCP
        Orch->>+DataA: MCP Call: query_cti_measurements<br/>{<br/>  query: "energía activa contador LGZ0011605100...",<br/>  dataProvider: "cti"<br/>}
        
        Note over DataA: PLANNER NODE<br/> LLM extrae parámetros
        DataA->>DataA: LLM genera CtiPlan:<br/>{<br/>  measurement: "active_energy",<br/>  tagFilter: {<br/>    sensorType: "DC",<br/>    meterId: "LGZ0011605100",<br/>    dcId: "ORM1151800825"<br/>  },<br/>  start: "2026-03-23T08:09:24Z",<br/>  end: "2026-04-06T08:09:24Z"<br/>}
        
        DataA->>DataA: DataProviderFactory<br/>.getProvider("cti")<br/>→ CtiProvider
        
        DataA->>DataA: buildCtiUrl(plan)<br/>→ construye URL completa
        
        Note over DataA: FETCHER NODE<br/> Ejecuta petición HTTP
        DataA->>+CTI: HTTP GET<br/>/api/v2/data/measurements/active_energy<br/>?sensorType=DC<br/>&meterId=LGZ0011605100<br/>&dcId=ORM1151800825<br/>&start=2026-03-23T08:09:24Z<br/>&end=2026-04-06T08:09:24Z
        
        CTI-->>-DataA: 200 OK<br/>JSON: [<br/>  {timestamp, AI, AI_A, AI_B, AI_C, ...},<br/>  {timestamp, AI, AI_A, AI_B, AI_C, ...},<br/>  ... 5618 registros<br/>]
        
        DataA-->>-Orch: MCP Response:<br/>{<br/>  success: true,<br/>  data: [5618 records],<br/>  url: "...",<br/>  plan: {...}<br/>}
    end
    
    %% === FASE 3: VISUALIZACIÓN ===
    rect rgb(243, 229, 245)
        Note over Orch: VISUALIZER NODE<br/> Genera gráfica
        Orch->>+VizA: MCP Call: create_visualization<br/>{<br/>  prompt: "gráfico de líneas...",<br/>  data: [5618 records],<br/>  chartProvider: "quickchart"<br/>}
        
        Note over VizA: PLANNER NODE<br/> LLM decide visualización
        VizA->>VizA: LLM genera VisualizationPlan:<br/>{<br/>  chartType: "line_chart",<br/>  xField: "timestamp",<br/>  yField: ["AI"],<br/>  title: "Energía Activa - LGZ0011605100",<br/>  xLabel: "Tiempo",<br/>  yLabel: "Energía (Wh)"<br/>}
        
        Note over VizA: GENERATOR NODE<br/> Genera gráfica
        VizA->>VizA: ChartGeneratorFactory<br/>.getGenerator("quickchart")<br/>→ QuickChartGenerator
        
        VizA->>VizA: QuickChartGenerator<br/>.sampleData(5618 → 2500)<br/>Excede límite, aplica sampling
        
        VizA->>VizA: QuickChartGenerator<br/>.generate(data, plan, config)<br/>→ construye URL de QuickChart
        
        VizA->>+QC: HTTP GET<br/>https://quickchart.io/chart<br/>?c={<br/>  type: 'line',<br/>  data: {<br/>    labels: [timestamps...],<br/>    datasets: [{<br/>      label: 'AI',<br/>      data: [values...],<br/>      borderColor: '#36a2eb',<br/>      fill: false<br/>    }]<br/>  },<br/>  options: {...}<br/>}
        
        QC-->>-VizA: 200 OK<br/>image/png (95.3 KB)
        
        Note over VizA: SAVER NODE<br/> Guarda en disco
        VizA->>VizA: saveImageTool()<br/>→ output/chart_2026-04-06_083624.png
        
        VizA-->>-Orch: MCP Response:<br/>{<br/>  success: true,<br/>  imagePath: "output/chart_2026-04-06_083624.png",<br/>  imageUrl: "https://quickchart.io/...",<br/>  format: "png",<br/>  metadata: {<br/>    dataPoints: 2500,<br/>    generationTimeMs: 1843<br/>  }<br/>}
    end
    
    %% === FASE 4: RESPUESTA FINAL ===
    rect rgb(225, 245, 254)
        Note over Orch: FORMATTER NODE<br/> Genera respuesta
        Orch->>Orch: Formatea mensaje:<br/>"✓ Gráfica generada exitosamente<br/> Tipo: line_chart<br/> Archivo: output/chart_2026-04-06_083624.png<br/> Datos: 5618 registros (muestreados a 2500)<br/>⏱ Tiempo: 11.4s"
    end
    
    Orch-->>-User: Respuesta final + ruta del archivo
    
    Note over User: Usuario abre:<br/>output/chart_2026-04-06_083624.png
```

**Puntos Clave del Flujo:**

1. **Detección Automática de Providers** (pasos 2-3):
   - `detectChartProvider()` no encuentra keyword → usa default "quickchart"
   - `detectDataProvider()` no encuentra keyword → usa default "cti"

2. **Data Agent - Procesamiento Inteligente** (pasos 6-11):
   - LLM interpreta prompt en lenguaje natural
   - Extrae: measurement, sensorType, meterId, dcId, fechas
   - Factory selecciona CtiProvider
   - Construye URL estructurada para CTI API
   - Recibe 5618 registros de energía activa

3. **Viz Agent - Generación con Límites** (pasos 14-21):
   - LLM decide: line_chart (por "gráfico de líneas" en prompt)
   - Factory selecciona QuickChartGenerator
   - **Sampling automático**: 5618 → 2500 puntos (límite de QuickChart)
   - Genera URL, descarga PNG, guarda en disco

4. **Tiempo Total**: ~11.4 segundos
   - Data fetch: ~8.5s
   - Visualization: ~1.8s
   - Overhead (LLM, MCP): ~1.1s

5. **Formato de Salida**: PNG de 95.3 KB con 2500 puntos de datos

---
