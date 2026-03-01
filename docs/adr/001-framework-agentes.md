# ADR-001: Selección de Framework de Agentes — LangGraph

**Status**: Aceptado

**Fecha**: 2026-03-01

**Sustituye a**: Propuesta inicial de CrewAI (descartada antes de implementación)

## Contexto

openAgents es una **plataforma (PaaS)** para construir, desplegar y operar agentes IA. No es una aplicación de agentes; es la infraestructura sobre la que otros construyen sus agentes. Esta distinción es fundamental para la elección del framework.

### El problema específico

1. **Flexibilidad de patrones**: La plataforma debe soportar cualquier patrón de agentes que sus usuarios necesiten — no solo los que un framework predefina
2. **Control sobre el Core**: Necesitamos diseñar nuestras propias abstracciones (Agent, Memory, Orchestration) sin que el framework imponga las suyas
3. **Integración profunda**: El framework debe ser un componente dentro de nuestra arquitectura, no la arquitectura en sí
4. **Compatibilidad con LLMs**: Debe funcionar con Anthropic, OpenAI, y modelos open-source
5. **Desarrollo progresivo**: Debe permitir empezar simple y escalar en complejidad sin reescribir

## Alternativas consideradas

### Opción A: CrewAI

Framework especializado en agentes con abstracciones de alto nivel.

**Ventajas**:
- Abstracción semántica clara: `Agent(role, goal, backstory)`, `Task`, `Crew`, `Process`
- Memoria unificada de caja (short-term, long-term, entity)
- Tool binding automático
- Orquestación built-in (sequential, hierarchical)
- Arranque rápido: un crew funcional en ~20 líneas

**Desventajas**:
- **Abstracciones opinadas**: El concepto de Agent, Crew y Process son fijos. Si la plataforma necesita patrones que no encajan en sequential/hierarchical, hay que luchar contra el framework
- **Memoria acoplada**: Su sistema de memoria (ChromaDB/LanceDB, SQLite) impone decisiones de storage que la plataforma necesita controlar (multi-tenancy, gobernanza, backends configurables)
- **Techo de flexibilidad**: Para una PaaS donde no sabemos de antemano todos los patrones que los usuarios necesitarán, las abstracciones fijas se convierten en limitación
- **Caja negra parcial**: La orquestación interna del crew es difícil de instrumentar y adaptar

**Conclusión**: Excelente para construir *aplicaciones* de agentes. No ideal como base de una *plataforma* de agentes.

---

### Opción B: LangGraph ← Elegida

Framework de grafos de estado para construir sistemas agentic.

**Ventajas**:
- **Máxima flexibilidad**: Un grafo de estados puede representar cualquier patrón — loops, branches, subgrafos, human-in-the-loop, orquestación dinámica
- **Primitivos, no opiniones**: Te da nodos, edges, state y checkpointing. Tú construyes las abstracciones de tu plataforma encima
- **Control total sobre el Core**: Puedes diseñar exactamente cómo funciona un Agent, cómo se orquesta, cómo fluye el estado — que es precisamente lo que una PaaS necesita
- **Checkpointing nativo**: Persistencia de estado del grafo, lo que habilita human-in-the-loop, recuperación ante fallos, y ejecuciones de larga duración
- **Soporte dual Python/TypeScript**: Flexibilidad de lenguaje sin lock-in
- **Open-source**: Sin dependencia de servicios de pago (LangSmith es opcional, no requerido)

**Desventajas**:
- Más código necesario: no hay abstracción "Agent" de caja, la construyes tú
- Curva de aprendizaje: requiere entender el modelo de grafos de estado
- Sin memoria unificada: el Memory Service es responsabilidad nuestra

**Conclusión**: Los "contras" son exactamente las cosas que una PaaS debe controlar. Que no tenga abstracción de Agent de caja es una *ventaja* porque nuestra plataforma define su propio concepto de Agent.

---

### Opción C: AutoGen (Microsoft)

Framework para conversación multi-agente.

**Ventajas**:
- Enfoque conversacional natural entre agentes
- Comunidad académica activa
- Soporte Python + TypeScript

**Desventajas**:
- Menos determinístico: la conversación puede divergir
- Orientado a chat, no a ejecución de tareas con resultados concretos
- Menor adopción en producción industrial

**Conclusión**: No encaja para tasks orientadas a objetivos con resultados tangibles.

---

### Opción D: Custom Runtime (sin framework)

Construir el runtime de agentes desde cero.

**Ventajas**:
- Control absoluto
- Sin dependencias externas
- Optimizado exactamente a necesidades

**Desventajas**:
- Reimplementar primitivos que LangGraph ya resuelve (grafos de estado, checkpointing, routing condicional)
- Significativamente más tiempo de desarrollo
- Mayor carga de mantenimiento

**Conclusión**: Innecesario. LangGraph proporciona los primitivos de bajo nivel sin imponer abstracciones de alto nivel — es el equilibrio justo.

---

## Decisión

**Usar LangGraph como framework base del runtime de agentes.**

### Razón fundamental

Estamos construyendo una PaaS, no una aplicación. La plataforma necesita **definir sus propias abstracciones** (qué es un Agent, cómo se orquesta, cómo funciona la memoria) y el framework debe ser un *componente* que da primitivos de ejecución, no un *marco* que imponga su modelo mental.

LangGraph da grafos de estado como primitivo. Con eso construimos:
- Nuestro concepto de Agent (más rico y configurable que el de cualquier framework)
- Nuestro Orchestrator (un grafo que decide qué agentes invocar y en qué orden)
- Nuestro Memory Service (con los backends, gobernanza y multi-tenancy que necesitemos)
- Nuestros patrones de ejecución (sin estar limitados a sequential/hierarchical)

### Mapeo a la arquitectura de 7 capas

```
Capa 2 (Desarrollo):
  └─ Herramientas para que los desarrolladores definan agentes y flujos
       ├─ API de definición de Agent (role, tools, skills) → compila a grafo LangGraph
       ├─ API de definición de Flow (pasos, condiciones, sub-agentes)
       └─ Futuro: No-Code builder que genera la misma estructura

Capa 3 (Core):
  └─ Runtime basado en LangGraph
       ├─ Execution Engine: grafos de estado ejecutando el ciclo cognitivo
       ├─ Orchestrator: un grafo supervisor que coordina agentes
       ├─ Memory Service: diseño propio (short-term, long-term, RAG)
       ├─ Checkpointing: persistencia de estado via LangGraph checkpointer
       └─ Event Bus: eventos del sistema (propio, no de LangGraph)
```

### Ejemplo conceptual: un agente como grafo

```python
from langgraph.graph import StateGraph, END

# El state schema lo define la plataforma
class AgentState(TypedDict):
    messages: list
    task: dict
    memory_context: list
    tools_available: list
    iteration: int

# Nodos = funciones que la plataforma controla
def reason(state: AgentState) -> AgentState:
    """El agente razona sobre su siguiente acción."""
    # Llamada al LLM con contexto de memoria + tools
    ...

def execute_tool(state: AgentState) -> AgentState:
    """Ejecuta la tool seleccionada via Tool Gateway."""
    ...

def should_continue(state: AgentState) -> str:
    """Decisión: seguir ejecutando, pedir input humano, o terminar."""
    if needs_human_input(state):
        return "human_in_the_loop"
    if task_completed(state):
        return END
    return "reason"

# El grafo = el ciclo cognitivo del agente
graph = StateGraph(AgentState)
graph.add_node("reason", reason)
graph.add_node("execute_tool", execute_tool)
graph.add_node("human_in_the_loop", wait_for_input)

graph.set_entry_point("reason")
graph.add_conditional_edges("reason", should_continue)
graph.add_edge("execute_tool", "reason")

agent = graph.compile(checkpointer=our_checkpointer)
```

La clave: cada nodo, cada edge, cada decisión condicional la controla la plataforma. No hay caja negra.

## Consecuencias

### Positivas
- **Flexibilidad total**: Cualquier patrón de agente expresable como grafo de estados
- **Abstracciones propias**: La plataforma define Agent, Memory, Orchestration sin restricciones del framework
- **Integración natural con el Core**: LangGraph es un componente del Execution Engine, no lo reemplaza
- **Checkpointing**: Human-in-the-loop y recuperación ante fallos resueltos por el framework
- **Sin servicios de pago obligatorios**: LangGraph es open-source; la observabilidad la construimos con herramientas abiertas (OpenTelemetry, Langfuse, etc.)
- **Escalabilidad de patrones**: De un agente simple a un orquestador multi-agente complejo, todo con el mismo modelo mental

### Negativas
- **Más código inicial**: No hay "Agent en 20 líneas" — hay que construir las abstracciones de la plataforma
  - **Mitigación**: Es trabajo que de todas formas necesitamos hacer; las abstracciones de CrewAI no servirían para una PaaS
- **Curva de aprendizaje**: El modelo de grafos de estado requiere comprensión
  - **Mitigación**: Documentación interna, ejemplos, y la curva se paga una sola vez
- **Memory Service propio**: No hay memoria de caja
  - **Mitigación**: Es deliberado — la plataforma necesita control total sobre memoria (multi-tenancy, gobernanza, backends)

## Impacto en Stack

| Componente | Con CrewAI (descartado) | Con LangGraph (elegido) |
|-----------|------------------------|------------------------|
| Agent definition | CrewAI Agent(role, goal) | Abstracción propia → compila a grafo |
| Orquestación | CrewAI Process (seq/hier) | Grafo supervisor diseñado por nosotros |
| Memory | CrewAI unified memory | Memory Service propio (diseño capa 3) |
| Tool integration | CrewAI tool binding | Tool Gateway propio + nodos del grafo |
| Human-in-the-loop | Limitado | Checkpointing + nodos condicionales |
| Patrones soportados | Sequential, Hierarchical | Cualquiera expresable como grafo |

## Notas adicionales

### LangGraph ≠ LangChain

LangGraph es una librería independiente del ecosistema LangChain. No requiere usar LangChain, LangSmith, ni ningún otro producto de pago. Se puede usar directamente con el SDK de Anthropic, OpenAI, o cualquier cliente LLM.

### Fallback

Si LangGraph presenta limitaciones graves:
1. Los grafos se pueden reimplementar con una librería de state machines propia
2. El modelo mental (nodos + edges + state) es agnóstico de framework
3. El cambio quedaría acotado al Execution Engine de la capa 3

### Referencias
- LangGraph docs: https://langchain-ai.github.io/langgraph/
- LangGraph GitHub: https://github.com/langchain-ai/langgraph
- LangGraph conceptos: https://langchain-ai.github.io/langgraph/concepts/
