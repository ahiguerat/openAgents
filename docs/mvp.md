# MVP — openAgents

## Objetivo

Validar el núcleo de la plataforma: que un agente definido en código se ejecute de extremo a extremo — reciba una petición, razone con un LLM, y devuelva un resultado. Sin infraestructura empresarial (observabilidad, seguridad, RAG), sin interfaces visuales. Solo el camino crítico.

## Capas incluidas

El MVP cubre 4 de las 7 capas de la arquitectura:

```
┌─────────────────────────────────────────────┐
│  1. Interacción        TUI + API básica     │
├─────────────────────────────────────────────┤
│  2. Desarrollo         Solo Code-Based      │
├─────────────────────────────────────────────┤
│  3. Core               Execution Engine +   │
│                        Memoria corto plazo  │
├─────────────────────────────────────────────┤
│  5. Fundación          Un proveedor LLM     │
└─────────────────────────────────────────────┘
```

### Capas excluidas

- **4. Información** — Sin RAG ni data lake. Los agentes del MVP trabajan con tools, no con conocimiento indexado.
- **6. Observabilidad** — Logs estándar del runtime. Sin sistema de trazas, métricas ni FinOps dedicado.
- **7. Trust** — Autenticación básica a nivel de código (API key). Sin IAM/RBAC, guardrails ni registry.

## Alcance por capa

### 1. Interacción

- **TUI**: Interfaz de terminal para interactuar con agentes en tiempo real (enviar peticiones, ver respuestas, seguir el flujo).
- **API REST**: Endpoint básico con Hono para invocar agentes programáticamente.
- **Fuera de alcance**: Generative UI, chatbots con UI propia, canales (Slack, email, voz).

### 2. Desarrollo

- **Code-Based**: SDK en TypeScript para definir agentes, tools y flujos. El código define la estructura que el Core ejecuta.
- **Fuera de alcance**: No-Code/Low-Code builder, orquestación visual, Git/CI/CD integrado.

### 3. Core

- **Execution Engine**: Ciclo cognitivo del agente implementado como grafo de estado (LangGraph). Enrutamiento, lógica condicional, checkpointing.
- **Memoria de corto plazo**: Estado de la tarea en curso (in-memory o SQLite). Suficiente para que el agente mantenga contexto dentro de una ejecución.
- **Fuera de alcance**: Memoria de largo plazo, Code Sandbox, Buses de Eventos, orquestación multi-agente compleja.

### 5. Fundación

- **Acceso a un proveedor de LLM**: Mediante LangChain.js providers (`@langchain/openai`, `@langchain/anthropic` o `@langchain/google-genai`). Un solo proveedor configurado.
- **Fuera de alcance**: Model Routing, multi-proveedor simultáneo, Context Caching.

## Stack tecnológico

Definido en [ADR-002](adr/002-stack-tecnologico-mvp.md). Resumen:

| Componente | Tecnología |
|------------|------------|
| Lenguaje | TypeScript |
| Framework de agentes | LangGraph (`@langchain/langgraph`) |
| Estructura | Monorepo (pnpm workspaces) |
| Servidor HTTP | Hono |
| TUI | Ink |
| Persistencia | SQLite |
| Acceso a LLMs | LangChain.js providers |

## Estructura del proyecto

```
openagents/
├── packages/
│   ├── foundation/    # Capa 5
│   ├── core/          # Capa 3
│   ├── development/   # Capa 2
│   └── interaction/   # Capa 1
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

Dependencias entre paquetes:

```
foundation ← core ← interaction
                 ↑
            development
```

## Criterio de éxito

El MVP está completo cuando:

1. Se puede definir un agente en TypeScript usando el SDK de Desarrollo
2. Ese agente se ejecuta en el Core (grafo de estado con ciclo cognitivo)
3. El agente razona con un LLM a través de Fundación
4. Un usuario puede interactuar con el agente desde la TUI o la API
