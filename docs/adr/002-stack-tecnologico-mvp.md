# ADR-002: Stack Tecnológico del MVP

**Status**: Aceptado

**Fecha**: 2026-03-01

**Relacionado con**: [ADR-001 — LangGraph como framework de agentes](001-framework-agentes.md)

## Contexto

Con el framework de agentes decidido (LangGraph, ADR-001) y las 4 capas del MVP seleccionadas (Interacción, Desarrollo, Core, Fundación), necesitamos definir el stack tecnológico transversal: lenguaje, runtime, dependencias clave, y estructura del proyecto.

### Criterios de decisión

1. **Coherencia**: Un solo lenguaje de punta a punta para minimizar fricción en el MVP
2. **Compatibilidad con LangGraph**: El stack debe integrarse naturalmente con `@langchain/langgraph`
3. **Estructura alineada a la arquitectura**: La organización del código debe reflejar las capas del sistema
4. **Simplicidad**: Mínima infraestructura para el MVP, sin comprometer la extensibilidad post-MVP

## Decisiones

### Lenguaje: TypeScript

TypeScript en todo el proyecto. LangGraph tiene SDK oficial en TypeScript (`@langchain/langgraph`) con soporte para grafos de estado, checkpointing y persistencia — todo lo que el Core necesita.

### Estructura: Monorepo con pnpm workspaces

El proyecto se organiza como monorepo con un paquete por capa:

```
openagents/
├── packages/
│   ├── foundation/    # Capa 5 — Acceso a LLMs
│   ├── core/          # Capa 3 — Execution Engine
│   ├── development/   # Capa 2 — SDK de definición de agentes
│   └── interaction/   # Capa 1 — API + TUI
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

**Grafo de dependencias entre paquetes:**

```
foundation ← core ← interaction
                 ↑
            development
```

- `foundation` no depende de ningún paquete interno (solo de SDKs de LLMs)
- `core` depende de `foundation` (delega razonamiento)
- `development` depende de `core` (define agentes usando los tipos que Core ejecuta)
- `interaction` depende de `core` (punto de entrada que invoca flujos)

**Por qué monorepo**: Cada capa tiene responsabilidad clara y fronteras definidas. El monorepo enforza las dependencias entre capas a nivel de paquete (no por convención). Post-MVP, añadir capas es añadir paquetes (`packages/information/`, `packages/observability/`, `packages/trust/`).

**Por qué pnpm**: Workspaces nativos, resolución de dependencias estricta, eficiente en disco.

### API: Hono

Servidor HTTP para la capa de Interacción. Ligero, con tipado nativo en TypeScript, y agnóstico de runtime (Node, Deno, Bun). Para el MVP, expone los endpoints para invocar agentes.

### TUI: Ink

Framework React para interfaces de terminal. Permite construir una TUI interactiva para comunicarse con los agentes durante el desarrollo. Sencillo de iterar y con un modelo de componentes conocido.

### Persistencia de estado: SQLite

LangGraph soporta checkpointing con SQLite. Para el MVP es suficiente: un archivo en disco, sin infraestructura adicional. Post-MVP se puede migrar a PostgreSQL sin cambiar la interfaz de checkpointing.

### Acceso a LLMs: Providers de LangChain.js

Se utilizan los paquetes oficiales del ecosistema LangChain.js:

- `@langchain/openai`
- `@langchain/anthropic`
- `@langchain/google-genai`

Cualquiera de los tres es válido para el MVP. La interfaz `ChatModel` de LangChain es la misma para todos — cambiar de proveedor es cambiar un import y una API key. La capa de Fundación abstrae esto del resto del sistema.

No se introduce abstracción adicional (como LiteLLM o Vercel AI SDK) en el MVP. Cuando llegue Model Routing (post-MVP), se construirá una capa propia por encima de los providers.

## Stack completo del MVP

| Decisión | Elección | Alternativas descartadas |
|----------|----------|--------------------------|
| Lenguaje | TypeScript | Python (ecosistema más maduro, pero queremos TS de punta a punta) |
| Gestor de paquetes | pnpm (workspaces) | npm, yarn, Bun |
| Estructura | Monorepo (1 paquete = 1 capa) | Paquete único con carpetas |
| Framework de agentes | LangGraph (`@langchain/langgraph`) | CrewAI, AutoGen, custom (ver ADR-001) |
| Servidor HTTP | Hono | Express, Fastify |
| TUI | Ink | Clack, readline manual |
| Persistencia | SQLite | PostgreSQL (post-MVP) |
| Acceso a LLMs | LangChain.js providers | Vercel AI SDK, SDKs directos |

## Consecuencias

### Positivas

- **Un solo lenguaje**: TypeScript en todas las capas reduce el context-switching y simplifica CI/CD
- **Estructura = Arquitectura**: La organización del código refleja las capas del diagrama, fácil de navegar y razonar
- **Extensible**: Añadir capas post-MVP es añadir paquetes, sin reestructurar
- **Mínima infraestructura**: SQLite + un proceso Node — nada más para arrancar el MVP

### Negativas

- **LangChain.js menos maduro que Python**: Algunos features o ejemplos llegan antes a Python
  - **Mitigación**: Las funcionalidades que necesita el MVP (grafos de estado, checkpointing, chat models) están soportadas en TypeScript
- **Ink puede ser overkill para una TUI simple**: React en terminal añade una dependencia
  - **Mitigación**: Si resulta excesivo, se puede reemplazar por algo más ligero sin afectar al resto del sistema

### Nota sobre Python

La estructura de monorepo con paquetes independientes permite integrar Python en el futuro si fuera necesario (e.g., un servicio Python comunicándose por HTTP/gRPC con los paquetes TypeScript). La interfaz entre paquetes es el contrato, no el lenguaje.
