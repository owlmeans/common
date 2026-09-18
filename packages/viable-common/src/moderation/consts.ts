
/**
 * What the moderation gate refuses, and nothing more.
 *
 * The set is deliberately about the SHAPE of what is being built, never its sector: a product
 * that handles money, credentials or medical data is ordinary, and a platform that refuses
 * those refuses most of its own market. What is not ordinary is a product whose purpose is to
 * collect someone else's credentials, to be mistaken for someone who did not ask to be
 * represented, or to push messages at people who never asked for them.
 *
 * Every generated app has a sign-in screen of its own — that is what an application is — so a
 * login is never evidence of anything here.
 *
 * The set is CLOSED. A new refusal shape belongs inside one of these four, phrased into the
 * policy prompt: each value is a wire contract with user-facing wording in seven languages
 * behind it, and a fifth one silently renders as the generic refusal until every one of those
 * catches up.
 */
export enum ModerationCategory {
  /** Captures credentials, OTPs, card numbers or recovery phrases for a service the requester does not run. */
  CredentialHarvesting = 'credential-harvesting',
  /** Presents itself as a named third party — an organization OR a real person — rather than as its own product. */
  BrandImpersonation = 'brand-impersonation',
  /** Collects payment details on behalf of a merchant that is not the requester. */
  PaymentCapture = 'payment-capture',
  /** Tooling whose purpose is abuse: credential stuffers, phishing-kit builders, bulk-spam senders. */
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
