# 7. Trust (Seguridad y Gobernanza)

## Propósito

La capa de Trust asegura que el sistema es confiable, seguro, y cumple con regulaciones. Controla quién puede hacer qué (IAM), previene comportamientos maliciosos o alucinaciones fuera de spec (Guardrails), y mantiene registro de componentes, herramientas y skills autorizados (Registry). Su responsabilidad es garantizar que agentes nunca exceden sus límites.

## Componentes

### Identity & Access Management (IAM)
- **Responsabilidad**: Autenticación de usuarios y autorización granular. Define quién puede crear tareas, acceder a proyectos, invocar tools, y ver observabilidad.
- **Interfaces expuestas**:
  - `authenticate(credentials)` → token
  - `authorize(user, action, resource)` → allowed | denied
  - `create_api_key(user, scopes)` → key
  - `revoke_api_key(key_id)` → done
- **Interfaces consumidas**: API Gateway, Orchestrator, Observability
- **Tecnologías candidatas**: Auth0, Okta, Keycloak, custom RBAC

#### Modelo de permisos
```
Workspace
  ├── User (role: admin | developer | viewer)
  │   ├── can_create_tasks
  │   ├── can_view_observability
  │   └── can_manage_members
  ├── Project
  │   ├── Owner → full access
  │   ├── Developer → create tasks, read results
  │   └── Viewer → read-only
  └── Tool
      ├── admin_only (p.ej. delete_all_files)
      ├── developer_only (p.ej. invoke_external_api)
      └── public (p.ej. read_file)
```

#### Ejemplos
- User A (viewer) puede ver resultados de tareas en Proyecto X
- User B (developer) puede crear tareas en Proyecto X pero no acceder Proyecto Y
- Tool `filesystem.delete` solo disponible para agents con role `admin`
- Agente `coder` puede invocar `filesystem.read` pero no `network.external`

### Guardrails (Mitigación de Riesgos)
- **Responsabilidad**: Prevenir comportamiento no deseado. Validar outputs de agentes, bloquear acciones peligrosas, y forzar políticas de ejecución.
- **Interfaces expuestas**:
  - `validate_output(agent, output)` → valid | rejected with reason
  - `check_policy(action, constraints)` → allowed | blocked
  - `audit_tool_call(tool, input, agent)` → approved | rejected
- **Interfaces consumidas**: Agent Runtime, Orchestrator, Tool Gateway
- **Tecnologías candidatas**: Custom validators, guardrails libraries (OWASP, Anthropic Guardrails)

#### Tipos de guardrails

**1. Input validation**
- No SQL injection en queries
- No paths fuera del sandbox en filesystem tools
- Validación de tipos contra JSON schema

**2. Output validation**
- Agente no genera código malicioso
- No revelar secrets (API keys, passwords) en outputs
- No generar HTML/JS no sanitizado

**3. Policy enforcement**
- Task timeout: max 5 min
- Token budget: max 100k tokens por task
- Rate limit: max 100 tasks/min por workspace
- Retry policy: max 3 intentos antes de abort

**4. Resource limits**
- Memory por task: max 1GB
- Disk space: max 100MB
- CPU: max 4 cores, 30s timeout

#### Ejemplo: Guardrail de secretos
```typescript
const guardrail = new SecretDetectionGuardrail({
  patterns: [
    /sk-[a-zA-Z0-9]{20,}/,  // API keys
    /password[:=]\s*[^\s]+/, // password= in output
    /BEGIN PRIVATE KEY/      // SSH keys
  ],
  action: "redact" | "block" | "alert"
})

const output = await agent.execute(task)
const safe_output = guardrail.validate(output)
// Si hay secrets, redactarlos o rechazar según policy
```

### Skill & Tool Registry
- **Responsabilidad**: Catálogo centralizado de skills y tools autorizados. Define qué pueden hacer, qué permisos necesitan, y qué versión se permite.
- **Interfaces expuestas**:
  - `register_skill(manifest)` → skill_id
  - `register_tool(spec)` → tool_id
  - `list_available(agent_role, project_id)` → authorized skills/tools
  - `get_version(skill_id, version)` → code | metadata
  - `deprecate(skill_id, version, alternative)` → notifica users
- **Interfaces consumidas**: Agent Runtime, Tool Gateway, Skill Loader
- **Tecnologías candidatas**: Custom registry (JSON files), artifact repos (Artifactory, Nexus), package managers (npm, PyPI)

#### Registro de Skill
```json
{
  "id": "skill-coder-v1",
  "name": "Advanced Python Coding",
  "version": "1.2.3",
  "author": "openagents/core",
  "description": "Skills for expert Python development",
  "compatible_agents": ["coder", "planner"],
  "permissions": [
    "fs:read",
    "fs:write",
    "network:https-only"
  ],
  "requires_models": ["claude-opus-4-6"],
  "resource_limits": {
    "timeout_seconds": 300,
    "max_tokens": 50000
  },
  "dependencies": {
    "python": "3.10+",
    "packages": ["pytest", "black"]
  },
  "published_at": "2025-02-15T10:00:00Z",
  "status": "active"
}
```

#### Registro de Tool
```json
{
  "id": "tool-read-file",
  "name": "filesystem.read",
  "description": "Read a file",
  "input_schema": { ... },
  "output_schema": { ... },
  "permissions_required": ["fs:read"],
  "side_effects": "none",
  "timeout_seconds": 30,
  "rate_limit": "1000 per hour per agent",
  "sandbox_level": "full",
  "audit_required": false,
  "version": "1.0.0",
  "status": "active | deprecated | disabled"
}
```

#### Control de versiones
- Skills y tools pueden tener múltiples versiones
- Project puede fijar "usar skill-coder v1.2" o "latest"
- Deprecated: legacy skills avisan pero sigue funcionando
- Disabled: bloquea invocación, obliga a migrar

## Decisiones técnicas

### IAM simple en MVP
MVP tiene autenticación por API key (header `X-API-Key`). No OAuth ni SAML aún.
```
Workspace A
  ├── User 1: key=sk-workspace-a-user1
  ├── User 2: key=sk-workspace-a-user2
  └── permissions hardcoded en config.json
```

Fase 2: OAuth2 / OpenID Connect.

### Guardrails enfocados en seguridad, no UX
MVP bloquea acciones peligrosas:
- Filesystem read/write fuera del sandbox
- SQL injection
- Network calls a hosts no permitidos

Guardrails de UX (p.ej. "no uses tono sarcástico") en Fase 3 si es necesario.

### Registry local en MVP
Registry es archivo JSON que se versionea en Git:
```
registry/
  ├── skills.json
  └── tools.json
```

En Fase 2: Sistema remoto con versionado + descargas.

### Auditoría completa
Toda invocación de tool se audita. Log incluye:
- Usuario / workspace
- Agent que lo invocó
- Tool y parámetros
- Resultado
- Timestamp + trace_id

Guardado en base de datos separada (append-only para compliance).

## Alcance MVP

**En scope:**
- Autenticación por API key
- Autorización simple (por workspace + rol básico)
- Validación de input: JSON schema + path sandbox
- Validación de output: redactar secrets con regex
- Política de timeout (5 min) + token budget (100k)
- Rate limiting básico (100 tasks/min por workspace)
- Registry local (JSON files)
- Auditoría de tool calls (logs)

**Fuera de scope:**
- OAuth2, SAML, SSO
- RBAC granular (usuario/proyecto/tool)
- Guardrails semánticos (no se genera content inapropiado)
- Encryption at-rest para memoria larga
- PII detection y masking automático
- Compliance (SOC2, HIPAA)
- Sistema remoto de registry con versionado

## Preguntas abiertas

1. **¿Qué tan estricta es la validación de output?** MVP redacta secrets. ¿Y si agente es overly cautious y no retorna nada útil? Propuesta: log + warning, pero no rechazar.

2. **¿Cómo se actualiza registry?** ¿Reload de archivo cada vez? ¿Cache? Propuesta: cache con TTL de 5 min, o invalidar via webhook.

3. **¿Permiso para crear nuevos tools?** ¿Solo admins? Propuesta: developers pueden crear locales, pero no se registran globalmente hasta admin approval.

4. **¿Auditoría de memory access?** ¿Quién vio qué memory records? Crítico para compliance. MVP solo logs; Fase 3 audit trail detallado.

5. **¿Encryption de credentials?** Workspace almacena API keys (Stripe, Salesforce). ¿Encriptadas? Sí, con KMS. MVP: plain en env var (no producción).

6. **¿Revocar acceso en vivo?** Si invalido un API key, ¿afecta requests en curso? Propuesta: inmediato para nuevos, en-flight termina.

7. **¿Sandbox de skills Python?** ¿Ejecutar código no confiable? Requiere container + seccomp. MVP: no sandbox real. Fase 5.

8. **¿Derecho al borrado (GDPR)?** Usuario pide "delete mi data". ¿Qué se borra? Memory, artifacts, logs? Propuesta: memory sí, logs no (para auditoría).
