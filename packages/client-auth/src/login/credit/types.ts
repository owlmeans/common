export interface ResolvedCredit {
  /** Whether "Powered by OwlMeans" is rendered. */
  poweredBy: boolean
  /** The product and organization line, already composed. Null when there is nothing to say. */
  line: string | null
}
