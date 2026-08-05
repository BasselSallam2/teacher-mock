# 05 — Queue jobs & cross-service sequences

## SAQ job catalog

Chat is **not** an SAQ job — see [06-chat-service.md](06-chat-service.md) (SSE).

```mermaid
flowchart TB
  subgraph api [teacher-api enqueues — async only]
    J1["learn_media(media_id)"]
    J2["plan_lesson(lesson_id)"]
    J3["revise_plan(lesson_id, edit_payload)"]
    J4["execute_lesson(lesson_id)"]
    J5["revise_slide(lesson_id, page_id, prompt)"]
    J6["process_lesson_images(lesson_id, page_ids)"]
  end

  subgraph queues [SAQ queues]
    Q1["teacher-lesson-learner"]
    Q2["teacher-lesson-planner"]
    Q3["teacher-lesson-executer"]
    Q4["teacher-image-manager"]
  end

  subgraph workers [SAQ consumers]
    L["lesson-learner"]
    P["planner"]
    E["executer"]
    I["image-manager"]
  end

  J1 --> Q1 --> L
  J2 --> Q2 --> P
  J3 --> Q2 --> P
  J4 --> Q3 --> E
  J5 --> Q3 --> E
  J6 --> Q4 --> I
```

## Job → side effects

| Job | Worker | Reads | Writes |
|-----|--------|-------|--------|
| `learn_media` | lesson-learner | S3 file | `media.description`, `media.summary`, `status=indexed` |
| `plan_lesson` | planner | context (prefs + media + identity) | `content.plan`, `content.pages`, status `awaiting_execute_approval` |
| `revise_plan` | planner | plan + edit | updated plan |
| `execute_lesson` | executer | plan + prefs + identity | `content.lesson[]` HTML, status `slides_ready` |
| `revise_slide` | executer | page HTML + prompt | patched slide HTML |
| `process_lesson_images` | image-manager | image prompts | `generated_images_urls`, `images_status` |

| Real-time | Service | Transport |
|-----------|---------|-----------|
| Chat turns | teacher-chat | Frontend ↔ chat **SSE** (AG-UI); chat ↔ API **MCP** |

## Full happy path

```mermaid
flowchart TB
  subgraph phase1 [Phase 1 — SAQ]
    U1["Upload → S3"] --> U2["learn_media"]
    U2 --> U3["summary stored status=indexed"]
  end

  subgraph phase2a [Phase 2a — SSE]
    L1["lesson status=chatting"] --> L2["SSE chat ADK + MCP"]
    L2 --> L3["awaiting_plan_approval"]
    L3 --> L4{"Continue or Make plan?"}
    L4 -->|continue| L2
  end

  subgraph phase2b [Phase 2b — SAQ again]
    L4 -->|make plan| L5["planning → plan_lesson"]
    L5 --> L6["awaiting_execute_approval"]
    L6 --> L7["slides_in_progress → execute_lesson"]
    L7 --> L8["image-manager if needed"]
    L8 --> L9["slides_ready"]
  end

  U3 -.-> L1
```

## Microservice ownership

```mermaid
flowchart LR
  subgraph API_owns [teacher-api]
    Schema["DB + content JSONB"]
    REST["REST /v1"]
    MCP["MCP /mcp"]
    Internal["/v1/internal"]
    Dispatch["Enqueue SAQ"]
  end

  subgraph Chat_owns [teacher-chat]
    ADK["ADK LlmAgent SSE"]
  end

  subgraph Learner_owns [lesson-learner]
    Index["Index file"]
  end

  subgraph Planner_owns [planner]
    PlanGen["Plan"]
  end

  subgraph Executer_owns [executer]
    Html["Slides HTML"]
  end

  subgraph Images_owns [image-manager]
    GenImg["AI images"]
  end

  ADK -->|MCP| API_owns
  Dispatch --> Learner_owns
  Dispatch --> Planner_owns
  Dispatch --> Executer_owns
  Dispatch --> Images_owns
```

## API surface (illustrative)

```mermaid
flowchart TB
  subgraph ChatSSE ["SSE /agui/run via /api/chat/run"]
    live["RUN_STARTED TEXT_MESSAGE_CONTENT RUN_FINISHED"]
  end

  subgraph LessonsAPI ["/v1/lessons"]
    create["POST create status=chatting"]
    plan["POST .../plan → SAQ plan_lesson"]
    edit["POST .../plan/edit → revise_plan"]
    execute["POST .../execute → execute_lesson"]
    revise["POST .../slides/{page_id}/revise"]
    get["GET lesson ?view=progress"]
    export["POST .../export"]
  end

  subgraph MediaAPI ["/v1/media"]
    upload["POST create + signed URL"]
    complete["POST .../complete → learn_media"]
  end
```

## Failure & retry (SAQ)

```mermaid
sequenceDiagram
  participant API
  participant Redis
  participant Worker
  participant PG

  API->>Redis: enqueue job (unique key)
  Redis->>Worker: deliver
  alt success
    Worker->>PG: PATCH content + status
  else transient
    Worker-->>Redis: retry backoff
  else permanent
    Worker->>PG: status=failed
  end
```

### Stuck-job recovery

teacher-api runs a background loop (~60s) that re-enqueues lessons stuck in `planning` or `slides_in_progress` beyond configurable timeouts (default 180s).

## SAQ queue monitor

| Item | Value |
|------|--------|
| UI path | `/queues` on teacher-api |
| Health | `GET /queues/health` |
| Env | `REDIS_URL`, `PLANNER_REDIS_URL`, `EXECUTER_REDIS_URL`, `IMAGE_MANAGER_REDIS_URL` |
| Disable | `QUEUE_MONITOR_ENABLED=false` |

Queue names: `teacher-lesson-learner`, `teacher-lesson-planner`, `teacher-lesson-executer`, `teacher-image-manager`.

## Mock equivalent

No real queue — `js/media.js`, `js/chat.js`, and `js/workspace.js` use `setTimeout` / `async` delays to simulate worker progress. UI polls via `xplain:store` custom events (`js/store.js`).
