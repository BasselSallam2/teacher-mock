# Xplain AI Teacher Tools — UI Mock (Milestone 0)

Clickable prototype aligned with the UX discovery in `chat.txt`. **No backend, no LLM, no real uploads** — browser `localStorage` + timers only.

## Run

```bash
cd getxplain-teacher-mock
python3 -m http.server 5173
```

Open http://localhost:5173

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
| `index.html` | Blank start + continue recent |
| `classes.html` | Classes CRUD |
| `media.html` | Media library + mock upload |
| `lessons.html` | Session list |
| `workspace.html` | Chat \| plan / execute / ready |
| `settings.html` | Branding + reset |

## Happy path (full chat cycle)

1. Hard-refresh (store **v3**) or Settings → Reset demo data
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

Milestone 0 UX prototype. Production is planned as Next.js + WorkOS + teachers-api.