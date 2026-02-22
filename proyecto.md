# Proyecto Base: Sandbox de Agentes con Tools y Skills

## 1. Alcance
Este proyecto define una base para:
- Crear agentes especializados reutilizables.
- Conectar agentes entre sí.
- Exponer tools seguras y observables.
- Incorporar skills como módulos de conocimiento/flujo.

## 2. Estructura de carpetas
```text
.
├── arquitectura.md
├── proyecto.md
├── platform/
│   ├── runtime/
│   ├── orchestrator/
│   ├── tool-gateway/
│   ├── message-bus/
│   └── observability/
├── agents/
│   ├── supervisor/
│   ├── planner/
│   ├── coder/
│   └── reviewer/
├── skills/
├── schemas/
└── docs/
```

## 3. Responsabilidad por módulo
- `platform/runtime`: lifecycle y ejecución de agentes.
- `platform/orchestrator`: coordinación de tareas multiagente.
- `platform/tool-gateway`: registro, validación y ejecución de tools.
- `platform/message-bus`: transporte de eventos y mensajes internos.
- `platform/observability`: logs, métricas y trazas.
- `agents/*`: implementaciones concretas de roles.
- `skills/`: skills instaladas/creadas para comportamientos especializados.
- `schemas/`: contratos JSON Schema compartidos.
- `docs/`: documentación técnica y operativa adicional.

## 4. MVP (primera entrega)
1. API mínima para usuario:
   - `submit_task(goal, context, constraints)`
   - `get_task_status(task_id)`
   - `get_task_result(task_id)`
2. Un flujo completo con 2 agentes (`supervisor` + `planner`).
3. 2 tools iniciales (ej. `filesystem.read`, `filesystem.write`) con schemas.
4. Logging con `trace_id` por task.
5. Skill de ejemplo en `skills/` para validar el pipeline.

## 5. Roadmap por fases

### Fase 0 - Bootstrap
- Crear contratos en `schemas/`.
- Implementar estructura base del Orchestrator.
- Definir interfaz común de agentes y tools.

### Fase 1 - Ejecución básica
- Runtime funcional de un agente.
- Tool Gateway con validación I/O.
- Flujo end-to-end de una tarea simple.

### Fase 2 - Intercomunicación
- Integrar Message Bus.
- Habilitar request/reply entre agentes.
- Manejar timeouts y retries.

### Fase 3 - Skills y gobernanza
- Cargar skills desde `skills/`.
- Validar manifest/versionado.
- Añadir políticas de permisos por agente/tool.

### Fase 4 - Hardening
- Observabilidad completa (métricas y trazas).
- Reintentos robustos + DLQ.
- Pruebas de carga y regresión.

## 6. Definición de listo (DoD) del MVP
- Una tarea recorre Orchestrator -> Agent Runtime -> Tool Gateway -> respuesta final.
- Logs trazables por `task_id` y `trace_id`.
- Contratos validados contra JSON Schema.
- Pruebas básicas de integración pasando en CI.

## 7. Próximos pasos inmediatos
1. Crear archivos de schema iniciales en `schemas/`.
2. Definir interfaz `IAgent` y `ITool` en `platform/runtime` y `platform/tool-gateway`.
3. Implementar un command runner mínimo en `platform/orchestrator`.
4. Añadir una skill de ejemplo en `skills/base/`.
