/** Area-weighted votes per property: property → value → weight. */
export type Tally = Record<string, Record<string, number>> // a nested open record of votes
