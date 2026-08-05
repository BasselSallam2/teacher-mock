# getXplain Teacher Tools — System Summary for Approval

**Purpose of this document:** End-to-end overview of the Teacher Tools product and technical design, for management approval.

**Status:** Architecture docs + clickable UI mock completed. Production services exist across `getxplain-ai-teacher-*` repos.

---

## 1. What we are building

A **Teacher Tools** product that helps teachers (and school admins) turn uploaded curriculum files into **AI-assisted lesson plans and HTML slides**.

Teachers will:

1. Upload source materials (PDF / Word / PowerPoint) into a **nested Media Library**.
2. Let the system **index and summarize** those files once (`lesson-learner`).
3. Chat with an assistant to set lesson requirements (topic, duration, identity/branding, page count, etc.).
4. Review and approve a **lesson plan**.
5. Generate **finished slides** as branded HTML, with optional AI images.
6. Export PDF / PPTX when ready.

A separate **platform admin** area manages schools (organizations), teachers, and dropdown catalogs (grades, curriculums, fonts, etc.).

---

## 2. Who uses it

| Role | What they can do |
|------|------------------|
| **Teacher** | Upload media, chat to build lessons, manage classes / identities / media library |
| **Organization admin** | Everything a teacher can do, plus edit school name, domains, logo, and manage teachers in their org |
| **Platform admin** | Login to admin dashboard: orgs, users, catalogs (grades, curriculums, backgrounds, image styles, fonts), platform stats |

Signup: if email domain matches a registered school → confirm join; otherwise create a new organization (user becomes org admin).

---

## 3. Product journey A → Z

### Phase A — Prepare materials (Media Library)

1. Teacher uploads a file into a folder (PDF / DOC / PPT).
2. File is stored in **S3** (or local dev storage).
3. Background **lesson-learner** worker indexes the file → description + summary.
4. Media `status` becomes `indexed`.

**Important rule:** File indexing is **not** part of chat. Files are prepared first; chat later only uses stored summaries.

### Phase B — Chat for requirements (real-time SSE)

5. Teacher starts a new lesson and attaches indexed media + branding (identity).
6. **teacher-chat** (Google ADK agent + MCP tools) talks to the teacher via **SSE** (AG-UI protocol).
7. Every chat message and structured selection is stored in Postgres.
8. When the checklist is complete, status becomes `awaiting_plan_approval` — teacher chooses **Continue chatting** or **Create Lesson Plan**.

### Phase C — Plan (async SAQ job)

9. **Make plan** → status `planning`, enqueue `plan_lesson`.
10. **planner** worker builds the slide plan (pages with `type`, `layout_template`, `content_blocks`, `details`).
11. Status becomes `awaiting_execute_approval`. Teacher can edit the plan (`revise_plan`) or approve.

### Phase D — Slides (async SAQ jobs)

12. On approve → status `slides_in_progress`, enqueue `execute_lesson`.
13. **image-manager** generates AI images where needed.
14. **executer** generates each slide as HTML (1280×720), patching `lessons.content` incrementally.
15. Status becomes `slides_ready`. Teacher can view, revise per-page, and export.

### Lesson status lifecycle

| Status | Meaning |
|--------|---------|
| `chatting` | Gathering requirements in live chat |
| `awaiting_plan_approval` | Ready — continue chat or create plan |
| `planning` | Plan is being generated |
| `awaiting_execute_approval` | Plan ready — wait for approve to build slides |
| `slides_in_progress` | Slides being generated |
| `slides_ready` | Done |
| `failed` | Error (retryable) |

---

## 4. What's inside the lesson content JSON

Stored in Postgres `lessons.content` JSONB:

- Lesson **title** and **status**
- Attached **media** (ids + summary snapshots)
- The **plan** (overview, learning objectives, visual theme)
- **pages[]** with per-page `plan` (`type` + `details`)
- **lesson[]** with HTML per page
- Optional **revision** tracker during edits

Identity and preferences stay in the database — inputs to planner/executer, not root JSON fields.

---

## 5. Technical architecture

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Next.js** | Modern teacher/admin UI |
| Main API | **teacher-api** (FastAPI) | REST + MCP + internal API; owns DB |
| Chat | **teacher-chat** (ADK + SSE) | Streaming requirements chat (AG-UI) |
| Background jobs | **SAQ + Redis** | Slow work: index, plan, slides, images |
| Database | **PostgreSQL** | Users, orgs, media, chat, `lessons.content` |
| Files | **S3** | Uploads, logos, slide images, exports |
| AI | **Gemini** | Chat, plan, slides, images, indexing |
| Auth | **WorkOS AuthKit** | JWT for teacher UI |

### Services

| Service | Type | Responsibility |
|---------|------|----------------|
| **teacher-api** | Always on | Auth, CRUD, MCP tools, enqueue jobs, DB ownership |
| **teacher-chat** | Always on | Real-time requirement gathering (SSE + ADK) |
| **lesson-learner** | Queue worker | Index uploads → description + summary |
| **planner** | Queue worker | Create / revise lesson plan |
| **executer** | Queue worker | Generate HTML slides + revisions |
| **image-manager** | Queue worker | AI images for slides |

### Real-time chat path

```
Teacher browser  ──SSE──►  teacher-chat  ──MCP──►  teacher-api
                                              ↓
                                         PostgreSQL
```

### Async path (file / plan / slides)

```
teacher-api  →  Redis (SAQ)  →  lesson-learner / planner / executer / image-manager
                                      ↓
                              PATCH /v1/internal/lessons/{id}
```

---

## 6. Data we store (high level)

- **Organizations** (name, email domains, logo)
- **Users** (teachers / org admins, linked to org)
- **Media folders** (nested `parent_id`) **& media** (S3 URL + summary, `status`)
- **Classes**, **identities**, **lessons** (`content` JSONB)
- **Lesson chat messages** + **lesson preferences**
- **Catalogs** (dropdowns): grades, curriculums, backgrounds, image styles, fonts

---

## 7. What exists today

| Item | Status |
|------|--------|
| Clickable **UI mock** (teacher app + platform admin) | Done (`teacher-mock/`, localStorage) |
| Architecture docs + Mermaid diagrams | Done (`docs/architecture/`, `system_overview.html`) |
| Production services | Built (`getxplain-ai-teacher-*` repos) |
| Full canonical reference | `/root/code/system_overview.md` |

---

## 8. One-line summary

**Teachers upload materials once; the system indexes them; later they chat in real time (SSE) to define a lesson; after approval we generate a plan and then HTML slides — powered by Next.js, FastAPI, ADK chat with MCP tools, SAQ workers, Postgres, S3, and Gemini.**

---

*Detailed diagrams:* `teacher-mock/docs/architecture/`  
*Browsable overview:* `teacher-mock/system_overview.html`  
*Full stack reference:* `/root/code/system_overview.md`  
*UI mock:* `teacher-mock/` (run with `python3 -m http.server 5173`)
