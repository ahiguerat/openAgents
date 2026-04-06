# Data Agent

## Descripción

El Data Agent es un agente especializado en la obtención de datos de mediciones eléctricas desde la API CTI (Ormazabal). Actúa como interfaz inteligente entre solicitudes en lenguaje natural y consultas estructuradas a la API, utilizando un LLM para interpretar las peticiones y generar las llamadas apropiadas.

## Arquitectura

El agente utiliza LangGraph para coordinar un flujo de trabajo de dos nodos:

```
User Query (natural language)
         |
         v
    [PLANNER]
    - Analiza el prompt con LLM
    - Identifica measurement type
    - Extrae filtros (sensor, fechas, campos)
    - Genera plan estructurado
         |
         v
    [FETCHER]
    - Construye URL de API
    - Ejecuta petición HTTP
    - Procesa respuesta
    - Maneja reintentos si hay errores
         |
         v
    Structured Data (JSON)
```

## Componentes

### 1. MCP Server (`src/mcp-server.ts`)

Punto de entrada del agente. Expone el tool `query_cti_measurements` vía Model Context Protocol (MCP).

**Interfaz:**
- Input: Prompt en lenguaje natural
- Output: JSON con datos estructurados de la API

### 2. Graph (`src/graph.ts`)

Orquestador basado en LangGraph que coordina el flujo:

**Nodos:**
- `plannerNode`: Interpreta el prompt y genera plan de consulta
- `fetcherNode`: Ejecuta la petición HTTP a la API CTI

**Estado compartido:**
- `userPrompt`: Query original del usuario
- `rawModelOutput`: Respuesta raw del LLM
- `parsedPlan`: Plan estructurado validado
- `finalUrl`: URL construida para la API
- `apiResponse`: Datos obtenidos de la API
- `error`: Mensaje de error si ocurre

### 3. Planner (`src/prompts.ts`)

Sistema de prompts para el LLM que define:
- Measurements disponibles (voltage, current, temperature, etc.)
- Sensor types (TR, DC, TSC, LBT#)
- Field filters por measurement
- Reglas de construcción de queries

### 4. API Client (`src/graph.ts` - fetcherNode)

Cliente HTTP con:
- Construcción de URLs con parámetros correctos
- Manejo de filtros (sensorType, meterId, dcId, cimId)
- Retry logic para errores transitorios
- Parsing de respuestas JSON y CSV

### 5. Schema Validator (`src/cti-schema.ts`)

Define y valida:
- Measurements permitidos
- Field filters por measurement
- Sensor types válidos
- Estructura del plan de consulta

### 6. LLM Abstraction (`src/llm-flexible.ts`)

Capa de abstracción para providers LLM:
- Soporta GitHub Copilot SDK
- Soporta OpenRouter
- Configuración vía variables de entorno

## Flujo de Ejecución

### Ejemplo: "Dame el voltaje del contador LGZ0011605102 de los últimos 7 días"

1. **Recepción del prompt**
   ```
   MCP Server recibe: { prompt: "Dame el voltaje del contador LGZ0011605102..." }
   ```

2. **Planner analiza con LLM**
   ```json
   {
     "measurement": "voltage",
     "tagFilter": {
       "sensorType": "DC",
       "meterId": "LGZ0011605102"
     },
     "start": "2026-03-23T00:00:00Z",
     "end": "2026-03-30T00:00:00Z"
   }
   ```

3. **Fetcher construye URL**
   ```
   GET http://IP:PORT/api/v2/data/measurements/voltage
     ?sensorType=DC
     &meterId=LGZ0011605102
     &start=2026-03-23T00:00:00Z
     &end=2026-03-30T00:00:00Z
   ```

4. **API responde con datos**
   ```json
   [
     {
       "time": "2026-03-29T19:33:28Z",
       "field": "V_A",
       "value": "235",
       "meterId": "LGZ0011605102",
       "sensorType": "DC"
     },
     ...
   ]
   ```

5. **Retorno al caller**
   ```json
   {
     "success": true,
     "apiResponse": [...],
     "plan": {...}
   }
   ```

## Configuración

### Variables de Entorno (.env)

```env
# LLM Provider
LLM_PROVIDER=copilot|openrouter
COPILOT_MODEL=claude-sonnet-4.5
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=nvidia/nemotron-3-nano-30b-a3b:free

# API CTI
CTI_API_BASE_URL=http://192.168.45.18:2022
```

## API CTI - Parámetros

### Measurements Soportados

- `voltage`: Tensión eléctrica por fase
- `current`: Corriente eléctrica por fase
- `active_power`: Potencia activa
- `reactive_power`: Potencia reactiva
- `active_energy`: Energía activa acumulada
- `reactive_energy`: Energía reactiva acumulada
- `temperature`: Temperatura interna
- `pressure`: Presión del aceite
- `level`: Nivel de aceite
- `tap_position`: Posición del tap
- `maneuvers`: Número de maniobras
- `meter_event`: Eventos del contador

### Filtros (tagFilter)

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `sensorType` | Tipo de sensor | TR, DC, TSC, LBT1-5 |
| `meterId` | ID del contador | LGZ0011605102 |
| `dcId` | ID del concentrador | ORM1151800825 |
| `cimId` | ID CIM/CGMES | c663f140-0ebc-... |

### Parámetros Temporales

| Parámetro | Formato | Descripción |
|-----------|---------|-------------|
| `start` | RFC3339 | Fecha inicio |
| `end` | RFC3339 | Fecha fin |
| `interval` | Número | Minutos entre muestras |
| `sampling` | min/max/mean | Tipo de muestreo |
| `limit` | Número | Máximo registros |

## Uso

### Como MCP Server

```bash
npm run build
npm run mcp
```

### Como módulo

```typescript
import { buildGraph } from './graph.js';

const graph = buildGraph();
const result = await graph.invoke({
  userPrompt: "Dame el voltaje del contador LGZ0011605102",
  plan: null,
  dataAgentResponse: null,
  finalMessage: "",
  error: null,
});

console.log(result.apiResponse);
```

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP SERVER                             │
│  (Interfaz externa vía Model Context Protocol)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Tool: query_cti_measurements
                       │ Input: { prompt: string }
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    LANGGRAPH                                │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                │
│  │   PLANNER    │────────>│   FETCHER    │                │
│  │              │         │              │                │
│  │ - Parse NL   │         │ - Build URL  │                │
│  │ - Call LLM   │         │ - HTTP GET   │                │
│  │ - Validate   │         │ - Parse JSON │                │
│  │ - Extract    │         │ - Retry      │                │
│  └──────────────┘         └──────────────┘                │
│         │                        │                         │
│         v                        v                         │
│    CtiPlan (validated)    API Response (JSON)             │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ Output: { success, apiResponse, plan }
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    API CTI                                  │
│  http://192.168.45.18:2022/api/v2/data/measurements/{type}  │
│                                                             │
│  Returns: Array of measurement objects                     │
└─────────────────────────────────────────────────────────────┘
```

## Estructura de Directorios

```
data-agent/
├── src/
│   ├── mcp-server.ts      # Punto de entrada MCP
│   ├── graph.ts           # LangGraph orchestrator
│   ├── prompts.ts         # Sistema de prompts LLM
│   ├── cti-schema.ts      # Definiciones y validaciones
│   ├── llm-flexible.ts    # Abstracción LLM
│   ├── llm-provider.ts    # Copilot SDK provider
│   ├── utils.ts           # Utilidades
│   └── providers/
│       ├── copilot.ts     # GitHub Copilot integration
│       └── openrouter.ts  # OpenRouter integration
├── dist/                  # Código compilado
├── .env                   # Variables de entorno
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencias Principales

- `@langchain/langgraph`: Orquestación de flujo
- `@langchain/core`: Primitivos de LangChain
- `@modelcontextprotocol/sdk`: Protocolo MCP
- `@github/copilot-sdk`: GitHub Copilot integration
- `axios`: Cliente HTTP
- `zod`: Validación de schemas

## Desarrollo

### Build

```bash
npm run build
```

### Ejecutar como MCP Server

```bash
npm run mcp
```

### Ejecutar en desarrollo (con tsx)

```bash
npm run dev
```

## Manejo de Errores

El agente implementa varios niveles de manejo de errores:

1. **Validación del plan**: Si el LLM genera un plan inválido, se rechaza
2. **Retry HTTP**: Si la API retorna error, intenta con configuración mínima
3. **Timeout**: Peticiones HTTP con timeout de 30 segundos
4. **Parsing robusto**: Maneja respuestas JSON y CSV
5. **Error propagation**: Errores se propagan con mensajes descriptivos

## Limitaciones

- Requiere conectividad con la API CTI
- Depende de LLM para interpretación (puede fallar con prompts ambiguos)
- Límite de 5000 registros por consulta (configurable en API)
- No cachea resultados (todas las consultas golpean la API)


