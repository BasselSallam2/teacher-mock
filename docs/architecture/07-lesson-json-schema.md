# Lesson content JSON schema

Canonical payload: **`lessons.content` JSONB** in PostgreSQL.

Workers patch incrementally via `/v1/internal/lessons/{id}/content/*`. Optional `lessons.json_url` points to an exported artifact in S3.

**planner** and **executer** both read/write this structure.

---

## Who writes what

| Field | Written by |
|-------|------------|
| `id`, `createdAt` | API on create (immutable) |
| `updatedAt`, `status`, `title`, `error` | API / chat / planner / executer |
| `media` | API / chat (snapshotted into JSON) |
| `plan` | **planner** (reads identity + preferences from DB; does not copy them into JSON) |
| `pages[].plan` | **planner** (+ teacher edits via API) |
| `lesson[]` (HTML per page) | **executer** |
| `revision` | API / executer (tracks plan or slide revision in progress) |

Identity and preferences stay in Postgres only — not root fields in content JSON.

---

## Status values

**Root `status`:**  
`chatting` | `awaiting_plan_approval` | `planning` | `awaiting_execute_approval` | `slides_in_progress` | `slides_ready` | `failed`

**`pages[].status`:** `pending` | `planned` | `failed`  
**`lesson[].status`:** `pending` | `generating` | `ready` | `failed`

---

## Page plan `type`

Each page has a required `type`. Activity/assessment settings live in **`details`** (shape depends on `type`).

| `type` | Meaning |
|--------|---------|
| `explain` | Teaching / explanation slide |
| `assessment` | Questions (MCQ, short, matching, …) |
| `group_work` | Group activity |
| `pair_work` | Pair activity |

---

## Canonical example

```json
{
  "schema_version": "1.0",
  "id": "les_01HXYZ",
  "title": "Photosynthesis for Grade 8",
  "status": "awaiting_execute_approval",
  "createdAt": "2026-07-23T10:00:00Z",
  "updatedAt": "2026-07-23T10:12:00Z",
  "createdBy": "t-salma",
  "classId": "c-bio-a",
  "error": null,
  "media": [
    {
      "id": "m-photo-pdf",
      "file_name": "Photosynthesis_Basics.pdf",
      "file_url": "https://bucket.example/media/m-photo-pdf.pdf",
      "description": "…",
      "summary": "…"
    }
  ],
  "plan": {
    "version": 1,
    "overview": "45-minute lesson introducing photosynthesis for Grade 8.",
    "learning_objectives": [
      "Explain light-dependent reactions at a high level",
      "Identify inputs and outputs of photosynthesis"
    ],
    "global_design_style": {
      "identity": "id-gvi-clean",
      "primary_color": "#7B4DFF",
      "secondary_color": "#F5A623",
      "typography": {
        "name": "Nunito",
        "url": "https://fonts.google.com/specimen/Nunito"
      },
      "visual_style": "Realistic images",
      "background": "Simple white",
      "rules": "Simple white backgrounds · Clear hierarchy · Minimal decoration · Prefer realistic photos"
    },
    "createdAt": "2026-07-23T10:11:00Z",
    "updatedAt": "2026-07-23T10:12:00Z"
  },
  "pages": [
    {
      "id": "page_01",
      "index": 1,
      "title": "Hook: Why do plants need light?",
      "status": "planned",
      "createdAt": "2026-07-23T10:11:00Z",
      "updatedAt": "2026-07-23T10:11:00Z",
      "plan": {
        "type": "explain",
        "summary": "Open with a short question and a plant-in-darkness photo.",
        "objectives": ["Activate prior knowledge"],
        "teacher_notes": "Ask 2 students to share ideas.",
        "image_needed": true,
        "image_prompt": "Plant on a windowsill in morning light",
        "images_uploaded": false,
        "uploaded_images_urls": [],
        "content_blocks": [
          { "type": "heading", "text": "Why do plants need light?" },
          { "type": "body", "text": "Think about what happens in the dark." }
        ],
        "estimated_minutes": 5,
        "details": {
          "key_points": [
            "Light is needed for photosynthesis",
            "Plants still need water and CO2"
          ],
          "examples": ["Plant left in a cupboard wilts/yellows"],
          "misconceptions_to_address": ["Plants eat soil for food"]
        }
      }
    },
    {
      "id": "page_02",
      "index": 2,
      "title": "Pair share: inputs",
      "status": "planned",
      "createdAt": "2026-07-23T10:11:20Z",
      "updatedAt": "2026-07-23T10:11:20Z",
      "plan": {
        "type": "pair_work",
        "summary": "Partners list inputs of photosynthesis.",
        "objectives": ["Name inputs with a partner"],
        "teacher_notes": "Circulate and listen for CO2 / water / light.",
        "image_needed": false,
        "image_prompt": null,
        "images_uploaded": false,
        "uploaded_images_urls": [],
        "content_blocks": [
          { "type": "heading", "text": "Turn and talk" },
          { "type": "body", "text": "List three things a plant needs to make food." }
        ],
        "estimated_minutes": 3,
        "details": {
          "task": "With your partner, list three inputs of photosynthesis.",
          "duration_minutes": 3,
          "turn_taking": true,
          "prompt_for_partner_a": "Start listing aloud.",
          "prompt_for_partner_b": "Add any missing inputs and check together.",
          "expected_output": "Oral list: light, water, carbon dioxide",
          "success_criteria": ["At least 2 correct inputs named"]
        }
      }
    },
    {
      "id": "page_03",
      "index": 3,
      "title": "Group lab sketch",
      "status": "planned",
      "createdAt": "2026-07-23T10:11:40Z",
      "updatedAt": "2026-07-23T10:11:40Z",
      "plan": {
        "type": "group_work",
        "summary": "Teams sketch the photosynthesis equation.",
        "objectives": ["Collaborate on a labelled diagram"],
        "teacher_notes": "Assign roles before starting.",
        "image_needed": true,
        "image_prompt": null,
        "images_uploaded": true,
        "uploaded_images_urls": [
          "https://bucket.example/lessons/les_01HXYZ/pages/page_03/worksheet.png"
        ],
        "content_blocks": [
          { "type": "heading", "text": "Team challenge" },
          { "type": "body", "text": "Draw and label the photosynthesis process." }
        ],
        "estimated_minutes": 10,
        "details": {
          "group_size": 4,
          "roles": ["recorder", "presenter", "materials_manager", "checker"],
          "task": "As a group, draw a labelled diagram of photosynthesis and prepare a 30-second share-out.",
          "materials": ["whiteboard", "markers", "uploaded worksheet image"],
          "duration_minutes": 10,
          "collaboration_rules": [
            "Everyone contributes one label",
            "Presenter speaks for the group"
          ],
          "expected_output": "One labelled diagram per group",
          "success_criteria": ["Inputs and outputs both labelled"]
        }
      }
    },
    {
      "id": "page_04",
      "index": 4,
      "title": "Check understanding",
      "status": "planned",
      "createdAt": "2026-07-23T10:12:00Z",
      "updatedAt": "2026-07-23T10:12:00Z",
      "plan": {
        "type": "assessment",
        "summary": "Three quick questions on inputs/outputs.",
        "objectives": ["Check understanding"],
        "teacher_notes": "Use as exit ticket.",
        "image_needed": false,
        "image_prompt": null,
        "images_uploaded": false,
        "uploaded_images_urls": [],
        "content_blocks": [
          { "type": "heading", "text": "Exit ticket" }
        ],
        "estimated_minutes": 7,
        "details": {
          "question_count": 3,
          "questions": [
            {
              "id": "q1",
              "question_type": "mcq",
              "prompt": "Which gas do plants take in for photosynthesis?",
              "options": [
                { "id": "a", "text": "Oxygen", "is_correct": false },
                { "id": "b", "text": "Carbon dioxide", "is_correct": true },
                { "id": "c", "text": "Nitrogen", "is_correct": false },
                { "id": "d", "text": "Hydrogen", "is_correct": false }
              ]
            },
            {
              "id": "q2",
              "question_type": "short_question",
              "prompt": "Name one product of photosynthesis.",
              "sample_answer": "Glucose (or oxygen)",
              "max_words": 20
            },
            {
              "id": "q3",
              "question_type": "matching",
              "prompt": "Match each item to input or output.",
              "left_items": [
                { "id": "l1", "text": "Light" },
                { "id": "l2", "text": "Oxygen" },
                { "id": "l3", "text": "Water" }
              ],
              "right_items": [
                { "id": "r1", "text": "Input" },
                { "id": "r2", "text": "Output" }
              ],
              "correct_pairs": [
                { "left_id": "l1", "right_id": "r1" },
                { "left_id": "l2", "right_id": "r2" },
                { "left_id": "l3", "right_id": "r1" }
              ]
            }
          ]
        }
      }
    }
  ],
  "lesson": [
    {
      "page_id": "page_01",
      "index": 1,
      "title": "Hook: Why do plants need light?",
      "status": "pending",
      "html": null,
      "createdAt": "2026-07-23T10:11:00Z",
      "updatedAt": "2026-07-23T10:11:00Z"
    },
    {
      "page_id": "page_02",
      "index": 2,
      "title": "Pair share: inputs",
      "status": "pending",
      "html": null,
      "createdAt": "2026-07-23T10:11:20Z",
      "updatedAt": "2026-07-23T10:11:20Z"
    },
    {
      "page_id": "page_03",
      "index": 3,
      "title": "Group lab sketch",
      "status": "pending",
      "html": null,
      "createdAt": "2026-07-23T10:11:40Z",
      "updatedAt": "2026-07-23T10:11:40Z"
    },
    {
      "page_id": "page_04",
      "index": 4,
      "title": "Check understanding",
      "status": "pending",
      "html": null,
      "createdAt": "2026-07-23T10:12:00Z",
      "updatedAt": "2026-07-23T10:12:00Z"
    }
  ]
}
```

---

## Field notes

Root JSON has **no** `identity` or `preferences` objects (those live in DB / `lesson_preferences` + `identities`). Design choices appear under `plan.global_design_style` after planning.

### `pages[].plan` (common fields)

| Field | Type | Notes |
|-------|------|--------|
| `type` | string | `explain` \| `assessment` \| `group_work` \| `pair_work` |
| `summary` | string | |
| `objectives` | string[] | |
| `teacher_notes` | string \| null | |
| `image_needed` | boolean | |
| `image_prompt` | string \| null | AI generate when not uploading |
| `images_uploaded` | boolean | Teacher uploaded images for this page |
| `uploaded_images_urls` | string[] | S3 URLs |
| `content_blocks` | `{ type, text }[]` | |
| `estimated_minutes` | number \| null | |
| `details` | object | **Shape depends on `type`** |

### `details` by `type`

#### `type: "explain"`

```json
"details": {
  "key_points": ["…"],
  "examples": ["…"],
  "misconceptions_to_address": ["…"]
}
```

#### `type: "pair_work"`

```json
"details": {
  "task": "…",
  "duration_minutes": 3,
  "turn_taking": true,
  "prompt_for_partner_a": "…",
  "prompt_for_partner_b": "…",
  "expected_output": "…",
  "success_criteria": ["…"]
}
```

#### `type: "group_work"`

```json
"details": {
  "group_size": 4,
  "roles": ["recorder", "presenter", "checker"],
  "task": "…",
  "materials": ["…"],
  "duration_minutes": 10,
  "collaboration_rules": ["…"],
  "expected_output": "…",
  "success_criteria": ["…"]
}
```

#### `type: "assessment"`

```json
"details": {
  "question_count": 3,
  "questions": [
    {
      "id": "q1",
      "question_type": "mcq",
      "prompt": "…",
      "options": [
        { "id": "a", "text": "…", "is_correct": false },
        { "id": "b", "text": "…", "is_correct": true }
      ]
    },
    {
      "id": "q2",
      "question_type": "short_question",
      "prompt": "…",
      "sample_answer": "…",
      "max_words": 20
    },
    {
      "id": "q3",
      "question_type": "matching",
      "prompt": "…",
      "left_items": [{ "id": "l1", "text": "…" }],
      "right_items": [{ "id": "r1", "text": "…" }],
      "correct_pairs": [{ "left_id": "l1", "right_id": "r1" }]
    }
  ]
}
```

`question_type`: `mcq` | `short_question` | `matching`

- **mcq** → requires `options[]` (`id`, `text`, `is_correct`)
- **short_question** → `sample_answer`, optional `max_words`
- **matching** → `left_items`, `right_items`, `correct_pairs`

`question_count` should equal `questions.length`.

### `lesson[]` (HTML output)

| Field | Type |
|-------|------|
| `page_id` | string (matches `pages[].id`) |
| `index` | number |
| `title` | string |
| `status` | `pending` \| `generating` \| `ready` \| `failed` |
| `html` | string \| null |
| `createdAt` | datetime |
| `updatedAt` | datetime |

---

## JSON Schema (draft)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://getxplain.ai/schemas/lesson.v1.json",
  "title": "LessonArtifact",
  "type": "object",
  "required": [
    "schema_version",
    "id",
    "title",
    "status",
    "createdAt",
    "updatedAt",
    "createdBy",
    "media",
    "plan",
    "pages",
    "lesson"
  ],
  "properties": {
    "schema_version": { "const": "1.0" },
    "id": { "type": "string" },
    "title": { "type": "string" },
    "status": {
      "type": "string",
      "enum": [
        "chatting",
        "awaiting_plan_approval",
        "planning",
        "awaiting_execute_approval",
        "slides_in_progress",
        "slides_ready",
        "failed"
      ]
    },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "createdBy": { "type": "string" },
    "classId": { "type": ["string", "null"] },
    "error": {
      "type": ["object", "null"],
      "properties": {
        "code": { "type": "string" },
        "message": { "type": "string" },
        "at": { "type": "string", "format": "date-time" }
      }
    },
    "media": { "type": "array" },
    "plan": { "type": "object" },
    "pages": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "index", "title", "status", "plan", "createdAt", "updatedAt"],
        "properties": {
          "id": { "type": "string" },
          "index": { "type": "integer", "minimum": 1 },
          "title": { "type": "string" },
          "status": { "type": "string", "enum": ["pending", "planned", "failed"] },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" },
          "plan": {
            "type": "object",
            "required": ["type", "summary", "details"],
            "properties": {
              "type": {
                "type": "string",
                "enum": ["explain", "assessment", "group_work", "pair_work"]
              },
              "summary": { "type": "string" },
              "objectives": { "type": "array", "items": { "type": "string" } },
              "teacher_notes": { "type": ["string", "null"] },
              "image_needed": { "type": "boolean" },
              "image_prompt": { "type": ["string", "null"] },
              "images_uploaded": { "type": "boolean" },
              "uploaded_images_urls": { "type": "array", "items": { "type": "string" } },
              "content_blocks": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["type", "text"],
                  "properties": {
                    "type": {
                      "type": "string",
                      "enum": ["heading", "body", "bullet_list", "activity", "quiz", "other"]
                    },
                    "text": { "type": "string" }
                  }
                }
              },
              "estimated_minutes": { "type": ["number", "null"] },
              "details": { "type": "object" }
            }
          }
        }
      }
    },
    "lesson": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["page_id", "index", "title", "status", "html", "createdAt", "updatedAt"],
        "properties": {
          "page_id": { "type": "string" },
          "index": { "type": "integer", "minimum": 1 },
          "title": { "type": "string" },
          "status": {
            "type": "string",
            "enum": ["pending", "generating", "ready", "failed"]
          },
          "html": { "type": ["string", "null"] },
          "createdAt": { "type": "string", "format": "date-time" },
          "updatedAt": { "type": "string", "format": "date-time" }
        }
      }
    }
  }
}
```

> Validate `details` against `type` in application code (or use `if`/`then` JSON Schema conditionals per type).

---

## Lifecycle

```text
1. API creates lesson → skeleton in lessons.content
2. Chat fills preferences + identity in DB; media snapshotted into content JSON
3. planner → plan + pages with type + details; seeds lesson[]
4. Teacher may upload images → uploaded_images_urls on page plan
5. image-manager → generated_images_urls where needed
6. executer → lesson[].html; root status = slides_ready
```
