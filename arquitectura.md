# Arquitectura Base: Plataforma de Agentes Sandbox

## 1. Objetivo
Construir una base reutilizable para crear agentes especializados con `tools` y `skills`, y permitir su intercomunicación de forma segura, trazable y extensible.

## 2. Glosario (definiciones clave)

### Usuario
Persona o sistema cliente que envía objetivos de negocio. Nunca habla directo con subagentes en producción; siempre entra por el `API Gateway`.

### Agente (`Agent`)
Unidad de razonamiento autónoma con un rol (por ejemplo `supervisor`, `planner`, `coder`, `reviewer`). Un agente decide pasos y pide ejecución externa a través de `tools`.

### Runtime de Agente (`Agent Runtime`)
Proceso que ejecuta al agente. Gestiona contexto, memoria corta, selección de `tools`, manejo de errores y formato de entrada/salida.

### Tool (`Tool`)
Capacidad ejecutable con efectos observables. Ejemplos: leer archivo, llamar API, consultar base de datos. Toda tool tiene contrato formal (`ToolSpec`).

### Tool Gateway
Capa única para registrar, validar y ejecutar `tools`. Aísla seguridad y evita que agentes llamen integraciones externas de forma directa.

### Skill
Paquete de conocimiento y flujo para especializar comportamiento del agente. Incluye `SKILL.md` y opcionalmente `scripts/`, `references/` y `assets`.  
Una `skill` guía cómo razona/actúa el agente; una `tool` ejecuta acciones concretas.

### Skill Registry
Componente que descubre, valida, versiona y habilita `skills`.

### Orchestrator
Coordinador central del sistema. Recibe tareas de usuario, decide agentes participantes, aplica políticas (`timeout`, `retry`, `budget`) y consolida resultados.

### API Gateway
Punto de entrada para CLI/UI/API. Expone operaciones de alto nivel como `submit_task`, `get_task_status` y `get_task_result`.

### Message Bus
Canal de mensajería interna para eventos y request/reply entre componentes. Permite desacoplar productores y consumidores.

### Observability
Conjunto de logs, métricas y trazas para auditar comportamiento, diagnosticar fallos y medir costos.

### MCP (Model Context Protocol)
Protocolo para integrar fuentes externas (tools/resources) de forma estándar. En esta arquitectura vive dentro de `Tool Gateway` como adaptador de integración, no como reemplazo de Orchestrator.

## 3. Principios de diseño
- Separar razonamiento (`agents`) de ejecución (`tools`).
- Definir contratos tipados para mensajes y tools.
- Centralizar coordinación y políticas en `Orchestrator`.
- Aislar permisos por agente y por tool (sandbox por capacidades).
- Mantener trazabilidad completa (`trace_id`, eventos, costos).

## 4. Componentes y límites de responsabilidad

### API Gateway (entrada de usuario)
- Recibe solicitudes externas.
- Normaliza autenticación/autorización de cliente.
- Publica estado y resultado por `task_id`.
- No ejecuta lógica de negocio de agentes.

### Orchestrator
- Crea y gobierna el ciclo de vida de tareas (`pending`, `running`, `blocked`, `completed`, `failed`).
- Selecciona agentes y secuencia de colaboración.
- Aplica políticas de control operativo.
- No llama integraciones externas de forma directa; delega a agentes y tools.

### Agent Runtime
- Ejecuta el loop de cada agente.
- Interpreta `skills` activas para orientar decisiones.
- Invoca `tools` vía `Tool Gateway`.
- No gestiona transporte de mensajería global (eso pertenece a `Message Bus`).

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
- Pub/sub para eventos de dominio (`task.*`, `agent.*`, `tool.*`).
- No persiste estado de negocio final; eso lo gestiona el Orchestrator.

### Observability
- Logs estructurados por `trace_id` y `task_id`.
- Métricas de latencia, throughput, error-rate y costo.
- Trazas de extremo a extremo (usuario -> orquestación -> tools -> resultado).

## 5. Flujo principal
1. Usuario envía `submit_task` al `API Gateway`.
2. Gateway genera/propaga `task_id` y `trace_id`.
3. `Orchestrator` selecciona agente inicial (por ejemplo `supervisor` o `planner`).
4. El agente ejecuta pasos en `Agent Runtime`.
5. Si necesita ejecución externa, invoca tools vía `Tool Gateway`.
6. Si necesita colaboración, usa `Message Bus` para pedir apoyo a otro agente.
7. `Orchestrator` consolida resultados parciales y publica `AgentResult`.

## 6. Contratos base (sugeridos)

### AgentTask
- `id`: identificador único de tarea.
- `goal`: objetivo principal.
- `context`: contexto de entrada para ejecución.
- `constraints`: límites de costo, tiempo, alcance, etc.
- `reply_to`: canal destino para respuesta final.

### AgentResult
- `task_id`: tarea asociada.
- `status`: `completed | failed | blocked`.
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

## 7. Seguridad y sandbox
- Cada agente corre con perfil de capacidades mínimo necesario.
- Cada tool se ejecuta con allowlist explícita.
- Operaciones sensibles requieren política de aprobación.
- Toda invocación queda auditada con actor, parámetros y timestamp.

## 8. Escalabilidad y resiliencia
- Escalado horizontal de `Agent Runtime` y workers del `Orchestrator`.
- `Message Bus` desacoplado para absorber picos.
- Idempotencia por `task_id` + `step_id`.
- Reintentos con backoff y dead-letter queue para fallos persistentes.

## 9. Decisiones iniciales recomendadas
- Comunicación de usuario: siempre vía `Orchestrator` (a través de `API Gateway`).
- Comunicación interna: eventos tipados en `Message Bus`.
- Skills: versionadas y validadas antes de habilitarse.
- Tools: contratos estrictos y pruebas de integración.
- MCP: integrado como adaptador de `Tool Gateway`.
