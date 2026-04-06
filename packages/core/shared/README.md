# @openagents/shared

Paquete compartido que contiene código común reutilizado por todos los agentes en OpenAgents.

## 📦 Contenido

### LLM (Large Language Model)

Abstracciones y proveedores para interactuar con modelos de lenguaje:

- **Factory Pattern**: `LLMFactory` para crear instancias de proveedores
- **Interfaces**: `LLMProvider`, `StreamArgs`, `StreamResponse`, `ProviderConfig`
- **Proveedores**:
  - `OpenRouterProvider`: Cliente para OpenRouter API
  - `CopilotProvider`: Cliente para GitHub Copilot SDK

```typescript
import { getLLMProvider, streamStructuredPlan } from '@openagents/shared/llm';

// Uso directo
const provider = await getLLMProvider();
const response = await provider.streamStructuredPlan({
  systemPrompt: "You are a helpful assistant",
  userPrompt: "Generate a plan",
});

// Uso con helper
const result = await streamStructuredPlan({
  systemPrompt: "You are a helpful assistant",
  userPrompt: "Generate a plan",
});
```

### Utils (Utilidades)

Funciones de utilidad comunes:

- **`safeJsonParse<T>(text: string): T`**: Parse JSON con soporte para markdown code blocks y texto explicativo
- **`getTimeRFC3339(): string`**: Obtener timestamp actual en formato ISO 8601
- **`deepNullToUndefined(value: any): any`**: Convertir recursivamente `null` a `undefined`

```typescript
import { safeJsonParse, getTimeRFC3339, deepNullToUndefined } from '@openagents/shared/utils';

// Parse JSON robusto
const data = safeJsonParse('```json\n{"key": "value"}\n```');

// Timestamp
const timestamp = getTimeRFC3339(); // "2026-04-06T10:00:00.000Z"

// Normalizar null
const normalized = deepNullToUndefined({ a: null, b: { c: null } }); // { b: {} }
```

## 🚀 Instalación

Este paquete se instala automáticamente como dependencia local en los agentes:

```json
{
  "dependencies": {
    "@openagents/shared": "file:../shared"
  }
}
```

## 🔧 Desarrollo

```bash
# Instalar dependencias
npm install

# Compilar
npm run build

# Desarrollo con watch mode
npm run dev
```

## 📁 Estructura

```
shared/
├── src/
│   ├── llm/
│   │   ├── factory.ts              # LLMFactory y helpers
│   │   ├── provider.interface.ts   # Interfaces comunes
│   │   ├── providers/
│   │   │   ├── openrouter.ts       # OpenRouter provider
│   │   │   └── copilot.ts          # Copilot provider
│   │   └── index.ts                # Exports
│   ├── utils/
│   │   ├── json.ts                 # safeJsonParse
│   │   ├── time.ts                 # getTimeRFC3339
│   │   ├── data.ts                 # deepNullToUndefined
│   │   └── index.ts                # Exports
│   └── index.ts                    # Main exports
├── dist/                           # Compiled output
├── package.json
└── tsconfig.json
```

## 🎯 Beneficios

### Eliminación de Duplicación
- **~800 líneas duplicadas eliminadas** entre los 3 agentes
- Código LLM 100% idéntico ahora centralizado
- Utilidades comunes en un solo lugar

### Mantenimiento
- **Un solo lugar** para actualizar proveedores LLM
- **Consistencia** garantizada entre agentes
- **Testing** centralizado de lógica común

### Extensibilidad
- **Fácil agregar** nuevos proveedores LLM
- **Reutilizable** para futuros agentes
- **Versionable** independientemente

## 🔄 Migración

Los siguientes archivos fueron consolidados desde los 3 agentes:

### Eliminados de data-agent, orchestrator, viz-agent:
- ❌ `src/llm-flexible.ts` (110 líneas c/u)
- ❌ `src/llm-provider.ts` (56 líneas c/u)
- ❌ `src/providers/openrouter.ts` (100+ líneas c/u)
- ❌ `src/providers/copilot.ts` (100+ líneas c/u)

### Parcialmente eliminados:
- ⚠️ `src/graph.ts`: `safeJsonParse()` y `deepNullToUndefined()` movidos a shared
- ⚠️ `src/utils.ts`: `getTimeRFC3339()` movido a shared (orchestrator)
- ⚠️ `src/planner.ts`: `safeJsonParse()` eliminado (viz-agent)

## 📝 Changelog

### v0.1.0 (2026-04-06)

**Fase 1 de Refactorización - Consolidación LLM y Utilidades**

- ✅ Creado paquete `@openagents/shared`
- ✅ Movido sistema completo de LLM Factory
- ✅ Movido OpenRouterProvider y CopilotProvider
- ✅ Creadas utilidades compartidas (json, time, data)
- ✅ Actualizado data-agent para usar shared
- ✅ Actualizado orchestrator para usar shared
- ✅ Actualizado viz-agent para usar shared
- ✅ Todos los agentes compilan correctamente
- ✅ Documentación completa

**Métricas:**
- 📉 **~800 líneas** de código duplicado eliminadas
- 📦 **10 archivos** consolidados
- ✅ **4 paquetes** compilan sin errores
- 🎯 **100%** compatibilidad mantenida

## 🔮 Próximos Pasos (Fase 2+)

- [ ] Crear abstracciones para MCP Clients (BaseMCPClient)
- [ ] Implementar IStorageProvider (local, S3, Azure)
- [ ] Añadir interfaces comunes (AgentResponse, BaseGraphState)
- [ ] Crear ConfigurationManager centralizado
- [ ] Extraer patrones comunes de error handling

---

**Nota**: Este paquete es parte de la refactorización incremental del proyecto OpenAgents. Ver `PLAN_REFACTORIZACION.md` para el plan completo.
