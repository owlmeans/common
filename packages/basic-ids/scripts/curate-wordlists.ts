/**
 * Regenerate `src/wordlists/list-a.ts` and `src/wordlists/list-b.ts`.
 *
 * Run: `bun run scripts/curate-wordlists.ts` (needs network access; writes the two source files).
 *
 * The lists are an editorial asset, not a random sample: every word ends up in hostnames, OIDC
 * client ids and support conversations, so the pipeline below screens three ways — a profanity
 * list, a substring screen for words that read badly inside a hostname even when the word itself
 * is innocent, and a frequency floor so nothing unrecognisable survives. Proper nouns are dropped
 * (Moby capitalises them) because a place or brand name makes a poor generic slug, and stopwords
 * are dropped because `not-for` is not a name.
 *
 * Sources (all public, fetched at run time so no corpus is vendored into the repo):
 * - Moby part-of-speech list — github.com/en-wl/wordlist, `pos/part-of-speech.txt`.
 *   Tab-separated `word<TAB>|CODES`; N noun, V/t/i verb, A adjective, v adverb.
 * - google-10000-english (USA) — github.com/first20hours/google-10000-english. Primary frequency
 *   ranking; the 50k list below only orders what google's 10k does not cover.
 * - FrequencyWords en_50k — github.com/hermitdave/FrequencyWords.
 * - stopwords-en — github.com/stopwords-iso/stopwords-en.
 * - LDNOOBW `en` — github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WORDLIST_SIZE } from '../src/consts.js'

const SOURCES = {
  moby: 'https://raw.githubusercontent.com/en-wl/wordlist/master/pos/part-of-speech.txt',
  google10k: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt',
  freq50k: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt',
  stopwords: 'https://raw.githubusercontent.com/stopwords-iso/stopwords-en/master/stopwords-en.txt',
  profanity: 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en',
  negative: 'https://raw.githubusercontent.com/shekhargulati/sentiment-analysis-python/master/opinion-lexicon-English/negative-words.txt',
}

const WORD = /^[a-z]{3,8}$/

/** Innocent words that carry an unfortunate substring once they sit in a public hostname. */
const BAD_SUBSTRINGS = [
  'sex', 'nazi', 'rape', 'kill', 'die', 'dead', 'shit', 'fuck', 'cunt', 'porn', 'slut',
  'whore', 'hell', 'damn', 'crap', 'piss', 'suck', 'gun', 'war', 'drug', 'bomb',
]

/**
 * Clean, neutrally-ranked words that still make a poor name for somebody's organization. Matched
 * whole, not as substrings — a substring rule here would take `asset`, `class` and `passage` with
 * it, which is how a screen quietly empties the list it is meant to police.
 */
const BAD_WORDS = [
  'pee', 'poo', 'butt', 'ass', 'anal', 'bum', 'fart', 'burp', 'snot', 'puke', 'vomit',
  'funeral', 'coffin', 'corpse', 'tumor', 'tumour', 'cancer', 'plague', 'sewer', 'morgue',
  'grave', 'tomb', 'autopsy', 'carcass', 'manure', 'urine', 'feces', 'faeces', 'bowel',
  'rectum', 'groin', 'naked', 'nude', 'booze', 'drunk', 'vodka', 'whisky', 'cigar', 'casino',
  'gamble', 'curse', 'satan', 'demon', 'ghost', 'zombie', 'virgin', 'sperm', 'uterus',
  'breast', 'nipple', 'thigh', 'divorce', 'lawsuit', 'prison', 'inmate', 'felony', 'arrest',
  'arrested', 'combat', 'weapon', 'bullet', 'blade', 'poison', 'venom', 'stab',
]

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: ${response.status}`)
  }

  return await response.text()
}

const lines = (text: string): string[] =>
  text.split('\n').map(line => line.trim()).filter(line => line !== '')

const curate = async () => {
  const [moby, google10k, freq50k, stopwords, profanity, negative] = await Promise.all(
    [SOURCES.moby, SOURCES.google10k, SOURCES.freq50k, SOURCES.stopwords, SOURCES.profanity,
      SOURCES.negative].map(fetchText)
  )

  // Negative-sentiment words are screened out because the slug becomes an organization's public
  // name: `idiotic-spring` is clean by every profanity list and still not a name anyone wants.
  const blocked = new Set(
    [...lines(profanity), ...lines(stopwords), ...BAD_WORDS,
      ...lines(negative).filter(word => !word.startsWith(';'))].map(word => word.toLowerCase())
  )
  const admissible = (word: string): boolean =>
    WORD.test(word) && !blocked.has(word) && !BAD_SUBSTRINGS.some(bad => word.includes(bad))

  // Frequency rank decides which of several thousand admissible words make the cut. Google's list
  // is the better signal, so it keeps the low ranks and the 50k list only breaks ties below it.
  const rank = new Map<string, number>()
  lines(google10k).forEach((word, index) => {
    const key = word.toLowerCase()
    if (!rank.has(key)) rank.set(key, index)
  })
  lines(freq50k).forEach((line, index) => {
    const key = line.split(' ')[0]?.toLowerCase()
    if (key != null && !rank.has(key)) rank.set(key, 10_000 + index)
  })

  const A_CODES = ['A', 'v']
  const B_CODES = ['N', 'V', 't', 'i']
  // Value records whether the part of speech is the word's PRIMARY sense — those are picked first,
  // so `list-a` reads as adjectives rather than as nouns that happen to be adjectival.
  const adjectives = new Map<string, boolean>()
  const subjects = new Map<string, boolean>()

  for (const line of moby.split('\n')) {
    const [rawWord, rawCodes] = line.split('\t')
    if (rawWord == null || rawCodes == null) continue
    const word = rawWord.trim()
    if (word !== word.toLowerCase()) continue // proper noun
    if (!admissible(word)) continue
    const codes = rawCodes.replace(/\|/g, '').trim()
    if (codes === '') continue
    if (A_CODES.some(code => codes.includes(code))) adjectives.set(word, A_CODES.includes(codes[0]))
    if (B_CODES.some(code => codes.includes(code))) subjects.set(word, B_CODES.includes(codes[0]))
  }

  const pick = (candidates: Map<string, boolean>, exclude: Set<string>): string[] =>
    [...candidates.entries()]
      .filter(([word]) => !exclude.has(word) && rank.has(word))
      .sort(([wordX, primaryX], [wordY, primaryY]) =>
        (Number(primaryY) - Number(primaryX)) || (rank.get(wordX)! - rank.get(wordY)!))
      .slice(0, WORDLIST_SIZE)
      .map(([word]) => word)

  // A picks first and B excludes its choices, so the two halves of a slug are always distinct.
  const listA = pick(adjectives, new Set())
  const listB = pick(subjects, new Set(listA))

  for (const [name, list] of [['list-a', listA], ['list-b', listB]] as const) {
    if (list.length !== WORDLIST_SIZE) {
      throw new Error(`${name} came out at ${list.length} words; ${WORDLIST_SIZE} are required`)
    }
  }

  emit('list-a', 'WORDLIST_A', 'Descriptive half of a word slug — adjectives and adverbs.', listA)
  emit('list-b', 'WORDLIST_B', 'Subject half of a word slug — verbs and nouns.', listB)
  console.log(`Wrote ${listA.length} + ${listB.length} words.`)
}

const emit = (file: string, name: string, summary: string, words: string[]) => {
  const rows: string[] = []
  for (let index = 0; index < words.length; index += 8) {
    rows.push('  ' + words.slice(index, index + 8).map(word => `'${word}'`).join(', ') + ',')
  }
  const body = `/**
 * ${summary}
 *
 * Exactly ${WORDLIST_SIZE} words (11 bits of entropy per pick), each lowercase ASCII, 3-8 characters, and
 * unique within this list. The two lists share no word, so the halves of a slug can never repeat.
 *
 * Curated by \`scripts/curate-wordlists.ts\` from the Moby part-of-speech list, screened against
 * profanity, stopword, negative-sentiment and proper-noun sources. Regenerate with that script
 * rather than editing by hand: \`tests/word-slug.spec.ts\` enforces the invariants above, and a
 * hand-edit that breaks the ${WORDLIST_SIZE} count silently biases slug generation.
 */
export const ${name}: string[] = [
${rows.join('\n')}
]
`
  writeFileSync(resolve(import.meta.dir, '..', 'src', 'wordlists', `${file}.ts`), body)
}

await curate()
