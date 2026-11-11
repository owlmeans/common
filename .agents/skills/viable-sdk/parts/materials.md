---
name: materials
description: A new project's files through the connector — create_project_with_files (stdio hosts only, never fully local), its disk read and precheck against MATERIALS_UPLOAD_POLICY, the create-attach-send-seal flow and the 45-second answer, list_materials and read_material on every host, ConnectorApi.materials and the listing presentations.
metadata:
  purposes: agent, client-api, data
  mentions: create_project_with_files, list_materials, read_material, materialsToolHelper, MaterialOutcome, MaterialsUploadOptions, uploadsMaterials, readsDisk, MATERIALS_ANSWER_MS
---

# @owlmeans/viable-sdk — A new project's files

Uploading exists only at creation. `create_project_with_files { prompt, paths }` is offered where
`toolHostHelper.uploadsMaterials` — `readsDisk` (a stdio host, either target) and NOT target `local` AND
llm `local` (a project the parent agent develops with its own models: its files are already the
parent's). `list_materials { projectId? }` and `read_material { projectId?, path }` are `anyHost`.

- **Precheck before anything is sent.** `materialsToolHelper.inputsOf(paths, deps.dir)` walks each path
  (`uploadPathHelper.fromPaths` per path — absolute, or relative to the project directory, else the
  process's; a folder by its own name; links never followed; a path that cannot be read is an
  `unreadable` outcome, never a throw), then `precheck` against `MATERIALS_UPLOAD_POLICY`
  (`@owlmeans/viable-common`: 50 files, 12 MiB each, 50 MiB in all, programs refused, an archive one file of
  its own size). Nothing admissible: `Nothing was created` and no platform call.
- **Create, attach, send, seal.** `api.materials.create({ prompt, materials: totals, target, sessionId? })`
  (the delegated mode names an unattached session exactly like `create_project`), `deps.attach(P)` and —
  delegated — `ensureSession(deps, P)` BEFORE the first file, because the seal hands the drafting to the
  project's delegating session. `send` uploads `MATERIALS_UPLOAD_CONCURRENCY` (3) at a time
  (`MATERIALS_FILE_TIMEOUT_MS` per file), then seals whatever arrived; a refused seal asks
  `draft(P, true)` (Continue with what arrived). It never throws: every file is an outcome
  (`accepted`, `rejected` by the platform, `refused` before sending, `failed` after the retries,
  `unreadable`).
- **The 45-second rule.** The tool waits for the send at most `MATERIALS_ANSWER_MS` (35 s) from its
  start; past it, it answers the project status and `pending: true` — the upload goes on in this process
  and is sealed after its last file; `list_materials` and `project_status` are the statuses to read.
- Spends credits like `create_project` (the drafting); the description says so and that a second call
  creates another project. Structured: `{ project, files, pending, sealed }`.
- `list_materials` renders every row (purpose, status, reason phrased by `MATERIAL_REASON_PHRASES`, where
  placed, the description cut at 200), the state (`MATERIALS_STATE_PHRASES`) and the next `read_material`;
  a project without files says so. `read_material` answers the text untouched (a listing's raw set), a note
  for a transcript or a cut, and for media "carries no text".
- The in-process `/mcp` bridge answers every member but `upload`, which refuses naming the stdio connector.
  Listings present all three (`platformPresentation`: `PROJECT_WITH_FILES_OUTPUT`, `MATERIALS_OUTPUT`,
  `MATERIAL_TEXT_OUTPUT`); the hosted ones never offer the upload, the local plugin does.
