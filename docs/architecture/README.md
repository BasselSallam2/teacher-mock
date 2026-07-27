# Teacher Tools — Architecture Diagrams

This folder documents the **production** teacher-tools architecture (Next.js + FastAPI microservices + arq workers), mapped from the UX mock in this repo.

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js |
| API | Python FastAPI (REST + **WebSocket** gateway + DB schema) |
| Real-time chat | **`chat_service` microservice** (WebSocket to API — **not** arq) |
| Queue | **arq** (Redis) for slow jobs only |
| Workers (arq) | `describer_worker`, `planner_worker`, `executer_worker` |
| Database | PostgreSQL |
| Object storage | Hetzner bucket |
| AI | Gemini (describer images + chat LLM as needed) |

## Microservices responsibilities

```mermaid
flowchart TB
  subgraph clients [Clients]
    TeacherUI["Next.js Teacher App"]
  end

  subgraph apiSvc [API service]
    FastAPI["FastAPI\nREST + WS gateway\nDB + enqueue arq"]
  end

  subgraph realtime [Real-time]
    Chat["chat_service\nimmediate replies"]
  end

  subgraph data [Data plane]
    PG[(PostgreSQL)]
    Redis[(Redis / arq)]
    Hetzner[(Hetzner Bucket)]
    Gemini[Gemini API]
  end

  subgraph workers [arq workers — async]
    Describer["describer_worker"]
    Planner["planner_worker"]
    Executer["executer_worker"]
  end

  TeacherUI -->|"REST"| FastAPI
  TeacherUI -->|"WebSocket chat"| FastAPI
  FastAPI -->|"WebSocket"| Chat
  Chat --> Gemini

  FastAPI --> PG
  FastAPI --> Hetzner
  FastAPI --> Redis

  Redis --> Describer
  Redis --> Planner
  Redis --> Executer

  Describer --> PG
  Describer --> Hetzner
  Describer --> Gemini
  Planner --> PG
  Executer --> PG
  Executer --> Hetzner
```

## Document index

| File | Contents |
|------|----------|
| [01-system-overview.md](01-system-overview.md) | System context, services |
| [02-media-describer-flow.md](02-media-describer-flow.md) | Upload → describer (async) |
| [03-lesson-planner-executor-flow.md](03-lesson-planner-executor-flow.md) | Plan / execute (async arq) |
| [04-database.md](04-database.md) | Postgres ER |
| [05-queue-and-sequence.md](05-queue-and-sequence.md) | arq jobs only |
| [06-chat-service.md](06-chat-service.md) | **WebSocket chat microservice** |
| [07-lesson-json-schema.md](07-lesson-json-schema.md) | **Full Hetzner lesson.json schema** |

## Design rules

1. **API owns** schema, REST, WebSocket to browsers, and arq enqueue.
2. **Chat is real-time**: Frontend WS → API → WS → `chat_service` → immediate reply path back.
3. **arq workers** only for slow work: describe file, build plan, build slides.
4. **Describe file ≠ chat** — store description/summary first; chat only reads them later.
5. On **make plan**, chat path ends the real-time gather phase; API sets `planning` and enqueues `planner_worker`.

## Critical separation: media ≠ chat

```mermaid
flowchart LR
  subgraph phase1 [Phase 1 — async arq]
    Upload --> Describer["describer_worker"]
    Describer --> Store["media.description + summary"]
  end

  subgraph phase2 [Phase 2 — real-time then async]
    ChatWS["chat_service via WS"] --> Plan["planner_worker arq"]
    Plan --> Exec["executer_worker arq"]
  end

  Store -.-> ChatWS
```

## Lesson status (DB + lesson JSON)

| Status | Meaning |
|--------|---------|
| `chatting` | Live chat gathering requirements |
| `awaiting_plan_approval` | Continue chat or make plan |
| `planning` | Plan job running (arq) |
| `awaiting_execute_approval` | Plan done; wait approve slides |
| `slides_in_progress` | Executer running (arq) |
| `slides_ready` | Done |
| `failed` | Error |

```mermaid
stateDiagram-v2
  [*] --> chatting: create lesson
  chatting --> awaiting_plan_approval: requirements complete
  awaiting_plan_approval --> chatting: continue chatting
  awaiting_plan_approval --> planning: make plan
  planning --> awaiting_execute_approval: plan done
  awaiting_execute_approval --> planning: revise plan
  awaiting_execute_approval --> slides_in_progress: approve execute
  slides_in_progress --> slides_ready: JSON uploaded
  planning --> failed
  slides_in_progress --> failed
  failed --> chatting
  failed --> planning
  failed --> slides_in_progress
  slides_ready --> [*]
```
