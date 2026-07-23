# 05 — Queue jobs & cross-service sequences

## arq job catalog

Chat is **not** an arq job — see [06-chat-service.md](06-chat-service.md) (WebSockets).

```mermaid
flowchart TB
  subgraph api [FastAPI enqueues — async only]
    J1["describe_media(media_id)"]
    J3["plan_lesson(lesson_id)"]
    J4["revise_plan(lesson_id, edit_payload)"]
    J5["execute_lesson(lesson_id)"]
  end

  subgraph workers [arq consumers]
    D["describer_worker"]
    P["planner_worker"]
    E["executer_worker"]
  end

  J1 --> D
  J3 --> P
  J4 --> P
  J5 --> E
```

## Job → side effects

| Job | Worker | Reads | Writes |
|-----|--------|-------|--------|
| `describe_media` | describer | Hetzner file | `media.description`, `media.summary` |
| `plan_lesson` | planner | preferences + media text + identity | plan payload, status `awaiting_execute_approval` |
| `revise_plan` | planner | plan + edit | updated plan |
| `execute_lesson` | executer | plan + preferences + identity | lesson JSON, `json_url`, `slides_ready` |

| Real-time | Service | Transport |
|-----------|---------|-----------|
| Chat turns | `chat_service` | Frontend ↔ API WS ↔ chat_service WS |

## Full happy path

```mermaid
flowchart TB
  subgraph phase1 [Phase 1 — arq]
    U1["Upload → Hetzner"] --> U2["describe_media"]
    U2 --> U3["description + summary stored"]
  end

  subgraph phase2a [Phase 2a — WebSocket]
    L1["lesson status=chatting"] --> L2["WS chat via API ↔ chat_service"]
    L2 --> L3["awaiting_plan_approval"]
    L3 --> L4{"Continue or Make plan?"}
    L4 -->|continue| L2
  end

  subgraph phase2b [Phase 2b — arq again]
    L4 -->|make plan| L5["planning → plan_lesson"]
    L5 --> L6["awaiting_execute_approval"]
    L6 --> L7["slides_in_progress → execute_lesson"]
    L7 --> L8["slides_ready + lesson.json"]
  end

  U3 -.-> L1
```

## Microservice ownership

```mermaid
flowchart LR
  subgraph API_owns [API]
    Schema["DB"]
    REST["REST"]
    WS["WS gateway to browsers"]
    Dispatch["Enqueue arq"]
  end

  subgraph Chat_owns [chat_service]
    Reply["Immediate LLM replies"]
  end

  subgraph Describer_owns [describer_worker]
    Parse["Parse file"]
  end

  subgraph Planner_owns [planner_worker]
    PlanGen["Plan"]
  end

  subgraph Executer_owns [executer_worker]
    Html["Slides + JSON"]
  end

  WS <-->|"socket"| Chat_owns
  Dispatch --> Describer_owns
  Dispatch --> Planner_owns
  Dispatch --> Executer_owns
```

## API surface (illustrative)

```mermaid
flowchart TB
  subgraph ChatWS ["WS /ws/lessons/{id}/chat"]
    live["user_message / assistant_message / token_delta"]
  end

  subgraph LessonsAPI ["/lessons"]
    create["POST create status=chatting"]
    plan["POST .../plan → arq plan_lesson"]
    edit["POST .../plan/edit"]
    execute["POST .../execute → arq execute_lesson"]
    get["GET lesson + json_url"]
  end

  subgraph MediaAPI ["/media"]
    complete["POST .../complete → describe_media"]
  end
```

## Failure & retry (arq only)

```mermaid
sequenceDiagram
  participant API
  participant Redis
  participant Worker
  participant PG

  API->>Redis: enqueue job
  Redis->>Worker: deliver
  alt success
    Worker->>PG: status + payload
  else transient
    Worker-->>Redis: retry backoff
  else permanent
    Worker->>PG: status=failed
  end
```
