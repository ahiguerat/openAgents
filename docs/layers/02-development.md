# 2. Capa de Desarrollo (La Fábrica)

## Propósito

La capa de desarrollo es donde los usuarios diseñan, construyen y despliegan agentes. Proporciona tres caminos complementarios: código especializado (CrewAI), interfaz visual (No-Code), y orquestación declarativa (Flows). Su responsabilidad es transformar intención de negocio en especificaciones que el Core ejecuta.

## Componentes

### Code-Based Development (CrewAI)
- **Responsabilidad**: Framework para definir agentes, crews y tasks en código Python. Especialización: roles claros, delegación automática, memory nativa.
- **Interfaces expuestas**:
  - `Agent` — Unidad especializada con rol, goal, tools y skills
  - `Crew` — Agrupación de agentes con proceso coordinado (sequential, hierarchical)
  - `Task` — Objetivo concreto asignado a un agente
  - `Tool` — Integración con librería externa (API, filesystem, database)
  - `Process` — Estrategia de ejecución (quién coordina, orden de ejecución)
- **Interfaces consumidas**: Tool Registry, Skill Registry, Orchestrator
- **Tecnologías**: CrewAI (Python), decoradores e inicialización YAML/JSON

#### CrewAI en nuestro contexto
CrewAI aporta:
- **Agentes tipados**: `Agent(role, goal, backstory, tools, skills)` — estructura clara vs. prompting libre
- **Tasks explícitas**: `Task(description, agent, expected_output)` — ciclo de vida controlado
- **Memory unificada**: CrewAI maneja short-term (estado de conversación) y long-term (knowledge persistente)
- **Tool binding automático**: Los tools se pasan al agente y se invocan vía tool use nativo
- **Process orchestration**: `Process.sequential | Process.hierarchical` — define quién coordina

**Decisión de diseño**: CrewAI resuelve la orquestación interna de un crew (qué agente → qué task → qué herramienta). El `Orchestrator` de la capa Core asume el rol de supervisor global (múltiples crews, políticas, human-in-the-loop).

#### Versus alternativas
- **LangGraph**: Más flexible pero más bajo nivel; requiere escribir loops manuales
- **AutoGen**: Enfoque más conversacional; menos determinístico
- **Custom runtime**: Máximo control pero requiere más código y testing
- **Decisión**: CrewAI + Anthropic SDK vía OpenRouter. CrewAI da estructura; Anthropic SDK da calidad de razonamiento.

#### Estructura de un Crew típico
```python
from crewai import Agent, Task, Crew, Process

# Definir agentes especializados
planner = Agent(
    role="Planificador",
    goal="Descomponer tareas en pasos ejecutables",
    backstory="Experto en planificación...",
    tools=[research_tool, web_search_tool],
    skills=["planning", "analysis"]
)

coder = Agent(
    role="Desarrollador",
    goal="Escribir código de calidad",
    backstory="Ingeniero de software con 10 años...",
    tools=[filesystem_tool, compiler_tool],
    skills=["python", "testing"]
)

# Definir tasks
plan_task = Task(
    description="Analizar el objetivo y crear un plan",
    agent=planner,
    expected_output="Plan detallado en markdown"
)

implement_task = Task(
    description="Implementar según el plan",
    agent=coder,
    expected_output="Código funcionando"
)

# Crear crew
crew = Crew(
    agents=[planner, coder],
    tasks=[plan_task, implement_task],
    process=Process.sequential  # planner primero, luego coder
)

# Resultado
result = crew.kickoff(inputs={"objective": "Crear un CLI en Python"})
```

### No-Code/Low-Code Studio
- **Responsabilidad**: Interfaz visual para usuarios sin experiencia en programación. Construye crews mediante drag-and-drop, templates y configuradores visuales.
- **Interfaces expuestas**:
  - Canvas de agents y tasks
  - Selector de tools y skills
  - Constructor de condiciones y branches
  - Publicador de workflows
- **Interfaces consumidas**: Skill Registry, Tool Registry, Orchestrator
- **Tecnologías candidatas**: React Flow, Figma-like canvas, n8n-style builder

#### Flujo de No-Code
1. Usuario selecciona template o crea desde cero
2. Añade agentes predefinidos al canvas
3. Conecta tasks entre agentes (arrastrar flechas)
4. Configura parámetros de cada agent (role, goal, herramientas disponibles)
5. Publica → genera YAML/JSON → envía al Orchestrator
6. El Orchestrator transforma en CrewAI internamente (si aplica)

### Flow Orchestration
- **Responsabilidad**: Lenguaje declarativo para definir flujos complejos con condicionales, loops, errores, y coordinación entre múltiples crews.
- **Interfaces expuestas**:
  - YAML/JSON schema de flujos
  - Condiciones y branches (`if`, `switch`, `loop`)
  - Error handling y retries
  - Integración con eventos del Message Bus
- **Interfaces consumidas**: Orchestrator, Message Bus
- **Tecnologías candidatas**: Declarativo YAML similar a Argo Workflows, Temporal, Step Functions

#### Ejemplo de Flow Orchestration
```yaml
version: 1
name: "content-generation-pipeline"

steps:
  - id: research
    crew: research-crew
    inputs:
      topic: "{{ params.topic }}"
    on_failure: retry-with-backoff

  - id: draft
    crew: writer-crew
    depends_on: research
    inputs:
      research_result: "{{ steps.research.output }}"
    on_failure: notify-owner

  - id: review
    crew: reviewer-crew
    depends_on: draft
    inputs:
      draft: "{{ steps.draft.output }}"

  - id: publish
    condition: "{{ steps.review.approved == true }}"
    action: call-external-api
    api_endpoint: "/content-hub/publish"
    payload: "{{ steps.draft.output }}"
```

## Decisiones técnicas

### Lenguaje y entorno
- **CrewAI en Python**: Decisión de ir a Python en lugar de TypeScript/Bun del MVP. Razón: CrewAI es Python-first, LLMs responden mejor a Python, librerias de análisis son más maduras en Python.
- **Aislamiento**: Crews ejecutan en contenedores separados (sandbox de código) — responsabilidad del Core.
- **Control de versión**: Cada crew versionado en repo (Git) o package manager (PyPI, artifact registry).

### Ciclo de vida de un crew
1. **Definición**: Usuario escribe o arma en No-Code
2. **Validación**: Verificar que agentes, tasks y tools existen
3. **Empaquetamiento**: Crear imagen Docker o tarball con dependencias
4. **Registro**: Guardar en Skill Registry con metadatos (versión, requerimientos)
5. **Despliegue**: El Orchestrator invoca la versión registrada

### Mapeo a componentes del Core
- Cada `Agent` de CrewAI → corresponde a un `Agent Runtime` en el Core (con su contexto, herramientas, skills)
- Cada `Task` → ciclo de tool use administrado por Agent Runtime
- Cada `Crew` → coordinación resuelta por CrewAI internamente, supervisado globalmente por Orchestrator del Core
- Memoria de CrewAI (short/long-term) → integrada con Memory Service del Core

## Alcance MVP

**En scope:**
- Definición manual de un crew en Python (sin builder visual aún)
- Un crew example: `general-assistant` con dos agents (planner, executor) integrados
- Carga de crews desde filesystem
- Validación básica de estructura (agentes, tasks, tools)
- Tool binding: crews acceden a herramientas vía Tool Registry del Core

**Fuera de scope (post-MVP):**
- No-Code/Low-Code Studio (Fase 2)
- Flow Orchestration declarativo (Fase 2-3)
- Versionado en Skill Registry (Fase 3)
- Múltiples crews competidores para una tarea
- Composición de crews (crew que llama otro crew)
- Debugging visual de ejecución de crew

## Preguntas abiertas

1. **¿Dónde vive el SDK de CrewAI?** En un paquete Python separado `@openagents/crewai-integration` o como parte de `platform/` en su propio submódulo.

2. **¿Cómo se comunican crews entre sí?** En MVP, el Orchestrator es quien orquesta crews secuencialmente. En fases posteriores, crews pueden usar Message Bus para coordinación directa.

3. **¿Sandboxing de crews?** La ejecución de código Python requiere aislamiento. Opciones:
   - Contenedores Docker por crew
   - Web Workers en Deno (si es posible)
   - Procesos isolados con permisos restrictivos
   Decisión pendiente; MVP podría ejecutar sin sandbox estricto en dev.

4. **¿Ecosistema de skills público?** ¿Los users pueden publicar skills y que otros las descarguen? Fuera de MVP pero importante para Fase 3.

5. **¿Cómo es el debugging de crews?** En MVP, logs + console output. En prod, traces completas en Observability.

6. **¿Integración con modelos no-Anthropic?** CrewAI soporta OpenAI, Gemini, etc. Decisión: en MVP, sólo Anthropic vía OpenRouter. Extensibilidad a otros modelos en Fase 3.

7. **¿Actualización en vivo de crews?** ¿Puedo cambiar un crew y que afecte ejecuciones en curso? Fuera de MVP. Versioning + rolling updates en Fase 4.
