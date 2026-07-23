# 01 — System overview

## Context

Teachers create lessons from uploaded sources. The Next.js app talks to the FastAPI **API** over REST and **WebSocket** (chat). The API persists metadata in Postgres, stores binaries in Hetzner, proxies live chat to **`chat_service`**, and enqueues slow work via **arq**: **describer**, **planner**, **executer**.

Media is described **before** chat. Chat is real-time; plan/slides stay async.

## High-level architecture

```mermaid
C4Context
  title Teacher Tools — System Context

  Person(teacher, "Teacher / Org Admin", "Creates lessons, manages media & org")
  Person(platformAdmin, "Platform Admin", "Manages orgs & users")

  System_Boundary(xplain, "getXplain Teacher Tools") {
    System(web, "Next.js Frontend", "Auth UI, workspace, media, classes")
    System(api, "FastAPI API", "REST, WS gateway, auth, DB, enqueue arq")
    System(chat, "chat_service", "Immediate lesson chat replies")
    System(workers, "arq Workers", "describer / planner / executer")
  }

  System_Ext(pg, "PostgreSQL", "Relational data")
  System_Ext(redis, "Redis", "arq broker")
  System_Ext(bucket, "Hetzner Bucket", "Files & lesson JSON")
  System_Ext(gemini, "Gemini API", "Image description + chat LLM")

  Rel(teacher, web, "Uses")
  Rel(platformAdmin, web, "Uses")
  Rel(web, api, "HTTPS REST + WebSocket")
  Rel(api, chat, "WebSocket")
  Rel(api, pg, "SQL")
  Rel(api, redis, "enqueue jobs")
  Rel(api, bucket, "presign / store URLs")
  Rel(workers, redis, "dequeue jobs")
  Rel(workers, pg, "update results")
  Rel(workers, bucket, "read/write files")
  Rel(workers, gemini, "describe images")
  Rel(chat, gemini, "chat LLM")
```

> If your Mermaid renderer does not support C4, use the flowchart below instead.

```mermaid
flowchart LR
  Teacher["Teacher / Org Admin"]
  PlatAdmin["Platform Admin"]
  Next["Next.js Frontend"]
  API["FastAPI API"]
  ChatSvc["chat_service"]
  PG[(PostgreSQL)]
  Redis[(Redis arq)]
  Bucket[(Hetzner Bucket)]
  DW["describer_worker"]
  PW["planner_worker"]
  EW["executer_worker"]
  Gemini["Gemini API"]

  Teacher --> Next
  PlatAdmin --> Next
  Next -->|REST| API
  Next -->|WebSocket chat| API
  API <-->|WebSocket| ChatSvc
  ChatSvc --> Gemini
  API --> PG
  API -->|put / signed URL| Bucket
  API -->|enqueue| Redis
  Redis --> DW
  Redis --> PW
  Redis --> EW
  DW --> PG
  DW --> Bucket
  DW --> Gemini
  PW --> PG
  PW --> Bucket
  EW --> PG
  EW --> Bucket
```

## Service map

```mermaid
flowchart TB
  subgraph frontend [Frontend — Next.js]
    AuthPages["Login / Signup / Org confirm"]
    Workspace["Lesson workspace chat"]
    MediaLib["Media library"]
    OrgAdmin["Organization settings"]
    Cards["Lessons / classes cards"]
  end

  subgraph api [API microservice — FastAPI]
    Auth["Auth & RBAC\nteacher | org_admin"]
    REST["REST resources\norgs users media classes\nidentities lessons"]
    Enqueue["Job dispatcher\nenqueue_describer\nenqueue_planner\nenqueue_executer"]
    WSGateway["WebSocket gateway\nto chat_service"]
    Models["SQLAlchemy / Alembic\nschema owner"]
  end

  subgraph workerPlane [Worker microservices]
    Describer
    Planner
    Executer
  end

  frontend --> api
  Enqueue --> workerPlane
  Models --> PG[(PostgreSQL)]
```

## Sync vs async boundary

```mermaid
flowchart TB
  Req["HTTP request from Next.js"] --> API["FastAPI"]

  API -->|sync| SyncPath["CRUD responses\nlist cards, get lesson status\npresigned upload URL"]
  API -->|async fire-and-forget| Q["arq enqueue"]

  Q --> JobDone["Worker completes"]
  JobDone --> DBWrite["Update Postgres\nstatus / description / json_url"]
  JobDone --> OptionalWS["Optional: poll / websocket / SSE\nfor UI progress"]
```

## Auth & tenancy (logical)

```mermaid
flowchart LR
  User["users"] -->|organization_id| Org["organizations"]
  User -->|role| Role{"teacher | org_admin"}
  Role -->|teacher| TeacherScope["Own media / lessons\nread org branding"]
  Role -->|org_admin| AdminScope["+ org name domains logo\n+ manage org teachers"]
```

## Deployment sketch (optional)

```mermaid
flowchart TB
  subgraph edge [Edge]
    CDN["CDN / Next.js host"]
  end

  subgraph k8s [Cluster]
    API_Pod["api Deployment"]
    Chat_Pod["chat_service Deployment"]
    Desc_Pod["describer_worker Deployment"]
    Plan_Pod["planner_worker Deployment"]
    Exec_Pod["executer_worker Deployment"]
  end

  subgraph managed [Managed / external]
    PG[(Postgres)]
    Redis[(Redis)]
    Bucket[(Hetzner)]
    Gemini[Gemini]
  end

  CDN --> API_Pod
  API_Pod --> PG
  API_Pod --> Redis
  API_Pod --> Bucket
  API_Pod <-->|WebSocket| Chat_Pod
  Chat_Pod --> Gemini
  Desc_Pod --> Redis
  Plan_Pod --> Redis
  Exec_Pod --> Redis
  Desc_Pod --> Gemini
  Desc_Pod --> Bucket
  Desc_Pod --> PG
  Plan_Pod --> PG
  Plan_Pod --> Bucket
  Exec_Pod --> PG
  Exec_Pod --> Bucket
```
