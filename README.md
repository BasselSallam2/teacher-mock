# Xplain AI Teacher Tools — UI Mock (Milestone 0)

Clickable prototype aligned with the UX discovery in `chat.txt`. **No backend, no LLM, no real uploads** — browser `localStorage` + timers only

## Run

```bash
cd getxplain-teacher-mock
python3 -m http.server 5173
```

Open http://localhost:5173 — you will be redirected to **login**.

## Auth (mock)

### Teacher app

| Account | Role | Password |
|---------|------|----------|
| `salma@greenvalley.edu` | teacher | `teacher123` |
| `admin@greenvalley.edu` | org_admin | `admin123` |

- **Login** — `login.html` (email + password)
- **Signup** — `signup.html` (name, email, password, confirm password, phone)
  - If the email domain matches a registered org → `confirm-org.html` to join as teacher
  - Otherwise a new org is created and the user becomes org admin
- Existing teacher pages require a teacher session; use **Log out** in the sidebar

### Org admin vs teacher

Both roles use the full teacher workspace. Org admins additionally get **Organization** (`organization.html`) to:

- Edit organization name
- Add / remove email domains
- Upload logo
- Manage teachers: **add / edit / remove**, with **search** and **pagination** (admins listed first)

Organization name + logo appear in the **header**.

### Platform admin

Separate site under `/admin/`:

| Account | Password |
|---------|----------|
| `admin@getxplain.ai` | `admin123` |

- Login: http://localhost:5173/admin/login.html
- Dashboard: http://localhost:5173/admin/dashboard.html (also `/admin/` redirects)

Dashboard includes:

- Left sidebar: **Dashboard**, **Organizations**, **Teachers**
- Stats overview on the dashboard
- Dedicated CRUD pages with **search** and **pagination** for organizations and teachers
- Create organization (+ admin account), edit/delete orgs
- Create/edit teachers, inactive, reset password, delete

Pages: `admin/dashboard.html`, `admin/organizations.html`, `admin/teachers.html`

## UX rules implemented

- Home feels like a **blank workspace** (Create New Lesson first), not a stats dashboard
- AI **never auto-starts** the plan — asks with **Create Lesson Plan** / **Continue Discussion**
- Plan builds **progressively**: Design Style → Page 1 → Page 2…
- **Global Design Style** card + **Pages**, each with a pencil
- Pencil inserts a visible `@Global Design Style` / `@Page N` mention into chat
- Editing Global Style updates **only** that card (pages stay unchanged)
- **Approve & Execute** builds slide placeholders, then the ready lesson

## Pages

| File | What |
|------|------|
| `login.html` / `signup.html` / `confirm-org.html` | Teacher auth |
| `index.html` | Blank start + continue recent |
| `classes.html` | Classes CRUD |
| `media.html` | Media library + mock upload |
| `lessons.html` | Session list |
| `workspace.html` | Chat \| plan / execute / ready |
| `organization.html` | Org admin: name, domains, logo, teachers |
| `settings.html` | Personal profile + reset |
| `admin/login.html` | Platform admin login |
| `admin/dashboard.html` | Platform stats overview |
| `admin/organizations.html` | Org CRUD + search/pagination |
| `admin/teachers.html` | Teacher CRUD + search/pagination |

## Happy path (full chat cycle)

1. Hard-refresh (store **v9**) or Settings → Reset demo data, then log in again
2. Home → type `Build a lesson about AI for Grade 8` → Create New Lesson  
   (or open **New Lesson** and type it in chat)
3. Pick **source(s)** from the buttons (e.g. Intro_to_AI_Unit.pdf)
4. Pick an **Identity** (colors / cartoon vs realistic / background)
5. Answer class → duration → styles → assessment
6. **Create Lesson Plan** (never auto-starts)
7. Pencil-edit any page or Global Style → **Approve & Execute**

## Identities

`identities.html` — create sets with primary/secondary colors, logo, background (simple white / soft / pattern), image style (realistic / cartoon / diagrams), and free-form style instructions. Chat asks you to choose one before planning.

## Reset

Settings → **Reset demo data**, or clear `localStorage` key `xplain-teacher-mock-v1`.

## Note

Milestone 0 UX prototype. Production is planned as Next.js + WorkOS + teachers-api. Passwords in this mock are plain text in `localStorage` only.
