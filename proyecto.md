# Proyecto: openAgents MVP

## 1. Objetivo

Construir un MVP funcional de la plataforma openAgents que valide el flujo completo:

```
Usuario (CLI) → Orchestrator (LLM) → Agent Runtime → Tool Gateway → resultado
```

El MVP demuestra que la arquitectura funciona end-to-end: el Orchestrator razona,
crea un agente especializado, ese agente ejecuta tools reales y el resultado vuelve
al usuario de forma trazable.

---

## 2. Stack técnico

| Elemento | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript | Ya definido en el proyecto |
| Runtime | Bun | Más rápido, TS nativo, sin config extra |
| LLM | Anthropic SDK + OpenRouter | 1 API key, todos los modelos |
| Modelo | `anthropic/claude-sonnet-4-5` | Equilibrio calidad/coste |
| API | Hono | Ligero, TS nativo, funciona con Bun |
| Validación | AJV | Para los JSON Schemas existentes |
| Logging | Pino | Estructurado, rápido, `task_id` + `trace_id` |
| Interfaz usuario | CLI (readline) | Rápida de implementar para MVP |
| Framework agente | Ninguno | El loop es ~30 líneas, lo construimos nosotros |
| Docker | No en MVP | Se añade en fase de hardening |
| Monorepo | Bun workspaces | Sin herramienta extra |

---

## 3. Dentro / fuera del MVP

### ✅ Dentro
- Orchestrator LLM que razona y crea un agente
- Agent Runtime con loop de tool use nativo
- Tool Gateway con `filesystem.read` y `filesystem.write`
- API: `submit_task`, `get_task_status`, `get_task_result`, `resume_task`
- Una skill de ejemplo cargada por el Agent Runtime
- CLI para interactuar con el Orchestrator
- Logging estructurado con `task_id` + `trace_id`
- Estado de tareas en memoria (in-process)

### ❌ Fuera (post-MVP)
- Message Bus real (inter-agente)
- Memory Service (short/long-term)
- RAG
- Agentes adicionales (planner, coder, reviewer como entidades separadas)
- Activity / Trigger / proactividad
- Docker / despliegue
- Persistencia de tareas (base de datos)
- Autenticación

---

## 4. Bloques de desarrollo

### Bloque 0 — Setup del proyecto
**Objetivo**: proyecto TypeScript funcional con Bun listo para desarrollar.

Tareas:
- Inicializar `package.json` con Bun workspaces
- Configurar `tsconfig.json` (strict, paths)
- Instalar dependencias: `@anthropic-ai/sdk`, `hono`, `pino`, `ajv`
- Configurar variables de entorno (`.env` con `OPENROUTER_API_KEY`)
- Script de dev: `bun run dev`

**DoD**: `bun run dev` arranca sin errores.

---

### Bloque 1 — LLM Client
**Objetivo**: módulo reutilizable para llamar a Claude vía OpenRouter.

Ubicación: `platform/llm-client/`

Tareas:
- Cliente Anthropic apuntando a `https://openrouter.ai/api/v1`
- Función `createLLMClient(apiKey)` → cliente configurado
- Tipado correcto de mensajes (`MessageParam[]`)
- Manejo básico de errores (rate limit, timeout)

> **Nota — SDK y abstracción**
>
> El SDK de Anthropic (`@anthropic-ai/sdk`) apuntado a OpenRouter funciona correctamente para modelos de Anthropic (`anthropic/claude-*`). Para modelos de otros proveedores (Llama, GPT-4o, Gemini…) se necesitaría el SDK de OpenAI, ya que OpenRouter no traduce entre formatos.
>
> Para el MVP esto es suficiente. Sin embargo, el módulo debe exponer su **propia interfaz** (`LLMClient`, `LLMResponse`) de forma que el resto del sistema nunca importe el SDK directamente. Si en fases posteriores se quiere flexibilidad de modelos, el cambio queda acotado a este módulo:
>
> ```typescript
> interface LLMClient {
>   chat(params: {
>     system: string
>     messages: ChatMessage[]
>     tools: ToolSpec[]
>   }): Promise<LLMResponse>
> }
>
> interface LLMResponse {
>   stopReason: "tool_use" | "end_turn"
>   text: string | null
>   toolCalls: ToolCall[]
> }
> ```

**DoD**: test manual que envía un mensaje y recibe respuesta de texto.

---

### Bloque 2 — Tool Gateway completo
**Objetivo**: Tool Gateway capaz de registrar y ejecutar tools reales con validación.

Ubicación: `platform/tool-gateway/` (ya existe parcialmente)

Tareas:
- Completar validación I/O contra JSON Schema (con AJV)
- Implementar `filesystem.read` como `IToolAdapter`
- Implementar `filesystem.write` como `IToolAdapter`
- Logging de cada invocación (`tool_name`, `input`, `output`, `task_id`)

API resultante:
```typescript
toolGateway.register(adapter: IToolAdapter): void
toolGateway.invoke(name: string, input: unknown, taskId: string): Promise<ToolResult>
toolGateway.getToolSpecs(): ToolSpec[]   // para pasarlas al LLM
```

**DoD**: `filesystem.read` y `filesystem.write` funcionan y rechazan input inválido.

> **Nota — Módulo MCP (adelantado, inactivo en MVP)**
>
> Durante la implementación del Bloque 2 se añadió `platform/tool-gateway/mcp/` con una abstracción para conectar servidores MCP externos (`IMcpClient`, `StubMcpClient`, `McpToolAdapter`, `registerMcpTools`). Este código no se usa en el MVP — el `StubMcpClient` es un stub que no realiza ninguna llamada real. Queda disponible para fases post-MVP cuando se quiera integrar tools externas vía protocolo MCP.

---

### Bloque 3 — Agent Runtime + Skill
**Objetivo**: motor que ejecuta un agente LLM con tools y skills.

Ubicación: `platform/runtime/`

Tareas:
- Loop de tool use (~30 líneas):
  ```
  while (stop_reason !== "end_turn"):
    llamar LLM con mensajes + tools
    si hay tool_calls → ejecutar via Tool Gateway → añadir resultados
  ```
- `SkillLoader`: lee `SKILL.md` del directorio de la skill y lo inyecta como system prompt adicional
- Construcción del contexto inicial: task goal + system prompt + skill activa
- Devuelve `AgentResult` al terminar

Skill de ejemplo: `skills/general-assistant/`
```
skills/general-assistant/
├── SKILL.md        ← instrucciones inyectadas en el system prompt
└── skill.json      ← manifest (name, version, triggers)
```

**DoD**: Agent Runtime ejecuta una tarea con filesystem tools y devuelve un resultado coherente.

---

### Bloque 4 — Orchestrator + API
**Objetivo**: Orchestrator LLM + endpoints REST para interactuar con el sistema.

Ubicación: `platform/orchestrator/`

Tareas:
- Estado de tareas en memoria: `Map<task_id, Task>`
- Ciclo de vida: `pending → running → completed | failed | blocked`
- Lógica LLM del Orchestrator: razona sobre el goal y decide crear un agente
- Delega en Agent Runtime con la skill y tools adecuadas
- Human-in-the-loop: si el Orchestrator necesita input, marca `blocked`
- Endpoints con Hono:

```
POST /tasks                     → { task_id }
GET  /tasks/:id/status          → { status, created_at, updated_at }
GET  /tasks/:id/result          → AgentResult
POST /tasks/:id/resume          → { input } → continúa tarea blocked
```

- Logging de cada cambio de estado con `task_id` + `trace_id`

**DoD**: `POST /tasks` con un goal devuelve `task_id`; el resultado es recuperable en `GET /tasks/:id/result`.

> **Nota — Selección de skill/agente simplificada en MVP**
>
> El proyecto describe que el Orchestrator "decide crear un agente y le delega con la skill y tools adecuadas". En la implementación del MVP el Orchestrator siempre delega en el `AgentRuntime` con la skill `general-assistant`, ya que es la única disponible. No hay lógica de selección entre múltiples agentes o skills. Esto es correcto para el scope del MVP — la selección dinámica de agentes se aborda en la Fase 2 del roadmap (Agentes especializados).

> **Nota — `@openagents/observability` pendiente de usar**
>
> El `package.json` del orchestrator declara `@openagents/observability` como dependencia, pero el módulo aún está vacío y no se usa. El logging del Bloque 4 se implementó con un `ConsoleLogger` propio. En fases posteriores, cuando `platform/observability/` tenga implementación real (pino, métricas, trazas), el `ConsoleLogger` se sustituirá por él.

---

### Bloque 5 — CLI
**Objetivo**: interfaz de línea de comandos para interactuar con el Orchestrator.

Ubicación: `cli/`

Tareas:
- Comando interactivo: pide goal al usuario, muestra estado en tiempo real, imprime resultado
- Polling a `GET /tasks/:id/status` hasta `completed | failed | blocked`
- Si `blocked`: muestra la pregunta del Orchestrator, recoge input, llama `resume_task`
- Formato legible en terminal (sin librerías extra, solo `console.log`)

Uso:
```bash
bun run cli
> ¿Qué quieres hacer? Lee el archivo README.md y resúmelo
> [running] Orchestrator procesando...
> [completed] El README describe un sistema de agentes...
```

**DoD**: flujo completo funciona desde el terminal sin tocar el API directamente.

> **Nota — URL del Orchestrator configurable**
>
> La CLI lee la URL del Orchestrator de `process.env.ORCHESTRATOR_URL`, con fallback a `http://localhost:3000`. Para apuntar a un servidor remoto o en otro puerto basta con exportar la variable antes de ejecutar: `ORCHESTRATOR_URL=http://localhost:3001 bun run cli`.

---

### Bloque 6 — Integración E2E
**Objetivo**: validar que todo el sistema funciona de principio a fin.

Tareas:
- Test de integración: CLI → Orchestrator → Agent Runtime → filesystem tools → resultado
- Verificar que los logs incluyen `task_id` y `trace_id` en cada paso
- Verificar que `filesystem.read` rechaza paths fuera del sandbox
- Verificar que un goal ambiguo desencadena el flujo `blocked` → `resume`

**DoD**: el test E2E pasa y los logs son legibles y trazables.

---

## 5. Estructura de carpetas objetivo (post-MVP)

```
.
├── platform/
│   ├── llm-client/         # Bloque 1 — cliente Anthropic/OpenRouter
│   ├── runtime/            # Bloque 3 — Agent Runtime + SkillLoader
│   ├── orchestrator/       # Bloque 4 — Orchestrator LLM + API Hono
│   ├── tool-gateway/       # Bloque 2 — Tool Gateway (ya existe parcialmente)
│   ├── message-bus/        # (vacío en MVP)
│   └── observability/      # (logging básico en MVP)
├── agents/
│   ├── planner/            # (vacío en MVP)
│   ├── coder/              # (vacío en MVP)
│   └── reviewer/           # (vacío en MVP)
├── skills/
│   └── general-assistant/  # Bloque 3 — primera skill
├── schemas/                # Ya completo
├── cli/                    # Bloque 5 — interfaz CLI
├── docs/
├── .env                    # OPENROUTER_API_KEY
├── package.json
├── tsconfig.json
└── bunfig.toml
```

---

## 6. Definición de Done del MVP

- [ ] Una tarea recorre CLI → Orchestrator → Agent Runtime → Tool Gateway → resultado visible
- [ ] El Orchestrator crea un agente y le delega la ejecución (no ejecuta directamente)
- [ ] `filesystem.read` y `filesystem.write` funcionan y validan I/O contra schema
- [ ] Una skill se carga y su contenido aparece en el system prompt del agente
- [ ] Todos los logs incluyen `task_id` y `trace_id`
- [ ] El flujo `blocked` / `resume_task` funciona desde la CLI
- [ ] Test E2E pasa de principio a fin

---

## 7. Roadmap post-MVP

### Fase 2 — Agentes especializados
- Implementar `planner`, `coder`, `reviewer` como agentes reales
- Orchestrator selecciona agente según tipo de tarea
- Inter-agente básico vía Message Bus in-process

### Fase 3 — Memory y persistencia
- Short-term memory por `task_id`
- Persistencia de tareas (SQLite o Postgres)
- Long-term memory básico

### Fase 4 — Activities y proactividad
- Trigger por cron y por evento del Message Bus
- `scheduled` y `continuous` Activities

### Fase 5 — Hardening
- Docker + despliegue
- Observabilidad completa (métricas, trazas)
- RAG sobre memoria larga
- Seguridad: sandbox de filesystem, ACLs por agente
