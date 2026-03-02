# Architecture Decision Records (ADRs)

## Qué es un ADR

Un Architecture Decision Record es un documento que registra una decisión arquitectónica importante junto con:
- **Contexto**: Por qué se necesita tomar una decisión
- **Alternativas**: Opciones consideradas
- **Decisión**: Qué se eligió y por qué
- **Consecuencias**: Impacto positivo y negativo

Cada ADR es numerado secuencialmente (001, 002, ...) y tiene un estado: **Propuesto**, **Aceptado**, **Rechazado**, o **Deprecado**.

## Por qué ADRs

La plataforma openAgents toma decisiones técnicas significativas que afectan toda la arquitectura:
- Elección de frameworks (CrewAI vs alternativas)
- Lenguajes de programación (Python vs TypeScript)
- Patrones de integración (MCP, tools, skills)
- Escalabilidad (serverless vs containers)

Documentar estas decisiones ayuda a:
1. **Entender el razonamiento**: Nuevos miembros saben por qué las cosas son así
2. **Evitar retrabajo**: No re-debatir lo ya decidido
3. **Rastrear evolución**: Cómo cambió la arquitectura con el tiempo
4. **Comunicar trade-offs**: Qué se ganó y qué se perdió

## Estructura de un ADR

```markdown
# ADR-NNN: [Título conciso]

**Status**: [Propuesto | Aceptado | Rechazado | Deprecado]

## Contexto

Por qué necesitamos tomar esta decisión. Qué problema resuelve.

## Alternativas consideradas

### Opción A
Descripción, ventajas, desventajas.

### Opción B
Descripción, ventajas, desventajas.

## Decisión

**Decidimos**: [Opción elegida]

**Razón**: [Justificación principal]

## Consecuencias

### Positivas
- ...

### Negativas
- ...

## Notas adicionales
Cualquier contexto relevante.
```

## Índice de ADRs

| ID | Título | Estado | Fecha |
|----|--------|--------|-------|
| [001](./001-framework-agentes.md) | Selección de Framework de Agentes — LangGraph | Aceptado | 2026-03-01 |
| [002](./002-stack-tecnologico-mvp.md) | Stack Tecnológico del MVP | Aceptado | 2026-03-01 |

## Cómo crear un nuevo ADR

1. Crear archivo `docs/adr/NNN-titulo-del-adr.md` (NNN = siguiente número)
2. Llenar template: Contexto, Alternativas, Decisión, Consecuencias
3. Pedir review a equipo arquitecto
4. Cambiar Status a "Aceptado" cuando haya consenso
5. Referenciar en documentación relevante (p.ej. si es sobre Layer 2, mencionar en `/02-development.md`)

## Lectura recomendada

Para entender decisiones arquitectónicas clave:
1. [ADR-001](./001-framework-agentes.md) — Elección de LangGraph vs alternativas
2. [ADR-002](./002-stack-tecnologico-mvp.md) — Stack del MVP
3. Luego consultar [docs/layers/02-development/02-development.md](../layers/02-development/02-development.md) para detalle de implementación

Para historia completa de la plataforma, ver [docs/architecture.md](../architecture.md) (7-layer overview).
