# 01 — System overview

## Context

Teachers create lessons from uploaded sources. The **Next.js** frontend talks to **teacher-api** over REST (`/v1/*`) and to **teacher-chat** over **SSE** (AG-UI). The API persists metadata in Postgres (`lessons.content` JSONB is canonical), stores binaries in **S3**, exposes **MCP tools** for the chat agent, and enqueues slow work via **SAQ**: **lesson-learner**, **planner**, **executer**, **image-manager**.

Media is indexed **before** chat. Chat streams in real time; plan/slides stay async.

> **UI mock:** This repo (`teacher-mock/`) is a static HTML prototype that mirrors the UX. See [README](README.md#ui-mock-in-this-repo) for the file map. Browse [`system_overview.html`](../../system_overview.html) for a rendered overview.

## High-level architecture

```mermaid
flowchart TB
  Teacher["Teacher / Org Admin"]
  PlatAdmin["Platform Admin"]
  Next["Next.js Frontend\n(mock: *.html)"]
  API["teacher-api\nFastAPI"]
  Chat["teacher-chat\nADK + SSE"]
  PG[(PostgreSQL)]
  Redis[(Redis SAQ)]
  S3[(S3)]
  Learner["lesson-learner"]
  Planner["planner"]
  Executer["executer"]
  Images["image-manager"]
  Gemini["Gemini API"]

  Teacher --> Next
  PlatAdmin --> Next
  Next -->|REST /v1| API
  Next -->|SSE AG-UI| Chat
  Chat -->|MCP /mcp| API
  Chat --> Gemini
  API --> PG
  API -->|upload / signed URL| S3
  API -->|enqueue| Redis
  Redis --> Learner
  Redis --> Planner
  Redis --> Executer
  Redis --> Images
  Learner --> PG
  Learner --> S3
  Learner --> Gemini
  Planner --> PG
  Executer --> PG
  Executer --> S3
  Images --> S3
  Images --> Gemini
```

## Service map

```mermaid
flowchart TB
  subgraph frontend [Frontend — Next.js]
    AuthPages["Login / Signup / Org confirm"]
    Workspace["Lesson workspace\nchat + plan + slides"]
    MediaLib["Media library\nnested folders"]
    OrgAdmin["Organization settings"]
    Cards["Lessons / classes"]
    PlatAdminUI["Platform admin\norgs / teachers / catalogs"]
  end

  subgraph api [teacher-api — FastAPI]
    Auth["Auth & RBAC\nteacher | org_admin"]
    REST["REST /v1\norgs users media classes\nidentities lessons export"]
    MCP["MCP /mcp\nagent tools"]
    Internal["/v1/internal\nworker + chat callbacks"]
    Enqueue["Job dispatcher\nlearn_media plan_lesson\nrevise_plan execute_lesson\nprocess_lesson_images"]
    Models["SQLAlchemy / Alembic\nschema owner"]
  end

  subgraph chatSvc [teacher-chat]
    ADK["ADK LlmAgent\nSSE /agui/run"]
  end

  subgraph workerPlane [SAQ workers]
    Learner["lesson-learner"]
    Planner["planner"]
    Executer["executer"]
    Images["image-manager"]
  end

  frontend --> api
  frontend --> chatSvc
  chatSvc --> MCP
  Enqueue --> workerPlane
  Models --> PG[(PostgreSQL)]
```

## Sync vs async boundary

```mermaid
flowchart TB
  Req["HTTP request from Next.js"] --> API["teacher-api"]

  API -->|sync| SyncPath["CRUD responses\nlist cards, get lesson + progress\npresigned upload URL"]
  API -->|async fire-and-forget| Q["SAQ enqueue"]

  Q --> JobDone["Worker completes\npatches via /v1/internal"]
  JobDone --> DBWrite["Update Postgres\nstatus / content / media"]
  JobDone --> Poll["Frontend polls\nGET /v1/lessons/{id}?view=progress"]
```

Chat is **not** on this diagram — it uses **SSE** directly to teacher-chat (see [06-chat-service.md](06-chat-service.md)).

## Auth & tenancy (logical)

```mermaid
flowchart LR
  User["users"] -->|organization_id| Org["organizations"]
  User -->|role| Role{"teacher | org_admin"}
  Role -->|teacher| TeacherScope["Own media / lessons\nread org branding"]
  Role -->|org_admin| AdminScope["+ org name domains logo\n+ manage org teachers"]
```

Platform admins are a separate scope (mock: `admin/*.html`; production: platform routes).

## Mock ↔ production mapping

| Area | Production | Mock (`teacher-mock/`) |
|------|------------|------------------------|
| App shell | Next.js App Router | `js/layout.js` + `#app-shell` |
| State | PostgreSQL | `js/store.js` → `localStorage` |
| Chat | SSE + ADK + MCP | `js/chat.js` scripted steps |
| Media index | `lesson-learner` queue | `js/media.js` timers |
| Plan / slides | planner + executer queues | `js/workspace.js` timers |
| Session phases | `lessons.status` enum | `session.phase` + `agent_step` |
| Media folders | `media_folders.parent_id` | `folders[]` in seed |
| Platform admin | Separate deployment | `admin/` pages |

### Mock session phases (workspace)

| `session.phase` | UX |
|-----------------|-----|
| `intake` | Chat gathering (topic → sources → identity → details) |
| `generating_plan` | Progressive plan cards |
| `planning` | Plan ready; pencil edits |
| `building` | Slide placeholders → ready HTML |
| `ready` | View / export lesson |

## Deployment sketch

```mermaid
flowchart TB
  subgraph edge [Edge]
    CDN["CDN / Next.js host"]
  end

  subgraph k8s [Cluster]
    API_Pod["teacher-api"]
    Chat_Pod["teacher-chat"]
    Learn_Pod["lesson-learner"]
    Plan_Pod["planner"]
    Exec_Pod["executer"]
    Img_Pod["image-manager"]
  end

  subgraph managed [Managed / external]
    PG[(Postgres)]
    Redis[(Redis)]
    S3[(S3)]
    Gemini[Gemini]
  end

  CDN --> API_Pod
  CDN --> Chat_Pod
  API_Pod --> PG
  API_Pod --> Redis
  API_Pod --> S3
  Chat_Pod -->|MCP| API_Pod
  Chat_Pod --> Gemini
  Learn_Pod --> Redis
  Plan_Pod --> Redis
  Exec_Pod --> Redis
  Img_Pod --> Redis
  Learn_Pod --> S3
  Learn_Pod --> PG
  Plan_Pod --> PG
  Exec_Pod --> PG
  Exec_Pod --> S3
  Img_Pod --> S3
```
