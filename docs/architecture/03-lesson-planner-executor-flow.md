# 03 — Lesson planner & executer flows

## Goal

1. **planner_worker** — after chat confirms **make plan**, build the slide **PLAN** from stored media text + **lesson preferences**; accept plan edits until teacher approves execute.
2. **executer_worker** — generate **HTML slides** and write **lesson JSON** (title, status, identity, preferences, slides) to Hetzner.

Chat itself is owned by [`chat_service`](06-chat-service.md) over **WebSockets** (not arq). Media describing is Phase 1 only ([02](02-media-describer-flow.md)).

## Prerequisite

- Media already has `description` + `summary`.
- Chat has filled `lesson_preferences` and lesson reached `awaiting_plan_approval` → user chose **make plan**.

## End-to-end (after chat)

```mermaid
sequenceDiagram
  autonumber
  actor T as Teacher
  participant UI as Next.js
  participant API as FastAPI
  participant PG as PostgreSQL
  participant R as Redis arq
  participant P as planner_worker
  participant E as executer_worker
  participant B as Hetzner Bucket

  Note over T,B: Chat phase already done — preferences + messages in DB

  T->>UI: Make plan
  UI->>API: POST /lessons/{id}/plan
  API->>PG: status=planning
  API->>R: enqueue plan_lesson(lesson_id)
  API-->>UI: 202

  R->>P: plan_lesson
  P->>PG: Load preferences + media.description/summary + identity
  Note over P: No file download / no Gemini vision
  P->>P: Generate plan Global Design Style + Pages
  P->>PG: Save plan payload status=awaiting_execute_approval
  P->>B: Optional upsert lesson.json skeleton with status
  UI->>API: GET plan
  API-->>UI: Plan cards — wait approve

  loop Plan edits
    T->>UI: Edit section
    UI->>API: POST /lessons/{id}/plan/edit
    API->>PG: status=planning
    API->>R: enqueue revise_plan
    R->>P: revise_plan
    P->>PG: Update plan status=awaiting_execute_approval
  end

  T->>UI: Approve and build slides
  UI->>API: POST /lessons/{id}/execute
  API->>PG: status=slides_in_progress
  API->>R: enqueue execute_lesson
  API-->>UI: 202

  R->>E: execute_lesson
  E->>PG: Load plan + preferences + identity
  E->>E: Generate HTML per slide
  E->>E: Assemble full lesson JSON
  E->>B: PUT lesson JSON
  E->>PG: json_url set status=slides_ready
  UI->>API: GET lesson
  API-->>UI: Ready
```

## Lesson status state machine

```mermaid
stateDiagram-v2
  [*] --> chatting: create lesson
  chatting --> awaiting_plan_approval: chat_worker requirements complete
  awaiting_plan_approval --> chatting: continue chatting
  awaiting_plan_approval --> planning: make plan
  planning --> awaiting_execute_approval: plan done
  awaiting_execute_approval --> planning: revise plan
  awaiting_execute_approval --> slides_in_progress: approve execute
  slides_in_progress --> slides_ready: lesson JSON written
  planning --> failed
  slides_in_progress --> failed
  failed --> chatting
  failed --> planning
  failed --> slides_in_progress
  slides_ready --> [*]
```

| Status | Owner | UI |
|--------|-------|-----|
| `chatting` | chat_service (WS) | Chat panel |
| `awaiting_plan_approval` | chat_service / API | Continue vs Make plan |
| `planning` | planner_worker | Progress |
| `awaiting_execute_approval` | API / teacher | Plan cards + Approve |
| `slides_in_progress` | executer_worker | Building slides |
| `slides_ready` | — | View / export lesson |
| `failed` | — | Retry |

## planner_worker

```mermaid
flowchart TB
  Job([plan_lesson / revise_plan]) --> In["Inputs from DB:\npreferences pair_work group_work...\nmedia.description/summary\nidentity\nchat history optional"]
  In --> Plan["PLAN: Global Design Style + Pages"]
  Plan --> Store["Persist plan\nstatus = awaiting_execute_approval"]
```

## executer_worker + lesson JSON

```mermaid
flowchart TB
  Job([execute_lesson]) --> Load["plan + preferences + identity"]
  Load --> Slides["HTML per slide"]
  Slides --> Bundle["lesson.json"]
  Bundle --> Upload["Hetzner PUT"]
  Upload --> DB["lessons.json_url\nstatus = slides_ready"]
```

### `lesson.json` shape (bucket)

```json
{
  "title": "Photosynthesis for Grade 8",
  "status": "slides_ready",
  "identity": {
    "id": "...",
    "name": "...",
    "primary_color": "#7B4DFF",
    "secondary_color": "#F5A623",
    "background": "simple_white",
    "image_style": "realistic",
    "typography": "...",
    "instructions": "...",
    "logo_url": "https://..."
  },
  "preferences": {
    "class_id": "...",
    "media_ids": ["..."],
    "topic": "...",
    "duration": "45m",
    "learning_styles": ["visual", "kinesthetic"],
    "pair_work": true,
    "group_work": false,
    "assessment": "exit_ticket",
    "language": "en",
    "grade_hint": "Grade 8"
  },
  "plan": { },
  "slides": [
    { "index": 1, "title": "...", "html": "<section>...</section>" }
  ]
}
```

`status` inside the JSON should track the same enum as `lessons.status` (updated as the lesson progresses; executer writes the final `slides_ready` artifact, earlier stages may write a partial JSON if desired).

## How API fires queues

```mermaid
flowchart LR
  subgraph triggers [REST / WS triggers]
    A["POST /media/{id}/complete"] --> Q1["describe_media"]
    B["WS make_plan / POST .../plan"] --> Q3["plan_lesson"]
    C["POST /lessons/{id}/plan/edit"] --> Q4["revise_plan"]
    D["POST /lessons/{id}/execute"] --> Q5["execute_lesson"]
  end

  Q1 --> Describer
  Q3 --> Planner
  Q4 --> Planner
  Q5 --> Executer
```

> Chat messages travel on WebSockets (see [06](06-chat-service.md)), not through this queue diagram.
