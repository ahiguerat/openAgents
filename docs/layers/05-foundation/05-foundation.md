# 5. Capa de Fundación (Inteligencia)

## Propósito

La capa de fundación abstrae y gestiona los modelos de lenguaje. Proporciona enrutamiento inteligente entre proveedores, caché de contexto para reducir latencia, y contabilización de tokens. Su responsabilidad es garantizar que los agentes siempre tienen acceso al mejor modelo para su tarea, de forma eficiente y rastreable.

## Componentes

### Model Routing
- **Responsabilidad**: Decidir qué modelo usar en cada invocación basado en costo, latencia, capacidades y carga actual. Soporta fallback si un modelo falla.
- **Interfaces expuestas**:
  - `select_model(task, constraints)` → model_id
  - `route_request(prompt, capabilities)` → selected model
  - `get_model_status()` → latency, cost, availability
- **Interfaces consumidas**: LLM Client, Observability
- **Tecnologías candidatas**: Custom rules engine, OpenRouter routing, LLM Provider SDKs

#### Estrategias de routing
1. **By capability**: ¿Necesito vision? ¿Razonamiento avanzado? → seleccionar modelo más capaz
2. **By cost**: ¿Task es simple? → usar modelo más barato (Sonnet vs Opus)
3. **By latency**: ¿User espera respuesta rápida? → modelo con menor latencia
4. **By load**: ¿Proveedor está saturado? → cambiar a competidor
5. **By policy**: Workspace define "solo Anthropic" o "prefer open models"

#### Ejemplo de decision tree
```
IF task.type == "coding" AND model_available(Opus) THEN Opus
ELSE IF task.type == "classification" THEN Sonnet (good balance)
ELSE IF task.latency_budget < 2s THEN Haiku (fastest)
ELSE IF workspace.budget < 100$ THEN Haiku
ELSE Sonnet (default)
```

### Model-as-a-Service (MaaS) Abstraction
- **Responsabilidad**: Interfaz unificada para llamar cualquier proveedor (Anthropic, OpenAI, together.ai, etc.). Normaliza request/response entre APIs diferentes.
- **Interfaces expuestas**:
  - `chat(model, messages, tools, temperature, max_tokens)` → response
  - `stream(...)` — versión streaming
  - `batch(requests)` → responses
- **Interfaces consumidas**: Orchestrator, Agent Runtime, Model Router
- **Tecnologías candidatas**: LiteLLM, LangChain LLMChain, custom adapter layer

#### Abstracción de interfaz
```typescript
interface LLMClient {
  chat(params: {
    model: string        // "claude-opus-4-6" o "gpt-4-turbo"
    messages: Message[]
    tools?: ToolSpec[]
    system?: string
    temperature?: number
    max_tokens?: number
  }): Promise<{
    content: string
    tool_calls: Array<{ id: string; name: string; input: object }>
    stop_reason: "end_turn" | "tool_use" | "stop_sequence"
    usage: { input_tokens: number; output_tokens: number }
  }>
}
```

Esta abstracción permite swappear proveedores sin cambiar código de agentes.

#### Ventaja: No importar SDK directamente
Agentes solo usan `LLMClient`, nunca `anthropic.Anthropic` o `openai.OpenAI` directamente. Si quiero cambiar de Sonnet a GPT-4, cambio una línea en la configuración.

### Context Caching
- **Responsabilidad**: Cachear contextos grandes (system prompt + memoria larga + RAG) para reducir latencia y costo de tokens.
- **Interfaces expuestas**:
  - `cache_key(project_id, agent_role, memory_version)` → key
  - `get_cached_context(key)` → contexto + cache headers
  - `invalidate_cache(patterns)` → purgar
- **Interfaces consumidas**: LLM Client, Memory Service
- **Tecnologías candidatas**: Redis, in-memory LRU cache, LLM native caching (Anthropic Cache Control)

#### Caching por nivel
1. **Application level**: Cache de RAG chunks + memory summaries (Redis)
2. **LLM level**: Prompt caching nativo (Anthropic Cache Control API) — cachea system prompt + long context
3. **Database level**: Cache de queries SQL (Redis)

#### Ejemplo: System prompt caching
Si el system prompt es estable (skills + instructions), Anthropic's Cache Control permite:
```typescript
const response = await client.messages.create({
  model: "claude-opus-4-6",
  max_tokens: 4096,
  system: [
    {
      type: "text",
      text: system_prompt,
      cache_control: { type: "ephemeral" }  // cachear por 5 min
    }
  ],
  messages: [{ role: "user", content: user_message }]
})
```

Así si ejecutamos 10 tareas con el mismo system prompt, solo la primera paga tokens completos.

#### Política de invalidación
Cache se invalida cuando:
- Memory Service cambia (nueva info larga plazo)
- Skill se actualiza
- Policy de Orchestrator cambia
- Explícitamente por admin

## Decisiones técnicas

### OpenRouter como default en MVP
- Una API key, todos los modelos
- Soporte para Anthropic, OpenAI, open-source
- Sin cambiar SDK; solo URL + key

### Model routing por políticas simples en MVP
MVP no tiene machine learning de routing. Decisiones hardcodeadas:
- `planner` → Sonnet (buen balance reasoning)
- `coder` → Opus (máxima calidad)
- `reviewer` → Sonnet (suficiente)
- Fallback: Haiku si Sonnet no disponible

Fase 2: Routing inteligente basado en latencia/costo históricos.

### Caching priorizado: RAG + memory, no system prompt aún
En MVP, cachear chunks RAG y memory summaries es importante (evita re-indexar). System prompt caching de Anthropic se activa en Fase 2 cuando hay estabilidad.

### Sin multi-proveedor en MVP
MVP solo Anthropic vía OpenRouter. Soporte multi-proveedor (GPT-4, Gemini, open-source):
- Fase 2: Agregar OpenAI connector
- Fase 3: Gemini, Llama, etc.

## Alcance MVP

**En scope:**
- LLMClient abstracción (no SDK directo)
- Anthropic vía OpenRouter como único proveedor
- Model selection simple (hardcoded per agent role)
- Logging de tokens y costos
- In-memory cache de últimas respuestas

**Fuera de scope:**
- Context Caching nativo de Anthropic
- Multi-proveedor (OpenAI, Gemini)
- Machine learning routing
- Fallback automático si modelo falla
- Batch API
- Fine-tuning

## Preguntas abiertas

1. **¿Cuándo cambiar de modelo?** Si latency > 10s, reintentar con Haiku? ¿O es mejor fallar rápido?

2. **¿Token budget por workspace?** "Este cliente puede gastar max $100/mes". ¿Rechazar tasks si excede? ¿O pausar con warning?

3. **¿Streaming en MVP?** Agent Runtime hoy retorna response final. Streaming de tokens en Fase 2 para UX better.

4. **¿Temperature y max_tokens tunables?** Por defecto: temperature=0.7, max_tokens=4096. ¿Por qué cambiar? Rare. Dejar para Fase 3.

5. **¿Cache invalidation automática?** ¿Cuándo exactamente invalidar? Propuesta: versionado de skills + manual purge.

6. **¿Monitoreo de modelo performance?** ¿Trackear qué modelo funciona mejor para cada task type? Sí, in observability. MVP puede loguear pero sin análisis.

7. **¿Downtime de proveedor?** Si OpenRouter cae, ¿fallback a cliente local (Ollama)? Fuera de MVP. En Fase 4 con contingency.

8. **¿Cost optimization?** ¿Usar modelo más barato si la tarea es sencilla? Routing inteligente, Fase 2.
