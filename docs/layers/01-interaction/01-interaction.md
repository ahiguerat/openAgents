# 1. Capa de Interacción (El Portal)

## Propósito

La capa de interacción es el punto de entrada para usuarios finales y sistemas externos. Abstrae los detalles de la comunicación (HTTP, gRPC, WebSocket) y normaliza solicitudes en un formato que el Core puede procesar. Su responsabilidad es recibir, validar y enrutar peticiones hacia la orquestación.

## Componentes

### API Gateway REST/gRPC
- **Responsabilidad**: Punto de entrada unificado para usuarios y sistemas externos. Recibe solicitudes, valida autenticación, genera `task_id` y `trace_id`, y las envía al Orchestrator.
- **Interfaces expuestas**:
  - `POST /tasks` — Envía una tarea (goal, contexto, constraints)
  - `GET /tasks/:id/status` — Consulta estado de ejecución
  - `GET /tasks/:id/result` — Recupera resultado final
  - `POST /tasks/:id/resume` — Resume tarea bloqueada (human-in-the-loop)
  - `GET /tasks/:id/artifacts` — Descargar archivos generados
- **Interfaces consumidas**: Orchestrator, authentication service
- **Tecnologías candidatas**: Hono (TypeScript/Bun), FastAPI (Python), tRPC (TypeScript)

### Chatbots y UIs
- **Responsabilidad**: Experiencia interactiva para usuarios finales. Incluye chat web, apps móviles, dashboards y generative UIs que adaptan su forma al resultado del agente.
- **Interfaces expuestas**: WebSocket para streaming, HTTP para polling
- **Interfaces consumidas**: API Gateway REST/gRPC
- **Tecnologías candidatas**: React/Next.js, Vue.js, Flutter, Generative UI frameworks (p.ej. Vercel AI SDK)

### Generative UI
- **Responsabilidad**: Componentes de UI que se generan dinámicamente según el resultado del agente. P.ej., el agente genera JSON con estructura de formulario y la UI lo renderiza.
- **Interfaces expuestas**: JSON schema con componentes UI
- **Interfaces consumidas**: Agentes especializados vía Orchestrator
- **Tecnologías candidatas**: Vercel AI SDK, LangSmith UI, custom React renderers

### Webhooks y Integraciones
- **Responsabilidad**: Recibir eventos de terceros (p.ej. Slack, Teams, CRM) y traducirlos a tareas internas.
- **Interfaces expuestas**: Endpoints autenticados para eventos externos
- **Interfaces consumidas**: API Gateway, Message Bus
- **Tecnologías candidatas**: HTTP callbacks con HMAC, queue de eventos (AWS SNS, GCP Pub/Sub, RabbitMQ)

## Decisiones técnicas

### Stack del MVP
- **API**: Hono + TypeScript + Bun (ligero, rápido, buen soporte TS)
- **Autenticación**: API keys simples en MVP; OAuth2/SAML en producción
- **Validación**: JSON Schema con AJV
- **Logging**: Estructurado con `task_id` y `trace_id`
- **Sin WebSocket en MVP**: polling HTTP es suficiente para validar flujo

### Consideraciones de diseño
- El API Gateway **no ejecuta lógica de negocio**; sólo valida, autentica y enruta.
- La respuesta inmediata es un `task_id`, no el resultado (async-first).
- Los usuarios consultan estado vía polling o webhooks de actualización.
- Se normaliza cualquier formato de entrada (REST, gRPC, CLI) a la estructura interna `AgentTask`.

## Alcance MVP

**En scope:**
- API Gateway REST con endpoints básicos (`submit_task`, `get_status`, `get_result`, `resume_task`)
- Validación de esquemas JSON (input schema)
- Logging con `task_id` + `trace_id`
- Autenticación mínima (API key en header)
- CLI como cliente de interacción

**Fuera de scope (post-MVP):**
- WebSocket para streaming en tiempo real
- gRPC
- Generative UI
- Webhooks entrantes desde terceros
- OAuth2, SAML, SSO
- Rate limiting avanzado
- Cache de resultados

## Preguntas abiertas

1. **¿Cómo se streaming de resultados parciales?** En MVP retornamos al final; en producción queremos que el usuario vea progress en vivo (p.ej. resultado de tool, pensamiento intermedio).

2. **¿Generative UI en MVP o post-MVP?** Podría ser en Fase 2 con agentes especializados que retornen JSON estructurado.

3. **¿Soporte para múltiples formatos de cliente (REST, gRPC, CLI)?** El MVP soporta REST + CLI. gRPC se deja para cuando haya clientes intensivos.

4. **¿Cómo se comunica el bloqueo por human-in-the-loop?** En MVP, `GET /status` retorna `status: blocked` + `question: "¿Deseas continuar?"`. El cliente llama `resume_task`.

5. **¿Versioning de API?** MVP sin versioning; se recomienda `/v1/` desde el inicio para futuro.

6. **¿Carga de archivos?** Fuera de MVP. Cuando sea necesario, habrá endpoint `POST /tasks/:id/artifacts/upload` con validación de mime-type y almacenamiento en storage seguro.
