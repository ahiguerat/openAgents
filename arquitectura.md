# Arquitectura Base: Plataforma de Agentes Sandbox

## 1. Objetivo
Construir una base reutilizable para crear agentes especializados con `tools` y `skills`, y permitir su intercomunicación de forma segura, trazable y extensible.

## 2. Principios de diseño
- Separar razonamiento (agentes) de ejecución (tools).
- Definir contratos tipados para mensajes y tools.
- Centralizar coordinación en un Orchestrator.
- Aislar permisos por agente y por tool (sandbox por capacidades).
- Mantener trazabilidad completa (logs, eventos, costos).

## 3. Componentes

### API Gateway (entrada de usuario)
- Punto de entrada único (CLI, HTTP o UI).
- Envía solicitudes al Orchestrator.
- Expone estado y resultados por `task_id`.

### Orchestrator
- Recibe tareas de usuario.
- Decide qué agente(s) ejecutar.
- Gestiona ciclo de vida de tareas: pending, running, blocked, completed, failed.
- Aplica políticas: timeout, retry, budget, prioridad.

### Agent Runtime
- Entorno de ejecución para cada agente.
- Maneja prompt/system context, selección de tools y memoria corta.
- Estandariza entrada/salida de agentes.

### Tool Gateway
- Registro y ejecución de tools.
- Validación de `input/output schema`.
- Control de permisos y side effects.
- Auditoría de cada invocación.

### Skill Registry
- Descubre skills locales/remotos.
- Valida estructura de skill (`SKILL.md`, scripts, referencias).
- Resuelve versiones y dependencias.

### Message Bus
- Comunicación entre agentes y servicios.
- Patrones: request/reply y pub/sub.
- Entrega eventos del sistema (`task.*`, `agent.*`, `tool.*`).

### Observability
- Logs estructurados con `trace_id`.
- Métricas de latencia, éxito/fallo y costos.
- Trazas por tarea/agente/tool.

## 4. Flujo principal
1. Usuario envía `submit_task` al API Gateway.
2. Gateway crea `task_id` y delega al Orchestrator.
3. Orchestrator selecciona agente inicial (ej. Supervisor o Planner).
4. Agente ejecuta pasos y llama tools vía Tool Gateway.
5. Si requiere colaboración, publica mensaje al Message Bus para otro agente.
6. Orchestrator recolecta resultados parciales.
7. Se consolida `AgentResult` y se devuelve al usuario.

## 5. Contratos base (sugeridos)

### AgentTask
- `id`: string
- `goal`: string
- `context`: object
- `constraints`: object
- `reply_to`: string

### AgentResult
- `task_id`: string
- `status`: `completed | failed | blocked`
- `summary`: string
- `artifacts`: array
- `next_actions`: array

### ToolSpec
- `name`: string
- `description`: string
- `input_schema`: JSON Schema
- `output_schema`: JSON Schema
- `permissions`: array
- `side_effects`: `none | fs | network | external`

### SkillManifest
- `name`: string
- `description`: string
- `triggers`: array
- `resources`: object
- `version`: string

## 6. Seguridad y sandbox
- Cada agente corre con perfil de capacidades.
- Tools se ejecutan con allowlist explícita.
- Operaciones sensibles requieren aprobación de política.
- Se registra quién ejecutó qué, cuándo y con qué parámetros.

## 7. Escalabilidad
- Escalado horizontal de Agent Runtime y Orchestrator workers.
- Message Bus desacoplado para evitar bloqueos.
- Idempotencia por `task_id` + `step_id`.
- Reintentos con backoff y dead-letter queue para fallos persistentes.

## 8. Decisiones iniciales recomendadas
- Comunicación de usuario: siempre vía Orchestrator.
- Comunicación interna: eventos tipados en Message Bus.
- Skills: versionadas y validadas antes de habilitarse.
- Tools: contratos estrictos + pruebas de integración.
