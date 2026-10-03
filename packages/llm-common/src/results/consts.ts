/**
 * The fixed wording that introduces a {@link CumulativeResults} view in a prompt.
 *
 * Written for the WEAKEST model a pipeline may run on, so every rule is literal and says what to do
 * rather than what to consider. It is a pure constant — no interpolation, no clock — because it
 * opens a block that recurs verbatim on every call of a step, and the rules are the reason the
 * block exists at all: a list of names with no instruction attached is read as a suggestion, and a
 * suggestion is exactly what a model re-derives, renames or re-cases.
 *
 * The last rules carry the list's own limits. It is written between steps and can go stale in ways
 * a live file read cannot, so a file actually shown in the conversation must win; and it may leave
 * things out for space, so "not listed" means "does not exist yet" only when nothing was left out.
 */
export const CUMULATIVE_RESULTS_PREAMBLE = `## Results of earlier steps

Everything below was read from the project's files by code, after each earlier step of this work finished. No model wrote it.

Rules for using it:
- These are the AUTHORITATIVE names produced by earlier steps. Use every name, path and import specifier exactly as written here. Never re-derive, rename, re-case or guess a different path.
- Import a listed symbol only from the specifier listed for it.
- Never declare anything listed here a second time. Import it, call it or extend it instead.
- Anything the current task needs that this list does not contain does not exist yet, unless the list says it left something out for space; then look in the project's files first. Create a missing thing only if the task says to, and never under a name that merely resembles a listed one.
- A source file actually shown elsewhere in this conversation is NEWER than this list and wins wherever the two disagree: this list can go stale between steps, a file you are shown cannot.
- An entry marked "(names only)" lists names without their detail. Read that file before relying on its shape.
- A summary marked "(not verified)" was written by a model and never checked against the files. Treat it as a hint, never as a fact.`

/** Opens the line naming the steps a view left out for space. The names follow it. */
export const CUMULATIVE_RESULTS_OMITTED_LEAD = 'Not listed here for space:'

/** Closes that line — what the model is to do about a step it cannot see. */
export const CUMULATIVE_RESULTS_OMITTED_TAIL =
  'Those steps finished and what they made exists in the project\'s files. Look there before creating anything they may already have made.'
