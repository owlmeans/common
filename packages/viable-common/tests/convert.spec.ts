import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import * as convert from '../src/convert/index.js'
import * as barrel from '../src/index.js'
import {
  CONVERSION_ARTIFACTS, CONVERSION_DIR, CONVERSION_DOCS, CONVERSION_MEMORY, ConversionStage,
  EntropyClass, FileClass, SizeClass, STACK_FAMILY, StackId, TAXONOMY_ORDER, TaxonomyKind
} from '../src/convert/index.js'
import {
  binaryByExtension, canEnter, decisionFor, entropyClassOf, fileClassOf, isOriginPath, originPath,
  sizeClassOf, stageAfter, storyComplexity
} from '../src/convert/helpers.js'
import { HISTORY_FILE } from '../src/metadata/consts.js'
import {
  conversionStoryDoc, CONVERTED_ORIGIN_DIR, ConversionDecision
} from '../src/convert/consts.js'

/**
 * Every `*Schema` a module exports.
 *
 * The two structural walks below are asked of the PACKAGE barrel rather than of the conversion
 * one, although this file is the conversion's. Neither failure they catch is particular to a
 * conversion — a draft-04 tuple and a bare `nullable` refuse wherever the schema reaches a
 * provider or a collection validator — and a walk over `src/convert/` alone would let the same
 * shape through in a design, a slot or a connector schema. Compiling is still asserted over the
 * conversion barrel, where its `> 10` floor means something.
 */
const schemasOf = (module: Record<string, unknown>): [string, object][] =>
  Object.entries(module)
    .filter(([name, value]) =>
      name.endsWith('Schema') && typeof value === 'object' && value !== null)
    .map(([name, value]) => [name, value as object])

/**
 * Walk a schema and report every subschema that says `nullable` without saying what type it is.
 *
 * Ajv refuses that combination, and these schemas are compiled at route registration and re-applied
 * as collection validators — so the refusal takes down whatever compiled it, at boot, rather than
 * failing the one call that would have carried the value.
 */
const nullableWithoutType = (node: unknown, at: string, found: string[] = []): string[] => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => nullableWithoutType(item, `${at}[${index}]`, found))

    return found
  }
  if (typeof node !== 'object' || node === null) return found

  const schema = node as Record<string, unknown>
  if (schema.nullable === true && schema.type == null) found.push(at)
  for (const [key, value] of Object.entries(schema)) {
    nullableWithoutType(value, `${at}.${key}`, found)
  }

  return found
}

/**
 * Walk a schema and report every `nullable: true` whose `enum` does not list `null`.
 *
 * `nullable` and `enum` are separate Ajv keywords and are checked independently, so that pair
 * widens the TYPE check to admit `null` and then refuses the very same value by enum — the field
 * can only ever be OMITTED, never sent empty. Nothing fails at compile time and nothing fails for
 * a caller that leaves the key out, which is why it survives review: it surfaces only as the one
 * caller that spells absence as `null`.
 */
const nullableEnumWithoutNull = (node: unknown, at: string, found: string[] = []): string[] => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => nullableEnumWithoutNull(item, `${at}[${index}]`, found))

    return found
  }
  if (typeof node !== 'object' || node === null) return found

  const schema = node as Record<string, unknown>
  if (schema.nullable === true && Array.isArray(schema.enum) && !schema.enum.includes(null)) {
    found.push(at)
  }
  for (const [key, value] of Object.entries(schema)) {
    nullableEnumWithoutNull(value, `${at}.${key}`, found)
  }

  return found
}

/** Walk a schema and report every `items` written as an array of subschemas. */
const tupleItems = (node: unknown, at: string, found: string[] = []): string[] => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => tupleItems(item, `${at}[${index}]`, found))

    return found
  }
  if (typeof node !== 'object' || node === null) return found

  const schema = node as Record<string, unknown>
  if (Array.isArray(schema.items)) found.push(`${at}.items`)
  for (const [key, value] of Object.entries(schema)) {
    tupleItems(value, `${at}.${key}`, found)
  }

  return found
}

describe('viable-common - the conversion contracts', () => {
  test('every exported schema compiles', () => {
    const ajv = addFormats(new Ajv({ strict: false }))
    const schemas = schemasOf(convert)

    expect(schemas.length).toBeGreaterThan(10)
    for (const [name, schema] of schemas) {
      expect(() => ajv.compile(schema as never), name).not.toThrow()
    }
  })

  test('no schema says nullable without saying of what type', () => {
    const offenders = schemasOf(barrel)
      .flatMap(([name, schema]) => nullableWithoutType(schema, name))

    expect(offenders).toEqual([])
  })

  test('every nullable enum carries `null` among its values', () => {
    // Asked of the package barrel for the same reason the walk above is: the pair refuses wherever
    // it is written, and a model answer, a wire body and a stored record each pay for it
    // differently. `StackConfirmation.alternative` is the model answer — the intake's ONE stack
    // call is retried three times and then discarded (`llm:retry-exceeded`) because OpenAI's
    // structured output writes an unset optional as `null` rather than dropping the key.
    // `ConverterProjectLlmBody.llmMode` is the wire body, where `null` MEANS "inherit the
    // profile's setting" and has no other spelling at all.
    const offenders = schemasOf(barrel)
      .flatMap(([name, schema]) => nullableEnumWithoutNull(schema, name))

    expect(offenders).toEqual([])
  })

  test('a nullable enum accepts null under Ajv, and still refuses an unknown member', () => {
    // The structural walk above says how the schema is written; this says what Ajv does with it.
    const ajv = addFormats(new Ajv({ strict: false }))
    const validate = ajv.compile(convert.StackConfirmationSchema as never)
    const answer = (alternative: unknown) => ({
      stack: StackId.NextJs, case: 'spa-api', confidence: 0.9, reason: 'the manifest says so',
      alternative,
    })

    expect(validate(answer(null))).toBe(true)
    expect(validate(answer(StackId.ReactSpa))).toBe(true)
    expect(validate(answer('cobol'))).toBe(false)
  })

  test('no schema declares `items` as a tuple', () => {
    // Ajv accepts the draft-04 tuple form and `JSONSchemaType` demands it for a tuple TYPE, so
    // nothing here fails until the schema reaches a provider: a structured-output endpoint takes
    // `items` as a schema object and answers `400 … is not of type 'object', 'boolean'` for an
    // array of them. One tuple inside `OriginProof` therefore refused the purpose inference, every
    // taxonomy layer, the access model and every story's proofs — a whole conversion's worth of
    // calls, each failing with a message about the wrong thing.
    const offenders = schemasOf(barrel).flatMap(([name, schema]) => tupleItems(schema, name))

    expect(offenders).toEqual([])
  })

  test('STACK_FAMILY answers for every stack there is', () => {
    // A partial map with a fall-through default is the target-role bug again: nothing fails, and
    // every unlisted member is simply reported as belonging to another language.
    for (const stack of Object.values(StackId)) {
      expect(STACK_FAMILY[stack], stack).toBeDefined()
    }
    expect(Object.keys(STACK_FAMILY)).toHaveLength(Object.values(StackId).length)
  })

  test('TAXONOMY_ORDER is a permutation of the layers, not a subset', () => {
    const kinds = Object.values(TaxonomyKind)

    expect(TAXONOMY_ORDER).toHaveLength(kinds.length)
    expect([...TAXONOMY_ORDER].sort()).toEqual([...kinds].sort())
  })

  test('canEnter allows a retry and the next stage, and refuses a skip', () => {
    expect(canEnter(ConversionStage.Intake, ConversionStage.Intake)).toBe(true)
    expect(canEnter(ConversionStage.Intake, ConversionStage.Analysis)).toBe(true)
    // Extraction reads the documents analysis wrote; entering it from intake runs it against
    // documents that were never produced.
    expect(canEnter(ConversionStage.Intake, ConversionStage.Extraction)).toBe(false)
    expect(canEnter(ConversionStage.Extraction, ConversionStage.Analysis)).toBe(false)
  })

  test('the stage ladder ends at implementation rather than falling off it', () => {
    expect(stageAfter(ConversionStage.Intake)).toBe(ConversionStage.Analysis)
    expect(stageAfter(ConversionStage.Implementation)).toBe(ConversionStage.Implementation)
    expect(decisionFor(ConversionStage.Extraction)).toBe(ConversionDecision.Implement)
    expect(decisionFor(ConversionStage.Implementation)).toBe(ConversionDecision.Leave)
  })

  test('every conversion document lives under the conversion directory', () => {
    for (const doc of CONVERSION_DOCS) {
      expect(doc.startsWith(`${CONVERSION_DIR}/`), doc).toBe(true)
    }
    expect(conversionStoryDoc('US-ABC12').startsWith(`${CONVERSION_DIR}/`)).toBe(true)
    for (const node of CONVERSION_MEMORY) {
      expect(node.startsWith('.agents/memory/'), node).toBe(true)
    }
  })

  test('what a conversion owns is one list both wipes read', () => {
    // The relocation keeps these at the root and the initialization one step later must leave the
    // same set alone. Two hand-kept copies drifted once already, and the cost was every document
    // the analysis had paid for: kept by the move, deleted by the install.
    expect(CONVERSION_ARTIFACTS).toEqual([CONVERSION_DIR, ...CONVERSION_MEMORY])
  })

  test('origin paths round-trip and never nest', () => {
    expect(originPath('src/index.ts')).toBe(`${CONVERTED_ORIGIN_DIR}/src/index.ts`)
    expect(isOriginPath(originPath('src/index.ts'))).toBe(true)
    expect(isOriginPath(CONVERTED_ORIGIN_DIR)).toBe(true)
    expect(isOriginPath('sources/web/src/index.ts')).toBe(false)
    // A caller that has lost track of which side of the move it holds must not be able to produce
    // `__viable_converted/__viable_converted/`.
    expect(originPath(originPath('src/index.ts'))).toBe(`${CONVERTED_ORIGIN_DIR}/src/index.ts`)
  })

  test('sizeClassOf splits on the declared bounds', () => {
    expect(sizeClassOf(0)).toBe(SizeClass.Tiny)
    expect(sizeClassOf(2_047)).toBe(SizeClass.Tiny)
    expect(sizeClassOf(2_048)).toBe(SizeClass.Small)
    expect(sizeClassOf(32_767)).toBe(SizeClass.Small)
    expect(sizeClassOf(32_768)).toBe(SizeClass.Medium)
    expect(sizeClassOf(262_144)).toBe(SizeClass.Large)
    expect(sizeClassOf(2_097_152)).toBe(SizeClass.Huge)
  })

  test('entropyClassOf tells prose from a minified bundle from binary', () => {
    expect(entropyClassOf('export const answer = 42\nconsole.log(answer)\n'))
      .toBe(EntropyClass.Text)
    // Printable throughout, and not something a model can reason over: no line breaks, no indent.
    expect(entropyClassOf(`const a=1,b=2,c=3;${'x'.repeat(400)}`)).toBe(EntropyClass.Dense)
    expect(entropyClassOf(`PNG   ${' ÿ'.repeat(40)}`))
      .toBe(EntropyClass.Opaque)
  })

  test('fileClassOf reads the path before the extension', () => {
    expect(fileClassOf('sources/api/src/index.ts', 'ts')).toBe(FileClass.Source)
    expect(fileClassOf('node_modules/left-pad/index.js', 'js')).toBe(FileClass.Generated)
    expect(fileClassOf('tests/api.spec.ts', 'ts')).toBe(FileClass.Test)
    expect(fileClassOf('seed/users.json', 'json')).toBe(FileClass.Data)
    expect(fileClassOf('package.json', 'json')).toBe(FileClass.Manifest)
    expect(fileClassOf('bun.lock', 'lock')).toBe(FileClass.Lock)
  })

  test('a seed or dump location reclassifies a payload and never a program', () => {
    // Asked before the test check and the extension table, the seed/dump rule answered `Data` for
    // all four of these — real source, out of the census's source budget on a word in its path.
    expect(fileClassOf('tests/fixtures/user.ts', 'ts')).toBe(FileClass.Test)
    expect(fileClassOf('src/seedUsers.ts', 'ts')).toBe(FileClass.Source)
    expect(fileClassOf('src/exportReport.ts', 'ts')).toBe(FileClass.Source)
    expect(fileClassOf('bin/cli.ts', 'ts')).toBe(FileClass.Source)
    // What the rule is for: a payload, and the one language that is a dump as often as it is code.
    expect(fileClassOf('fixtures/orders.csv', 'csv')).toBe(FileClass.Data)
    expect(fileClassOf('db/dumps/2024.sql', 'sql')).toBe(FileClass.Data)
    expect(fileClassOf('db/migrations/0001_init.sql', 'sql')).toBe(FileClass.Source)
  })

  test('storyComplexity scales on what the extraction actually found', () => {
    const proof = (proofs: number, algorithms: number) => ({
      proofs: Array.from({ length: proofs }, () => ({ path: 'a.ts', note: 'n' })),
      algorithms: Array.from({ length: algorithms }, () => ({
        name: 'rule', steps: ['one'], proof: { path: 'a.ts', note: 'n' },
      })),
    })

    expect(storyComplexity(proof(2, 0))).toBe(1)
    expect(storyComplexity(proof(5, 0))).toBe(1.5)
    expect(storyComplexity(proof(2, 1))).toBe(1.5)
    expect(storyComplexity(proof(2, 2))).toBe(2)
  })

  test('the source-list exclusions carry the metadata trees and the origin', () => {
    expect(convert.SOURCE_LIST_EXCLUSIONS).toContain(CONVERTED_ORIGIN_DIR)
    expect(convert.SOURCE_LIST_EXCLUSIONS).toContain('docs')
    expect(convert.SOURCE_LIST_EXCLUSIONS).toContain('.agents')
  })

  test('both pipeline prefixes are declared, since a conversion runs on two layers', () => {
    expect(convert.CONVERSION_PIPELINE_PREFIXES).toEqual(['vib:project:convert:', 'vib:convert:'])
  })

  test('a census walk skips only what is never the repository', () => {
    // The three executors answer the SAME question about the same tree, so a directory skipped by
    // one and walked by another means one repository has two different totals. `dist`, `build` and
    // `.next` were in one of the three: ordinary directory names an origin may keep sources in.
    expect(convert.CENSUS_SKIP_DIRS).toEqual(['node_modules', '.git'])
  })

  test('the relocate keep set names what belongs to the slot rather than to the project', () => {
    expect(convert.RELOCATE_ALWAYS_KEEP).toEqual(['.git', 'sandbox-meta.json', HISTORY_FILE])
  })

  test('binaryByExtension answers a tail it knows and defers on one it does not', () => {
    // The verdict a probe alone gets wrong: a small `.ico` with no NUL in its first bytes reads as
    // text, which is how a census on a laptop and the same census in the slot disagreed.
    expect(binaryByExtension('assets/logo.ico')).toBe(true)
    expect(binaryByExtension('assets/logo.PNG')).toBe(true)
    expect(binaryByExtension('sources/web/src/app.tsx')).toBe(false)
    expect(binaryByExtension('archive.tar.gz')).toBe(true)
    // Nothing to go on, so the caller has to read it: no tail at all, a dotfile (which
    // `path.extname` also answers nothing for), and a tail neither list carries.
    expect(binaryByExtension('Makefile')).toBeNull()
    expect(binaryByExtension('.env')).toBeNull()
    expect(binaryByExtension('data.parquet')).toBeNull()
    // The tail of the last SEGMENT, never of the path.
    expect(binaryByExtension('release.d/manifest')).toBeNull()
  })

  test('a head read is bounded, and the binary probe is smaller than the head', () => {
    expect(convert.BINARY_PROBE_BYTES).toBeLessThan(convert.CENSUS_HEAD_BYTES)
    expect(convert.CENSUS_MAX_HEAD_BYTES).toBeGreaterThan(convert.CENSUS_HEAD_BYTES)
  })
})
