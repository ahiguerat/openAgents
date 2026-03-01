# 4. Capa de Información (El Contexto)

## Propósito

La capa de información proporciona contexto de negocio para que los agentes razonan sin alucinar. Integra tres fuentes: conocimiento general (RAG sobre documentos), datos operacionales (CRM, bases de datos), y analytics (data lake para tendencias e insights). Su responsabilidad es enriquecer el contexto del agente con información relevante y actualizada.

## Componentes

### RAG (Retrieval-Augmented Generation)
- **Responsabilidad**: Pipeline de ingesta, indexación y recuperación de documentos. Evita que agentes alucinen sobre información interna sin acceso a fuentes.
- **Interfaces expuestas**:
  - `ingest(documents, project_id, tags)` — Cargar documentos (markdown, PDF, archivos)
  - `retrieve(query, agent_role, filters)` → chunks relevantes
  - `upsert_knowledge(fact, embedding)` — Actualizar conocimiento
- **Interfaces consumidas**: Memory Service, Vector Store, Embedding Service
- **Tecnologías candidatas**: Llamaindex, LangChain RAG, Llama Index, custom pipeline

#### Pipeline RAG detallado
1. **Ingesta**: Usuario carga documentos (p.ej. spec.md, architecture.pdf)
2. **Extracción**: Parse de texto/PDF, limpieza (remove boilerplate, normalize whitespace)
3. **Segmentación**: Chunk en fragmentos de 500-1000 tokens con overlap
4. **Metadatos**: Etiquetar por tipo (architecture, api-spec, user-guide), fuente, fecha
5. **Embeddings**: Generar vector para cada chunk (text-embedding-3-small o similar)
6. **Indexación**: Almacenar en vector store con metadatos
7. **Recuperación**: Query del agente → embedding → top-k por similitud coseno
8. **Re-ranking**: Filtrar por relevancia, eliminar duplicados, ordenar por recency
9. **Compresión**: Resumir fragmentos si contexto es muy grande
10. **Inyección**: Adjuntar a system prompt o context window del agent

#### Ejemplo de recuperación
```typescript
// En Agent Runtime, antes de ejecutar agente:
const query = "¿Cuál es el protocolo de error handling?"
const context = await ragService.retrieve({
  query,
  agent_role: "coder",
  project_id: "proj-123",
  top_k: 3,
  filters: { type: ["architecture", "api-spec"] }
})
// Retorna:
// [
//   { chunk: "En error handling...con retry exponencial...", score: 0.92, source: "architecture.md" },
//   { chunk: "400 Bad Request significa...", score: 0.88, source: "api-spec.md" }
// ]
```

### Datos Operacionales (SQL/CRM)
- **Responsabilidad**: Acceso a bases de datos de negocio, CRMs, y APIs de sistemas externos. Agentes consultan estado actual (clientes, órdenes, config) sin necesidad de embeddings.
- **Interfaces expuestas**:
  - `query(sql, params, project_id)` → tabla de resultados
  - `query_crm(entity, filter, fields)` → registros
  - `get_entity(entity_id)` → detalles de entidad
- **Interfaces consumidas**: Tool Gateway (como tools especializadas), Agent Runtime
- **Tecnologías candidatas**: SQL connectors (psycopg, mysql-connector), Salesforce SDK, HubSpot API, Stripe API

#### Datos operacionales como tools
En lugar de que cada agente hable directamente a BD, se exponen como tools:
```json
{
  "name": "query_crm",
  "description": "Buscar clientes en Salesforce",
  "input_schema": {
    "type": "object",
    "properties": {
      "email": { "type": "string" },
      "fields": { "type": "array", "items": { "type": "string" } }
    }
  },
  "output_schema": {
    "type": "array",
    "items": { "properties": { "id": "string", "name": "string", "status": "string" } }
  }
}
```

El agente invoca la tool, recibe resultado, continúa razonando. Ventajas:
- Auditoría de accesos (quién consultó qué)
- Validación (no SQL injection)
- Rate limiting por agente

### Analytical Data Lake
- **Responsabilidad**: Almacenar datos históricos, métricas agregadas, y trends para insights. Agentes consultan para análisis sin afectar BD operacional.
- **Interfaces expuestas**:
  - `query_analytics(metric, dimensions, filters, date_range)` → serie temporal o tabla
  - `get_trends(entity, period)` → cambios significativos
  - `forecast(metric, horizon)` → predicciones
- **Interfaces consumidas**: Tool Gateway, Agent Runtime
- **Tecnologías candidatas**: BigQuery, Snowflake, ClickHouse, Apache Druid

#### Ejemplo: Análisis de tendencia de pedidos
```json
Tool: query_analytics
Input: {
  "metric": "total_orders_value",
  "dimensions": ["region", "product_category"],
  "filters": { "year": 2025 },
  "group_by": "month"
}
Output: [
  { "month": "2025-01", "region": "NA", "category": "software", "value": 125000 },
  { "month": "2025-02", "region": "NA", "category": "software", "value": 137500 },
  ...
]
```

## Decisiones técnicas

### RAG activado por defecto en MVP
En MVP, RAG es **opt-in**: el Orchestrator consulta Memory Service que decide si recuperar contexto. Por defecto:
- Proyectos sin documentos cargados: no RAG
- Proyectos con docs: RAG automático si query coincide con palabras clave

### Embedding service centralizado
Un único servicio genera embeddings para todos (RAG, memory promotion). Decisión:
- **Proveedor**: OpenAI text-embedding-3-small (compatible con OpenRouter), o local Sentence Transformers
- **Cacheo**: Cachear embeddings de chunks para no regenerar

### Aislamiento de datos por proyecto
Cada proyecto/workspace tiene su propio:
- Vector store (Pinecone namespace, o tabla en pgvector)
- SQL database (schema isolado o database separado)
- Data lake (dataset o schema)

Así un agente no recupera documentos de otro proyecto.

### Datos operacionales como tools, no RAG
SQL queries no se indexan en RAG (sería data mining sin contexto). Se exponen como tools que el agente invoca dinámicamente.

## Alcance MVP

**En scope:**
- RAG básico: ingesta de markdown, chunking simple, embeddings locales (Sentence Transformers), vector store in-memory
- Recuperación por similitud + filtros
- Inyección en contexto del agent
- Un dataset de ejemplo (p.ej. documentación del proyecto)

**Fuera de scope:**
- Integración SQL real (simulada con datos mock)
- CRM connectors (Salesforce, HubSpot)
- Data lake / analytics queries
- Re-ranking por learning-to-rank
- Actualización incremental de RAG
- Garbage collection de embeddings antiguos

## Preguntas abiertas

1. **¿Cómo gestionar updatos a documentos RAG?** Si un spec cambia, ¿re-indexar todo? Propuesta: invalidar chunks relevantes y re-crear.

2. **¿Tamaño máximo de RAG context?** ¿Cuántos tokens de contexto puede absorber el agent? Propuesta: max 4k tokens, truncar si excede.

3. **¿Privacidad en RAG?** Si hay clientes múltiples, ¿cómo garantizar que RAG no mezcla datos de clientes? Filtrado estricto por `project_id` + `workspace_id`.

4. **¿Cold start RAG?** Proyecto nuevo sin documentos. ¿Cómo es la experiencia? Propuesta: sugerir upload de docs, mostrar ejemplo.

5. **¿RAG semántica vs keyword?** MVP usa semántica (embeddings). ¿Cuándo usar keyword search (grep)? Si query es muy técnica ("error code 503"), hybrid search.

6. **¿Caching de queries SQL?** Si el agente consulta el mismo cliente 2 veces en una tarea, ¿cachear? Sí, con TTL de 5 minutos.

7. **¿Validación de datos SQL?** Tool Gateway valida schema, pero ¿quién valida que los datos retornados son seguros? Implementar sanitization en tool wrapper.

8. **¿Forecast y predicciones?** ¿Cuándo es crítico? Fuera de MVP. En Fase 3 con ML models integrados.
