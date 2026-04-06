# Arquitectura Base: Plataforma de Agentes Sandbox

## 1. Objetivo
Construir una base reutilizable para crear agentes especializados con `tools` y `skills`, y permitir su intercomunicación de forma segura, trazable y extensible.

## 2. Glosario (definiciones clave)

### Conceptos fundamentales

**Usuario**
Persona o sistema cliente que envía objetivos. Nunca interactúa directamente con subagentes; siempre entra a través del `Orchestrator`.

**Agente (`Agent`)**
Unidad de razonamiento autónoma con un rol especializado (p.ej. `planner`, `coder`, `reviewer`). Decide qué pasos dar y delega la ejecución en `Tools`. El rol de coordinación y supervisión lo asume directamente el `Orchestrator`.

**Tool**
Capacidad ejecutable con efectos observables: leer un archivo, llamar una API, consultar una base de datos. Toda tool tiene un contrato formal (`ToolSpec`).

**Skill**
Paquete de conocimiento y comportamiento que especializa a un agente. Guía cómo razona y actúa; no ejecuta acciones directamente (eso es responsabilidad de las `Tools`).

**Task**
Unidad de trabajo enviada al sistema. Tiene un objetivo concreto, un ciclo de vida (`pending → running → blocked → completed | failed`) y produce un resultado. Puede ser creada por un usuario o por una `Activity`.

**Activity**
Entidad persistente y proactiva que genera `Tasks` en respuesta a `Triggers` o eventos del sistema. Representa el comportamiento autónomo sin intervención directa del usuario. Existen dos tipos:
- `scheduled`: cada ejecución es independiente, sin estado entre ciclos (p.ej. un informe nocturno).
- `continuous`: mantiene estado entre ejecuciones y evalúa en cada ciclo si hay que actuar o no. El patrón *heartbeat* es una `continuous Activity` con un `cron` de alta frecuencia.

**Trigger**
Lo que activa una `Activity`: temporal (`cron`), externo (`webhook`), condicional (umbral de métrica) o reactivo a un evento del sistema.

**Orchestrator**
Coordinador central impulsado por LLM. Absorbe el rol de supervisor: razona sobre cómo descomponer tareas, qué agentes invocar y en qué orden. Aplica políticas, consolida resultados y puede pausar la ejecución para pedir input al usuario (`human-in-the-loop`). El loop de razonamiento lo gestiona el propio modelo vía tool use nativo.

**Memory**
Conocimiento del sistema en dos capas: corto plazo (estado temporal por tarea, con TTL) y largo plazo (persistente entre tareas). Incluye recuperación por similitud (RAG) para enriquecer el contexto del agente antes de cada ejecución.

**Message Bus**
Canal de comunicación interna. Transporta eventos entre componentes (pub/sub) y permite coordinación directa entre agentes (request/reply).

---

### Organización del trabajo

**Workspace**
Nivel de agrupación más alto. Agrupa proyectos de un usuario o equipo. Define identidad, permisos globales y contexto de facturación.

**Project**
Contexto persistente que agrupa tareas relacionadas. Define objetivo general, constraints compartidos, skills habilitadas y scope de memoria larga. Permite que los agentes acumulen conocimiento entre tareas.

---

### Ejecución interna

**Plan**
Salida del agente `planner`: secuencia ordenada de `Steps` con dependencias y posibles ramificaciones condicionales.

**Step**
Unidad interna de trabajo generada al descomponer una `Task`. No es visible para el usuario; es interna al `Orchestrator` y al `Agent Runtime`.

**Run**
Ejecución concreta de una `Task`. Si una tarea se reintenta, pueden existir múltiples `Runs` para la misma `Task`, cada una con su propio `trace_id`.

**Artifact**
Salida tangible producida por un agente durante una `Run`: archivo, código, documento, diff o datos estructurados.

---

### Gobernanza

**Policy**
Reglas que el `Orchestrator` aplica sobre tareas y agentes: timeouts, reintentos, presupuesto de tokens/coste, y qué agents/tools están permitidos. Puede definirse a nivel de `Workspace`, `Project` o `Task`.

**Capability**
Permiso concreto otorgado a un agente o tool. Es la unidad del modelo sandbox. Ejemplos: `fs:read`, `network:external`, `memory:long-term:write`.

---

### Comunicación y trazabilidad

**Event**
Algo que ocurrió en el sistema. Viaja por el `Message Bus` y puede ser consumido por cualquier suscriptor. Es la unidad fundamental de trazabilidad y de proactividad adaptativa.

**Trace**
Hilo que une todos los `Events` de una `Task` de principio a fin, identificado por `trace_id`.

---

### Componentes de plataforma

**Agent Runtime**
Proceso que ejecuta a un agente especializado. Construye el contexto inicial, expone las `tools` disponibles y gestiona el ciclo de tool use nativo del LLM (el modelo decide cuándo llamar tools y cuándo terminar). Gestiona memoria corta y manejo de errores.

**Tool Gateway**
Capa única para registrar, validar y ejecutar `tools`. Centraliza seguridad y auditoría de todas las ejecuciones.

**API Gateway**
Punto de entrada externo. Expone operaciones de alto nivel (`submit_task`, `get_task_status`, `get_task_result`) y normaliza autenticación.

**Skill Registry**
Componente que descubre, valida y versiona `skills`. Expone el catálogo disponible al `Agent Runtime`.

**Observability**
Conjunto de logs, métricas y trazas para auditar comportamiento, diagnosticar fallos y medir costos.

**MCP (Model Context Protocol)**
Protocolo estándar para integrar fuentes externas (tools/resources). En esta arquitectura vive como adaptador dentro del `Tool Gateway`.

**RAG (Retrieval-Augmented Generation)**
Técnica donde el agente recupera contexto relevante desde memoria antes de generar su respuesta. Se implementa dentro del `Memory Service` como pipeline de ingesta, indexación y recuperación.

## 3. Principios de diseño
- Separar razonamiento (`agents`) de ejecución (`tools`).
- Definir contratos tipados para mensajes, memoria y tools.
- Centralizar coordinación y políticas en `Orchestrator`.
- Aislar permisos por agente y por tool (sandbox por capacidades).
- Mantener trazabilidad completa (`trace_id`, eventos, costos).
- Tratar la memoria y RAG como producto: calidad, gobernanza y ciclo de vida.

## 4. Componentes y límites de responsabilidad

### API Gateway (entrada de usuario)
- Recibe solicitudes externas.
- Normaliza autenticación/autorización de cliente.
- Publica estado y resultado por `task_id`.
- No ejecuta lógica de negocio de agentes.

### Orchestrator
- Impulsado por LLM (p.ej. Claude Sonnet vía OpenRouter). Absorbe el rol de `supervisor`.
- Razona sobre descomposición de tareas, selección de agentes y estrategia de ejecución.
- Gobierna el ciclo de vida de tareas (`pending`, `running`, `blocked`, `completed`, `failed`).
- Implementa `human-in-the-loop`: detecta ambigüedad, riesgo o necesidad de confirmación y pausa la tarea solicitando input al usuario.
- Aplica políticas de control operativo (timeout, retry, budget).
- Gestiona scopes de memoria por tarea y decide cuándo activar RAG.
- No llama integraciones externas directamente; delega en agentes especializados y tools.

### Agent Runtime
- Ejecuta a un agente especializado (`planner`, `coder`, `reviewer`).
- Construye el contexto inicial (task, skills activas, memoria corta, contexto RAG).
- Expone al modelo las `tools` disponibles y gestiona el ciclo de tool use nativo del LLM.
- El loop de razonamiento (pensar → llamar tool → observar resultado → repetir) lo resuelve el modelo; el Runtime gestiona la infraestructura alrededor.
- Lee/escribe memoria de corto plazo durante la ejecución.
- No gestiona transporte de mensajería global (eso pertenece a `Message Bus`).

### Activity
- Representa comportamiento proactivo: define tipo (`scheduled | continuous`), trigger y agentes objetivo.
- Suscribe a eventos del `Message Bus` relevantes para su condición de activación.
- Al activarse, genera una `Task` y la envía al `Orchestrator`.
- Gestiona su propio ciclo de vida: `active | paused | stopped`.
- Las `continuous Activities` mantienen estado entre ciclos en memoria corta.

### Memory Service
- Servicio especializado para lectura/escritura de memoria.
- Implementa dos stores:
  - `Short-term store`: key-value/document por `task_id` con TTL.
  - `Long-term store`: base persistente con metadatos y documentos normalizados.
- Incluye pipeline RAG:
  - Ingesta: limpieza, segmentación y etiquetado.
  - Indexación: embeddings + índice vectorial.
  - Recuperación: top-k por similitud + filtros (`agent_role`, `project`, `tags`).
  - Post-procesado: deduplicación, re-ranking y compresión de contexto.
- Expone operaciones: `append`, `summarize`, `promote`, `retrieve`, `expire`, `forget`.
- Aplica políticas de privacidad y retención.

### Tool Gateway
- Registro de tools locales y externas.
- Validación de `input_schema` y `output_schema`.
- Control de permisos y `side_effects`.
- Integración con MCP (adaptadores MCP -> `ToolSpec`).

### Skill Registry
- Descubre skills locales/remotas.
- Valida estructura mínima (`SKILL.md`, metadatos y recursos).
- Expone catálogo versionado para el Runtime.

### Message Bus
- Request/reply para coordinación puntual entre agentes.
- Pub/sub para eventos de dominio (`task.*`, `agent.*`, `tool.*`, `memory.*`, `rag.*`).
- No persiste estado de negocio final; eso lo gestiona el Orchestrator.

### Observability
- Logs estructurados por `trace_id` y `task_id`.
- Métricas de latencia, throughput, error-rate y costo.
- Métricas RAG: `recall@k`, hit-rate, latencia de recuperación, tokens recuperados usados.
- Trazas de extremo a extremo (usuario -> orquestación -> memoria/RAG/tools -> resultado).

### Diagrama de componentes

```mermaid
graph TB
    subgraph Entrada[" Entrada al sistema "]
        U([Usuario]) -->|request| GW[API Gateway]
        TRIG([Trigger\ncron · webhook · condition]) --> ACT[Activity]
    end

    GW -->|Task| ORC[Orchestrator]
    ACT -->|Task| ORC
    MB -.->|eventos| ACT

    ORC <--> MB[Message Bus]
    ORC --> RT[Agent Runtime]
    RT <--> MB
    RT --> TG[Tool Gateway]
    RT <--> MS[Memory Service]
    SR[Skill Registry] --> RT

    TG --> LOCAL[Tools locales]
    TG --> MCP[Adaptador MCP]

    MS --> REDIS[(Short-term · Redis)]
    MS --> PG[(Long-term · Postgres)]
    MS --> VEC[(Vector Store)]

    OBS{{Observability}} -.-> GW
    OBS -.-> ORC
    OBS -.-> RT
    OBS -.-> TG
    OBS -.-> MS
```

## 5. Memoria por tipo de agente

### Agentes que deben tener memoria de corto plazo
- `orchestrator`: estado de coordinación de la tarea en curso, decisiones de enrutamiento y contexto de conversación con el usuario.
- `planner`: plan actual, hipótesis de trabajo y pasos pendientes.
- `coder`: contexto técnico inmediato (archivos tocados, errores recientes, decisiones de implementación).
- `reviewer`: criterios de revisión aplicados y hallazgos de la sesión.

### Agentes que deben usar memoria de largo plazo y RAG
- `orchestrator`: políticas históricas, patrones de resolución y preferencias del usuario/equipo.
- `planner`: plantillas de planes exitosos por tipo de problema.
- `coder`: convenciones de proyecto y decisiones arquitectónicas persistentes.
- `reviewer`: baseline de calidad, reglas de aceptación y defectos recurrentes.

Regla práctica:
- Todos los agentes usan corto plazo.
- Largo plazo y RAG se habilitan por caso de uso y política de gobernanza; no todo debe persistirse.

## 6. Flujo principal

1. El usuario envía `submit_task` al `API Gateway` — o bien una `Activity` genera una `Task` al activarse su `Trigger`.
2. Gateway crea y propaga `task_id` y `trace_id`.
3. `Orchestrator` (LLM) crea scope de memoria corta, consulta RAG si aplica, y razona sobre qué agentes invocar y en qué orden.
4. Si detecta ambigüedad o riesgo, pausa la tarea (`blocked`) y solicita input al usuario (`human-in-the-loop`). La tarea se reanuda con `resume_task`.
5. El `Agent Runtime` ejecuta el agente elegido: construye contexto, expone tools y gestiona el ciclo de tool use nativo del LLM.
6. El agente invoca tools vía `Tool Gateway` y registra hitos en memoria corta.
7. Si necesita colaboración, usa el `Message Bus` para coordinarse con otro agente.
8. El `Orchestrator` consolida el resultado; si no es satisfactorio, puede replanificar y reintentar.
9. Al finalizar, dispara la política de promoción a memoria larga.
10. `Memory Service` resume, clasifica, indexa y persiste solo lo que cumpla reglas de retención.

### Diagrama de flujo principal

```mermaid
sequenceDiagram
    actor U as Usuario
    participant GW as API Gateway
    participant ORC as Orchestrator LLM
    participant RT as Agent Runtime
    participant MS as Memory Service
    participant TG as Tool Gateway
    participant MB as Message Bus

    U->>GW: submit_task(goal, context)
    GW->>GW: genera task_id + trace_id
    GW->>ORC: AgentTask

    ORC->>MS: crea scope de memoria corta
    ORC->>MS: retrieve(contexto relevante)
    MS-->>ORC: contexto comprimido
    ORC->>ORC: razona: qué agentes, en qué orden

    alt human-in-the-loop
        ORC-->>GW: AgentResult { status: blocked }
        GW-->>U: solicita input
        U->>GW: resume_task(input)
        GW->>ORC: continúa con input
    end

    ORC->>RT: ejecuta agente(task + contexto)

    loop Tool use nativo del LLM
        RT->>TG: invoke(tool_name, input)
        TG-->>RT: ToolResult
        RT->>MS: append(hito)
    end

    opt Colaboración inter-agente
        RT->>MB: request a otro agente
        MB-->>RT: reply con resultado parcial
    end

    RT-->>ORC: AgentResult
    ORC->>MS: promote a memoria larga
    MS->>MS: resumir, clasificar, indexar
    ORC-->>GW: AgentResult final
    GW-->>U: resultado
```

## 7. Contratos base (sugeridos)

### AgentTask
- `id`: identificador único de tarea.
- `project_id`: proyecto al que pertenece (opcional; permite herencia de constraints, skills y memoria).
- `goal`: objetivo principal.
- `context`: información adicional relevante para la ejecución.
- `constraints`: límites de costo, tiempo y alcance.
- `reply_to`: destino de la respuesta final — callback URL (webhooks) o nombre de canal (Message Bus interno).

### AgentResult
- `task_id`: tarea asociada.
- `status`: `completed | failed | blocked`. El estado `blocked` indica que el Orchestrator necesita input del usuario para continuar; la tarea se reanuda mediante `resume_task(task_id, input)`.
- `summary`: síntesis del resultado.
- `artifacts`: salidas generadas (archivos, datos, links).
- `next_actions`: sugerencias de siguientes pasos.

### ToolSpec
- `name`: identificador de tool.
- `description`: propósito funcional.
- `input_schema`: contrato de entrada (JSON Schema).
- `output_schema`: contrato de salida (JSON Schema).
- `permissions`: capacidades requeridas.
- `side_effects`: `none | fs | network | external`.

### SkillManifest
- `name`: nombre único de skill.
- `description`: alcance funcional.
- `triggers`: señales/intenciones de activación.
- `resources`: scripts/referencias/assets declarados.
- `version`: versión semántica.

### MemoryRecord
- `id`: identificador del registro.
- `scope`: `short | long`.
- `agent_id`: agente que escribe.
- `task_id`: tarea asociada (opcional en largo plazo).
- `content`: contenido estructurado/resumen.
- `embedding_ref`: referencia vectorial opcional.
- `ttl`: expiración (obligatorio en corto plazo).
- `tags`: etiquetas de búsqueda y gobernanza.

### RetrievalQuery (RAG)
- `query`: intención de búsqueda.
- `agent_role`: rol solicitante.
- `task_id`: contexto de ejecución.
- `filters`: proyecto, tags, ventanas temporales.
- `top_k`: número máximo de fragmentos.

### RetrievalResult (RAG)
- `chunks`: fragmentos recuperados con score.
- `citations`: referencias a fuentes/memory ids.
- `strategy`: `semantic | hybrid | keyword`.
- `latency_ms`: tiempo de recuperación.

## 8. Fases de implementación de memoria

### Fase 1: Memoria corta operativa
Store key-value por `task_id` con TTL. Operaciones mínimas: `append`, `read_recent`, `clear`. Purga automática al cerrar tarea.

### Fase 2: Memoria larga controlada
Store persistente con metadatos y documentos normalizados. Pipeline de promoción al final de cada tarea: extraer candidatos → resumir → clasificar sensibilidad → persistir solo lo permitido. Operaciones mínimas: `upsert_fact`, `search`, `forget`.

### Fase 3: Capa RAG
Embeddings generados durante ingesta. Índice vectorial con recuperación top-k filtrada por permisos. Re-ranking y compresión antes de inyectar contexto al agente.

### Fase 4: Gobernanza
Políticas de retención por tipo de dato, derecho al borrado por usuario/proyecto, y auditoría de accesos.

### Diagrama de memoria y RAG

```mermaid
graph LR
    RT[Agent Runtime] -->|append hito| STS
    RT -->|retrieve| PP
    ORC[Orchestrator] -->|promote al cerrar tarea| LTS

    subgraph MS [Memory Service]
        STS[(Short-term · Redis · TTL)]
        LTS[(Long-term · Postgres)]

        subgraph RAG [Pipeline RAG]
            ING[Ingesta y Segmentación]
            EMB[Embeddings]
            IDX[(Vector Store)]
            RET[Recuperación top-k]
            PP[Re-ranking y Compresión]
        end

        STS -->|candidatos al cerrar tarea| LTS
        LTS --> ING
        ING --> EMB
        EMB --> IDX
        IDX --> RET
        RET --> PP
    end

    PP -->|contexto comprimido| RT
```

## 9. Seguridad y sandbox
- Cada agente corre con perfil de capacidades mínimo necesario.
- Cada tool se ejecuta con allowlist explícita.
- Operaciones sensibles requieren política de aprobación.
- Toda invocación queda auditada con actor, parámetros y timestamp.
- Memoria larga debe cifrarse en reposo y limitarse por ACL por proyecto/equipo.
- RAG no debe recuperar contenido fuera del scope de permisos del agente.

## 10. Escalabilidad y resiliencia
- Escalado horizontal de `Agent Runtime` y workers del `Orchestrator`.
- `Message Bus` desacoplado para absorber picos.
- Idempotencia por `task_id` + `step_id`.
- Reintentos con backoff y dead-letter queue para fallos persistentes.
- Cache de recuperación para reducir latencia de memoria larga y RAG.

## 11. Decisiones iniciales recomendadas
- Comunicación de usuario: siempre vía `Orchestrator` (a través de `API Gateway`).
- Comunicación interna: eventos tipados en `Message Bus`.
- **Orchestrator**: impulsado por LLM (Claude Sonnet vía OpenRouter). Absorbe el rol de `supervisor`; no existe como agente separado.
- **Agent loop**: resuelto por el tool use nativo del LLM. El `Agent Runtime` gestiona la infraestructura (contexto, tools, memoria), no el loop en sí.
- **LLM Client**: el SDK de Anthropic apuntado a OpenRouter funciona correctamente para modelos `anthropic/*`. Si en fases posteriores se requiere flexibilidad de proveedor (Llama, GPT-4o…), bastará con cambiar el adaptador interno de `platform/llm-client/`, siempre que el resto del sistema use únicamente la interfaz propia del módulo (`LLMClient`, `LLMResponse`) y nunca el SDK directamente.
- **Human-in-the-loop**: el Orchestrator puede pausar tareas (`blocked`) para pedir confirmación o aclaración al usuario antes de continuar.
- Skills: versionadas y validadas antes de habilitarse.
- Tools: contratos estrictos y pruebas de integración.
- MCP: integrado como adaptador de `Tool Gateway`.
- Memoria: corto plazo obligatoria por tarea; largo plazo opt-in con gobernanza explícita.
- RAG: activación por política de tarea y presupuesto de latencia/tokens.
