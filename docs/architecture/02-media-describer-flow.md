# 02 — Media upload & lesson-learner

> **Naming:** Production service is **lesson-learner** (`learn_media` job). Older docs called this `describer_worker`.

## Goal

Upload a source file (PDF / DOC / PPT), store the binary in **S3**, then run **lesson-learner** to produce:

- per-page **description** + **summary**
- merged file-level **description** + **summary** on the `media` row
- `status=indexed` when ready for lesson attachment

Images on a page are sent to **Gemini** for description. Pure text is taken as-is.

## Independent of chat (important)

This runs in the **Media Library** on upload/reindex only. It is **not** part of chat.

Chat and planning later only **read** stored `media.summary` / `media.description`.

```mermaid
flowchart LR
  Phase1["Phase 1: lesson-learner\nstore summary + indexed"] -.->|"later"| Phase2["Phase 2: teacher-chat → planner → executer"]
```

```mermaid
sequenceDiagram
  autonumber
  actor T as Teacher
  participant UI as Next.js
  participant API as teacher-api
  participant S3 as S3
  participant PG as PostgreSQL
  participant R as Redis SAQ
  participant L as lesson-learner
  participant G as Gemini API

  T->>UI: Select file + folder
  UI->>API: POST /v1/media (metadata) or request upload URL
  API->>S3: Create object / return signed PUT URL
  API-->>UI: upload_url + media_id
  UI->>S3: PUT file bytes
  UI->>API: POST /v1/media/{id}/complete
  API->>PG: Insert/update media row status=processing
  API->>R: enqueue learn_media(media_id)
  API-->>UI: 202 Accepted + media card

  R->>L: Job learn_media
  L->>S3: Download file
  L->>L: Split into pages
  loop Each page
    alt Page has text only
      L->>L: Use text as-is
    else Page has image(s)
      L->>G: Describe image(s)
      G-->>L: Image captions
      L->>L: Combine text + captions
    end
    L->>L: Build page description + summary
  end
  L->>L: Merge pages to file description + summary
  L->>PG: UPDATE media SET description, summary, status=indexed
  L-->>R: Job success
  UI->>API: GET /v1/media/{id} poll
  API->>PG: Read media
  API-->>UI: summary ready — attachable to lesson
```

## Lesson-learner internal pipeline

```mermaid
flowchart TB
  Start([SAQ job: learn_media]) --> Load["Load media row from Postgres"]
  Load --> Fetch["Download file from S3"]
  Fetch --> Validate{"Type PDF DOC PPT?"}
  Validate -->|no| Fail["Mark media failed store error"]
  Validate -->|yes| Pages["Render / extract pages"]

  Pages --> PageLoop{"For each page"}
  PageLoop --> Detect{"Has images?"}
  Detect -->|no| TextOnly["Keep extracted text as-is"]
  Detect -->|yes| Gemini["Send image(s) to Gemini API"]
  Gemini --> MergePage["Combine text + image descriptions"]
  TextOnly --> PageOut["page_description page_summary"]
  MergePage --> PageOut
  PageOut --> PageLoop

  PageLoop -->|done| FileMerge["Merge all pages to file description + summary"]
  FileMerge --> Save["UPDATE media status = indexed"]
  Save --> End([Job complete])
  Fail --> End
```

## Supported inputs

```mermaid
flowchart LR
  subgraph allowed [Allowed uploads]
    PDF[PDF]
    DOC[DOC / DOCX]
    PPT[PPT / PPTX]
  end

  allowed --> Learner["lesson-learner"]
```

## Data written

```mermaid
flowchart LR
  File["Raw file in S3"] --> MediaRow["media table"]
  MediaRow --> Fields["file_url mime_type file_size file_name folder_id uploaded_by organization_id"]
  Learner["lesson-learner"] --> AIFields["description text summary text"]
  AIFields --> MediaRow
```

## Nested folders (Media Library)

Files always live inside a folder (`media.folder_id NOT NULL`). Folders support `parent_id` for Drive-style nesting.

```mermaid
flowchart TD
  root["Root folder parent_id null"]
  root --> folderA["Grade 8"]
  folderA --> sub["Unit 1"]
  folderA --> visuals["Visuals"]
  sub --> files["media rows"]
```

See [04-database.md](04-database.md) and `db-schema-eraser.md` in repo root.

## Status lifecycle (media)

| Mock status | Production status | Meaning |
|-------------|-------------------|---------|
| `uploading` | `uploading` | Upload in progress |
| `processing` | `processing` | Indexing job running |
| `indexed` | `indexed` | Ready for lesson use |
| `failed` | `failed` | Validation / parse / Gemini error |

```mermaid
stateDiagram-v2
  [*] --> uploading: create + signed URL
  uploading --> processing: upload complete
  processing --> indexed: summary saved
  processing --> failed: error
  failed --> processing: reindex / retry
  indexed --> [*]
```

## Mock implementation

`js/media.js` simulates indexing with timers:

1. Upload → `status=uploading`
2. After delay → `status=processing`
3. After delay → `status=indexed` (or `failed`)

Only `indexed` media appears in `js/media-picker.js` for lesson attachment.
