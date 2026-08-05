# 04 — PostgreSQL database

Base schema from `db-schema-eraser.md`, extended for **chat messages**, **lesson preferences**, **nested media folders**, and the **lesson status** enum. Lookup tables (`grades`, `curriculums`, `backgrounds`, `image_styles`) are dropdown-only. Binaries live in S3.

**Canonical lesson payload:** `lessons.content` JSONB (see [07-lesson-json-schema.md](07-lesson-json-schema.md)). Optional `json_url` for export artifacts.

## Entity-relationship diagram

```mermaid
erDiagram
  ORGANIZATIONS ||--o{ USERS : has
  ORGANIZATIONS ||--o{ MEDIA_FOLDERS : owns
  ORGANIZATIONS ||--o{ MEDIA : owns
  ORGANIZATIONS ||--o{ CLASSES : owns
  ORGANIZATIONS ||--o{ IDENTITIES : owns
  ORGANIZATIONS ||--o{ LESSONS : owns
  MEDIA_FOLDERS ||--o{ MEDIA_FOLDERS : "parent_id"
  MEDIA_FOLDERS ||--o{ MEDIA : contains
  USERS ||--o{ MEDIA_FOLDERS : creates
  USERS ||--o{ MEDIA : uploads
  USERS ||--o{ LESSONS : creates
  CLASSES ||--o{ LESSONS : "used by"
  FONTS ||--o{ IDENTITIES : typography
  LESSONS ||--o{ LESSON_MESSAGES : has
  LESSONS ||--o| LESSON_PREFERENCES : has
  IDENTITIES ||--o{ LESSON_PREFERENCES : selected
  LESSONS }o--o{ LESSON_MEDIA : sources
  MEDIA ||--o{ LESSON_MEDIA : attached

  ORGANIZATIONS {
    string id PK
    string name
    string_array domains
    datetime created_at
    datetime updated_at
  }

  USERS {
    string id PK
    string name
    string email UK
    string password_hash
    string role
    string organization_id FK
    datetime created_at
    datetime updated_at
  }

  MEDIA_FOLDERS {
    string id PK
    string organization_id FK
    string parent_id FK "nullable"
    string name
    string slug
    string created_by FK
    datetime created_at
    datetime updated_at
  }

  MEDIA {
    string id PK
    string organization_id FK
    string folder_id FK
    string uploaded_by FK
    string status
    text description
    text summary
    string file_name
    string file_url
    string mime_type
    int file_size
    int pages_number "nullable"
    text error "nullable"
    datetime created_at
    datetime updated_at
  }

  GRADES {
    string id PK
    string name
  }

  CURRICULUMS {
    string id PK
    string name
  }

  BACKGROUNDS {
    string id PK
    string name
  }

  IMAGE_STYLES {
    string id PK
    string name
  }

  FONTS {
    string id PK
    string name
    string url
  }

  CLASSES {
    string id PK
    string organization_id FK
    string name
    string grade
    string curriculum
    string description
  }

  LESSONS {
    string id PK
    string organization_id FK
    string title
    string created_by FK
    string class_id FK
    string identity_id FK "nullable"
    string status
    jsonb content
    string json_url "nullable export"
    json plan_payload "nullable legacy"
    datetime created_at
    datetime updated_at
  }

  LESSON_MESSAGES {
    string id PK
    string lesson_id FK
    string role "user|assistant|system"
    text content
    json meta
    datetime created_at
  }

  LESSON_PREFERENCES {
    string lesson_id PK_FK
    string identity_id FK
    string class_id FK
    string topic
    string duration
    string_array learning_styles
    string language
    string grade_hint
    json extra
    datetime updated_at
  }

  LESSON_MEDIA {
    string lesson_id FK
    string media_id FK
  }

  IDENTITIES {
    string id PK
    string organization_id FK
    string name
    string primary_color
    string secondary_color
    string background
    string image_style
    string typography FK
    string instructions
    string logo
    boolean is_default
  }
```

## Lesson status enum

Stored on `lessons.status` (mirrored in `lessons.content.status`):

| Value | Meaning |
|-------|---------|
| `chatting` | Chat gathering requirements |
| `awaiting_plan_approval` | Ask user: continue chat or make plan |
| `planning` | Plan creation in progress |
| `awaiting_execute_approval` | Plan done; wait approve to build slides |
| `slides_in_progress` | Slides generating |
| `slides_ready` | Slides done |
| `failed` | Error |

## Media status enum

| Value | Meaning |
|-------|---------|
| `uploading` | Upload in progress |
| `processing` | lesson-learner job running |
| `indexed` | Ready for lesson attachment |
| `failed` | Error (`media.error` set) |

## Nested media folders

| Concept | Rule |
|---------|------|
| Root | `media_folders.parent_id IS NULL` |
| Children | `WHERE parent_id = :folder_id` |
| Upload | Always into a folder — `media.folder_id NOT NULL` |
| Delete | Block if child folders or media exist (mock matches this) |
| Slug | `UNIQUE (organization_id, parent_id, slug)` |

```mermaid
flowchart TD
  root["My Drive parent_id null"]
  root --> folderA["Grade 8 - Set A"]
  folderA --> sub["Unit 1 - Intro to AI"]
  folderA --> visuals["Visuals"]
  sub --> files["media.folder_id = Unit 1"]
```

## Relationship summary

```mermaid
flowchart LR
  users -->|"organization_id"| organizations
  media_folders -->|"parent_id"| media_folders
  media_folders -->|"created_by"| users
  media -->|"folder_id"| media_folders
  media -->|"uploaded_by"| users
  lessons -->|"created_by"| users
  lessons -->|"class_id"| classes
  identities -->|"typography"| fonts
  lesson_messages -->|"lesson_id"| lessons
  lesson_preferences -->|"lesson_id"| lessons
  lesson_preferences -->|"identity_id"| identities
  lesson_media -->|"lesson_id"| lessons
  lesson_media -->|"media_id"| media
```

## Chat + selections (why both tables)

```mermaid
flowchart TB
  Messages["lesson_messages\nfull transcript + meta chips"] --> ChatUX["Replay chat UI"]
  Prefs["lesson_preferences\nchecklist fields"] --> Planner["planner input"]
  Prefs --> Design["Feeds plan visual theme\n(not copied as root JSON fields)"]
```

- **Messages** = conversational history (audit + UI + interaction chips in `meta`).
- **Preferences** = normalized checklist used by planner/executer from DB.
- **Page activity types** live in `content.pages[].plan.type`, not preference booleans.

## Dropdown-only catalogs

```mermaid
flowchart TB
  subgraph catalogs [Catalog tables — platform admin]
    grades
    curriculums
    backgrounds
    image_styles
    fonts
  end

  classes -.->|"grade / curriculum strings"| grades
  classes -.-> curriculums
  identities -.->|"background / image_style strings"| backgrounds
  identities -.-> image_styles
```

Mock: `js/seed.js` → `grades`, `curriculums`, `backgrounds`, `image_styles`, `fonts`; managed in `admin/catalogs.html`.

## Where binaries live

```mermaid
flowchart TB
  subgraph postgres [PostgreSQL]
    media_meta["media.file_url description summary"]
    lesson_meta["lessons.content JSONB\nlessons.json_url optional"]
    chat["lesson_messages lesson_preferences"]
  end

  subgraph s3 [S3]
    files["PDF DOC PPT images logos"]
    exports["PDF PPTX exports"]
  end

  media_meta --> files
  lesson_meta --> exports
```

## Mock data model (`js/seed.js` + `js/store.js`)

| Postgres table | Mock key |
|----------------|----------|
| `organizations` | `state.organizations` |
| `users` | `state.users` |
| `media_folders` | `state.folders` (with `parent_id`) |
| `media` | `state.media` |
| `identities` | `state.identities` |
| `classes` | `state.classes` |
| `lessons` | `state.lessons` |
| `lesson_messages` + preferences | `state.sessions[]` (embedded) |
| Catalogs | `grades`, `curriculums`, etc. |
| Platform admins | `state.platformAdmins` |

Persisted under `localStorage` key `xplain-teacher-mock-v1` (seed `version: 11`).
