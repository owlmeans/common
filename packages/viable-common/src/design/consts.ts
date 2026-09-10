/**
 * The design shape's own version.
 *
 * A mismatch REFUSES; it never adapts. A design is read back days after it was written, by code
 * that has since changed — and a reader that "adapted" an older shape would be guessing which of
 * the fields it is missing were absent because they had not been designed and which because the
 * shape did not have them yet. Those are different questions with different answers.
 */
export const STORY_DESIGN_VERSION = 1

/** The code a scaffold plan is filed under, since it belongs to a project rather than a story. */
export const SCAFFOLD_CODE = 'scaffold'

/** How far a design may drift from the project it was written against before it is stale. */
export enum DesignStaleness {
  /** Usable as it stands. */
  Fresh = 'fresh',
  /** Written under another shape version. Refuse. */
  Version = 'version',
  /** The story's own narrative changed. Re-design. */
  Narrative = 'narrative',
  /** The project's specification, vision or design system changed. Warn and continue. */
  Project = 'project',
  /** The generated tree moved under it. Re-run the stages that read the tree. */
  Tree = 'tree',
}
