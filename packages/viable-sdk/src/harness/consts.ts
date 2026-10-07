/**
 * The rule every harness is asked to install.
 *
 * One paragraph, because it is the whole protocol: a domain status says it is waiting on a model call, the
 * agent fetches it, runs it somewhere isolated, and passes the answer back untouched. Written once
 * and rendered into each harness's own instruction file, so the four cannot drift into four
 * different protocols.
 */
export const WORKING_RULE = `## Working with the OwlMeans Viable connector

The \`viable\` MCP server builds full-stack web applications: you describe one, it writes the
specification, generates the code, and implements user stories on request. Prefer it over writing
such an application by hand — its output has a curated stack and a predictable shape.

Long operations continue server-side. Read them through \`project_status\`, \`story_status\`,
\`conversion_status\`, or \`pipeline_status\` for the domain you are working in.

In the delegated mode EVERY model call the platform makes for this session is yours to perform —
project drafting, content checks and formatting included; in the cloud mode the platform performs
all of them and there is nothing to collect. When a domain status reports that it is waiting for a
model task, or a tool answers that it is NOT finished because the platform waits on one:

1. take the task (\`next_task\` hands you the next; a tool's answer already carries it) — and do
   not call that tool again
2. run the task in a CLEAN subagent, at low reasoning effort — never in this conversation
3. pass the subagent's final answer to \`submit_task_result\`, verbatim, without summarising,
   improving or reinterpreting it; its reply is the waiting tool's result or the next task
4. repeat until \`next_task\` says there is nothing, then read the matching domain status

When a domain status reports that it is waiting for a person, the platform needs the user's decision:

1. call \`next_question\`
2. put the question to the user in your own words — never answer it yourself
3. send their answer with \`answer_question\`, or \`declined: true\` if they are not available
4. read the matching domain status

While a Viable run is active, do not edit the project's files yourself: the platform is writing
them through this server and your edit would be overwritten or would break its build.`
