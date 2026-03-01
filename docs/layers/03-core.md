# 3. Capa Core (El Corazón de la Ejecución)

## Propósito

La capa Core es el runtime de la plataforma. Aquí los agentes razonan, ejecutan acciones, persisten estado y se comunican. Orquesta el ciclo de vida de tareas, gestiona memoria, aísla ejecución de código, y proporciona canales de comunicación entre componentes.

Es el corazón que transforma definiciones (capa 2) en resultados tangibles.

## Componentes

### Execution Engine (basado en LangGraph)

- **Responsabilidad**: Ejecutar los grafos de estado que representan agentes y flujos. Gestiona el ciclo cognitivo de cada agente (reason → tool → reason), el checkpointing de estado, y la recuperación ante fallos.
- **Interfaces expuestas**:
  - `execute(graph, initial_state, config)` → resultado + estado final
  - `resume(thread_id, new_input)` → continúa ejecución desde checkpoint
  - Streaming de eventos de ejecución (tool calls, decisiones, resultados parciales)
- **Interfaces consumidas**: Tool Gateway, Memory Service, LLM Client (capa 5)
- **Tecnologías**: LangGraph como runtime de grafos de estado

#### El ciclo cognitivo como grafo

Cada agente se ejecuta como un grafo LangGraph. El patrón base:

```
                    ┌──────────────┐
                    │   reason     │ ← LLM razona sobre qué hacer
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  should_act? │ ← Decisión condicional
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │exec_tool │ │  human   │ │   END    │
        └────┬─────┘ │  input   │ └──────────┘
             │       └──────────┘
             └──→ reason (loop)
```

- **reason**: Nodo que invoca al LLM con el contexto actual (messages, memoria, tools disponibles)
- **should_act**: Edge condicional — si el LLM pidió ejecutar un tool → `exec_tool`; si necesita input humano → `human_input`; si terminó → `END`
- **exec_tool**: Ejecuta la herramienta via Tool Gateway, añade resultado al state
- **human_input**: Persiste estado (checkpoint) y espera input del usuario

El loop `reason → exec_tool → reason` es el **tool use nativo** del LLM. LangGraph gestiona la infraestructura (state, persistencia, streaming); el LLM decide cuándo usar tools y cuándo terminar.

#### Checkpointing y human-in-the-loop

LangGraph persiste el estado del grafo en cada paso (checkpointer). Esto habilita:
- **Human-in-the-loop**: El grafo pausa en un nodo específico, se persiste el estado, y se reanuda cuando el usuario responde. No hay polling ni estados "blocked" manuales — es nativo.
- **Recuperación ante fallos**: Si el proceso muere, se retoma desde el último checkpoint.
- **Ejecuciones de larga duración**: Un flujo puede durar horas o días con pasos intermedios.

#### Orquestación multi-agente

Para flujos con múltiples agentes, el Execution Engine compila el Flow (capa 2) a un **grafo supervisor**:

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  planner   │ ──→ │   coder    │ ──→ │  reviewer  │
│  (subgrafo)│     │  (subgrafo)│     │  (subgrafo)│
└────────────┘     └────────────┘     └────────────┘
```

Cada agente es un subgrafo con su propio ciclo cognitivo. El grafo supervisor coordina la secuencia, pasa resultados entre agentes, y maneja condiciones y errores.

### Memory Service

- **Responsabilidad**: Persistencia y recuperación de conocimiento. Diseño propio de la plataforma (no delegado al framework). Dos capas: short-term (estado de tarea con TTL) y long-term (persistente entre tareas). Incluye pipeline RAG para enriquecimiento de contexto.
- **Interfaces expuestas**:
  - `append(scope, task_id, content)` — Escribir hito en corto plazo
  - `retrieve(query, agent_role, filters)` → fragmentos relevantes (RAG)
  - `promote(task_id)` — Seleccionar candidatos de corto a largo plazo
  - `summarize(task_id)` — Resumen de sesión
  - `forget(memory_id)` — Derecho al borrado
- **Interfaces consumidas**: Vector Store, Persistence DB, Embedding Service
- **Tecnologías**: Redis (short-term), PostgreSQL (long-term), pgvector o similar (vector store)

#### ¿Por qué memoria propia y no la de un framework?

La memoria es un componente crítico de la plataforma que necesita:
- **Multi-tenancy**: Aislamiento por workspace/proyecto
- **Gobernanza**: Políticas de retención, derecho al borrado, auditoría
- **Backends configurables**: Distintos usuarios pueden necesitar distintos stores
- **Integración transversal**: Observabilidad y Trust necesitan instrumentar la memoria

Frameworks como CrewAI acoplan la memoria a sus propios backends (ChromaDB, SQLite). Para una PaaS, eso es inaceptable.

#### Short-term Memory

- **Scope**: Por `task_id`
- **TTL**: Automático al cerrar tarea (default 24h)
- **Contenido**: Hitos de ejecución, tool outputs, decisiones intermedias
- **Operaciones**: `append`, `read_recent`, `clear`
- **Ejemplo**:
  ```json
  {
    "task_id": "task-123",
    "entries": [
      {"timestamp": "...", "agent": "planner", "action": "read_spec", "result": "spec.md contiene..."},
      {"timestamp": "...", "agent": "planner", "action": "create_plan", "result": "5 pasos identificados"}
    ]
  }
  ```

#### Long-term Memory

- **Scope**: Persistente entre tareas, aislada por proyecto/workspace
- **Contenido**: Hechos, patrones, decisiones arquitectónicas, preferencias del usuario
- **Operaciones**: `upsert_fact`, `search` (semántico + filtros), `forget`

#### Pipeline RAG

1. **Ingesta**: Al promover de corto a largo plazo — normalizar, limpiar, segmentar
2. **Embeddings**: Vector por fragmento (embedding model configurable)
3. **Indexación**: Vector store con filtros (project, agent_role, tags, fecha)
4. **Recuperación**: Query semántica + filtros → top-k fragmentos
5. **Post-procesado**: Deduplicación, re-ranking, compresión de contexto
6. **Inyección**: Adjuntar al contexto del agente como conocimiento relevante

#### Fases de implementación

- **Fase 1 (MVP)**: Short-term in-memory (Map por task_id). Sin RAG.
- **Fase 2**: Short-term en Redis. Long-term en PostgreSQL sin embeddings.
- **Fase 3**: RAG completo con vector store.
- **Fase 4**: Gobernanza, políticas de retención, auditoría de accesos.

### Code Sandbox

- **Responsabilidad**: Ejecutar código de agentes y tools en ambiente aislado. Prevenir acceso no autorizado a filesystem, red, y recursos del sistema.
- **Interfaces expuestas**:
  - `execute_isolated(code, capabilities, timeout)` → resultado | error
  - Capabilities: `fs:read`, `fs:write`, `network:external`, `memory:write`
- **Interfaces consumidas**: Tool Gateway, Orchestrator (policies desde capa 7)
- **Tecnologías candidatas**: Docker, gVisor, Firecracker (microVMs), systemd-nspawn

#### Modelo de aislamiento

Cada ejecución corre con:
- **Permisos mínimos**: Solo capabilities necesarias
- **Filesystem**: Directorio temporal `/tmp/task-{task_id}`, allowlist de paths
- **Red**: Bloqueada por defecto; allowlist de endpoints
- **Recursos**: Límites de CPU, memoria, tiempo de ejecución
- **Sin persistencia**: El sandbox se destruye al completar

#### MVP

Sandbox básico: validación de paths contra allowlist + timeout de 30s. Sin contenedor real. Hardening en fases posteriores.

### Event Bus

- **Responsabilidad**: Comunicación interna asincrónica entre componentes. Pub/sub para eventos de dominio y request/reply para coordinación puntual.
- **Interfaces expuestas**:
  - `publish(event_type, data)` — Publicar evento
  - `subscribe(event_type, handler)` — Suscribirse
  - `request(target, message)` → reply
- **Interfaces consumidas**: Todos los componentes internos
- **Tecnologías**: In-process EventEmitter (MVP), Redis Pub/Sub (Fase 2), Kafka (Fase 3)

#### Tipos de eventos

- `task.*` — task.created, task.started, task.blocked, task.completed, task.failed
- `agent.*` — agent.started, agent.tool_called, agent.completed, agent.error
- `tool.*` — tool.invoked, tool.success, tool.failed
- `memory.*` — memory.appended, memory.promoted, memory.retrieved

#### Escalabilidad

- **MVP**: In-process EventEmitter (sin persistencia, sin garantías)
- **Fase 2**: Redis Pub/Sub para múltiples instancias
- **Fase 3**: Kafka para garantías de entrega y replay de eventos

## Decisiones técnicas

### LangGraph como Execution Engine, no como arquitectura

LangGraph resuelve la ejecución de grafos de estado. El Core es más que eso: incluye Memory Service (propio), Code Sandbox (propio), y Event Bus (propio). LangGraph es un componente del Execution Engine, no reemplaza al Core.

### Orchestrator como grafo supervisor

No existe un "Orchestrator" como componente separado con su propio proceso. La orquestación es un grafo LangGraph más — uno que coordina subgrafos (agentes). Ventaja: mismo modelo mental, misma infraestructura de checkpointing, misma observabilidad.

### Checkpointing como fundamento de human-in-the-loop

El patrón de human-in-the-loop no se implementa con estados "blocked" y polling. Se implementa con checkpointing nativo de LangGraph: el grafo pausa, persiste estado, y se reanuda con `resume(thread_id, input)`. Esto es más robusto, más simple, y escala a ejecuciones de larga duración.

### Tool use nativo del LLM

El loop cognitivo no es un loop manual. El LLM decide cuándo usar tools y cuándo terminar. LangGraph gestiona la infraestructura alrededor (state, checkpointing, streaming). La plataforma controla qué tools están disponibles, valida I/O, y audita invocaciones.

## Alcance MVP

**En scope:**
- Execution Engine con LangGraph: grafo básico (reason → tool → reason → END)
- Checkpointing para human-in-the-loop (resume desde checkpoint)
- Memory Service short-term in-memory (Map por task_id)
- Code Sandbox básico: validación de paths + timeout
- Event Bus in-process (EventEmitter)
- Un agente ejemplo: `general-assistant` con tools de filesystem
- Task lifecycle: created → running → completed | failed (+ pausa via checkpoint)
- Logging con trace_id y task_id

**Fuera de scope:**
- Long-term memory y RAG
- Docker/gVisor sandbox real
- Event Bus distribuido
- Orquestación multi-agente (un solo agente en MVP)
- Streaming de resultados parciales al usuario
- Activities y Triggers (proactividad)
- Persistencia de tareas en BD (in-memory state)

## Preguntas abiertas

1. **¿Checkpointer del MVP?** LangGraph necesita un checkpointer. ¿In-memory (MemorySaver) para MVP, o SQLite desde el principio?

2. **¿Concurrencia de tareas?** MVP ejecuta una tarea a la vez. ¿Cuándo y cómo paralelizar?

3. **¿Timeout global?** Si un grafo entra en loop, ¿cuántas iteraciones máximo? Propuesta: 50 iteraciones o 5 minutos, lo que ocurra primero.

4. **¿Cómo se detecta un loop infinito?** Límite de iteraciones + detección de tool calls repetitivos con mismo input/output.

5. **¿Streaming?** LangGraph soporta streaming de eventos del grafo. ¿Exponemos esto al usuario en MVP o solo logs?

6. **¿Profundidad de memory context?** ¿Cuántos hitos inyectamos al agente? Propuesta: últimos 20 + top-3 por RAG (cuando exista).

7. **¿Separación de procesos?** ¿El Execution Engine corre en el mismo proceso que el API Gateway, o en workers separados? MVP: mismo proceso. Fase 2: workers.
