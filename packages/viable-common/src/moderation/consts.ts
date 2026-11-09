
/**
 * The categories a moderation refusal is phrased with — a wire contract, CLOSED.
 *
 * The policy refuses exactly one shape today: {@link ModerationCategory.BrandImpersonation}, a
 * product built to be MISTAKEN FOR a specific real brand by its name or its look, or presenting
 * itself as a real bank. Everything else — money, credentials, health data, sign-in screens,
 * clones and analogies — is an ordinary product.
 *
 * The other three values stay because each is a wire string with user-facing wording in eight
 * languages behind it, and records and refusals that carry them still exist: no value is ever
 * removed or renamed, and a new shape is phrased into an existing value rather than added.
 */
export enum ModerationCategory {
  /** Not refused by the current policy; kept as a wire value of earlier refusals. */
  CredentialHarvesting = 'credential-harvesting',
  /**
   * Passes itself off as an existing brand — its name IS one, contains one or is a lookalike of
   * one; it asks to look like that brand so a person takes it for the brand itself; or it presents
   * itself as a specific real bank. The one shape the policy refuses.
   */
  BrandImpersonation = 'brand-impersonation',
  /** Not refused by the current policy; kept as a wire value of earlier refusals. */
  PaymentCapture = 'payment-capture',
  /** Not refused by the current policy; kept as a wire value of earlier refusals. */
  AbuseTooling = 'abuse-tooling',
}

/**
 * What is being classified. Carried into the trace so a refusal can be attributed.
 *
 * Each value has a framing sentence behind it that tells the classifier whose words it is
 * reading — the same text means different things as a customer's request, as our own generated
 * specification, and as a file already sitting inside an approved project.
 */
export enum ModerationSubject {
  Prompt = 'prompt',
  Specification = 'specification',
  Story = 'story',
  /**
   * A file a human wrote through the project's own editor.
   *
   * Deliberately separate from the three above: this is code inside an already-approved
   * product, so the framing has to stop the classifier from refusing ordinary application
   * source that happens to contain the word "password" or a payment form.
   */
  Source = 'source',
  /**
   * What a project is CALLED — and, through its slug, what it is reachable at.
   *
   * The only subject that judges an identifier rather than a product, and the only one whose
   * answer may disagree with {@link ModerationSubject.Specification} about the same brand. A
   * consumer turns a project's name into a hostname on a domain all of its customers share, so
   * "a dashboard for our Shopify store" is an ordinary thing to build while `shopify-dashboard`
   * is not a name it may be reachable at. Descriptions may name a brand; identifiers may not.
   */
  Name = 'name',
}

/**
 * Who judges a text — which model role the gate resolves.
 *
 * `Senior` (the default) judges what a person wrote and rewrites a refused text; `Junior` is the
 * cheaper screen for text the platform drafted from a person's own material, where one refused
 * draft is rewritten by a senior rather than refusing the whole run.
 */
export enum ModerationReviewer {
  Senior = 'senior',
  Junior = 'junior',
}
