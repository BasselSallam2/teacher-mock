# 06 — Chat microservice (real-time, not a worker)

## Why not arq?

Chat needs **immediate** replies. Queuing a `chat_turn` job would add latency and feel broken in the UI.

So **chat is a long-running microservice**, not an arq worker.

- **Frontend ↔ API**: WebSocket (teacher sees messages live)
- **API ↔ Chat service**: WebSocket (or persistent socket) — API proxies / fans out; chat never talks to the browser directly
- **describer / planner / executer** stay on **arq** (slow, async jobs)

## Goal

1. Drive conversation to collect **full requirements**.
2. Persist every message + structured **user selections** in Postgres (via API or chat→API callbacks).
3. When ready, ask: **continue chatting** or **make the plan**.
4. On **make the plan** → API sets status `planning` and **enqueues** `planner_worker` (arq).
5. Uses **stored** `media.description` / `media.summary` only — never re-reads the file.

## Socket topology

```mermaid
flowchart LR
  UI["Next.js"] -->|"WebSocket\n/ws/lessons/{id}/chat"| API["FastAPI"]
  API -->|"WebSocket\ninternal chat channel"| Chat["chat_service\n(microservice)"]
  Chat --> LLM["LLM / Gemini"]
  API --> PG[(PostgreSQL)]
  Chat -.->|"optional: read context via API REST"| API
```

**Rule:** Browser only opens a socket to the **API**. The API holds the socket to **chat_service**. That keeps auth, tenancy, and DB ownership on the API.

## Message flow (immediate)

```mermaid
sequenceDiagram
  autonumber
  actor T as Teacher
  participant UI as Next.js
  participant API as FastAPI
  participant Chat as chat_service
  participant PG as PostgreSQL
  participant R as Redis arq

  T->>UI: Open lesson workspace
  UI->>API: REST POST /lessons (if new)
  API->>PG: status=chatting
  UI->>API: WebSocket connect /ws/lessons/{id}/chat
  API->>Chat: WebSocket ensure session for lesson_id

  T->>UI: Send message + selections
  UI->>API: WS user_message
  API->>PG: INSERT lesson_messages role=user\nUPSERT lesson_preferences
  API->>Chat: WS forward user_message + context refs
  Chat->>Chat: Generate reply immediately
  Chat->>API: WS assistant_message + updated selections + status hint
  API->>PG: INSERT assistant message\nUPSERT preferences\nUPDATE status if needed
  API->>UI: WS assistant_message (immediate)

  alt Requirements complete
    API->>UI: WS status=awaiting_plan_approval\n+ CTA continue | make_plan
  end

  alt Continue chatting
    UI->>API: WS or REST continue
    API->>PG: status=chatting
  else Make the plan
    UI->>API: REST/WS make_plan
    API->>PG: status=planning
    API->>R: enqueue plan_lesson
    Note over API,R: Slow work stays on arq — not on chat socket
  end
```

## Streaming (optional)

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant Chat

  UI->>API: WS user_message
  API->>Chat: WS user_message
  loop Token chunks
    Chat-->>API: WS token_delta
    API-->>UI: WS token_delta
  end
  Chat-->>API: WS message_complete + selections
  API-->>UI: WS message_complete
```

## What chat_service does vs API

| Responsibility | Owner |
|----------------|--------|
| Auth / lesson access check | API |
| Persist messages & preferences | API (on each WS event) |
| LLM reply generation | **chat_service** |
| Push reply to browser | API → UI WebSocket |
| Enqueue plan/execute | API → arq |
| Read media file bytes | Neither (describer only) |

## Stored data (unchanged)

- `lesson_messages` — full transcript  
- `lesson_preferences` — pair_work, group_work, assessment, identity_id, media_ids, …  

See [04-database.md](04-database.md).

## Chat vs workers

| Concern | Service | Transport | Immediate? |
|---------|---------|-----------|------------|
| Learn upload | `describer_worker` | arq | No |
| Gather requirements | **`chat_service`** | **WebSocket** | **Yes** |
| Build plan | `planner_worker` | arq | No |
| Build slides | `executer_worker` | arq | No |

## Status transitions from chat

```mermaid
stateDiagram-v2
  [*] --> chatting
  chatting --> chatting: more Q&A over WS
  chatting --> awaiting_plan_approval: requirements full
  awaiting_plan_approval --> chatting: continue chatting
  awaiting_plan_approval --> planning: make plan\nAPI enqueues planner via arq
```
