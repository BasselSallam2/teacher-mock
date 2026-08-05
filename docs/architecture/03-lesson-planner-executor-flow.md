# 03 — Lesson planner & executer flows

## Goal

1. **planner** — after chat confirms **make plan**, build the slide **plan** from stored media summaries + **lesson preferences**; accept plan edits until teacher approves execute.
2. **executer** — generate **HTML slides** and patch `lessons.content` incrementally (plan, pages, lesson arrays).
3. **image-manager** — generate AI images for pages where `image_needed=true` and no teacher upload exists.

Chat itself is owned by [`teacher-chat`](06-chat-service.md) over **SSE** (not SAQ). Media indexing is Phase 1 only ([02](02-media-describer-flow.md)).

## Prerequisite

- Media already has `status=indexed` with summary/description.
- Chat has filled `lesson_preferences` and lesson reached `awaiting_plan_approval` → user chose **make plan**.

## End-to-end (after chat)

```mermaid
sequenceDiagram
  autonumber
  actor T as Teacher
  participant UI as Next.js
  participant API as teacher-api
  participant PG as PostgreSQL
  participant R as Redis SAQ
  participant P as planner
  participant E as executer
  participant I as image-manager

  Note over T,I: Chat phase done — preferences + messages in DB

  T->>UI: Generate plan
  UI->>API: POST /v1/lessons/{id}/plan
  API->>PG: status=planning
  API->>R: enqueue plan_lesson(lesson_id)
  API-->>UI: 202

  R->>P: plan_lesson
  P->>API: GET /v1/internal/lessons/{id}/context
  Note over P: Uses media summaries + identity + preferences
  P->>P: Generate plan (structured JSON)
  P->>API: PATCH content.plan + content.pages + lesson stubs
  P->>API: PATCH status=awaiting_execute_approval
  UI->>API: GET /v1/lessons/{id}?view=progress
  API-->>UI: Plan cards — wait approve

  loop Plan edits
    T->>UI: Edit section / @page mention
    UI->>API: POST /v1/lessons/{id}/plan/edit
    API->>PG: status=planning
    API->>R: enqueue revise_plan
    R->>P: revise_plan
    P->>API: PATCH updated plan
    P->>API: PATCH status=awaiting_execute_approval
  end

  T->>UI: Approve and build slides
  UI->>API: POST /v1/lessons/{id}/execute
  API->>PG: status=slides_in_progress
  API->>R: enqueue execute_lesson
  API-->>UI: 202

  R->>E: execute_lesson
  E->>API: GET context
  opt Pages need AI images
    E->>API: POST .../images/process
    API->>R: enqueue process_lesson_images
    R->>I: process_lesson_images
    I->>API: PATCH generated_images_urls
  end
  loop Each page
    E->>E: Generate branded HTML 1280x720
    E->>API: PATCH content.lesson/{page_id}
  end
  E->>API: PATCH status=slides_ready
  UI->>API: GET lesson (poll every 2.5s)
  API-->>UI: Slides ready
```

## Lesson status state machine

```mermaid
stateDiagram-v2
  [*] --> chatting: create lesson
  chatting --> awaiting_plan_approval: checklist complete
  awaiting_plan_approval --> chatting: continue chatting
  awaiting_plan_approval --> planning: make plan
  planning --> awaiting_execute_approval: plan done
  awaiting_execute_approval --> planning: revise plan
  awaiting_execute_approval --> slides_in_progress: approve execute
  slides_in_progress --> slides_ready: all slides ready
  slides_ready --> slides_in_progress: revise slides
  planning --> failed
  slides_in_progress --> failed
  failed --> planning
  failed --> slides_in_progress
  slides_ready --> [*]
```

| Status | Owner | UI (mock) |
|--------|-------|-----------|
| `chatting` | teacher-chat (SSE) | Chat panel |
| `awaiting_plan_approval` | teacher-chat / API | Continue vs Create Lesson Plan |
| `planning` | planner | Progressive plan cards |
| `awaiting_execute_approval` | API / teacher | Plan cards + Approve & Execute |
| `slides_in_progress` | executer + image-manager | Building slides |
| `slides_ready` | — | View / export lesson |
| `failed` | — | Retry |

## planner

```mermaid
flowchart TB
  Job([plan_lesson / revise_plan]) --> In["Inputs from context:\npreferences topic duration page_count…\nmedia summaries\nidentity\nchat history"]
  In --> Plan["PLAN: overview + pages[]\ntype layout_template content_blocks"]
  Plan --> Store["PATCH content\nstatus = awaiting_execute_approval"]
```

**Page types:** `explain` | `assessment` | `group_work` | `pair_work`

**Layout templates:** `title_hero` | `split_image` | `two_column` | `timeline` | `quote_focus` | `assessment_cards` | `full_bleed_visual`

## executer + lesson content

```mermaid
flowchart TB
  Job([execute_lesson / revise_slide]) --> Load["plan + preferences + identity"]
  Load --> Slides["HTML per slide\nbranded 1280x720"]
  Slides --> Patch["PATCH lessons.content\nincrementally per page"]
  Patch --> DB["status = slides_ready"]
```

Canonical JSON shape: **[07-lesson-json-schema.md](07-lesson-json-schema.md)**.

- **`pages[].plan`** = pedagogical outline (planner writes)
- **`lesson[].html`** = rendered HTML (executer writes)
- Identity/preferences stay in Postgres — not root fields in content JSON

## How API fires queues

```mermaid
flowchart LR
  subgraph triggers [REST triggers]
    A["POST /v1/media/{id}/complete"] --> Q1["learn_media"]
    B["POST /v1/lessons/{id}/plan"] --> Q2["plan_lesson"]
    C["POST /v1/lessons/{id}/plan/edit"] --> Q3["revise_plan"]
    D["POST /v1/lessons/{id}/execute"] --> Q4["execute_lesson"]
    E["POST .../slides/{page_id}/revise"] --> Q5["revise_slide"]
    F["POST .../images/process"] --> Q6["process_lesson_images"]
  end

  Q1 --> Learner[lesson-learner]
  Q2 --> Planner[planner]
  Q3 --> Planner
  Q4 --> Executer[executer]
  Q5 --> Executer
  Q6 --> Images[image-manager]
```

> Chat messages travel on **SSE** (see [06](06-chat-service.md)), not through this queue diagram.

## Mock implementation

`js/workspace.js` + `js/chat.js`:

- **Create Lesson Plan** → `phase=generating_plan` → progressive plan cards (`plan_gen`)
- **Approve & Execute** → `phase=building` → slide placeholders fill in with timers
- **Export** → mock PDF/PPTX download toast
