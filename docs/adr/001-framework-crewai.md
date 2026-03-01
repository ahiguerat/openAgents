# ADR-001: Uso de CrewAI como Framework de Agentes

**Status**: Propuesto

**Fecha**: 2025-03-01

## Contexto

openAgents necesita un framework para definir, orquestar y ejecutar agentes especializados. Los agentes son entidades autónomas con roles (planner, coder, reviewer, etc.), cada una con objetivos claros, herramientas asignadas y habilidades (skills).

Durante la fase de diseño, se evaluaron múltiples opciones:

### El problema específico
1. **Definición clara de agentes**: Necesitamos que los desarrolladores creen agentes con rol, goal, herramientas y skills de forma declarativa
2. **Orquestación interna**: Un crew (grupo de agentes) debe poder coordinarse automáticamente
3. **Memoria integrada**: Agentes deben acceder a conocimiento compartido sin boilerplate
4. **Compatibilidad con LLMs**: Debe funcionar con Anthropic, OpenAI, y modelos open-source
5. **Desarrollo rápido**: El MVP debe salir en corto plazo

## Alternativas consideradas

### Opción A: CrewAI
Framework especializado en agentes, escrito en Python.

**Ventajas**:
- Abstracción clara: `Agent`, `Task`, `Crew`, `Process` — estructura semántica
- Memory unificada: Maneja short-term (conversación) y long-term (knowledge) sin código extra
- Tool binding automático: Los tools se integran nativamente al agente
- Process orchestration: Define estrategia (sequential, hierarchical) sin código manual
- Ecosistema: Integración con LangChain, LlamaIndex
- Comunidad activa y documentación en crecimiento
- Permite enfoque "code-first" para builders avanzados

**Desventajas**:
- Python-first (no TypeScript)
- Menos maduro que LangGraph (aún en fase activa de desarrollo)
- Documentación puede tener gaps
- Menos flexible que un runtime custom (requiere trabajar dentro del paradigma de CrewAI)
- No es el framework favorito de la comunidad IA (LangGraph es más popular)

**Decisión**: Usar CrewAI para **definición e interna** del crew. El Orchestrator (componente global) supervisa crews y toma decisiones de nivel superior que CrewAI no expone (human-in-the-loop, políticas globales).

---

### Opción B: LangGraph
Framework más bajo nivel de LangChain, permite construir graphs de agentic logic.

**Ventajas**:
- Ultra-flexible: Puedes construir cualquier patrón de agent
- Debugging visual: LangSmith integrado (puede ver graph execution)
- TypeScript / Python: Soporte dual
- Ya usado internamente en Anthropic (confianza)
- Menos opinado: Tú construyes el loop explícitamente

**Desventajas**:
- Bajo nivel: No hay abstracción de "Agent" o "Skill", todo es custom
- Más código boilerplate: El loop de tool use lo escribes tú
- Memory manual: No hay memory unificada de caja
- Curva de aprendizaje: Documentación asume conocimiento de LangChain
- Overhead de abstracciones LangChain (a veces excesivo para casos simples)

**Decisión**: LangGraph sería opción si necesitábamos máxima flexibilidad, pero CrewAI es más pragmático para MVP.

---

### Opción C: AutoGen (Microsoft)
Framework para multi-agent conversation.

**Ventajas**:
- Enfoque conversacional: Agentes se hablan entre sí
- Python + TypeScript
- Comunidad académica fuerte
- Integración con GPT-4

**Desventajas**:
- Menos determinístico: Conversación puede divergir
- Memory no integrada
- Documentación enfocada en chat, no en task execution
- Menos adoptado en industria

**Decisión**: No es un buen fit para tasks orientadas a objetivos (no conversacional).

---

### Opción D: Custom Runtime
Construir nuestro propio framework desde cero.

**Ventajas**:
- Control total
- Optimizado exactamente a nuestras necesidades
- Sin dependencias (riesgo de cambios en libraries externas)
- Más rápido (sin abstracciones innecesarias)

**Desventajas**:
- Retrabajar ruedas cuadradas: loops de tool use, memory, orchestration
- Más testing y debugging necesario
- Mantenimiento a largo plazo
- Hiring harder (menos developers saben nuestro framework)
- MVP tomaría 2-3 veces más tiempo

**Decisión**: Demasiado riesgo para MVP. Considerar en Fase 3 si rendimiento / flexibilidad lo requieren.

---

## Decisión

**Decidimos: Usar CrewAI como framework de definición y ejecución interna de agentes.**

### Implementación
1. **Capa de Desarrollo (Layer 2)**: CrewAI es el punto de entrada para desarrolladores. Definen Agents, Tasks, y Crews en Python.
2. **Capa Core (Layer 3)**: El Orchestrator (componente global LLM-driven) supervisa crews. Maneja:
   - Selección de qué crew invocar
   - Ciclo de vida global (blocking para human-in-the-loop)
   - Políticas (timeout, budget)
   - Consolidación de resultados de múltiples crews

3. **Agent Runtime**: Ejecuta el crew usando CrewAI, capturando outputs y eventos.

### Mapeo a Architecture
```
Layer 2 (Desarrollo):
  └─ CrewAI Crews (Python)
       ├─ Agent (planner, coder, reviewer, ...)
       ├─ Task (objetivo concreto)
       └─ Tools (integradas)

Layer 3 (Core):
  └─ Orchestrator LLM (TypeScript)
       ├─ Agent Runtime (ejecuta crews)
       ├─ Memory Service (acceso unificado)
       └─ Message Bus (inter-crew coordination)
```

### Estándares para crews
1. **Ubicación**: `skills/{skill-name}/crew.py`
2. **Estructura mínima**:
   ```python
   from crewai import Agent, Task, Crew, Process

   def create_crew():
       agents = [
           Agent(role="...", goal="...", tools=[...]),
           ...
       ]
       tasks = [
           Task(description="...", agent=agents[0]),
           ...
       ]
       return Crew(
           agents=agents,
           tasks=tasks,
           process=Process.sequential  # or hierarchical
       )
   ```
3. **Logging**: Toda invocación loguea con `trace_id` y `task_id`

## Consecuencias

### Positivas
- **Desarrollo rápido**: Estructura clara acelera MVP
- **Abstracción semántica**: Developers piensan en roles/skills, no en prompts bajos nivel
- **Memory out-of-box**: No reimplementar memory system
- **Integración suave**: CrewAI + Anthropic SDK funcionan bien juntos
- **Precedent**: La industria adopta CrewAI para agent applications
- **Python compatibility**: Ecosistema de DS/AI ya usa Python

### Negativas
- **Python vs TypeScript**: MVP Core está en TypeScript, crews en Python. Necesita IPC.
  - **Mitigación**: Crews ejecutan en procesos isolados, comunican vía JSON
- **Menos flexible**: Si un patrón de agent requiere lógica custom, está limitado por CrewAI
  - **Mitigación**: Fase 3 permite overrides custom
- **Madurez**: CrewAI evoluciona rápido, posibles breaking changes
  - **Mitigación**: Fijar versión, test suite comprehensive
- **Learning curve**: Nuevo para equipo, documentación de CrewAI mejorable
  - **Mitigación**: Escribir ejemplos internos, mentoring

## Impacto en Stack

| Componente | Antes | Después |
|-----------|-------|---------|
| Agent definition | Custom DSL o prompting libre | CrewAI + Python |
| Orchestration interna de crew | Manual | CrewAI built-in |
| Memory | Implementar desde cero | CrewAI unified memory |
| Tool integration | Custom Gateway | CrewAI agents.tools + Tool Gateway bridge |
| Language | TypeScript (MVP core) | TypeScript (core) + Python (crews) |

## Timeline

- **MVP (Semana 1-2)**: Un crew ejemplo (general-assistant) funcionando end-to-end
- **Fase 2 (Mes 1-2)**: Múltiples crews (planner, coder, reviewer) con selección automática
- **Fase 3 (Mes 2-3)**: Composición de crews (crew que llama otro crew)
- **Fase 4 (Mes 3+)**: Hardening, custom extensions

## Notas adicionales

### Roadmap de CrewAI que nos afecta
CrewAI está mejorando rápidamente:
- **v0.28+**: Memory mejorada
- **Próximo**: Soporte mejor para hierarchical processes
- **Futuro**: Integración nativa con cache de contexto (Anthropic)

Mantener eye en releases.

### Fallback: Migración a LangGraph
Si CrewAI se vuelve bloqueante:
1. Crews definen estructura en YAML (agnóstica de framework)
2. Agent Runtime puede parsear YAML con LangGraph o CrewAI
3. Cambio sería interno a `platform/runtime/`

No es blocking para MVP.

### Decisión complementaria: Python interop
- Core (Orchestrator, API Gateway) sigue siendo TypeScript + Bun
- Crews ejecutan como procesos Python separados
- Comunicación vía JSON over stdin/stdout o HTTP
- Sandbox: cada crew en contenedor (Fase 5)

### Referencias
- CrewAI docs: https://docs.crewai.com
- CrewAI GitHub: https://github.com/joaomdmoura/crewAI
- LangGraph (alternativa): https://langchain-ai.github.io/langgraph/
