# 2. Capa de Desarrollo (La Fábrica)

## Propósito

La capa de desarrollo es donde los usuarios diseñan, construyen y despliegan agentes. Proporciona tres caminos complementarios: código (Code-Based), interfaz visual (No-Code), y orquestación declarativa (Flows). Su responsabilidad es transformar intención de negocio en especificaciones que el Core ejecuta.

Esta capa **no ejecuta** — define. La ejecución es responsabilidad de la capa 3 (Core).

## Componentes

### Code-Based Development (LangGraph)

- **Responsabilidad**: Proporcionar a los desarrolladores las herramientas para definir agentes, flujos y herramientas en código. LangGraph es el framework base que da los primitivos de ejecución (grafos de estado), y la plataforma construye sus propias abstracciones encima.
- **Interfaces expuestas**:
  - API de definición de Agent (role, tools, skills, LLM config)
  - API de definición de Flow (pasos, condiciones, sub-agentes)
  - API de definición de Tool (schema de I/O, permisos, side effects)
  - Compilación: definición → grafo LangGraph ejecutable
- **Interfaces consumidas**: Tool Registry, Skill Registry, LLM Client
- **Tecnologías**: LangGraph (Python/TypeScript), SDK propio de la plataforma

#### ¿Por qué LangGraph y no CrewAI?

Ver [ADR-001](../adr/001-framework-agentes.md) para la decisión completa.

En resumen: estamos construyendo una PaaS, no una aplicación de agentes. Necesitamos **definir nuestras propias abstracciones** (qué es un Agent, cómo se orquesta, cómo funciona la memoria) sin que el framework imponga las suyas. LangGraph da primitivos (nodos, edges, state, checkpointing) y nosotros construimos encima. CrewAI da abstracciones opinadas (Agent/Crew/Process) que se convierten en techo cuando la plataforma necesita patrones que no contempló.

#### Abstracciones de la plataforma (construidas sobre LangGraph)

La plataforma expone su propia API de desarrollo:

```python
# Abstracción de Agent de la plataforma (NO es LangGraph directamente)
agent = platform.define_agent(
    name="code-reviewer",
    role="Revisor de código especializado en Python",
    tools=["filesystem.read", "github.diff", "code.lint"],
    skills=["python-best-practices", "security-review"],
    llm="anthropic/claude-sonnet-4-5",
    memory={"short_term": True, "long_term": True}
)

# Abstracción de Flow
flow = platform.define_flow(
    name="review-pipeline",
    steps=[
        Step(agent="planner", task="Analizar qué archivos revisar"),
        Step(agent="code-reviewer", task="Revisar código", depends_on="planner"),
        Condition(
            if_="review.has_issues",
            then=Step(agent="reporter", task="Generar informe"),
            else_=Step(action="approve")
        )
    ]
)
```

Internamente, `platform.define_agent()` compila a un grafo LangGraph con nodos para razonamiento, ejecución de tools, y decisiones condicionales. Pero el usuario de la plataforma no necesita saber que LangGraph existe.

#### Versus CrewAI (descartado)

| Aspecto | CrewAI | LangGraph (elegido) |
|---------|--------|---------------------|
| Modelo mental | Roles fijos (Agent/Crew/Process) | Grafos de estado (nodos/edges/state) |
| Flexibilidad | Sequential o Hierarchical | Cualquier patrón expresable como grafo |
| Abstracciones | Las del framework | Las que la plataforma defina |
| Memoria | Acoplada (ChromaDB/SQLite) | Desacoplada (Memory Service propio) |
| Control del Core | Parcial (caja negra en orquestación) | Total (cada nodo y edge lo controlamos) |

### No-Code/Low-Code Studio

- **Responsabilidad**: Interfaz visual para usuarios sin experiencia en programación. Construye agentes y flujos mediante drag-and-drop, templates y configuradores visuales.
- **Interfaces expuestas**:
  - Canvas de agentes y flujos
  - Selector de tools y skills
  - Constructor de condiciones y branches
  - Publicador de workflows
- **Interfaces consumidas**: Misma API de definición que Code-Based (genera la misma estructura)
- **Tecnologías candidatas**: React Flow, editor visual tipo n8n

#### Principio clave

El No-Code Studio genera **exactamente la misma estructura** que el path Code-Based. No es un sistema paralelo; es otra interfaz para la misma API de definición. Lo que el desarrollador escribe en código, el integrador lo arma visualmente. Ambos compilan al mismo grafo.

```
Code-Based ──→ platform.define_agent() ──→ Grafo LangGraph
                                             ↑
No-Code    ──→ Visual Builder ──→ JSON/YAML ─┘
```

### Flow Orchestration

- **Responsabilidad**: Definición del esqueleto lógico de workflows complejos — condicionales, loops, paralelismo, manejo de errores, coordinación entre múltiples agentes.
- **Interfaces expuestas**:
  - Schema declarativo de flujos (YAML/JSON)
  - Condiciones y branches (`if`, `switch`, `parallel`)
  - Error handling y retries
  - Puntos de human-in-the-loop
- **Interfaces consumidas**: Orchestrator (capa 3), Event Bus (capa 3)
- **Tecnologías candidatas**: Schema propio inspirado en Temporal/Argo Workflows

#### Ejemplo de Flow

```yaml
version: 1
name: "content-generation-pipeline"

steps:
  - id: research
    agent: researcher
    inputs:
      topic: "{{ params.topic }}"
    on_failure: retry(max=3, backoff=exponential)

  - id: draft
    agent: writer
    depends_on: research
    inputs:
      research_result: "{{ steps.research.output }}"

  - id: review
    agent: reviewer
    depends_on: draft
    human_approval: true  # pausa para aprobación humana

  - id: publish
    condition: "{{ steps.review.approved == true }}"
    action: call_tool
    tool: "api.publish"
    payload: "{{ steps.draft.output }}"
```

Este YAML se compila a un grafo LangGraph con nodos, edges condicionales, y checkpoints en los puntos de human-in-the-loop.

## Decisiones técnicas

### LangGraph como base, abstracciones propias encima

LangGraph proporciona los primitivos de ejecución. La plataforma construye su SDK de desarrollo encima:
- `platform.define_agent()` — compila a grafo con loop cognitivo
- `platform.define_flow()` — compila a grafo con orquestación multi-agente
- `platform.define_tool()` — registra en Tool Gateway

El desarrollador interactúa con la API de la plataforma, no con LangGraph directamente (aunque puede acceder al grafo si necesita customización avanzada).

### Ciclo de vida de un agente

1. **Definición**: Developer escribe código o usa No-Code Builder
2. **Validación**: Verificar que tools, skills y LLM config existen y son compatibles
3. **Compilación**: Generar grafo LangGraph desde la definición
4. **Registro**: Publicar en el Agent Registry con metadatos y versión
5. **Despliegue**: El Orchestrator puede invocar la versión registrada

### Lenguaje

Decisión pendiente (ver preguntas abiertas). LangGraph soporta Python y TypeScript. La elección de lenguaje es secundaria respecto a la decisión arquitectónica — lo que importa es que LangGraph da la flexibilidad para diseñar el Core.

## Alcance MVP

**En scope:**
- Definición de agentes en código usando API de la plataforma
- Compilación a grafo LangGraph básico (loop: reason → tool → reason)
- Un agente ejemplo: `general-assistant` con tools de filesystem
- Carga de definiciones desde filesystem
- Validación básica de estructura

**Fuera de scope (post-MVP):**
- No-Code/Low-Code Studio (Fase 2)
- Flow Orchestration declarativo con YAML (Fase 2-3)
- Versionado en Agent Registry (Fase 3)
- Composición de agentes (agente que invoca otro agente)
- Publicación de skills/agents por terceros

## Preguntas abiertas

1. **¿Python o TypeScript para el SDK?** LangGraph soporta ambos. Python tiene mejor ecosistema de IA; TypeScript da homogeneidad con un posible Core en TS. Decisión pendiente de spike técnico.

2. **¿Cuánta abstracción sobre LangGraph?** ¿El SDK de la plataforma oculta LangGraph completamente, o permite acceso directo al grafo para casos avanzados? Propuesta: ocultar por defecto, exponer bajo flag `advanced=True`.

3. **¿Formato de definición?** ¿Python puro, YAML, JSON, o combinación? Para No-Code el output natural es JSON/YAML. Para Code-Based, Python. Ambos deben compilar al mismo artefacto.

4. **¿Cómo se empaquetan los agentes?** ¿Docker image, Python package, archivo de definición + dependencias? Impacta en portabilidad y sandbox.

5. **¿Ecosistema abierto?** ¿Usuarios pueden publicar agentes/skills que otros descarguen? Fuera de MVP pero la decisión de formato de empaquetado la condiciona.
