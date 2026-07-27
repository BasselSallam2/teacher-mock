# getXplain Teacher Tools — System Summary for Approval

**Purpose of this document:** End-to-end overview of the proposed Teacher Tools product and technical design, for management approval before build.

**Status:** Architecture + clickable UI mock completed. Production build not started.

---

## 1. What we are building

A **Teacher Tools** product that helps teachers (and school admins) turn uploaded curriculum files into **AI-assisted lesson plans and HTML slides**.

Teachers will:

1. Upload source materials (PDF / Word / PowerPoint).
2. Let the system **read and summarize** those files once.
3. Chat with an assistant to set lesson requirements (topic, duration, pair work, identity/branding, etc.).
4. Review and approve a **lesson plan**.
5. Generate **finished slides** packaged as a structured lesson file.

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

1. Teacher uploads a file (PDF / DOC / PPT, **max 10 pages**).
2. File is stored in **Hetzner object storage**.
3. A background **describer** service:
   - Extracts text as-is.
   - Sends page images to **Gemini** for description when needed.
   - Builds per-page description + summary, then merges into **one file description + summary**.
4. Results are saved in the database on the media record.

**Important rule:** File reading/analysis is **not** part of chat. Files are prepared first; chat later only uses the stored summary/description.

### Phase B — Chat for requirements (real-time)

5. Teacher starts a new lesson and attaches ready media + branding (identity).
6. A dedicated **chat service** talks to the teacher in real time (WebSockets) to collect requirements and preferences (topic, duration, grade, learning styles, language, identity, media).
7. Every chat message and every structured selection is stored in the database.
8. When requirements are complete, the system asks: **Continue chatting** or **Make the plan**.

### Phase C — Plan (async job)

9. If the teacher chooses **Make the plan**, status becomes `planning`.
10. A **planner** worker builds the slide plan (global design style + pages). Each page has a **`type`** (`explain` | `assessment` | `group_work` | `pair_work`) and type-specific **`details`** (e.g. assessment questions with MCQ/matching options).
11. Status becomes `awaiting_execute_approval`. Teacher can edit the plan or approve.

### Phase D — Slides (async job)

12. On approve, status becomes `slides_in_progress`.
13. An **executer** worker generates each slide as HTML and writes one **lesson JSON** to Hetzner.
14. Status becomes `slides_ready`. Teacher can view/export the lesson.

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

## 4. What’s inside the final lesson file

The lesson JSON stored in Hetzner includes at least:

- Lesson **title** and **status**
- Attached **media** (ids + description/summary snapshots)
- The **plan** (including `global_design_style` derived from identity; pages with `type` + `details`)
- Array of **slides** (`lesson[]` with HTML)

Identity and preferences stay in the database; they are inputs to planner/executer, not fields in the bucket JSON.

The same status is tracked in the database and mirrored in that JSON.

---

## 5. Technical architecture (proposed)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **Next.js** | Modern teacher/admin UI |
| Main API | **Python FastAPI** | REST + WebSocket gateway; owns DB schema and security |
| Chat | **`chat_service` microservice** | Immediate replies over WebSocket (not a background queue) |
| Background jobs | **arq + Redis** | Slow work: file describe, plan, slides |
| Database | **PostgreSQL** | Users, orgs, media metadata, chat, lessons, catalogs |
| Files | **Hetzner bucket** | All uploads, logos, lesson JSON |
| AI | **Gemini API** | Image description in describer; chat LLM as needed |

### Services

| Service | Type | Responsibility |
|---------|------|----------------|
| **API** | Always on | Auth, CRUD, WebSocket to browser, enqueue jobs, DB ownership |
| **chat_service** | Always on | Real-time requirement gathering |
| **describer_worker** | Queue worker | Learn uploaded files → description + summary |
| **planner_worker** | Queue worker | Create / revise lesson plan |
| **executer_worker** | Queue worker | Generate HTML slides + lesson JSON |

### Real-time chat path

```
Teacher browser  ←WebSocket→  API  ←WebSocket→  chat_service
                                  ↓
                             PostgreSQL
```

Browser never talks to chat_service directly (auth and tenancy stay on the API).

### Async path (file / plan / slides)

```
API  →  Redis (arq)  →  describer / planner / executer workers
```

---

## 6. Data we store (high level)

- **Organizations** (name, email domains, logo)
- **Users** (teachers / org admins, linked to org)
- **Media folders & media** (file URL in Hetzner + description/summary)
- **Classes**, **identities**, **lessons**
- **Lesson chat messages** + **lesson preferences**
- **Catalogs** (dropdowns only): grades, curriculums, backgrounds, image styles, fonts

Platform admin can manage organizations, teachers, and those catalogs.

---

## 7. What already exists vs what we need to build

| Item | Status |
|------|--------|
| Clickable **UI mock** (teacher app + platform admin) | Done (localStorage prototype) |
| Architecture docs + Mermaid diagrams | Done (`docs/architecture/`) |
| Production Next.js + FastAPI + workers + Hetzner + Postgres | **To build** (pending approval) |

---

## 8. Decision points for approval

Please confirm / approve:

1. **Product scope** as described (media → chat → plan → slides).
2. **Hard separation**: analyze files first; chat never re-parses files.
3. **Tech stack**: Next.js, FastAPI, chat microservice (WebSocket), arq workers, Postgres, Hetzner, Gemini.
4. **Lesson status model** and lesson JSON contents (media + plan + slides). Identity/preferences remain DB-only.
5. **Roles**: teacher, org admin, platform admin.
6. Proceed to production implementation (phased delivery recommended).

### Suggested delivery phases (if approved)

1. **Auth + orgs + media upload + describer**
2. **Chat service + preferences persistence**
3. **Planner + plan approval UI**
4. **Executer + lesson JSON + ready view**
5. **Platform admin (orgs, users, catalogs)** hardened for production

---

## 9. One-line summary

**Teachers upload materials once; the system learns them; later they chat in real time to define a lesson; after approval we generate a plan and then HTML slides as a packaged lesson — powered by Next.js, FastAPI, a live chat service, background workers, Postgres, Hetzner, and Gemini.**

---

*Detailed diagrams:* `getxplain-teacher-mock/docs/architecture/`  
*UI mock:* `getxplain-teacher-mock/` (run with `python3 -m http.server 5173`)
