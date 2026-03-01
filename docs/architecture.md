# Arquitectura PaaS de Agentes IA

## Qué es openAgents

openAgents es una plataforma (PaaS) para construir, desplegar y operar agentes IA en contexto empresarial. Su objetivo es cerrar la brecha entre el razonamiento de los LLMs y las acciones reales de negocio: que un agente no solo "piense", sino que ejecute, recuerde, se coordine con otros agentes, y lo haga de forma segura y auditable.

## Para quién

La plataforma sirve a cuatro perfiles:

- **Desarrolladores**: Crean agentes y flujos en código, definen herramientas y skills, y despliegan a producción.
- **Integradores**: Construyen flujos mediante interfaces visuales (No-Code/Low-Code) sin escribir código.
- **Usuarios finales**: Interactúan con los agentes a través de chatbots, UIs, APIs o canales como Slack, email o voz.
- **Operaciones (Ops/Security)**: Monitorizan el comportamiento de los agentes, gestionan costes, y gobiernan permisos y políticas de seguridad.

## Organización: 7 capas

La plataforma se organiza en 7 contenedores lógicos. Las capas 1-5 forman el flujo principal (desde la petición del usuario hasta la respuesta). Las capas 6 y 7 son transversales: envuelven a todas las demás para garantizar visibilidad y control.

```mermaid
flowchart TD
    classDef default fill:#f8fafc,stroke:#cbd5e1,stroke-width:1px,color:#334155,rx:5px,ry:5px;
    classDef user fill:#e2e8f0,stroke:#64748b,stroke-width:2px,color:#0f172a,font-weight:bold;
    classDef crewai fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#92400e,font-weight:bold;
    classDef transversales fill:#f1f5f9,stroke:#94a3b8,stroke-width:2px,stroke-dasharray: 5 5;
    classDef spacer fill:transparent,stroke:transparent,color:transparent;

    Usuario((👥 Usuario / Sistemas externos)):::user

    subgraph L1 ["1. Capa de Interacción (El Portal)"]
        direction LR
        _sp1["　　　　　　　　　　　　　　　　　　　　　　　"]:::spacer
        UI[Chatbots / UIs]
        GenUI[Generative UI]
        API[APIs REST/gRPC]
    end

    subgraph L2 ["2. Capa de Desarrollo (La Fábrica)"]
        direction LR
        _sp2["　　　　　　　　　　　　　　　　　　　　　　　"]:::spacer
        CodeDev["💻 Code-Based<br/>(CrewAI)"]:::crewai
        NoCode["🧩 No-Code/Low-Code"]
        FlowOrch["🔀 Orquestación de Flujos"]
    end

    subgraph L3 ["3. Capa Core (El Corazón de la Ejecución)"]
        direction LR
        _sp3["　　　　　　　　　　　　　　　　　　　　　　　　　　　　　"]:::spacer
        ExecEngine["⚙️ Execution Engine<br/>(Flows/Tasks de CrewAI)"]:::crewai
        Memoria["🧠 Gestión de Memoria<br/>(Unificada por CrewAI)"]:::crewai
        Sandbox["📦 Code Sandbox"]
        EventBus["📨 Buses de Eventos"]
    end

    subgraph L4 ["4. Capa de Información (El Contexto)"]
        direction LR
        _sp4["　　　　　　　　　　　　　　　　　　　　　　　"]:::spacer
        RAG["📚 Conocimiento (RAG)"]
        OpsData["📊 Datos (SQL/CRM)"]
        DataLake["🗄️ Analytical Data Lake"]
    end

    subgraph L5 ["5. Capa de Fundación (Inteligencia)"]
        direction LR
        _sp5["　　　　　　　　　　　　　　　　　　　　　　　"]:::spacer
        Router["🚦 Model Routing"]
        MaaS["🧠 Model-as-a-Service"]
        Cache["⚡ Context Caching"]
    end

    subgraph Transversales ["Capas Transversales (Monitoreo y Validación)"]
        direction LR
        _sp6["　　　　　　　　　　　　　　　　　　　　　　　　　　　　　"]:::spacer
        Obs["👁️ 6. Observabilidad (Monitoring)"]:::transversales
        Trust["🛡️ 7. Trust (Seguridad y Gobernanza)"]:::transversales
    end

    Usuario -->|Petición| L1
    L1 -->|Activa Flujo| L3
    L2 -.->|Despliega lógica, Agentes y Crews| L3
    L3 <-->|Obtiene contexto para no alucinar| L4
    L3 <-->|Delega razonamiento| L5
    Transversales -.->|Audita/Asegura| L1
    Transversales -.->|Audita/Asegura| L2
    Transversales -.->|Audita/Asegura| L3
    Transversales -.->|Audita/Asegura| L4
    Transversales -.->|Audita/Asegura| L5
```

## Flujo funcional

```mermaid
sequenceDiagram
    actor U as 👥 Usuario
    participant L1 as 1. Interacción
    participant L7 as 7. Trust
    participant L3 as 3. Core
    participant L4 as 4. Información
    participant L5 as 5. Fundación
    participant L6 as 6. Observabilidad

    Note over L1,L6: La capa 2 (Desarrollo) opera en tiempo de diseño:<br/>define y despliega la lógica que el Core ejecuta.

    U ->>+ L1: Petición
    L1 ->> L7: Validar identidad y permisos
    L7 -->> L1: ✓ Autorizado

    L1 ->>+ L3: Activar flujo

    rect rgb(235, 245, 255)
        Note over L3,L5: Procesamiento agéntico
        L3 ->> L4: Consultar contexto
        L4 -->> L3: Contexto
        L3 ->> L5: Razonamiento y ejecución
        L5 -->> L3: Resultado
    end

    L3 -->>- L1: Resultado
    L1 -->>- U: Respuesta

    L6 --) L3: Trazas, métricas, costes
    L7 --) L3: Auditoría
```

## Documentación detallada

Cada capa tiene su propio documento con componentes, interfaces, decisiones técnicas y alcance del MVP:

| Capa | Documento |
|------|-----------|
| 1. Interacción | [01-interaction.md](layers/01-interaction.md) |
| 2. Desarrollo | [02-development.md](layers/02-development.md) |
| 3. Core | [03-core.md](layers/03-core.md) |
| 4. Información | [04-information.md](layers/04-information.md) |
| 5. Fundación | [05-foundation.md](layers/05-foundation.md) |
| 6. Observabilidad | [06-observability.md](layers/06-observability.md) |
| 7. Trust | [07-trust.md](layers/07-trust.md) |

Las decisiones arquitectónicas se registran en [docs/adr/](adr/).
