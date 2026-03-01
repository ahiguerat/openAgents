# 6. Observabilidad (Monitoreo y Análisis)

## Propósito

La capa de observabilidad proporciona visibilidad sobre la ejecución de agentes, desempeño del sistema, costos, y calidad de resultados. Permite rastrear cada tarea desde principio a fin, detectar anomalías, optimizar costos, y evaluar si los agentes están cumpliendo sus objetivos.

## Componentes

### Monitoring (Logs, Métricas, Trazas)
- **Responsabilidad**: Capturar y almacenar eventos de sistema, métricas de performance, y trazas distribuidas para diagnóstico.
- **Interfaces expuestas**:
  - `log(level, message, context)` — Logs estructurados
  - `emit_metric(name, value, tags)` — Métricas punto
  - `record_trace(trace_id, events)` — Trazas distribuidas
  - `query_logs(filters)` → eventos
- **Interfaces consumidas**: Todos los componentes (Agent Runtime, Orchestrator, Tool Gateway, Memory Service)
- **Tecnologías candidatas**: Datadog, Grafana Loki, ELK Stack, Prometheus, Jaeger

#### Logs estructurados
Cada evento incluye:
- `timestamp` — Cuándo ocurrió
- `trace_id` — ID único de la tarea, para ligar todos los eventos
- `task_id` — Identificador de tarea
- `component` — Quién lo emitió (Orchestrator, Tool Gateway, etc.)
- `level` — INFO, WARN, ERROR
- `message` — Texto humano
- `context` — JSON con datos adicionales

```json
{
  "timestamp": "2025-03-01T10:15:23.456Z",
  "trace_id": "trace-abc-123",
  "task_id": "task-456",
  "component": "Agent Runtime",
  "level": "INFO",
  "message": "Tool invoked",
  "context": {
    "tool_name": "filesystem.read",
    "input": { "path": "README.md" },
    "duration_ms": 45,
    "status": "success"
  }
}
```

#### Métricas clave
- **Latency**: Time to completion per task, per agent, per tool
- **Throughput**: Tasks completed per minute
- **Error rate**: % tasks failed
- **Tool performance**: Invocations, latency, failures por tool
- **Memory**: Memory usage por task, cache hit rate
- **LLM usage**: Tokens por model, costo total por workspace
- **Queue depth**: Tasks pending, blocked

#### Trazas distribuidas
Jaeger-style traces que muestran:
```
Task-123 (submitted at 10:00)
├── Orchestrator reasoning (100ms)
├── Agent Runtime execution (2500ms)
│   ├── Tool: filesystem.read (45ms)
│   ├── Tool: filesystem.write (30ms)
│   └── LLM call (2400ms)
└── Memory promotion (20ms)
Total: 2620ms
```

### Evaluation (Calidad de Resultados)
- **Responsabilidad**: Evaluar si el agente logró su objetivo. Incluye métricas técnicas y de negocio.
- **Interfaces expuestas**:
  - `evaluate(task_id, metrics)` → score
  - `compare_results(task_ids)` → ranking
  - `track_goal_completion(goal, result)` → % completado
- **Interfaces consumidas**: Orchestrator, Agent Runtime
- **Tecnologías candidatas**: Custom evaluators, LLM-based graders, user feedback

#### Evaluadores
1. **Técnicos**: ¿El resultado cumple spec? (parsing, validación de schema)
2. **Semánticos**: ¿La respuesta contesta la pregunta? (LLM-based scoring)
3. **Negocio**: ¿El cliente está satisfecho? (user feedback, NPS)

#### Ejemplo: Evaluación de coding task
```typescript
const evaluation = {
  task_id: "task-789",
  goal: "Crear función de suma en Python",
  metrics: {
    code_syntax_valid: true,      // ¿Código parseable?
    tests_pass: 95,               // % tests pasados
    semantic_correctness: 0.92,   // LLM grade del código
    performance: 0.88,            // Ejecuta en < 1ms?
    readability: 0.85             // Bien estructurado?
  },
  overall_score: 0.90,            // Promedio ponderado
  feedback: "Buen trabajo, agregar docstring"
}
```

### FinOps (Contabilidad de Costos)
- **Responsabilidad**: Trackear costos por modelo, por tarea, por workspace. Alertas si se excede presupuesto.
- **Interfaces expuestas**:
  - `record_token_usage(model, input_tokens, output_tokens)` — Registrar consumo
  - `calculate_cost(model, tokens)` → USD
  - `get_cost_summary(project_id, date_range)` → tabla de costos
  - `alert_budget_exceeded(workspace_id, threshold)` — Alerta
- **Interfaces consumidas**: LLM Client, Orchestrator
- **Tecnologías candidatas**: Custom billing module, stripe, metered billing API

#### Costo por modelo (Marzo 2025 referencial)
```
Claude Opus 4.6:        $3 / 1M input, $15 / 1M output
Claude Sonnet:          $3 / 1M input,  $15 / 1M output
Claude Haiku:           $0.80 / 1M input, $4 / 1M output
GPT-4o:                 $5 / 1M input, $15 / 1M output
Gemini Pro:             $0.5 / 1M input, $1.5 / 1M output
```

#### Facturación
Workspace paga por tokens consumidos. Cálculo:
```
Cost = sum(
  (input_tokens / 1_000_000) * input_price +
  (output_tokens / 1_000_000) * output_price
  for each model call
)
```

#### Presupuesto y alertas
```typescript
workspace.budget = {
  monthly_limit: 1000,        // USD
  current_spent: 234.56,
  remaining: 765.44,
  alert_threshold: 0.8,       // Alerta a 80%
  alert_email: "finance@company.com"
}
```

Si `current_spent > monthly_limit * alert_threshold`, enviar alerta.

## Decisiones técnicas

### Logging estructurado desde el inicio
Cada componente loguea en formato JSON con `trace_id`. No plain text.

### Centralización de observabilidad
Un único módulo `@openagents/observability` que exporta:
```typescript
const logger = createLogger(component_name)
logger.info("mensaje", { context_data })
logger.error("error", { error_details })
logger.metric("latency_ms", 234, { tool: "read_file" })
```

Implementación puede cambiar (Pino → Datadog, Prometheus → Grafana) sin tocar código.

### Costos trackados en real-time
Cada call a LLM loguea tokens y costo calculado instantly. No esperar a factura.

### Evaluación por default
Cada tarea retorna `evaluation_score`. Users pueden ver inmediatamente si fue exitosa.

## Alcance MVP

**En scope:**
- Logs estructurados con trace_id (Pino a stdout/file)
- Métricas básicas: latency per task, token usage per model, error rate
- Jaeger-style traces (en JSON, sin UI fancy aún)
- Evaluación básica: task status (completed/failed/blocked)
- Costo tracking: tokens consumidos + cálculo USD por modelo
- Dashboard mínimo: CLI que muestra logs + métricas
- Alertas: warning si costo exceeds 80% de presupuesto

**Fuera de scope:**
- Datadog, Grafana, etc. (solo local file + console)
- Evaluadores semánticos (LLM-based grading)
- Comparativas de resultados
- Optimización automática de costos
- User feedback loop
- Real-time dashboards
- Anomaly detection

## Preguntas abiertas

1. **¿Granularidad de costos?** ¿Cuánto detalle necesitamos? Propuesta: por task, por agent, por model.

2. **¿Retention de logs?** ¿Cuántos logs guardamos? Propuesta: 30 días en memoria, archivado después.

3. **¿Budget por task o por workspace?** Propuesta: por workspace (mensual), con overrides por task.

4. **¿Quien ve qué en observabilidad?** Admin ve todo. Owner del proyecto ve su proyecto. Implementar RBAC.

5. **¿Evaluación automática de todas las tareas?** ¿O solo opt-in? Propuesta: opt-in, porque evaluador también cuesta tokens.

6. **¿SLA tracking?** "Este agente debe responder en < 30s". ¿Monitorear? Fuera de MVP; Fase 3.

7. **¿Integración con monitoreo existente?** Si cliente usa Datadog, ¿enviar logs allá? Fase 2 con adaptadores.

8. **¿Debugging visual de traces?** UI para explorar traces interactivamente. Fuera de MVP; Fase 3.
