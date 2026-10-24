/** License documents shipped by npm packages, including embedded upstream notices. */
export const NOTICE_DOCUMENT = /^(?:licen[cs]e|copying|copyright|notice|third[-_ ]?party[-_ ]?(?:notices?|licenses?)(?:text)?)(?:[._ -]|$)/i

/** These grants impose no notice-retention requirement of their own. */
export const NO_NOTICE_LICENSE = /^(?:0BSD|MIT-0|CC0-1\.0|Unlicense)$/

export const DEFAULT_NOTICE_FILE = 'THIRD-PARTY-NOTICES.txt'
