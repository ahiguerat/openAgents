# openAgents

Base modular para construir agentes sandbox con `tools` y `skills`, y permitir su intercomunicacion de forma segura y trazable.

## Estructura

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

## Flujo base

1. El usuario envia una tarea al Orchestrator.
2. El Orchestrator selecciona agentes y coordina ejecucion.
3. Los agentes consumen tools via Tool Gateway.
4. La intercomunicacion interna ocurre por Message Bus.
5. Se devuelve un resultado consolidado al usuario.

## Contratos iniciales

Los contratos JSON Schema viven en `schemas/`:

- `agent-task.schema.json`
- `agent-result.schema.json`
- `tool-spec.schema.json`
- `skill-manifest.schema.json`

Estos schemas son el punto de partida para validar mensajes entre componentes.

## Proximos pasos

1. Implementar interfaces `IAgent` y `ITool`.
2. Crear API minima en `platform/orchestrator` (`submit_task`, `get_task_status`, `get_task_result`).
3. Agregar pruebas de validacion de schemas en CI.
