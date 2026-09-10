import type { SkillDefinition } from '@owlmeans/llm-common'
import { SKILL_ORDER, ViableSkill } from './consts.js'

/**
 * Every skill body is written for a WEAK model, which means three things throughout:
 * state the rule as an imperative, show the wrong form next to the right one, and name
 * the exact error the wrong form produces. A model that has seen the error text
 * recognises its own output; one that has only seen an abstract rule does not.
 *
 * Bodies are pure constants — they land in the cached region of the system prompt, and
 * one interpolated byte would invalidate the prefix for every call that shares them.
 */

const skill = (alias: ViableSkill, title: string, body: string): SkillDefinition => ({
  alias, title, body: body.trim(), order: SKILL_ORDER[alias],
})

/** The one rendering of a library allow-list — an override must match it byte for byte. */
export const renderLibraries = (list: string[]): string =>
  `Use these libraries; do not introduce others:\n${list.map(l => `- ${l}`).join('\n')}`

const libraries = (alias: ViableSkill, title: string, list: string[]): SkillDefinition =>
  skill(alias, title, renderLibraries(list))

/**
 * What a file in the shared package imports. Deliberately just `ajv`: this list is carried by
 * `DomainTypesArchitect`/`AccessArchitect` too, and a domain model type file imports nothing
 * else. `@owlmeans/entrypoint` and `@owlmeans/route` are named by `OwlMeansEntrypoints`
 * instead — the personas that actually author `entrypoints.ts` carry that skill, and naming a
 * package pulls its whole published documentation into the prompt.
 */
export const commonLibraryList = ['ajv']
export const uiStateLibraryList = [
  'react', '@owlmeans/client', '@owlmeans/state', '@owlmeans/web-client',
]
export const uiComponentLibraryList = [
  'react', 'tailwindcss', 'shadcn', '@owlmeans/client', '@owlmeans/web-client', 'lucide-react',
  // `toast` comes from here, and this list is the last thing a UI persona reads: a package
  // missing from it reads as a package that is not installed.
  'sonner',
]
/**
 * Deliberately WITHOUT `drizzle-orm`. This list renders last of all the skills (order 90), so a
 * package named here is the final instruction a backend persona reads — and it used to say
 * "use drizzle" directly under `ResourceLayer` saying "never import it". `postgres-resource`
 * owns drizzle internally (its own dependency; the peers are `pg` and `ajv`), and a target
 * reaches the builder through the resource, never through an import. Do not re-add it.
 */
export const backendLibraryList = [
  '@owlmeans/server-app', '@owlmeans/postgres-resource', 'ajv',
]
export const fullUiLibraryList = [...new Set([...uiStateLibraryList, ...uiComponentLibraryList])]

/**
 * The backend list plus the two packages that make a model call possible.
 *
 * Naming them is what pulls their own published documentation into the prompt, so this list
 * carries the API contract without this catalogue restating a line of it. It is reachable only
 * through a blueprint case that also installs them — a coder told about a package the manifest
 * does not declare writes `TS2307`.
 */
export const aiLibraryList = [
  ...backendLibraryList, '@owlmeans/llm', '@owlmeans/agent',
]

/**
 * The UI list plus three.js. Scene code and interface code are the same package and the same
 * bundle here; what separates them is the component, not the dependency list.
 */
export const gameLibraryList = [...new Set([...fullUiLibraryList, 'three'])]

/**
 * How an entrypoint alias is spelled. Shared verbatim by the entrypoints skill and by every
 * helper prompt that asks a model to invent one — two renderings would drift, and the pipeline
 * splits screen from API access rules on the prefix alone.
 */
export const ALIAS_CONVENTION = `
- A screen alias is \`web:<screen-definition>\` — \`web:task-list\`, \`web:task-details\`.
- An AREA alias is \`web:area:<area>\`, and there are exactly four, all already declared:
  \`web:area:guest\`, \`web:area:user\`, \`web:area:admin\`, \`web:area:operator\`, referenced as
  \`app.web.area.<area>\`. Never invent a fifth, never respell one. There is no
  \`web:layout:\` alias and no \`app.web.layout\` — writing either addresses nothing.
- An endpoint alias is \`api:<entity>:<action>\` — \`api:task:list\`, \`api:task:create\`. The
  group alias that carries the shared path and guard is \`api:<entity>\` — \`api:task\`.
- A queued job alias is \`job:<entity>:<action>\` — \`job:report:build\`, \`job:contract:analyze\`.
  A job is never given a \`web:\` or \`api:\` alias, and an endpoint is never given a \`job:\` one:
  the prefix is what says which side serves it.
- Lowercase kebab-case in every segment. The prefix is NOT optional and NOT decorative: access
  rules are applied per side by it.
`.trim()

export const VIABLE_SKILLS: SkillDefinition[] = [

  skill(ViableSkill.ProjectLayout, 'Where files live', `
The generated project is a \`@owlmeans/create-app\` monorepo with five workspace packages under
\`sources/\`. Always prefix a relative path with the package it belongs to:

- \`sources/common\` — types, entrypoint declarations and the alias tree, shared by every side.
- \`sources/backend\` — the shared backend LIBRARY: the context factory, the config, the
  resources, the services and the domain models. It builds with \`tsc -b\` and serves nothing.
- \`sources/api\` — the HTTP server. It builds its context from \`sources/backend\` and holds the
  endpoint handlers.
- \`sources/web\` — the react application.
- \`sources/worker\` — the queue consumer. Same context, no HTTP routes, one processor per job.

These files are the CONTRACT between the packages. Every screen, endpoint and job passes through
them, and each has a sentinel comment marking where a new line goes:

- \`sources/common/src/consts.ts\` — the \`app\` alias tree.
- \`sources/common/src/entrypoints.ts\` — the shared \`entrypoints\` declaration list.
- \`sources/api/src/entrypoints.ts\` — server elevations (\`appEntrypoints\`).
- \`sources/web/src/entrypoints.ts\` — client elevations (\`appEntrypoints\`).
- \`sources/worker/src/entrypoints.ts\` — job elevations.
- \`sources/web/src/nav.ts\` — the navigation registry: one line per screen, which
  is the only thing that puts it in the menus.

A file's KIND is its directory, never its name: \`models/task/task.ts\` and \`state/task.ts\` are
both plain \`.ts\` files and differ only in where they sit. The one exception is a view model,
\`<component>.vm.ts\`, because a view and its view model share a directory and a base name.

The web chrome is the FOUR area layouts in \`sources/web/src/layout/area.tsx\` —
the project's only layouts, already written, never added to. Screens are components under
\`sources/web/src/screens/\`.

An entity owns exactly ONE directory segment, shared by its shared types
(\`common/src/models/<entity>/\`), its resources (\`backend/src/resources/<entity>/\`), its
backend models (\`backend/src/models/<entity>/\`) and its endpoint handlers
(\`api/src/app/<entity>/\`). Spell it in lowercase kebab-case and spell it
the same way everywhere — the resource alias, and therefore the physical table name, is derived
from that directory. When the task carries a \`NAME REGISTRY\` block it is the authority on
every such name; use its paths verbatim rather than inventing a variant.
`),

  skill(ViableSkill.AgentTooling, 'Working with the project', `
- Start by LISTING the files you need. Never assume the project structure — ask for it.
- Reading a source file and getting empty content means the file does not exist; the path
  is almost certainly wrong. Do not create it blindly, look for the real one.
- Writing a file is a separate step. Generating code does not persist it — call the write
  tool explicitly for every file you created or changed.
- Resolve the working directory before globbing: a source-list pattern has to be prefixed
  with the project root.
- A clean validation is not a working application. \`validate\` type-checks and
  \`validate_with_renderer\` builds — neither one loads the page, and the faults that matter most
  here are the ones that only happen while a module is being evaluated. Never report a change as
  verified because a build came back clean.
`),

  skill(ViableSkill.OutputSourceOnly, 'Output format — source code only', `
Return working TypeScript source and nothing else. No prose before or after it, no
explanation, no markdown code fences.
`),

  skill(ViableSkill.OutputTextOnly, 'Output format — text only', `
Return only the requested text. No commentary, no preamble, no explanation of what you
did, no markdown code fences.
`),

  skill(ViableSkill.MainFlowFocus, 'Main flow focus', `
An application delivers value through ONE straight path, described at its natural length — long
enough to cover every step the flow really has, and no longer. That path is the main flow,
and it is the only thing you describe.

- The path has one BENEFICIARY — the kind of user who ends up holding the value — and however
  many PARTICIPANTS the delivery cannot happen without. A social network needs a creator AND a
  reader; a marketplace needs a seller AND a buyer; most applications need nobody besides the
  beneficiary. Name each as a kind of user ("operator", "author", "reader"), never a market
  segment or an ICP label, and never add a role the value can be delivered without.
- The main flow is 3 to 12 ordered steps, each performed by one named kind of user, running from
  the enabling first action to the moment the beneficiary holds the value. The FIRST step is what
  someone declares, creates or brings in before the flow can run at all.
- WRONG first step: "the user sees a dashboard of their results". RIGHT first step: "the user
  declares the process their leads will pass through". A screen that shows, lists or reports on
  something the flow has not produced yet is never the beginning of the flow.
- Cover the WHOLE path, not its opening. Every participant acts in at least one step, at most one
  step is about setting things up, and the last step delivers the value. A description that stops
  after the setup — a social network where someone publishes but nobody ever reads — has
  described no value at all, however detailed its first steps are.
- Never describe branches, alternatives, optional steps, error paths, or anything about signing
  up, signing in, roles, permissions, settings, configuration, onboarding, notifications, billing
  or administration. They are not the flow. This bans them as STEPS — it does not ban thinking
  about them: whether an actor needs an account is always judged, because it is what decides the
  area their story belongs to.
- If a step can be dropped and the beneficiary still gets the value, drop it, and spend it on the
  part of the path that is still missing. Breadth is one failure mode; a truncated path is the
  other, and it is the more common one — a path that never shows the public half of the product,
  or stops before anyone consumes what was produced, is truncated however tidy it looks.

Both bans above are about the FLOW ITSELF — about what may be one of its numbered steps. They are
not a ban on the screens that CONNECT the steps to each other: the list of records waiting for
someone, the directory that finds one of them, the page of a single record, the list of what an
actor submitted. Those are never steps, and you never volunteer one while you are describing the
flow. When a task asks for them IN SO MANY WORDS — handing you the flow steps as finished context
and asking what has to exist BETWEEN them — that task is not asking about the flow, and answering
it is not breadth. Describe them only then.

The application serves exactly FOUR audiences, called AREAS, and every actor in a story belongs
to one of them:

- \`guest\` — the actor is NOT signed in: public visitors, prospects, anonymous readers.
- \`user\` — a signed-in end user consuming the product's value; the front office.
- \`operator\` — staff running the product's business process from the inside; the back office.
- \`admin\` — the owner configuring or managing the application itself.

Decide an actor's area by asking, IN ORDER, and stopping at the first yes: can they do this step
with NO account (\`guest\`) — does the step manage the application itself (\`admin\`) — do they act
on the business process from the inside (\`operator\`) — otherwise \`user\`.

The authentication question comes first and it outranks who benefits: an actor who needs no
account is \`guest\` even when the product exists for them. A public product therefore normally has
both \`guest\` and \`user\` steps, and a flow whose stories all landed in one area is usually a
misread of that first question.

A product's own role names — a seller, an author, a reviewer, a reader — are not areas. The same
name can sit in different areas in different steps, so judge the STEP, never the title. An area is
never a step of its own: classifying an actor is not licence to add one, so an \`admin\` or a
moderator still appears only when the flow genuinely needs their action.
`),

  skill(ViableSkill.ScopeDiscipline, 'Scope', `
Implement only what the task describes. Do not add features, files, abstractions, or
error handling for situations the task does not mention.
`),

  skill(ViableSkill.NonTypescriptOutput, 'This file is not TypeScript', `
The file you are asked for is NOT TypeScript — it is CSS, JSON, Markdown or another
format. The TypeScript style and import rules above do not apply to it. Produce the file
in its own language, with no TypeScript syntax and no import statements it does not need.
`),

  skill(ViableSkill.TsStyle, 'TypeScript style', `
- No semicolons at the end of statements.
- Named exports only — never \`export default\`.
- Declare every function before it is used.
- Add an explicit props type to every React component.
- When a value is a free-form dictionary (for example collected Zod errors), type it
  explicitly as \`Record<string, any>\`.
- Never import a runtime value with \`import type\` or \`import { type X }\`. Those are for
  types and interfaces ONLY. Importing a value that way compiles and then fails at
  runtime with "X is not defined" or "does not provide an export named X", because the
  import is erased.
- Keep comments short and only for what the code cannot show. Never restate parameter or
  return types in a comment — TypeScript already carries them.
- View-model files end in \`.vm.ts\`, not \`.vm.tsx\`: they contain no JSX.
`),

  skill(ViableSkill.TsImports, 'Imports and path aliases', `
- Import shared code as \`project-common/<path>\`, never as \`sources/common/src/<path>\`,
  and never with a \`.js\` extension.
- Inside a BUNDLED package — \`api\`, \`web\`, \`worker\` — \`@/\` is an alias for that package's own
  \`src\`; use it instead of chains of \`../\`.
- **The shared backend library has NO \`@/\` alias.** It is built by \`tsc -b\`, not bundled, and
  declares no tsconfig \`paths\`. Inside \`sources/backend/\` every internal import is RELATIVE and
  keeps its \`.js\` suffix:
  \`import { taskResource } from '../../resources/task/task.js'\`.
  \`@/resources/task/task.js\` there is \`TS2307: Cannot find module\`, and changing the suffix does
  not help — the alias is what is missing, not the extension.
- \`@/\` is the ONLY alias that exists. If you find yourself writing any other \`@\`-prefixed
  import that is not a real npm package, you are inventing a module that is not there;
  use a relative path or an existing package instead.
`),

  skill(ViableSkill.ReactComponents, 'React components', `
- Icons come from \`lucide-react\`. If a named icon does not exist in that package, do not
  guess another name — inline a small SVG instead.
- Every component declares a props type.
- Do not fetch data directly in a component. A component reads its data and its handlers
  from its view-model hook.
- Never use a dynamic import for a component or an icon — in particular never
  \`lucide-react/dynamicIconImports\`. Import what you need statically by name.
`),

  skill(ViableSkill.OwlMeansEntrypoints, 'Entrypoints — screens and endpoints', `
Everything this app addresses — a screen the browser renders, an endpoint the server answers
— is an OwlMeans **entrypoint**: declared with \`@owlmeans/entrypoint\` and \`@owlmeans/route\`
in the shared package, elevated with \`@owlmeans/web-client\` in the browser and
\`@owlmeans/server-app\` on the backend. \`@owlmeans/web-client\` builds the route table from the
entrypoints and renders it over the History API, so there is no router file, no \`<Routes>\` and
no \`app.get(...)\`. No third-party routing or HTTP-server package is installed — importing one
fails to resolve.

An entrypoint is DECLARED once in the shared package, then ELEVATED on each side that uses it.

**1. The alias.** Aliases live in ONE place, the \`app\` tree in
\`sources/common/src/consts.ts\`. NEVER write an alias string inline — always reference
\`app.web.*\` / \`app.api.*\`. An inline string compiles and then silently addresses nothing.

${ALIAS_CONVENTION}

**2. The declaration** — \`sources/common/src/entrypoints.ts\`, one line in the \`entrypoints\`
array:

    import { entrypoint, guard, gate, filter, body } from '@owlmeans/entrypoint'
    import { route, frontend, RouteMethod } from '@owlmeans/route'

    entrypoint(route(app.api.task.list, '/list', { parent: app.api.task }), guard(DEFAULT_GUARD))

- \`route(alias, path)\` is a BACKEND route by default. \`route(alias, path, frontend())\` makes
  it a screen; \`frontend({ default: true, parent: app.web.base })\` makes it the index screen.
- Nest with \`{ parent: <group alias> }\` — the child path is APPENDED to the parent's, so the
  child path is the tail only (\`'/list'\`, not \`'/tasks/list'\`).
- \`{ method: RouteMethod.POST }\` (from \`@owlmeans/route\`) for anything that is not a GET.
- \`filter(body<T>(TSchema))\` whenever the body's type has a schema beside it in the shared
  package — every generated type exports one, named after the type with a \`Schema\` suffix
  (\`Task\` → \`TaskSchema\`). Import both from the shared package and use them; that is what makes
  the framework reject a malformed request before your handler runs, so the handler never has to
  check whether a field arrived. Still never INVENT a schema inline: if the type has none, leave
  the endpoint unfiltered rather than writing a literal here that nothing else agrees with.
- Access is declarative: no \`guard()\` = public, \`guard(DEFAULT_GUARD)\` = any signed-in user,
  \`guard(DEFAULT_GUARD, gate(OIDC_GATE, ['<permission>']))\` = a permission is required.
  \`<permission>\` is a SHAPE, never a value: build the real name from the domain being
  implemented — the resource, TWO hyphens, the action, lowercase kebab-case, singular resource.
  Do not write a bracketed word into an application, and do not copy a name out of this
  document; both produce a gate nobody can pass.
  Add \`@<routeParam>\` to scope the check to one record — the name after \`@\` MUST be a \`:\`
  segment of that same entrypoint's own path, since one the path does not carry resolves to
  nothing and the gate then refuses every request. Guards and gates are INHERITED by children and
  enforced by the framework — a handler or a screen never re-checks them.

**3. The elevation.** The declaration alone renders and answers nothing.

- Server, \`sources/api/src/entrypoints.ts\`:
  \`elevate(appEntrypoints, app.api.task.list, handleRequest(...))\`
- Client screen, \`sources/web/src/entrypoints.ts\`:
  \`elevate(appEntrypoints, app.web.taskList, handler(TaskListScreen))\`
- Client CALL, same file: a BARE elevation, no component —
  \`elevate(appEntrypoints, app.api.task.list)\`. This is what makes the alias callable from the
  browser. Passing a component to a backend alias is a hard error, not a warning.

**A missing client elevation is invisible until the app runs.** The whole shared list is
registered on the browser context, so \`ctx.entrypoint(alias)\` finds the un-elevated declaration
and returns it; the call site casts it to \`ClientEntrypoint\`, so TypeScript sees a type that has
\`call\` and the build is clean. The only symptom is in the browser:

    TypeError: entrypoint.call is not a function

That message means EXACTLY one thing — the alias in that \`ctx.entrypoint(...)\` has no
\`elevate(list, <alias>)\` line in \`sources/web/src/entrypoints.ts\`. Add the bare
elevation above the \`// owlmeans: add new backend elevations above this line\` sentinel. It is
never a broken component, never a bad import, and never a reason to rewrite the view model or to
replace the call with \`fetch\`. If the alias is not declared in
\`sources/common/src/entrypoints.ts\` either, declare it there FIRST: elevating an alias the
shared list does not carry throws \`Entrypoint with alias X not present\` while the module is
still loading, which blanks the whole app instead of failing one call.

**4. An AREA is the PARENT entrypoint.** The chrome of the app — header, navigation, footer —
is never imported by a screen. It comes from an entrypoint of its own, and the screens that use
it are declared as its CHILDREN. There are exactly FOUR areas, they already exist in the
project, and an area contributes chrome AND a URL prefix:

- \`app.web.area.guest\` at \`/\` — visitors who are not signed in.
- \`app.web.area.user\` at \`/frontoffice\` — signed-in end users; the front office.
- \`app.web.area.admin\` at \`/admin\` — the owner of the application.
- \`app.web.area.operator\` at \`/backoffice\` — staff running the business process; the back office.

Those four declarations and their elevations are FIXED. NEVER add an area, NEVER change one's
path, NEVER touch its \`guard()\`/\`gate()\`, NEVER re-declare one — put the screen in the area
whose access and audience it needs instead. A product's own roles are not areas: they are users
or operators holding different permissions.

    // sources/common/src/entrypoints.ts — a screen: TAIL path, area as parent, no access
    entrypoint(route(app.web.taskList, '/tasks', frontend({ parent: app.web.area.user }))),

    // sources/web/src/entrypoints.ts
    elevate(list, app.web.taskList, handler(TaskListScreen))

That screen answers at \`/frontoffice/tasks\`. The path you write is the TAIL ONLY — repeating the
area prefix (\`'/frontoffice/tasks'\`) publishes it at \`/frontoffice/frontoffice/tasks\`, which
nothing in the menu links to and no navigation call reaches.

The framework passes the matched child to the area as \`children\`, so an area layout is
\`FC<PropsWithChildren>\` and renders \`{children}\` in its content region. A screen therefore
renders ONLY its own content: importing a layout inside a screen renders the header, the menu
and the footer a second time, nested inside the first.

- \`app.web.base\` stays BARE — \`elevate(list, app.web.base)\`, no \`handler()\`. It is the
  pass-through shell that hosts the four areas and contributes no chrome.
- Every area needs a child declared \`frontend({ default: true, parent: app.web.area.<area> })\`.
  An entrypoint with children but no default child matches nothing and renders a BLANK PAGE.
  Each area already ships one; never remove it and never add a second.

**Access is INHERITED from the area.** Guards and gates cascade to children, so choosing the area
IS the access decision and a screen declares none of its own:

- guest area — no guard at all; its screens add nothing.
- user area — \`guard(DEFAULT_GUARD)\`; its screens add nothing.
- admin area — \`guard(DEFAULT_GUARD, gate(OIDC_GATE, ['project--admin']))\`; its screens add
  nothing, the marker is the whole rule.
- operator area — \`guard(DEFAULT_GUARD)\`, and EVERY screen under it additionally declares
  \`gate(OIDC_GATE, ['<permission>'])\` naming the permission THAT screen needs, built from the
  screen's own resource and action (add \`@<routeParam>\` when the screen shows one specific
  record). This is the ONLY screen that declares access.

An ENDPOINT has no area to inherit from, so it states its level itself: no \`guard()\` for guest,
\`guard(DEFAULT_GUARD)\` for any signed-in user,
\`guard(DEFAULT_GUARD, gate(OIDC_GATE, ['<permission>']))\` when a permission is required — built
from ITS OWN resource and action — and
\`guard(DEFAULT_GUARD, gate(OIDC_GATE, ['project--admin']))\` for owner-only.

\`project--admin\` is the OWNER's marker — holding it passes EVERY gate, so the owner is not a
role inside the app. It is never one of the permissions this app declares for itself, and it is
never granted to an ordinary user. Never hand-write an admin bypass in a handler, never weaken an
existing guard to make something reachable, and never model a "limited admin" with this marker:
that is an ordinary user holding some of the app's own permissions.

Insert every new line ABOVE the matching \`// owlmeans: add new ... above this line\` sentinel,
one declaration or elevation per line. Adding an endpoint touches five files (alias,
declaration, handler, server elevation, client elevation); a screen touches five too (alias,
declaration, screen component, client elevation, navigation entry). Skipping one leaves it
unreachable.

**Calling an endpoint** from the frontend — \`call()\` resolves to the VALUE, and a non-2xx THROWS:

    const tasks = await owlCtx.entrypoint<ClientEntrypoint<Task[]>>(app.api.task.list).call()
    const task = await owlCtx.entrypoint<ClientEntrypoint<Task>>(app.api.task.create)
      .call({ body: input })
    const task = await owlCtx.entrypoint<ClientEntrypoint<Task>>(app.api.task.get)
      .call({ params: { taskId } })

An entrypoint carries three verbs and each answers a different question:

- \`call(req?)\` — performs the call and resolves to the VALUE. This is the one nearly every
  view model wants.
- \`invoke(req?)\` — the same round trip, resolving to \`{ value, outcome }\`, for the rare place
  where the OUTCOME decides what happens next.
- \`url(req?, opts?)\` — builds the URL this entrypoint addresses; \`url(req, { absolute: true })\`
  for a fully qualified one. A SCREEN entrypoint answers only this verb — calling \`call()\` or
  \`invoke()\` on one THROWS.

\`ClientEntrypoint\` comes from \`@owlmeans/web-client\` and from nowhere else:

    import type { ClientEntrypoint } from '@owlmeans/web-client'

\`@owlmeans/client\` does NOT export it — importing it from there fails the build with
\`error TS2305: Module '"@owlmeans/client"' has no exported member 'ClientEntrypoint'\`.
And the type argument goes on \`ClientEntrypoint\`, never on \`entrypoint\` itself:
\`owlCtx.entrypoint<Task>(alias)\` fails with \`error TS2739: Type 'Task' is missing the
following properties from type 'BasicEntrypoint'\`.

Inside a component or a hook — which is where nearly every call belongs — read the context with
\`useContext()\` from \`@owlmeans/web-client\`. \`owlCtx\` is for module-level code that has no
hook to run in: it is a MODULE EXPORT — \`import { owlCtx } from '@/owlmeans'\` — never a global;
\`window.owlCtx\` and \`(window as any).__owlCtx\` do not exist. NEVER set an
\`Authorization\` header and never read a token — the framework attaches it to every guarded
call. There is no \`fetchApi\` helper and no \`fetch\` call to the backend.
`),

  skill(ViableSkill.OwlMeansNav, 'Navigating between screens', `
Navigation addresses an ALIAS, never a URL. The path an alias resolves to is owned by
\`sources/common/src/entrypoints.ts\`; a hard-coded \`/tasks/\${id}\` desynchronizes silently the
moment the declaration changes.

    import { useNavigate } from '@owlmeans/client'

    const nav = useNavigate()
    nav.go(app.web.taskDetails, { params: { taskId } })   // navigate now
    <button onClick={nav.press(app.web.taskList)}>        // press() RETURNS the handler
    nav.back()

- \`useNavigate\` comes from \`@owlmeans/client\`. It is NOT exported by
  \`@owlmeans/web-client\` — importing it from there fails to resolve.
- \`nav.press(alias)\` returns a click handler. Write \`onClick={nav.press(alias)}\`, never
  \`onClick={() => nav.press(alias)}\` — the second form navigates nowhere because it only
  builds a handler and drops it.
- There is no \`<Link>\` and no \`<Navigate>\` component. Use an \`<a>\` (or a button) with
  \`onClick\`.

Route params are PROPS, not a hook. The framework renders a screen with
\`{ context, params, alias, path }\`, so a screen that needs \`:taskId\` declares it:

    interface TaskDetailsScreenProps { params: { taskId: string } }

    export const TaskDetailsScreen: FC<TaskDetailsScreenProps> = ({ params }) => { ... }

Never import \`useParams\` — no package the app depends on exports it, and the import fails to
resolve.

**A screen reaches the MENUS only through the navigation registry** — one line per screen in
\`sources/web/src/nav.ts\`, above the
\`// owlmeans: add new navigation entries above this line\` sentinel:

    { area: 'user', section: 'Tasks', alias: app.web.taskList, label: 'All tasks' },

- \`area\` is \`'guest' | 'user' | 'admin' | 'operator'\` and must be the SAME area the screen is
  declared under in \`sources/common/src/entrypoints.ts\`.
- \`section\` groups screens into the TOP menu (the first level). The screens of the active
  section are the SIDE menu (the second level), and a section holding a single screen shows no
  side menu at all.
- A section is a LABEL, never a URL segment. Regrouping screens changes the menus and never an
  address.
- NEVER hand-write a menu, a \`<nav>\`, a sidebar, a breadcrumb or a list of links in a screen or
  a layout. The chrome comes from \`NavLayout\` (\`@owlmeans/web-panel\`), which the four area
  layouts already render off this registry.

A screen with no line here compiles, elevates and renders — it is simply reachable by direct URL
only, and nothing reports it.
`),

  skill(ViableSkill.PermissionModel, 'Permissions — the name, the gate and the grant', `
\`enquiry\` below belongs to a DIFFERENT application, used here only to show the shape. Every
permission you write is built from the resource and action of the app you are working on; a name
copied out of this document is a gate nobody can ever pass.

A permission is ONE string that has to line up in three places:

1. the GATE on the entrypoint — \`gate(OIDC_GATE, ['enquiry--view@enquiryId'])\`
2. the permission DEFINITION registered for the project — name \`enquiry--view\`,
   resource \`enquiry\`, action \`view\`, resource-scoped \`true\`
3. the GRANT an administrator makes, which addresses that definition by name.

**The \`@\` suffix belongs to the GATE ONLY. It is never part of a permission's name.**

    // right — the gate scopes the check; the definition and the grant use the bare name
    entrypoint(
      route(app.api.enquiry.get, '/:enquiryId', { parent: app.api.enquiry }),
      guard(DEFAULT_GUARD, gate(OIDC_GATE, ['enquiry--view@enquiryId']))
    )
    // definition: enquiry--view      grant: enquiry--view

    // wrong — the suffix carried into the registered or granted NAME
    // definition: enquiry--view@enquiryId
    // grant:      enquiry--view@enquiryId

The gate splits its parameter at the FIRST \`@\`: what comes before is the permission it looks up,
what comes after says where to read the resource id. So a definition or a grant whose name
contains an \`@\` is a key nothing ever looks up. The symptom is a user who HAS been granted the
permission and still gets 403, with nothing logged. The cause is the \`@\` in the stored name —
never the gate line, which is usually already correct. Repair the definition and the grant; do
NOT delete the \`@\` from the gate to make the two strings match.

**Repair order matters.** Normalize FIRST, then judge what is left. Normalizing renames a
malformed definition and carries its grants across in the same write; deleting first throws those
grants away, and nothing can reconstruct who held them.

**The name.** \`<resource>--<action>\`:
- Both halves are names from THIS application's own domain. \`<resource>\`, \`<action>\` and
  \`<permission>\` are placeholders describing the shape — writing one of them, or any other
  bracketed word, produces a permission no screen can grant and no user can ever hold.
- \`--\` is TWO hyphens. One hyphen is not a separator: \`enquiry-view\` is a resource named
  \`enquiry-view\` with no action at all.
- lowercase kebab-case in both segments, singular resource.
- Actions are collapsed: create, update, edit and delete are all \`modify\`; reading one record is
  \`view\`; reading many is \`list\`.
- \`project--admin\` is the OWNER's marker. No story ever registers it, and holding it passes every
  gate. It is enforced by a decoration wrapped around the gate in \`sources/backend/src/context.ts\`,
  NOT by any gate parameter — so its absence from the entrypoint declarations is not evidence that
  it is unused, and it must never be deleted as "a definition nothing names".

**The \`@\` selector.** \`@<routeParam>\`: the name after \`@\` must be a \`:\` segment of THAT
entrypoint's own declared path. \`'enquiry--view@enquiryId'\` on a route declared \`'/enquiries/:id'\`
resolves to nothing, so the gate refuses every request and no error explains why. A permission used
with a selector is resource-scoped: a grant may carry the specific ids it covers, and a grant
carrying no ids at all covers every resource.

**Every way this goes wrong, and what each one costs.** The application is a clinic in these
examples; yours is not, so read the right-hand column as a shape and build the name from your own
domain.

    // WRONG — a bracketed word from an instruction, written as if it were a name
    gate(OIDC_GATE, ['<permission>'])
    gate(OIDC_GATE, ['<resource>--<action>'])
    // RIGHT — this application's own resource and action
    gate(OIDC_GATE, ['appointment--modify'])
    // Costs: nothing registers a bracketed name, so the gate refuses every request forever.

    // WRONG — a name copied out of a skill, a comment or another app's example
    gate(OIDC_GATE, ['article--modify'])      // in an application that has no articles
    // RIGHT — a name that exists in THIS domain
    gate(OIDC_GATE, ['appointment--modify'])
    // Costs: the permission is asserted but never declared, so no administrator can grant it.

    // WRONG — the selector carried into the stored name
    ensurePermission(entity, client, 'appointment', { permission: 'modify@appointmentId' })
    // RIGHT — the selector stays in the gate; the stored name is bare
    ensurePermission(entity, client, 'appointment', { permission: 'modify' })
    // Costs: a grant lands on a key no gate reads — the screen says granted, the request says 403.

    // WRONG — a selector naming a param this route does not declare
    route(app.api.appointment.get, '/:appointmentId')
    gate(OIDC_GATE, ['appointment--view@id'])
    // RIGHT — the name after @ is a ":" segment of this very route
    gate(OIDC_GATE, ['appointment--view@appointmentId'])
    // Costs: the id resolves to nothing, so the endpoint refuses every request with nothing logged.

    // WRONG — one hyphen
    gate(OIDC_GATE, ['appointment-modify'])
    // RIGHT — two
    gate(OIDC_GATE, ['appointment--modify'])
    // Costs: it registers as a resource with no action, and never lines up with the real one.

**Never spell one permission two ways.** Reuse the exact string an existing declaration already
carries. Introducing a second spelling orphans every grant made against the first.
`),

  skill(ViableSkill.ShadcnUi, 'shadcn/ui and Tailwind', `
- The \`cn\` helper is a NAMED export of \`@/lib/utils\` — not \`@/lib/utils/cn\`, which is not a
  file and fails to resolve.
- The shadcn primitives are VENDORED into this project at \`@/components/ui/*\`, and
  \`@owlmeans/web-panel\`'s own components resolve theirs through that same path — against these
  files, not a copy of their own. They are already there: import them, never delete, rename or
  move one, and never re-add a primitive the directory already carries.
- Styling is Tailwind utility classes. There are no CSS modules and no styled-components.
- Colour comes in PAIRS. Every surface token in this theme has a foreground partner —
  \`--background\`/\`--foreground\`, \`--card\`/\`--card-foreground\`, \`--primary\`/\`--primary-foreground\`,
  and the same for \`secondary\`, \`muted\`, \`accent\`, \`popover\`, \`destructive\` and \`sidebar\`. Painting a
  surface is therefore never a single decision: give the element its partner in the SAME
  \`className\`, or the text keeps the colour meant for the surface underneath and vanishes wherever
  the design made that surface dark.

      <section className="bg-primary p-6">Join us</section>                         // WRONG
      <section className="bg-primary text-primary-foreground p-6">Join us</section>  // right

  Nothing catches the wrong form — it compiles and it renders. It is unreadable only on the
  surfaces the design happened to make dark, which is why it survives to the finished screen.
- Never paint a surface with a raw or palette colour — \`bg-slate-900\`, \`bg-[#101820]\`,
  \`style={{ background: '#101820' }}\`. Those have no foreground partner, so nothing keeps the text
  on them legible, and they ignore the theme. Every surface is one of the tokens above.
- Depth and emphasis come from the theme's DECORATION VOCABULARY, and using it is expected rather
  than exceptional — a screen built only from flat cards is an unfinished screen. That vocabulary
  is: the component classes \`gradient-heading\` (a page or section headline), \`glass-card\` (a
  panel with depth), \`eyebrow\` (the small chip above a headline), \`cta-btn\` (the primary call to
  action, on an \`<a>\` or a bare \`<button>\`, never on a shadcn \`Button\` whose own \`bg-\`
  utility would win), \`glow-orb\` (a soft colour field behind a section, always
  \`pointer-events-none\` and behind the content); the elevation utilities \`shadow-soft\`,
  \`shadow-raised\`, \`shadow-floating\`, \`shadow-glow\`; the idle-motion classes \`reveal\`,
  \`float-slow\`, \`drift-slow\`, \`pulse-soft\`, \`spin-slow\`; and gradients whose stops are THEME
  tokens with opacity. None of these is a raw colour.

      <div className="bg-[radial-gradient(#818cf8,transparent)] blur-[120px]" />   // WRONG
      <span className="glow-orb h-80 w-96 -z-10" aria-hidden />                    // right
      <div className="bg-gradient-to-br from-primary/20 to-transparent p-6" />     // right

  Keep a gradient under a text element light — \`/20\` or less — unless the element also carries a
  \`-foreground\` partner class. These class names are defined in the project's stylesheet; do not
  invent others in the same family.
- Text that is NOT on a coloured surface takes NO colour class: it already inherits the readable
  one. Never add \`text-white\`, \`text-black\` or a \`-foreground\` class "to be safe" — on an ordinary
  panel that is the same fault inverted. \`text-muted-foreground\` for secondary text is the
  exception, and it is the partner of the standard background.
- Tailwind is version 4: every styling configuration — theme variables, custom utilities,
  layers — lives in the css files. There is NO \`tailwind.config.js\` in the project and it is
  never required: do not create it, do not look for it, do not reference it.
- A \`SelectItem\` value must never be the empty string. Radix throws
  "A <Select.Item /> must have a value prop that is not an empty string" at render time,
  because the empty string is reserved for clearing the selection. Model an
  empty/unset/"all" option with a sentinel value of \`"__empty__"\` and translate it back to
  an empty value in the change handler:

      <SelectItem value="__empty__">Any</SelectItem>
      ...
      onValueChange={value => onChange(value === '__empty__' ? undefined : value)}
`),

  skill(ViableSkill.FormFeedback, 'Telling the user what happened', `
Every action a user takes says what happened, and a successful one leaves them somewhere sensible.
An action that silently succeeds and an action that silently fails look identical from the other
side of the screen, and the user's only recourse is to do it again.

    import { toast } from 'sonner'

    toast.success('Request submitted')
    toast.error('Could not submit the request — please try again')

- The \`<Toaster />\` is ALREADY MOUNTED by the area layouts. Never import it, never render one in
  a screen or a component: a second one renders every message twice.
- ON SUCCESS of a submit, a create, an update or a delete: raise \`toast.success\` with what
  happened in a few words, then navigate. Where to is decided in this order:
  1. the destination the user story itself names;
  2. otherwise the SECTION DASHBOARD of the section this screen belongs to — its alias is the
     first entry of that section in \`sources/web/src/nav.ts\`.
  Leaving the user on a form they have just submitted, with the fields still filled in, reads as
  though nothing happened.
- ON FAILURE: raise \`toast.error\` with a message that says what to do about it, and STAY on the
  screen with the entered values intact. Never navigate away from a failure.
- The toast belongs in the VIEW MODEL's action handler, beside the call that succeeded or threw —
  never in JSX, and never inside a render.
- Never \`alert()\`, never \`window.confirm()\`, never a hand-built floating \`<div>\` announcing an
  outcome, and never a bare \`console.error\` as the user-facing report.

      const submit = async (values: RequestInput) => {                      // right
        try {
          await model.create(values)
          toast.success('Request submitted')
          nav.go(app.web.requestsDashboard)
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not submit the request')
        }
      }

      await model.create(values); alert('Saved'); location.href = '/requests'  // WRONG
`),

  skill(ViableSkill.OwlmeansState, 'Client state', `
There is NO redux in this project. \`@reduxjs/toolkit\` and \`react-redux\` are NOT installed,
there is no \`store.ts\`, and \`createSlice\`, \`createAsyncThunk\`, \`configureStore\`,
\`useSelector\`, \`useDispatch\`, \`PayloadAction\`, \`RootState\` and \`AppDispatch\` do not exist.
Importing any of them fails to resolve.

State lives in a state RESOURCE on the OwlMeans context — the same container the entrypoints and
services live in.

**1. One state module per domain type**, at \`sources/web/src/state/<entity>/<type>.ts\`.
It declares the alias and the hooks that READ it, and nothing else:

    import { useStoreList, useStoreModel } from '@owlmeans/client'
    import { useContext } from '@owlmeans/web-client'
    import type { Criteria } from '@owlmeans/resource'
    import type { Task } from 'project-common/models/task/task.type.js'

    export const TASK_STATE = 'task-state'

    export const useTaskResource = () => useContext().getStateResource<Task>(TASK_STATE)
    export const useTask = (id?: string) => useStoreModel<Task>(id, TASK_STATE)
    export const useTaskList = (query: Criteria<Task> = {}) =>
      useStoreList<Task>({ query, resource: TASK_STATE })

\`useStoreModel\` / \`useStoreList\` come from \`@owlmeans/client\` — \`@owlmeans/web-client\` does
NOT re-export them. \`useContext\` in a STATE module comes from \`@owlmeans/web-client\`, never
from \`@/context.js\`: that module imports this one to register the alias, so importing it back
is a cycle.

**2. The alias is registered on the context**, one line in \`sources/web/src/context.ts\`
above its sentinel:

    import { TASK_STATE } from '@/state/task/task.js'
    ...
    appendStateResource<C, T>(context, TASK_STATE)
    // owlmeans: add new state resources above this line

Without that line every hook for the alias throws \`Resource task-state not found\` at runtime,
and no type check can see it.

**3. Reading.** \`useStoreList({ query })\` is a LIVE list: it re-renders whenever a write changes
which records match, so a screen never recomputes ids and never re-subscribes.

    const open = useTaskList({ status: 'open' })   // StateModel<Task>[]
    open.map(model => model.record.title)

\`useStoreModel(id)\` is one record — the model always exists so a screen has something to bind
to, but nothing is invented to fill it. \`model.empty\` is what "not loaded yet" looks like:

    const task = useTask(id)
    if (task.empty) return <Spinner />   // no record for that id (yet)

**4. Writing.** A \`StateModel.record\` is a COPY. Assigning to it changes nothing:

    model.record.title = 'renamed'      // WRONG — silent no-op, nothing re-renders
    model.update({ title: 'renamed' })  // RIGHT — merges and commits
    model.clear()                       // deletes the record

Through the resource: \`await tasks.save(record)\` creates-or-replaces, \`tasks.delete(id)\`
removes, \`tasks.list(criteria)\` returns \`{ items, total }\` and \`tasks.count(criteria)\` the
number alone.

When an endpoint answers with a WHOLE set — every task of a project, the session's items — install
it in one step:

    await tasks.replace(fromServer)   // the store now holds exactly these

\`replace\` is what makes the store agree with the server: a record deleted elsewhere leaves in the
same write, and the subscribers wake once instead of once per record. A loop of \`save\` calls only
ever ADDS, so anything stale stays visible forever.

**5. Criteria** are the same language the backend resources take: a bare value is equality, a
bare ARRAY means "any of these", plus \`$eq $ne $gt $gte $lt $lte $in $nin $exists $null $like
$ilike $regex $startsWith $endsWith $between\` and \`$and\` / \`$or\` / \`$not\`. A dotted key
reaches into the record. A value of \`undefined\` is skipped, so an untouched filter does not
empty the list.
`),

  skill(ViableSkill.StoreAccess, 'Reading and writing the store', `
- The store is NOT granular: it holds whole records. There is no method per field, and adding
  one is not how a single property is changed — \`model.update({ field })\` merges.
- A subscribed record is reached through \`model.record\`, never as the model itself:
  \`task.record.title\`, not \`task.title\`.
- A record may not have arrived yet, and nothing invents one to stand in. \`model.empty\` says so;
  guard on it before rendering, and guard before reading THROUGH the record —
  \`model.record?.items?.[id]?.name\` — rather than assuming the shape is populated.
- A list read is \`model.list()\` on the resource, returning \`{ items, total }\` — take the count
  from \`total\`, and \`count(criteria)\` when the number is all that is wanted.
- The store carries RECORDS, not request status. Loading flags and error messages are ordinary
  \`useState\` in the view model; a field named \`isLoading\` or \`error\` does not belong in a
  stored record unless the domain type genuinely has one.
`),

  skill(ViableSkill.ViewModelNaming, 'View-model naming convention', `
A component's view logic lives in its sibling \`.vm.ts\` file. Derive its public
symbols from the component name (PascalCase of the component definition — for example
"main-task-list" becomes "MainTaskList"):

- The hook is \`use<ComponentName>ViewModel\` (\`useMainTaskListViewModel\`).
- Its options/props type, when it takes arguments, is \`<ComponentName>ViewModelOptions\`.
- The primary loader the hook returns is \`load<ComponentName>\`; a refresh action is
  \`reload<ComponentName>\`.
- Action handlers are verb-first camelCase (\`createTask\`, \`removeTask\`).

Both sides must use these exact names. This is a DEFAULT: when a "View-model contract"
block is present in the task, it lists the symbols that actually exist and overrides this
convention entirely.
`),

  skill(ViableSkill.ResourceLayer, 'OwlMeans resources own the schema', `
A "resource" is ONE file — \`src/resources/{entity}/{type}.ts\` — carrying all data access
for one domain entity: its AJV schema, its \`makePostgresResource()\` maker, and an accessor
that returns the instance already registered on the OwlMeans context.

\`src/resources\` sits directly under \`src\`, not under \`models\`.

THE RESOURCE OWNS THE DDL. You never define a table. The AJV schema you write on the
resource IS the table: the OwlMeans layer creates it, and on every start reconciles an
existing table against the schema — adding, retyping and dropping columns and reconciling
indexes. A resource whose schema changed simply converges the next time the backend starts.

Never do any of the following — each one is the removed Drizzle-DDL layout. Some of these
imports still RESOLVE, because the framework uses the driver internally, so a clean build
proves nothing: the table you define becomes a SECOND owner of one the resource layer
already owns, and the next start reconciles yours away.

- \`import ... from 'drizzle-orm'\` or \`'drizzle-orm/pg-core'\`. \`drizzle-orm\` is NOT a
  dependency of this project. If you ever truly need the builder, the resource hands it to
  you — see the resource-method rules below.
- \`import ... from 'postgres'\`, \`'pg'\`, \`'@/lib/db.js'\` or \`'@/db/schema/...'\`. \`pg\` is
  installed only because the framework's driver requires it; it is never yours to import.
- calling \`drizzle()\`, \`pgSchema()\` or \`pgTable()\` yourself.
- writing a table definition, a migration file, a \`drizzle.config.ts\`, or a \`src/db\`
  directory. There is no \`db:generate\` and no \`db:migrate\`.

A foreign key is declared by the referenced resource's ALIAS, never by importing another
file:

    pg: { references: { resource: 'other-alias' } }

If the referenced resource does not exist, use a plain string property instead.
`),

  skill(ViableSkill.ResourceResults, 'How resource methods are called, and what they return', `
Reach data through the accessor from \`@/resources/{entity}/{type}.js\` and call the
resource's own methods. Never write raw SQL in a route handler, never import a database
connection, and never construct a resource yourself.

A WRITE takes ONE argument — the record — and the id travels INSIDE it. There is no
\`(id, changes)\` overload on any of them:

    await resource.create(payload)                        // refuses a caller-supplied id
    await resource.update({ ...current, ...changes })     // replaces the WHOLE record
    await resource.patch({ id: current.id, progress })    // merges only the listed fields
    await resource.save(record)                           // create-or-replace

THE DATABASE ASSIGNS THE ID. \`id\` is a generated column — the table is created with a
\`gen_random_uuid()\` default — so a NEW record does not have one yet and it is not yours to
invent. NEVER generate an id in application code: no \`randomUUID()\`, no \`crypto.randomUUID()\`,
no \`uuid()\`, no counter, no \`Date.now()\` string, and never \`import { randomUUID } from
'crypto'\` for this. Build the record WITHOUT an \`id\` key at all and read the id off the record
\`create\` HANDS BACK:

    const created = await resource.create({ title, ownerId })   // no id in the payload
    return created.id                                           // the id the database assigned

\`create\` REJECTS a record that carries an \`id\` — including one you just generated — by
throwing \`resource:record-exists:id-present\`. Despite its name that error does NOT mean a
duplicate record was found and it is NOT a race, a double submit or a uniqueness collision: it
means the payload had an id in it. The only fix is to stop putting one there. Do not "repair" it
with a retry, an in-flight guard, an idempotency check, or a \`load(id)\`-then-return-existing
branch — none of those touch the cause, and looking up an id you just minted can only ever miss.

When you genuinely have an id already — the record exists and you are writing it back — that is
\`update\`/\`patch\`/\`save\`, never \`create\`. A record type declaring \`id: string\` as required
describes a STORED record; the create payload is that type without its id (\`Omit<T, 'id'>\`).

Passing an id as a WRITE's first argument fails to compile with \`error TS2559: Type 'string'
has no properties in common with type 'Partial<...>'\` — a bare id is a READ's argument, never
a write's. Load the record first when you only have its id, then write the merged object back
— or use \`patch\`.

A READ takes either an ID or a CRITERIA OBJECT as its first argument. There is no
"value plus field name" overload — the field is a key of the object:

    await resource.load(id)                       // the record, or null
    await resource.load({ projectId })            // by any other field, or several at once
    await resource.get(id)                        // throws UnknownRecordError instead of null
    await resource.get({ ownerId, slug })
    await resource.list({ status: 'open' })       // { items, total, page?, size? }
    await resource.count({ status: 'open' })      // number

Writing \`load(projectId, 'projectId')\` fails to compile — the second parameter is
\`{ sort }\`, not a field name. Fetching ONE record is \`load\`/\`get\`, never a \`list\` whose
first element you take: \`const { items: [x] } = await resource.list({ a, b })\` is
\`const x = await resource.load({ a, b })\`.

Inside the criteria object a bare value means equality, a bare ARRAY means "any of these"
(\`{ status: ['open', 'held'] }\`), \`null\` asks for IS NULL, and \`undefined\` is SKIPPED —
so an untouched filter cannot empty a list. A field may instead carry an operator object —
\`$eq $ne $gt $gte $lt $lte $in $nin $exists $null $like $ilike $regex $startsWith $endsWith
$between $contains $contained $overlaps\` — and \`$and\` / \`$or\` / \`$not\` combine whole
criteria:

    await resource.list({ createdAt: { $gte: since }, $or: [{ ownerId }, { shared: true }] })

\`delete(id)\` returns the removed record or \`null\`. \`take(id)\` DELETES the record it hands
back and throws \`UnknownRecordError\` when there is none — it is never a way to read one; use
\`load\`/\`get\` for that. \`purge(where)\` deletes every match and returns how many went, so
clearing a set is one call and never a page loop around \`delete\`; it refuses an empty \`{}\`
rather than emptying the table.

These methods return the RECORDS THEMSELVES, never a driver result object. There is NO
\`rowsAffected\`, \`affectedRows\`, \`changes\` or \`rowCount\` anywhere — reading one
yields \`undefined\`, which then silently compares as false. Use \`count(where)\` for a
number and \`await resource.load(id) != null\` for an existence check.

PAGING AND SORT ARE FLAT IN THE SECOND ARGUMENT of \`list\`. There is no \`limit\`, no
\`offset\`, and no \`pager\` or \`criteria\` wrapper — those two names do not exist:

    resource.list({ status: 'open' }, { page: 0, size: 20, sort: ['createdAt'] })

- \`sort\` is an array of field names (ascending) or \`{ field, order: 'desc' }\` objects.
- Writing \`list({}, { page, limit: 10 })\` fails with \`'limit' does not exist in type
  'ListOptions<...>'\`, and nesting the same pair under \`pager\` only moves the error to
  \`'pager' does not exist in type 'ListOptions<...>'\`. The declared name is \`size\`.
- The backend pages by itself: Postgres returns at most \`DEFAULT_PAGE_SIZE\` (100) rows when
  \`size\` is absent, so a listing that genuinely needs every match asks for
  \`{ size: 0 }\` — explicitly, once, where a reader can see it.
- The result is \`{ items, total, page?, size? }\`. \`total\` is the full count of matching
  records, never \`items.length\` — build pagination UI from it, and never recompute it.

For a join or aggregate the CRUD surface cannot express, use \`resource.select()\`/\`query()\`
with \`{{}}\` for this resource's table and \`{{other-alias}}\` for another registered
resource's.

A Drizzle handle exists as a LAST RESORT, and only through the resource:
\`(await resource.db()).drizzle\` over \`resource.entity\`, reached with NO import. Nothing on
that path is typed — \`resource.entity\` is \`Record<string, any>\` — and the moment the query
needs \`eq\`, \`and\` or \`sql\` it needs an import you may not write: that query goes in
\`resource.query()\` instead. Read \`resource.entity\` inside a function, never at module
scope; it is built during \`init()\` and is \`undefined\` before then.
`),

  skill(ViableSkill.ResourceMigrations, 'Data migrations', `
Schema shape needs no migration — reconciliation handles it. Only a DATA change
reconciliation cannot make on its own (a backfill, a value rewrite) needs one, and it is
registered on the resource as code, inside the maker, beside \`resource.index(...)\`. The
signature is \`resource.migration(name, fn, stage)\`:

    resource.migration(name, async tx => { ... }, stage)

Registering is all there is to do: the resource runs its pending migrations itself during
\`init()\`, so nothing ever calls one. The call returns the resource, so several chain, and
re-registering the same name with the same body is a no-op — which is what makes it safe in a
maker that runs more than once.

Each one is applied once and recorded under its name and a checksum of its body. Editing a
migration that has already run throws \`resource:migration-conflict\` at the next boot; a new
fact needs a NEW migration under a new name. A migration that throws aborts the boot with
\`resource:migration-failed\` rather than leaving the app on a half-shaped database.
`),

  skill(ViableSkill.OwlmeansContext, 'The OwlMeans context', `
The context is the application's container. It holds exactly two kinds of thing: RESOURCES (data)
and SERVICES. Nothing else lives on it.

**The context is built by a LIBRARY and there is no module-level \`owlCtx\` on the server side.**
\`makeBackendContext\` lives in \`sources/backend/src/context.ts\`, and the api and the worker each
build their own from it — so a module in \`sources/backend\` that imported a container singleton
would bind whichever process happened to load it first. The browser is the exception: the web app
IS one process, and \`sources/web/src/owlmeans.ts\` exports \`owlCtx\` for module-level code.

**Data comes from the resource accessor, and the accessor takes the context.** Every handler and
every job processor is handed its own; pass it down.

    import { taskResource } from 'project-backend/resources/task/task'
    const { items } = await taskResource(ctx).list({ status: 'open' })

**Business logic in \`src/models/**\` is PLAIN EXPORTED FUNCTIONS. It is never a service.**
Never write this:

    // WRONG — this object is not a service, nothing registers it, and the lookup throws
    export const DASHBOARD_SERVICE = 'dashboard-activity'
    export const makeDashboardService = (ctx) => ({
      alias: DASHBOARD_SERVICE, registerContext: ..., assertCtx: ..., initialized: true,
      getSummary: async () => ...
    })

Write this instead, and let the route handler import the function directly:

    // RIGHT — sources/backend/src/models/dashboard/activity.ts
    export const getSummary = async (ctx: BasicContext<BasicConfig>, guestId: string) => { ... }

    // RIGHT — sources/api/src/app/dashboard/activity.ts
    import { getSummary } from 'project-backend/models/dashboard/activity.js'
    const summary = await getSummary(ctx, guestId)

Do not create a service just to hold functions.

**A resource is NEVER reached through \`service()\`.** Resources and services are two different
registries. Asking for a resource alias on the service registry throws even though the resource
exists and is registered:

    // WRONG — 'reservation' is a RESOURCE; this throws
    //   SyntaxError: Service reservation not found
    const reservations = ctx.service<PostgresResource<any>>('reservation')

    // RIGHT — import the accessor the resource file exports, and hand it the context
    import { reservationResource } from 'project-backend/resources/reservation/reservation'
    const { items } = await reservationResource(ctx).list({ status: 'open' })

A function in \`src/models/**\` takes the context first and its own domain arguments after.

**\`ctx.service(alias)\` THROWS when the alias is unknown** — it does NOT return
\`undefined\`:

    SyntaxError: Service dashboard-activity not found

So a null check around it is dead code that never runs:

    // WRONG — the throw already happened on the line above
    const svc = ctx.service(ALIAS)
    if (!svc) { throw { status: 503 } }

\`ctx.resource(alias)\` and \`ctx.entrypoint(alias)\` throw the same way
(\`Resource X not found\`, \`Entrypoint X not found\`).

**Only when a real lifecycle-owning singleton is needed** — a client holding a connection, a
cache, a poller. Business logic never qualifies, and neither does "the handler needs to call
this": export a function. When it genuinely does qualify, put it in
\`sources/backend/src/services/{name}.ts\`, one service per file,
flat in that directory, built with \`createService\` and never as a hand-written object:

    import { createService } from '@owlmeans/context'
    import type { InitializedService } from '@owlmeans/context'
    import type { BasicConfig, BasicContext } from '@owlmeans/context'

    export const SERVICE_ALIAS = 'dashboard-activity'

    export interface DashboardActivityService extends InitializedService {
      getSummary: (guestId: string) => Promise<Summary | null>
    }

    // The maker name is fixed — the generated service registry imports exactly this symbol.
    export const makeService = (): DashboardActivityService =>
      createService<DashboardActivityService>(SERVICE_ALIAS, {
        getSummary: async guestId => { ... }
      })

    /** The registered instance — import this from API handlers and job processors. */
    export const dashboardActivityService = (ctx: BasicContext<BasicConfig>): DashboardActivityService =>
      ctx.service<DashboardActivityService>(SERVICE_ALIAS)

Never call \`registerService()\` yourself and never edit \`src/services/index.ts\`: that registry
is generated from the directory, and the context factory registers everything in it before
\`init()\` runs.

**Never resolve anything at module scope.** Module bodies run before the context is initialized,
so a top-level \`const svc = ctx.service(X)\` throws while the file is being imported and kills
the process before it can listen. Resolve inside the function that uses it.
`),

  skill(ViableSkill.OwlMeansServices, 'Services vs entrypoints — two registries', `
This project has TWO registries of names. They share nothing, and confusing them is the single
most expensive mistake that still compiles.

**SERVICES** are the two sides of the application as NETWORK ENDPOINTS — a host, a port, a base
path. They live in \`cfg.services\`, and there are exactly two:

- \`APP_WEB\` — the frontend
- \`APP_API\` — the backend

Both are declared in \`sources/common/src/consts.ts\` and registered by a \`service({ … })\` /
\`sservice({ … })\` call in \`sources/web/src/config.ts\` and
\`sources/api/src/owlmeans.ts\`. **\`serviceRoute()\` reads this registry and nothing else.**

**ENTRYPOINTS** are the \`app.web.*\` and \`app.api.*\` tree — screens and endpoints, i.e. ROUTES.
\`ctx.entrypoint()\` reads that one.

    // RIGHT — sources/web/src/owlmeans.ts, exactly as the project ships
    import { APP_API, APP_WEB } from 'project-common/consts'
    owlCtx.serviceRoute(APP_WEB, true)
    owlCtx.serviceRoute(APP_API, true)

    // WRONG — every one of these type-checks, builds clean, and blanks the whole application
    owlCtx.serviceRoute(app.web.base, true)
    owlCtx.serviceRoute(app.web.area.guest, true)
    owlCtx.serviceRoute(app.api.post.base, true)

Both sides are strings, so nothing in TypeScript can tell them apart. The failure appears only
in the browser, while the module is still being imported:

    Uncaught SyntaxError: Service not found web:base

The alias in that message is not a key of \`cfg.services\`. Pass one of the SERVICE constants
above. Do NOT substitute a different \`app.*\` value: the error simply returns wearing the new
name, which is how one project spent twenty repair attempts on one line — every one of them
reporting success.

**\`config.ts\` and \`owlmeans.ts\` on both sides are framework wiring this project was generated
with.** They carry no sentinel and no application code, nothing in the pipeline authors them, and
the write tools refuse them. If one of them is the cause, call \`restore_wiring_file\` to put back
the version the project was generated from — never re-derive it, and never "fix" it by changing
which name it uses. A service alias is renamed in \`sources/common/src/consts.ts\` and nowhere
else, and both sides must keep using the same constant or the frontend calls a backend that
publishes itself under another name.
`),

  skill(ViableSkill.OwlMeansServer, 'Writing an endpoint handler', `
There is NO express here. \`express\`, \`cors\` and \`@types/express\` are not installed, there is
no \`app.get(...)\`, no \`req\`/\`res\` of a web server, no \`next\`, and no middleware. Anything
written for express fails to resolve.

A handler is a plain async function that RETURNS its result, wrapped in one of three helpers
from \`@owlmeans/server-app\`. Pick by what the handler reads:

    import { handleBody, handleParams, handleRequest } from '@owlmeans/server-app'

    // the request BODY — the payload type is the type argument
    export const createTask = handleBody<TaskInput>(async (payload, ctx) => {
      const tasks = getTaskResource(ctx)
      return await tasks.create(payload)
    })

    // the route PARAMS — names match the ':' segments of the declared path
    export const getTask = handleParams<{ taskId: string }>(async ({ taskId }, ctx) => {
      return await tasks(ctx).load(taskId)
    })

    // anything else (query, headers, nothing at all) — the whole request
    export const listTasks = handleRequest(async (req, ctx) => {
      const query = req.query as { search?: string }
      return await tasks(ctx).list(query.search != null ? { search: query.search } : {})
    })

- The SECOND argument is the OwlMeans context. Reach every resource through it — never
  import a database connection and never write raw SQL in a handler.
- RETURN the value. \`res.json(...)\`, \`res.status(...)\`, \`res.send(...)\` do not exist; a
  returned value IS the 200 response body.
- Do not wrap the body in try/catch to convert an error into a response. A thrown
  \`ResilientError\` subclass is mapped to its status by the framework; catching it produces a
  200 carrying an error object instead.
- Never read a token, never check a role, never look at an \`Authorization\` header. Access is
  declared on the entrypoint (\`guard()\` / \`gate()\`) and enforced before the handler runs.
- A handler is inert until an \`elevate(appEntrypoints, alias, handler)\` line in
  \`sources/api/src/entrypoints.ts\` binds it to its alias. Without that line the endpoint
  answers 404 and nothing reports an error.
- Handlers are ENTITY-SCOPED: \`sources/api/src/app/<entity>/<action>.ts\`, named exports only.
  The directory is what keeps two entities' \`list\` apart — the file name carries no marker.
`),

  skill(ViableSkill.FixerHeuristics, 'Reading a build error', `
Change as little as the reported error requires, and read the error for what it actually
says before rewriting anything.

- When the task carries a \`NAME REGISTRY\` block, it is AUTHORITATIVE for every directory,
  path, alias and exported symbol it lists. NEVER rename an identifier that appears in it. An
  error saying one "does not exist" means the thing is MISSING and must be DECLARED or CREATED
  where the registry says it lives — add the alias line above the sentinel, add the import,
  write the file at that path. Renaming the reference to a different guess makes the error move
  rather than go away: the next build reports it again under the new spelling, and the loop
  never converges. "Change as little as required" is about the SIZE of the edit, never a licence
  to rename instead of declare.
- Two files disagreeing about where something lives is not two problems. Take the registry's
  spelling in both, and never invent a third.

- **"Cannot find module '@/…'" in a file under \`sources/backend/\` is the ALIAS, not the
  suffix.** That package is the shared library: it is built by \`tsc -b\`, declares no tsconfig
  \`paths\`, and \`@/\` resolves to nothing in it. Rewrite the specifier as a RELATIVE path keeping
  its \`.js\` suffix — \`'../../resources/task/task.js'\`. Adding, removing or changing the
  extension on the alias fixes nothing and the same error comes back under the other spelling;
  two attempts that differ only in the suffix mean you are in this case.
- "Cannot find module" for \`postgres\`, \`@/lib/db.js\` or \`@/db/schema/...\` inside a
  \`resources/**\` file means the file was written against the REMOVED Drizzle-DDL layout.
  Rewrite it as an OwlMeans resource: an AJV schema on \`resource.schema\`, built with
  \`makePostgresResource\`, with no table definition at all. Do not create the missing module.
- An \`import\` of \`drizzle-orm\`, \`drizzle-orm/pg-core\` or \`pg\` reports NO error — the
  driver is installed for the framework's own use — and is still wrong. It is never the cause
  of the error you were given, so do not go hunting for one; but when the reported error puts
  you in that file anyway, drop the import as part of the fix. The builder is
  \`(await resource.db()).drizzle\`, and anything that needed \`eq\`/\`and\`/\`sql\` becomes
  \`resource.query()\` with \`{{}}\` and \`$1\` parameters.
- A missing foreign-key target means the referenced resource does not exist. Declare the
  reference by alias (\`pg: { references: { resource: '<alias>' } }\`) or fall back to a
  plain string property — never import another resource file. The alias must be one the
  registry (or the listed existing resources) actually names: an invented one compiles and then
  kills the backend at startup with \`fk-unknown-resource\`, which no type check can catch.
- An error about \`rowsAffected\`/\`rowCount\`/\`changes\` not existing is the resource result
  shape — see the result rules above. \`result.pager\` is the same fault: a listing returns
  \`{ items, total, page?, size? }\`, so \`pager?.total\` becomes \`total\`.
- \`'limit' does not exist in type 'ListOptions<...>'\` (or the same for \`offset\` or
  \`pager\`) is one call written against a shape that has none of them. Paging is FLAT in
  \`list\`'s second argument: \`list(where, { page, size, sort })\`. \`size\` is the declared
  name — moving the pair under a \`pager\` key only changes which of the two names the next
  build rejects, and that swap is the loop that never converges.
- \`Property 'pick' does not exist\` on a resource means \`take(id)\` — delete-and-return, which
  throws \`UnknownRecordError\` instead of returning null.
- \`Argument of type 'string' is not assignable to parameter of type 'Criteria<...>'\` on a
  \`load\`/\`get\` call is the removed \`(value, 'field')\` overload. The field is a key of the
  criteria object: \`load({ projectId })\`. The second argument now carries only \`sort\`.
- \`delete\` takes an id and nothing else. A \`delete(criteria)\` call is \`purge(where)\`, which
  returns the number of records removed rather than a record.
- "Cannot find module" for a third-party router or HTTP-server package (\`express\`, \`cors\`),
  \`@reduxjs/toolkit\`, \`react-redux\`, \`@/state/store\` or \`@/lib/fetch\` means the file was
  written against the REMOVED stack. None of those packages are installed and none will be.
  Rewrite the file against entrypoints: \`useNavigate\` from \`@owlmeans/client\` for navigation,
  \`ctx.entrypoint(alias).call(...)\` for a backend call, a
  \`handleRequest\`/\`handleBody\`/\`handleParams\` function for an endpoint, and the state hooks
  (\`useStoreModel\`/\`useStoreList\` over a state resource) for client state. Do NOT install the
  package and do NOT create the missing module.
- A missing export from a \`*.ts\` module — a selector, an action creator, a thunk, a
  reducer — is the same removed stack in a different disguise. That module exports an ALIAS
  constant and read hooks only. Replace a selector with the matching hook, a dispatched action
  with \`resource.save(record)\` / \`model.update({ ... })\`, and a thunk with an
  \`entrypoint(alias).call(...)\` in the VIEW MODEL followed by a \`save\`. Do not add the missing
  export to the state module.
- A runtime \`Resource <alias> not found\` for a state alias means the state module is written but
  nothing registered it. Add the import and ONE
  \`appendStateResource<C, T>(context, ALIAS)\` line above the sentinel in
  \`sources/web/src/context.ts\` — never a second alias string, and never a new store file.
- \`DEFAULT_ID\` has no export from \`@owlmeans/state\`. A record is either held or it is not, and
  \`model.empty\` is the test — \`record.id === DEFAULT_ID\` was a placeholder that no longer gets
  invented. Never reintroduce the constant, and never compare against \`'_default'\` in its place.
- \`Property 'erase' does not exist\` on a state resource is \`clear()\`; \`all()\` and
  \`match(criteria)\` are both \`list(criteria)\`, which returns \`{ items, total }\` rather than a
  bare array. An \`erase()\` followed by a \`save\` per record is \`replace(records)\` — one write,
  and the store ends up holding exactly what the server sent.
- A list screen that recomputes ids to keep itself in step is fighting the store. One
  \`useStoreList({ query, resource })\` subscribes to the CRITERIA and re-renders on every write
  that changes which records match, so the \`useValue(() => resource.list())\` that fed it a list
  of ids goes away entirely rather than being repaired.
- A runtime \`TypeError: entrypoint.call is not a function\` (or \`<name>.call is not a function\`
  on the result of \`ctx.entrypoint(...)\`) is a MISSING CLIENT ELEVATION and nothing else. The
  alias resolves — the browser context carries every shared declaration — but only an elevated
  one has \`call\`. Add the bare \`elevate(list, <the alias in that call>)\` above the
  \`// owlmeans: add new backend elevations above this line\` sentinel in
  \`sources/web/src/entrypoints.ts\`. Do NOT rewrite the view model, do NOT replace the
  call with \`fetch\`, and do NOT add a component to a backend alias. The build was clean
  because the call site casts to \`ClientEntrypoint\`, so \`tsc\` will not confirm the fix —
  the elevation line is the fix.
- A screen that renders blank is the same class of fault on the other side: the screen alias has
  no \`elevate(list, alias, handler(Screen))\` line. Adding a declaration without its elevation
  is the usual cause of both.
- A header, menu or footer rendered TWICE is a screen importing its own layout. The AREA is the
  screen's parent entrypoint and the framework already wraps it — delete the import and the
  wrapper element from the screen, never the area from the entrypoint tree.
- An error naming an AREA — \`app.web.area.<area>\`, its \`route(...)\`, its \`guard()\`/\`gate()\`,
  or one of the four layouts in \`sources/web/src/layout/area.tsx\` — means generated code
  EDITED something that ships with the project. RESTORE the shipped form: four areas under
  \`app.web.base\` at \`/\`, \`/frontoffice\`, \`/admin\` and \`/backoffice\`, each with its own guard
  and one \`default: true\` child. Never re-declare an area to satisfy the error, never add a
  fifth, and never move a screen's access up onto the area — a screen that needs different
  access belongs in a different area.
- A user who WAS granted a permission and still gets 403 is almost always an \`@\` in the stored
  permission NAME. The gate splits its parameter at the first \`@\`: \`'enquiry--view@enquiryId'\`
  in \`gate(OIDC_GATE, [...])\` is CORRECT and means "look up \`enquiry--view\`, read the resource
  id from the \`:enquiryId\` route param". The same string registered or granted as a permission
  NAME is a key nothing ever looks up, so every grant against it is a silent no-op. Fix the
  registration and the grant, never the gate line — and never delete the \`@\` from the gate to
  "make the names match". A gate whose \`@name\` is not a \`:\` segment of that entrypoint's own
  declared path is the other half of the same fault: it refuses every request.
- A PERMISSION that no definition backs is a gate nobody can pass, and there are two ways generated
  code gets one. A bracketed word — \`gate(OIDC_GATE, ['<permission>'])\` — is an instruction's
  placeholder written out as if it were a name. A foreign name — \`article--modify\` in an
  application that has no articles — is an example copied from a comment or a skill. Both look
  perfectly valid to the compiler and to the boot check, so nothing reports them; the app simply
  refuses those requests forever. Replace the string with a permission built from THIS project's own
  resource and action, spelling it exactly as the project's other declarations spell that capability
  — never delete the gate to make the error go away, and never invent a definition to match a name
  that should not have been written.
- A whole area rendering BLANK is its missing \`default: true\` child: an entrypoint with
  children and no default child matches nothing. Restore the default child; do not give the area
  a component of its own.
- \`'X' does not exist in type 'Y'\` means the SHAPE you wrote is wrong, not that the
  feature is impossible. When a TYPE_DECLARATIONS block is present in the task, it is the
  ground truth — rewrite the object or call to match it exactly, instead of renaming the
  property to another guess or deleting the code.
- If the same error survives a fix, the fix was wrong. Re-read the message rather than
  applying a larger version of the same change.
- NEVER make a handler or a function stop doing its job to make the build pass. Returning
  \`{ items: [], total: 0 }\`, an empty object, a hard-coded literal or \`res.sendStatus(204)\`
  in place of the real call is not a fix — it turns a loud build error into a silent wrong
  answer nobody will notice. If a call does not type-check, correct the ARGUMENTS to match
  the function's real signature; the imports and the call must survive the fix.
- A runtime \`SyntaxError: Service not found <alias>\` from \`context.serviceRoute\` is a
  DIFFERENT error from the one below, and the difference decides the repair. It means an
  ENTRYPOINT alias (\`app.web.*\`, \`app.api.*\`) was passed where a SERVICE alias is required.
  The registered ones are \`APP_WEB\` and \`APP_API\` from \`sources/common/src/consts.ts\`, and
  the REGISTERED SERVICE ALIASES block in this task lists what this project actually declares.
  **Substituting another \`app.*\` value is what makes this loop circle** — it has already cost
  one project twenty attempts, each one reporting success and changing only which name the error
  prints. The two files that can produce it, \`config.ts\` and \`owlmeans.ts\`, are framework
  wiring: they are refused to the write tools, and \`restore_wiring_file\` is the repair.
- A runtime \`Service <alias> not found\` means generated code called
  \`owlCtx.service('<alias>')\` for something nothing registers. Two causes, both common:
  a hand-written service object in \`src/models/**\`, or a RESOURCE alias asked for on the
  service registry (\`ctx.service('reservation')\` — use the resource accessor instead,
  \`reservationResource()\` from \`@/resources/reservation/reservation.js\`, and drop the
  \`ctx\` parameter the function only needed for the lookup). **Do NOT create a service to fix it, and do NOT add a
  file under \`src/services/\`.** Delete the fake service object and the lookup, EXPORT the
  functions it wrapped from the same model file (dropping the \`ctx\` parameter they never
  needed), and import those functions directly in the handler. TypeScript cannot see the
  original error — the code compiles — but it does see the follow-ups, so expect
  \`declares 'X' locally, but it is not exported\` next and fix it by exporting, never by
  reintroducing a service.
- A runtime \`Resource <alias> not found\` means the resource module is missing from the
  generated \`src/resources/index.ts\`. Report it; never hand-register a resource and never
  edit a generated registry.
`),

  skill(ViableSkill.LayoutDefinition, 'What "layout" means here', `
A layout is one of the FOUR AREA shells this project already ships, all in one file —
\`sources/web/src/layout/area.tsx\`: \`GuestLayout\`, \`UserLayout\`, \`AdminLayout\`,
\`OperatorLayout\`. They carry the chrome of the application — header, section menu, side menu,
content region, footer — and each is a thin wrapper over \`NavLayout\` from
\`@owlmeans/web-panel\`, which builds both menu levels from \`sources/web/src/nav.ts\`.

A layout is mounted as the PARENT entrypoint of its area, never imported by a screen. The
framework renders the matched screen INTO it as \`children\`, so a layout is
\`FC<PropsWithChildren>\` and puts \`{children}\` where the screen belongs. It knows nothing about
which screen that is.

A generated project never creates a layout. There are four and there will only ever be four:
customise one by RESTYLING it — its title, its classes, its header actions — never by writing a
fifth shell and never by rebuilding the navigation inside it by hand.
`),

  skill(ViableSkill.ScreenDefinition, 'What "screen" means here', `
A screen is the React component that arranges other components and their layout inside
the page. It may also switch between the components it contains. It never contains
general chrome — no header, no footer, no navigation, no menu, no sidebar.

A screen NEVER imports and NEVER renders a layout component. Its layout is the AREA it is
declared under — \`frontend({ parent: app.web.area.<area> })\` — and the framework wraps the
screen in it. A screen that wraps itself renders the whole chrome twice, nested.

A screen's declared path is the TAIL ONLY: \`'/tasks'\`, never \`'/frontoffice/tasks'\`. The area
contributes the prefix, so repeating it publishes the screen at a doubled URL nothing links to.
`),

  skill(ViableSkill.QueueDiscipline, 'When work belongs off the request path', `
Almost never. Start from "this is a request handler and a table" and stay there unless one of
the reasons below is TRUE of this feature. A queue turns one request into two processes and a
message that can be delivered twice; a worker is a second thing that can be down; an LLM agent
turns a click into a bill. None of that is free, and none of it is undone easily.

## Reasons that are real
- The work calls an LLM, or any third-party API that is slow or rate-limited.
- The work walks an unbounded set — every row a user owns, every file in an upload.
- The work must survive the user closing the tab: a long import, a generated report.
- The work is scheduled or repeated rather than requested.
- The work must be retried on failure without the user doing anything.

## Reasons that are NOT real
- "It might be slow one day." Measure first; moving it later is a small change.
- "It writes to several tables." That is a transaction, not a job.
- "It sends one email." One outbound call in a request is fine.
- "It feels like background work." Feelings are not a reason; name the property.
- "It is complicated." Complexity belongs in a function, not in another process.

## If the answer is yes
Say WHY in one sentence naming the property above, and say how the processor is safe to run
twice — a worker can die mid-job, the lock expires and the step re-runs. There is no way to
make that automatic. "Skip rows already marked done" and "delete what a previous attempt
created before recreating it" are answers; "it should be fine" is not.

## And say who watches it
A queued job has no screen and no session. Name the story whose screen shows its progress, or
the work is invisible and the user is left pressing a button that appears to do nothing.
  `),

  skill(ViableSkill.WorkerJobs, 'Queues, jobs and processors', `
Three files have to agree, and a job that exists in two of the three is worse than one that
exists in none — a declared name nothing processes is a message that piles up, and a processor
with no declaration is dead code the barrel still imports.

## 1. The queue — \`sources/backend/src/jobs/index.ts\`
A queue is an ADDRESS: it says what exists and which job names it accepts. Both the api (which
enqueues) and the worker (which consumes) read this one list, and a job name the queue does not
declare is refused at enqueue time.

\`\`\`ts
export const queues: QueueDeclaration[] = [
  { name: APP_QUEUE, jobs: [app.job.test, app.job.<name>],
    worker: { concurrency: 4, lockDuration: 60_000 } },
]
\`\`\`

## 2. The alias and the entrypoint — \`sources/common/src\`
The job's name IS its entrypoint alias. Declare \`app.job.<name>\` in \`consts.ts\` above the
sentinel, and the entrypoint in \`entrypoints.ts\` with \`job()\` from \`@owlmeans/route\`.

## 3. The processor — \`sources/worker/src/jobs/<name>.ts\`
A plain async function wrapped in \`handleRequest\` / \`handleBody<T>\` / \`handleParams<T>\`,
exactly like an endpoint handler. It RETURNS its result; throwing a \`ResilientError\` subclass
is how a refusal is reported, and the class survives the broker.

Two rules with no equivalent on the HTTP side:
- **Call \`job.touch()\` inside every long loop.** The broker judges liveness by the lock, and
  silence for longer than \`lockDuration\` is indistinguishable from a dead worker — the job is
  handed to somebody else and the work runs twice.
- **A processor must be safe to run twice.** Skip what a previous attempt recorded, or delete
  what it created, and say in a comment which of the two this one does.

Elevate it in \`sources/worker/src/entrypoints.ts\` above the sentinel. Enqueue from an endpoint
with \`context.jobs().create({ name: app.job.<name>, data })\`.
  `),

  skill(ViableSkill.TargetAgents, 'LLM agents inside the application', `
An agent generated into the application is an \`@owlmeans/agent\` model, built in the shared
backend package and RUN FROM A JOB — never on the request path. A model call takes seconds to
minutes and costs money per attempt; holding a request open for it gives the user a timeout and
the operator a bill with no result attached.

- \`makeAgentModel({ exec, tools, ... })\` for a tool loop that converses.
- \`makePipeline(spec, steps)\` for ordered, resumable steps whose position must survive a crash.
  Pipeline state holds KEYS, never artifacts — a step writes its output somewhere and puts the
  id in the state.

The agent module goes in \`sources/backend/src/agents/<alias>.ts\` and is registered in that
directory's generated barrel. The endpoint the user presses enqueues the job; the job invokes
the agent; the screen watches the job. Never import an agent from \`sources/api\`.
  `),

  skill(ViableSkill.AgenticChoice, 'A call, a pipeline, or an agent', `
Three shapes can perform work with a model, and they are not interchangeable. Pick the
SIMPLEST one that does the job, and increase complexity only when the simpler shape provably
cannot. Every step up costs latency, money and a failure mode.

**A call** — one prompt, one answer. The default, and the right answer far more often than it
is chosen. Summarise, classify, extract, rewrite, draft, translate, answer a question about
text you already have. If you can write down the prompt, it is a call.

**A pipeline** — fixed, ordered steps, decided by you and not by the model. Choose it when the
work decomposes cleanly into subtasks you can NAME IN ADVANCE, and each step's output is the
next step's input: transcribe then summarise then file; extract then validate then store. You
are trading latency for accuracy, and you know the number of steps before you start.

**An agent** — the model chooses its own path through tools, and you cannot say in advance how
many steps it will take. Choose it ONLY when all of these are true:
- the number of steps genuinely cannot be predicted;
- which tool to use next is a judgement, not a rule you could write down;
- the input is unstructured and the decision is contextual;
- and the work runs in a place where an unpredictable number of tool calls is acceptable.

Not reasons to choose an agent: the task is "complex"; it uses more than one piece of data; it
sounds impressive; a tool exists. A rules engine with a model in it is a pipeline. An app that
calls a model but does not let the model direct the work is not an agent at all.

If you are unsure between two of them, take the simpler one. A call that turns out to need a
second step becomes a pipeline with one edit; an agent that never needed to be one is a bill
nobody can explain.

Whichever shape it is, it runs off the request path — a model call is seconds to minutes and
costs money per attempt, and holding a request open for it gives the user a timeout and the
operator a bill with no result attached. So it is ALWAYS reached through something a person does:
somebody starts it, and somebody watches it finish. Work with no human half is work nobody can
see, cancel or be told about, and it reaches the user as a button that appears to do nothing.

Describe that work INSIDE the story of the person who starts it — "I request a write-up and come
back to read it" — rather than as a story of its own told in the machine's voice. A machine has
no account to sign in with, no screen of its own and no permission that can be granted to it, so
"As an AI assistant, I want to open the queue…" is a story whose actor can never use what gets
built for it.
  `),

  skill(ViableSkill.TargetLlm, 'Calling a model from the application', `
Model calls happen in \`sources/backend\` and are invoked from a job in \`sources/worker\`.
NEVER from \`sources/web\` — a browser bundle cannot hold a provider key — and never inline in
a request handler in \`sources/api\`.

The key is the user's, not the platform's, and it may be absent. Follow the shape
\`sources/backend/src/config.ts\` already uses for the database and the queue:

\`\`\`ts
export const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''
export const llmConfigured = anthropicKey !== ''
\`\`\`

- Never throw at module scope when it is missing. The application must still boot, exactly as
  it does without \`VALKEY_URL\`.
- The endpoint that would use it answers a refusal explaining that a model API key has not been
  configured yet — not a 500, and not silence.
- Declare the variable so the platform can ask the owner for it; do not invent a default.

Give every call a bounded output and treat a refusal or an empty answer as an outcome the code
handles, never as an exception that reaches the user.

Where the answer has a SHAPE, describe it with the same AJV schema style the rest of this
application uses — the one already exported beside each type. Do not reach for \`zod\`: it is not
a dependency of this project, and importing it fails the build with \`TS2307\`.
  `),

  skill(ViableSkill.TargetAgentTools, 'Tools and skills for the application’s agent', `
An agent is only as good as the tools it is given, and a bloated tool set is the most common
way to make one worse.

- Give it the FEWEST tools that can complete the work. If you cannot say which of two tools the
  agent should reach for in a given situation, neither can it.
- Name each tool for what it accomplishes, not for the endpoint behind it, and describe it in
  one sentence that says WHEN to use it.
- Return human-readable results. An agent reasons better over a name than over a row id, and a
  large result should be filtered or truncated by the tool rather than by the model.
- A tool must never reject. Catch inside it and return the failure as text the agent can act
  on; a thrown tool call aborts the whole turn.

The application's own \`.agents/skills/\` directory is loadable into its agent's prompt. Where
guidance is long or situational, write it as a skill and let the agent read it when it needs
it, rather than pasting it into the system prompt where it is paid for on every call.
  `),

  skill(ViableSkill.GameDesign, 'What a game brief is made of', `
A game is not a business flow, and analysing it as one produces a menu with nothing behind it.

Describe, in this order:
1. **The core loop** — the one thing the player does over and over, in a sentence. "Steer, dodge,
   collect." "Place a tile, score the line."
2. **The win and lose conditions** — how a session ends, both ways. A game with no end is a toy.
3. **The controls** — what input does what. Keyboard, pointer, touch.
4. **Progression** — what changes between the first minute and the tenth: speed, levels, score,
   unlocks. One axis is enough.
5. **What is persisted** — usually a score, a run history, a player profile. Almost never the
   frame-by-frame state of a session.

Steps that are NOT part of a game brief: sign-up, settings, billing, admin. They exist, they are
ordinary screens, and they are not the product.

Keep it to one game. A brief that describes a platform of several games describes none of them.
  `),

  skill(ViableSkill.GameScene, 'The three.js scene component', `
Exactly ONE component owns the 3D scene. It creates the renderer, the camera and the scene,
runs the animation loop, and tears all of it down again.

\`\`\`tsx
// right — the loop and the renderer live in one effect, and it cleans up after itself
useEffect(() => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  mount.current!.appendChild(renderer.domElement)
  let frame = 0
  const tick = () => { frame = requestAnimationFrame(tick); renderer.render(scene, camera) }
  tick()
  return () => {
    cancelAnimationFrame(frame)
    renderer.dispose()
    renderer.domElement.remove()
  }
}, [])
\`\`\`

Rules that are not optional:
- **Never drive the animation loop from React state.** A \`setState\` per frame re-renders the
  tree sixty times a second and the game stutters. Mutate the object3D directly in the loop and
  publish to React only what the interface shows — a score, a life count — and only when it
  changes.
- **Dispose what you create.** Geometries, materials and the renderer all hold GPU memory that
  unmounting does not release. A scene mounted and unmounted a few times without disposal
  exhausts the context and the canvas goes black.
- **Resize is an event, not a render.** Update \`camera.aspect\`, call
  \`camera.updateProjectionMatrix()\` and \`renderer.setSize(...)\` from a resize listener.
- **Geometry is generated, never loaded.** Compose it from the built-in geometries and simple
  materials — box, sphere, cylinder, plane, lathe, extrude. No textures, no image files, no
  external model formats. Colour, light and shape carry the whole look.
  `),

  skill(ViableSkill.GameUi, 'The interface is React, above the canvas', `
Everything a player reads or presses — score, menus, dialogs, buttons, settings — is an
ordinary React component rendered ABOVE the canvas, using the same shadcn primitives as the rest
of the application. Nothing is drawn as text inside the 3D scene.

\`\`\`tsx
// right — the canvas fills the frame, the interface floats over it
<div className="relative h-full w-full">
  <div ref={mount} className="absolute inset-0" />
  <div className="pointer-events-none absolute inset-0 p-4">
    <ScoreBadge value={score} />
    <div className="pointer-events-auto"><Button onClick={pause}>Pause</Button></div>
  </div>
</div>
\`\`\`

- The overlay container carries \`pointer-events-none\` so clicks reach the canvas; each
  interactive control turns them back on with \`pointer-events-auto\`. Forgetting this makes the
  game unplayable — every drag lands on an invisible div.
- Text rendered into the scene cannot be selected, translated, scaled by the browser or read by
  a screen reader. Use it for nothing that matters.
- SVG is the second half of the art: icons, badges, backgrounds and 2D games are inline SVG
  written by hand. No raster images anywhere.
  `),

  skill(ViableSkill.GameNetworking, 'Who owns the state', `
Three kinds of game, and the difference is entirely about where the state lives.

**Casual** — one player, one browser. The session runs entirely on the client; the server sees
only what is worth keeping: a final score, a run record, a profile. No queue, no worker, no
socket. This is most games, and it is the right answer unless the brief asks otherwise.

**Online, turn-based** — several players acting one after another, minutes or days apart. The
match is an ordinary record and every move is an ordinary endpoint that validates it and writes
the next state. Anything slow that follows a move — scoring a finished match, notifying the next
player, rebuilding a leaderboard — is a job. No realtime anything.

**Online, live** — several players acting at once, and the server simulates.
- The client sends INTENT ("move forward", "fire"), never an outcome ("I am at x=12", "I hit
  them"). A client that reports outcomes is a client that decides them, and one player's browser
  then decides everybody's game.
- The server holds the authoritative state, advances it on a fixed tick, and broadcasts it.
- The client may predict its own movement locally so it feels immediate, and corrects when the
  server's answer disagrees. Other players' entities are interpolated between the last two
  updates rather than snapped.
- Anything the outcome depends on — damage, scoring, currency, who won — is decided on the
  server and nowhere else.
  `),

  libraries(ViableSkill.LibrariesCommon, 'Libraries — shared code', commonLibraryList),
  libraries(ViableSkill.LibrariesUiState, 'Libraries — UI state', uiStateLibraryList),
  libraries(ViableSkill.LibrariesUi, 'Libraries — UI', fullUiLibraryList),
  libraries(ViableSkill.LibrariesBackend, 'Libraries — backend', backendLibraryList),
  libraries(ViableSkill.LibrariesAi, 'Libraries — model calls and agents', aiLibraryList),
  libraries(ViableSkill.LibrariesGame, 'Libraries — game', gameLibraryList),
]

/** Look one up by alias — for the places that still splice a rule into a task prompt. */
export const viableSkill = (alias: ViableSkill): SkillDefinition =>
  VIABLE_SKILLS.find(entry => entry.alias === alias)!
