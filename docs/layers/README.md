# Documentación de Capas de Arquitectura

## Introducción

Este directorio contiene la documentación detallada de cada capa de la arquitectura PaaS de Agentes IA. La plataforma está organizada en **7 capas lógicas** que transforman el razonamiento de los LLMs en acciones empresariales.

## Estructura de las Capas

Las capas se dividen en tres categorías:

### Capas de Usuario y Desarrollo
1. **Capa de Interacción (El Portal)** — Puntos de entrada de usuarios y sistemas externos
2. **Capa de Desarrollo (La Fábrica)** — Herramientas para diseñar agentes y flujos
3. **Capa Core (El Corazón)** — Runtime y orquestación de ejecución

### Capas de Apoyo
4. **Capa de Información (El Contexto)** — Datos y conocimiento para evitar alucinaciones
5. **Capa de Fundación (Inteligencia)** — Abstracción y gestión de modelos LLM

### Capas Transversales
6. **Observabilidad (Monitoreo)** — Visibilidad y análisis de costos
7. **Trust (Seguridad y Gobernanza)** — Acceso, auditoría y guardrails

## Índice de Documentación

| Capa | Documento | Descripción |
|------|-----------|-------------|
| 1 | [Capa de Interacción](./01-interaction.md) | Chatbots, UIs, APIs REST/gRPC |
| 2 | [Capa de Desarrollo](./02-development.md) | CrewAI, No-Code, Orquestación |
| 3 | [Capa Core](./03-core.md) | Execution Engine, Memoria, Sandbox, Event Bus |
| 4 | [Capa de Información](./04-information.md) | RAG, Datos Operacionales, Data Lake |
| 5 | [Capa de Fundación](./05-foundation.md) | Model Routing, MaaS, Context Caching |
| 6 | [Observabilidad](./06-observability.md) | Monitoring, Evaluation, FinOps |
| 7 | [Trust](./07-trust.md) | IAM, Guardrails, Registry |

## Cómo Leer Esta Documentación

Cada documento de capa sigue una estructura consistente:

- **Propósito** — Por qué existe la capa
- **Componentes** — Elementos que la forman, responsabilidades e interfaces
- **Decisiones técnicas** — Tecnologías elegidas y justificación (especialmente respecto a CrewAI)
- **Alcance MVP** — Qué se implementa en la fase inicial
- **Preguntas abiertas** — Decisiones pendientes para fases posteriores

## Diagrama General

```
┌─────────────────────────────────────────────────────────┐
│ 1. Interacción (El Portal)                              │
│    Chatbots, UIs, APIs REST/gRPC                        │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│ 2. Desarrollo (La Fábrica)                              │
│    CrewAI Code-Based, No-Code, Orquestación             │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│ 3. Core (El Corazón)                                    │
│    Execution Engine, Memoria, Sandbox, Event Bus        │
└─┬──────────────────────────────────────────────────────┬┘
  │                                                        │
┌─▼─────────────────────────────────┐  ┌─────────────────▼┐
│ 4. Información (El Contexto)      │  │ 5. Fundación    │
│    RAG, Datos, Data Lake           │  │    Model Router │
└──────────────────────────────────┘  │    MaaS         │
                                      └──────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 6. Observabilidad & 7. Trust (Transversal)               │
│    Monitoring, IAM, Seguridad                            │
└──────────────────────────────────────────────────────────┘
```

## Punto de Entrada Recomendado

Si es tu primera vez:
1. Lee [01-interaction.md](./01-interaction.md) para entender cómo los usuarios entran al sistema
2. Luego [02-development.md](./02-development.md) para ver dónde se diseñan agentes
3. Después [03-core.md](./03-core.md) para entender la ejecución
4. Finalmente las capas de apoyo (4-7) según necesites

Para decisiones arquitectónicas sobre la elección de CrewAI y alternativas, consulta [docs/adr/](../adr/).
