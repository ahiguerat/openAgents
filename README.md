# openAgents

Base modular para construir agentes sandbox con `tools` y `skills`, y permitir su intercomunicación de forma segura y trazable.

## Instalación

> ⚠️ Pendiente de definir tras completar el Bloque 0 del MVP.

## Documentación

| Documento | Descripción |
|---|---|
| [`arquitectura.md`](./arquitectura.md) | Arquitectura del sistema: componentes, contratos, flujos y decisiones de diseño |
| [`proyecto.md`](./proyecto.md) | Plan de desarrollo del MVP: bloques, stack, scope y roadmap |

## Esquemas

Los contratos JSON Schema viven en [`schemas/`](./schemas/):

- `agent-task.schema.json` — input de una tarea
- `agent-result.schema.json` — resultado de un agente
- `tool-spec.schema.json` — especificación de una tool
- `skill-manifest.schema.json` — manifiesto de una skill
