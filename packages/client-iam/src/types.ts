

export interface ConsentLoginOptions {
  /** The category that must be granted. Defaults to `essential`. */
  category?: string
  /** Off switch, for an application that genuinely sets no cookie at all. */
  disabled?: boolean
}

export interface AppendIamOptions {
  /** Consent required before a sign-in flow may start. `{ disabled: true }` turns it off. */
  consent?: ConsentLoginOptions
}
