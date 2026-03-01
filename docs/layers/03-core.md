# 3. Capa Core (El Corazón de la Ejecución)

## Propósito

La capa Core es el runtime de la plataforma donde agentes razonan y ejecutan acciones. Orquesta el ciclo de vida de tareas, gestiona memoria, aísla ejecución de código, y proporciona canales de comunicación entre componentes. Es el corazón que transforma razonamiento en resultados tangibles.

## Componentes

### Orchestrator (Agente LLM Supervisor)
- **Responsabilidad**: Coordinador central impulsado por LLM. Recibe objetivos de usuario, razona sobre descomposición, selecciona agentes, gestiona ciclo de vida de tareas, implementa human-in-the-loop, y aplica políticas operativas.
- **Interfaces expuestas**:
  - `submit_task(goal, context, constraints)` → task_id
  - `resume_task(task_id, user_input)` → continúa ejecución
  - Escucha eventos del Message Bus (tareas completadas, errores, actividades)
- **Interfaces consumidas**: Agent Runtime, Memory Service, Tool Gateway, Message Bus, API Gateway
- **Tecnologías candidatas**: Anthropic SDK + OpenRouter, LangChain, LangGraph

#### Responsabilidades específicas del Orchestrator
1. **Razonamiento de alto nivel**: ¿Qué agentes necesito invocar? ¿En qué orden? ¿Qué memoria consulto?
2. **Ciclo de vida**: Transiciones de estado (`pending` → `running` → `completed | failed | blocked`)
3. **Human-in-the-loop**: Detecta ambigüedad, riesgo, o necesidad de confirmación y pausa (`blocked`) pidiendo input al usuario
4. **Políticas**: Enforce timeout, reintentos, presupuesto de tokens/costo, permitir/denegar agentes y tools
5. **Consolidación**: Toma resultados parciales de agentes, decide si es satisfactorio o necesita replaneamiento
6. **Memoria**: Gestiona scopes de memoria por tarea, decide cuándo activar RAG

#### El loop de razonamiento
CrewAI + Anthropic SDK usan **tool use nativo** del LLM. No existe un loop manual de "pensar → acción → observación"; el modelo decide:
- Si tiene suficiente información → responde
- Si necesita ejecutar tools → pide al API Client que las invoque
- Si está confuso → responde con pregunta al usuario

El Orchestrator orquesta a nivel de **agentes/tasks**, no a nivel de tool calls individuales.

### Agent Runtime
- **Responsabilidad**: Ejecuta un agente especializado dentro de su contexto. Construye initial context (task + skills + memoria corta + RAG), expone tools disponibles, gestiona el ciclo nativo de tool use del LLM, maneja errores y timeouts.
- **Interfaces expuestas**:
  - `execute(agent, task, context)` → AgentResult
  - Streaming de tool calls (opcional)
- **Interfaces consumidas**: Tool Gateway, Memory Service, LLM Client, Message Bus
- **Tecnologías**: CrewAI Agent execution, Anthropic SDK, custom loop (~30 líneas)

#### Flujo de Agent Runtime
```
1. Recibir (Agent, Task, contexto)
2. Construir initial_context:
   - Goal de la tarea
   - Backstory del agente (rol, especialización)
   - Skills activas (inyectadas en system prompt)
   - Memoria corta (últimas acciones, estado)
   - Contexto RAG (fragmentos relevantes)
   - Tools disponibles (JSON Schema)
3. System prompt = [agent role] + [skills] + [tools schema]
4. Iniciar conversación con LLM
5. Loop (mientras stop_reason != "end_turn"):
   a. Enviar messages + tools a LLM
   b. Si LLM retorna tool_calls:
      - Validar contra Tool Gateway
      - Ejecutar cada tool
      - Append resultados a memoria corta
      - Continuar loop
   c. Si LLM retorna texto final → salir
6. Retornar AgentResult (texto, artifacts, próximas acciones)
```

#### Integración con CrewAI
En MVP, CrewAI `Agent` + `Task` están presentes pero la ejecución real del loop la maneja el Agent Runtime, usando CrewAI como abstracción de estructura. En fases posteriores, CrewAI puede encapsular el loop completo.

### Memory Service
- **Responsabilidad**: Persistencia y recuperación de conocimiento en dos capas: short-term (estado de tarea con TTL) y long-term (persistente entre tareas). Incluye pipeline RAG para enriquecimiento de contexto.
- **Interfaces expuestas**:
  - `append(scope, task_id, content)` — Escribir hito en corto plazo
  - `retrieve(query, agent_role, filters)` — Buscar fragmentos relevantes (RAG)
  - `promote(task_id)` — Seleccionar candidatos de corto a largo plazo
  - `summarize(task_id)` — Resumen de sesión
  - `forget(memory_id)` — Derecho al borrado
- **Interfaces consumidas**: Agent Runtime, Orchestrator, Vector Store, Persistence DB
- **Tecnologías**: Redis (short-term), PostgreSQL (long-term), embedding service, vector index

#### Short-term Memory (Redis)
- **Scope**: Por `task_id`
- **TTL**: Automático al cerrar tarea (default 24h)
- **Contenido**: Hitos de ejecución, tool outputs, decisiones intermedias
- **Operaciones**: append, read_recent, clear
- **Ejemplo**:
  ```json
  {
    "task_id": "task-123",
    "scope": "short",
    "entries": [
      { "timestamp": "2025-03-01T10:00:00Z", "agent": "planner", "action": "read_spec", "result": "spec.md contiene..." },
      { "timestamp": "2025-03-01T10:00:15Z", "agent": "planner", "action": "create_plan", "result": "5 pasos identificados" }
    ]
  }
  ```

#### Long-term Memory (PostgreSQL + Vector Store)
- **Scope**: Persistente entre tareas, por proyecto/workspace
- **Contenido**: Hechos, patrones, decisiones arquitectónicas, baselines de calidad, preferencias del usuario
- **Operaciones**: upsert_fact, search (semantic + filters), forget
- **Estructura**:
  ```json
  {
    "id": "mem-789",
    "project_id": "proj-456",
    "agent_role": "coder",
    "type": "architectural_decision",
    "content": "Usamos async/await en lugar de callbacks...",
    "embedding_vector": [...],
    "created_at": "2025-02-15T09:00:00Z",
    "tags": ["async", "error-handling"],
    "ttl": null
  }
  ```

#### Pipeline RAG
1. **Ingesta**: Cuando se promociona de corto a largo plazo, normalizar formato, limpiar, segmentar en fragmentos
2. **Embeddings**: Generar vector para cada fragmento usando embedding model (default: text-embedding-3-small o similar)
3. **Indexación**: Almacenar en vector store (Pinecone, Weaviate, pgvector)
4. **Recuperación**: Query semántica + filtros (agent_role, project, date range, tags)
5. **Post-procesado**: Deduplicación, re-ranking por relevancia, compresión de contexto
6. **Inyección**: Adjuntar al contexto del Agent Runtime (como "Conocimiento relevante: ...")

#### Fases de implementación de memoria
- **Fase 1 (MVP)**: Short-term memory in-memory (Map). Sin RAG.
- **Fase 2**: Short-term en Redis. Long-term en Postgres sin embeddings.
- **Fase 3**: RAG completo con vector store.
- **Fase 4**: Gobernanza, políticas de retención, auditoría.

### Code Sandbox
- **Responsabilidad**: Ejecutar código de agents y tools en ambiente aislado. Prevenir acceso no autorizado a filesystem, red, y recursos del sistema.
- **Interfaces expuestas**:
  - `execute_isolated(code, allowed_tools, timeout)` → result | error
  - Whitelist de capabilities (`fs:read`, `network:external`, `memory:write`)
- **Interfaces consumidas**: Tool Gateway, Orchestrator (policies)
- **Tecnologías candidatas**: Docker containers, systemd-run, WebWorkers (Deno), gVisor

#### Modelo de Sandbox
Cada ejecución de agent/tool corre en contexto aislado con:
- **Permisos mínimos**: Solo capacidades necesarias para esa tarea
- **Filesystem**: Acceso a directorio temporal `/tmp/task-{task_id}`
- **Red**: Bloqueado por defecto; permitir solo APIs permitidas (via allowlist)
- **CPU/Memoria**: Límites de recursos
- **Timeout**: Máximo tiempo de ejecución

#### Decisión de MVP
En MVP, sandbox es básico:
- Filesystem: validar paths contra allowlist (no salir del proyecto)
- Red: bloqueada
- Timeout: 30s por defecto
- Sin contenedor real (por simplificar); hardening en Fase 5

### Event Bus (Message Bus)
- **Responsabilidad**: Comunicación interna asincrónica entre componentes. Soporta pub/sub (eventos de dominio) y request/reply (coordinación puntual).
- **Interfaces expuestas**:
  - `publish(event_type, data)` — Publicar evento
  - `subscribe(event_type, handler)` — Suscribirse
  - `request(target, message)` → reply — Request/reply sincrónico
- **Interfaces consumidas**: Todos los componentes (Orchestrator, Agent Runtime, Tool Gateway, Activities, Observability)
- **Tecnologías candidatas**: In-process (Event Emitter), Redis Pub/Sub, RabbitMQ, Kafka

#### Tipos de eventos
- `task.*` — task.created, task.started, task.blocked, task.completed, task.failed
- `agent.*` — agent.created, agent.executed, agent.error
- `tool.*` — tool.invoked, tool.success, tool.failed
- `memory.*` — memory.appended, memory.promoted, memory.retrieved
- `activity.*` — activity.triggered, activity.executed

#### Ejemplo: Inter-agent coordination
```typescript
// Agent A necesita resultado de Agent B
await eventBus.request('agent:reviewer', {
  type: 'review_request',
  artifact: codeArtifact,
  criteria: reviewCriteria
})
// Agent B escucha, ejecuta revisión, retorna resultado
```

#### Escalabilidad
- MVP: In-process Event Emitter (sin persistencia)
- Fase 2: Redis Pub/Sub para múltiples instancias
- Fase 3: Kafka para garantías de entrega y replay

## Decisiones técnicas

### Lenguaje y tecnologías del Core
- **TypeScript + Bun**: Continuidad con MVP, performance, no config
- **Anthropic SDK**: Calidad de razonamiento, acceso a todas las capacidades
- **OpenRouter**: Una sola API key, modelos múltiples, routing automático

### Orchestrator como supervisor LLM, no como agente separado
El Orchestrator **no es un agente distinto**; es una instancia del LLM con rol de supervisor. Resuelve:
- Razonamiento de alto nivel (qué hacer)
- No ejecuta tools directamente (delega en agentes)
- Toma decisiones de control (retry, human-in-the-loop, abort)

### Memory unificada
Todos los agentes en una tarea comparten el mismo scope de memoria corta. Así:
- Agent A escribe "encontré dependencia X"
- Agent B lee eso antes de ejecutar
- Menos redundancia, más contexto

### Tool use nativo del LLM
No reimplementar el loop; usar el nativo del modelo. Ventajas:
- Mejor razonamiento del modelo
- Manejo automático de errores
- Reflexión del modelo sobre resultados

### Decisión: CrewAI para definición, Custom Runtime para ejecución
- **CrewAI**: Define estructura (Agent, Task, Crew) — aporta semántica
- **Custom Agent Runtime**: Ejecuta el loop — control y observabilidad
- **Orquestación global**: Orchestrator supervisa todo

## Alcance MVP

**En scope:**
- Orchestrator básico (razona qué agent invocar)
- Agent Runtime con loop nativo (~30 líneas)
- Memory Service short-term in-memory
- Code Sandbox: validación de paths + timeout
- Event Bus: in-process Event Emitter
- Un crew example: general-assistant con skills básicas
- Task lifecycle: pending → running → completed | failed | blocked
- Human-in-the-loop: `blocked` state y `resume_task`
- Logging completo con trace_id

**Fuera de scope:**
- Long-term memory persistente
- RAG
- Activities y Triggers
- Inter-agent coordination vía Message Bus (coordinación es serial en MVP)
- Docker sandbox real
- Múltiples Orchestrator instances (concurrencia)
- Persistencia de tareas (en-memory state)

## Preguntas abiertas

1. **¿Concurrencia de tareas?** MVP ejecuta serial (una tarea a la vez). ¿Cuándo paralelizar y cómo gestionar state?

2. **¿Timeout del Orchestrator?** Si un agente cuelga, ¿cuánto espera el Orchestrator antes de abortar? Propuesta: 5 minutos por defecto.

3. **¿Reintentos y fallback?** Si un agente falla, ¿reintentar con otro agente? ¿Pasar a fallback plan? Fuera de MVP; Fase 2.

4. **¿Composition de agents?** ¿Un agente puede invocar a otro? En MVP, no. Orchestrator es quien orquesta. Fase 2+.

5. **¿Streaming de resultados parciales?** Agent Runtime solo retorna resultado final. Streaming de tool calls en Fase 2.

6. **¿Profundidad de memory context?** ¿Cuántos hitos pasado inyectamos? Propuesta: últimos 20 + top-3 por RAG.

7. **¿Quién gestiona el resource cleanup?** Redis, Vector Store, temporal files. Automatizar con TTLs y garbage collection.

8. **¿Cómo se detecta un loop infinito?** Limite de iterations (~50) por task. Tool calls repetitivos en el mismo resultado.
