# 02 — Media upload & describer_worker

## Goal

Upload a source file (PDF / DOC / PPT, **max 10 pages**), store the binary in **Hetzner**, then run **describer_worker** to produce:

- per-page **description** + **summary**
- merged file-level **description** + **summary** written to `media.description` / `media.summary`

Images on a page are sent to **Gemini** for description. Pure text is taken as-is.

## Independent of chat (important)

This runs in the **Media Library** on upload/reindex only. It is **not** part of chat.

Chat (`chat_worker`) and planning later only **read** stored `media.description` / `media.summary`.

```mermaid
flowchart LR
  Phase1["Phase 1: describer_worker\nstore description + summary"] -.->|"later"| Phase2["Phase 2: chat_worker → planner → executer"]
```

```mermaid
sequenceDiagram
  autonumber
  actor T as Teacher
  participant UI as Next.js
  participant API as FastAPI
  participant B as Hetzner Bucket
  participant PG as PostgreSQL
  participant R as Redis arq
  participant D as describer_worker
  participant G as Gemini API

  T->>UI: Select file + folder
  UI->>API: POST /media (metadata) or request upload URL
  API->>B: Create object / return signed PUT URL
  API-->>UI: upload_url + media_id
  UI->>B: PUT file bytes
  UI->>API: POST /media/{id}/complete
  API->>PG: Insert/update media row status=pending_analysis
  API->>R: enqueue describe_media(media_id)
  API-->>UI: 202 Accepted + media card

  R->>D: Job describe_media
  D->>B: Download file
  D->>D: Split into pages max 10
  loop Each page
    alt Page has text only
      D->>D: Use text as-is
    else Page has image(s)
      D->>G: Describe image(s)
      G-->>D: Image captions
      D->>D: Combine text + captions
    end
    D->>D: Build page description + summary
  end
  D->>D: Merge pages to file description + summary
  D->>PG: UPDATE media SET description, summary, status=ready
  D-->>R: Job success
  UI->>API: GET /media/{id} poll
  API->>PG: Read media
  API-->>UI: description + summary ready
```

## Describer internal pipeline

```mermaid
flowchart TB
  Start([arq job: describe_media]) --> Load["Load media row from Postgres"]
  Load --> Fetch["Download file from Hetzner file_url"]
  Fetch --> Validate{"Type PDF DOC PPT and pages <= 10?"}
  Validate -->|no| Fail["Mark media failed store error"]
  Validate -->|yes| Pages["Render / extract pages"]

  Pages --> PageLoop{"For each page 1..N"}
  PageLoop --> Detect{"Has images?"}
  Detect -->|no| TextOnly["Keep extracted text as-is"]
  Detect -->|yes| Gemini["Send image(s) to Gemini API get visual description"]
  Gemini --> MergePage["Combine text + image descriptions"]
  TextOnly --> PageOut["page_description page_summary"]
  MergePage --> PageOut
  PageOut --> PageLoop

  PageLoop -->|done| FileMerge["Merge all pages to file description + summary"]
  FileMerge --> Save["UPDATE media.description media.summary status = ready"]
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

  allowed --> Cap["Hard cap: 10 pages"]
  Cap --> Describer["describer_worker"]
```

## Data written

```mermaid
flowchart LR
  File["Raw file in Hetzner"] --> MediaRow["media table"]
  MediaRow --> Fields["file_url mime_type file_size file_name folder_id uploaded_by"]
  Describer["describer_worker"] --> AIFields["description text summary text"]
  AIFields --> MediaRow
```

## Status lifecycle (media)

```mermaid
stateDiagram-v2
  [*] --> uploading: create + signed URL
  uploading --> pending_analysis: upload complete
  pending_analysis --> processing: describer picks job
  processing --> ready: description + summary saved
  processing --> failed: validation / Gemini / parse error
  failed --> pending_analysis: reindex / retry
  ready --> [*]
```
