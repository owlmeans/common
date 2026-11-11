import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createGoogleDriveResolver, fileInspector, FileKind, googleDriveResolver, ResolverError } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { docxOf, noise, PNG, pptxOf, xlsxOf } from './fixtures.js'
import { startFakeDrive } from './harness/drive.js'
import type { FakeDrive } from './harness/drive.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { localClient } from './context.js'

describe('@owlmeans/file-streams — Google Drive resolver', () => {
  let drive: FakeDrive
  let foreign: Origin
  beforeAll(async () => {
    foreign = startOrigin()
    drive = startFakeDrive({ small: PNG, large: noise(300_000), docx: await docxOf(), xlsx: await xlsxOf(), pptx: await pptxOf() }, foreign)
  })
  afterAll(() => {
    drive.stop()
    foreign.stop()
  })

  const client = () => localClient({
    resolvers: [createGoogleDriveResolver({ origins: { drive: drive.base, usercontent: drive.base, docs: drive.base, accounts: drive.accounts } })],
  })

  test('rewrites share and editor links to the URLs that serve bytes', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz'
    const cases: Array<[string, string]> = [
      [`https://drive.google.com/file/d/${id}/view?usp=sharing`, `https://drive.usercontent.google.com/download?id=${id}&export=download`],
      [`https://drive.google.com/open?id=${id}`, `https://drive.usercontent.google.com/download?id=${id}&export=download`],
      [`https://drive.google.com/uc?id=${id}&export=download`, `https://drive.usercontent.google.com/download?id=${id}&export=download`],
      [`https://drive.google.com/file/d/${id}/view?resourcekey=0-key`, `https://drive.usercontent.google.com/download?id=${id}&export=download&resourcekey=0-key`],
      [`https://docs.google.com/document/d/${id}/edit`, `https://docs.google.com/document/d/${id}/export?format=docx`],
      [`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`, `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`],
      [`https://docs.google.com/presentation/d/${id}/edit`, `https://docs.google.com/presentation/d/${id}/export/pptx`],
      [`https://docs.google.com/drawings/d/${id}/edit`, `https://docs.google.com/drawings/d/${id}/export/png`],
    ]
    for (const [input, expected] of cases) {
      expect(googleDriveResolver.rewrite(new URL(input)).href).toBe(expected)
    }
    const csv = createGoogleDriveResolver({ exports: { spreadsheet: 'csv' } })
    expect(csv.rewrite(new URL(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=42`)).href)
      .toBe(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=42`)
    expect(() => googleDriveResolver.rewrite(new URL('https://drive.google.com/drive/folders/abcdefghijk'))).toThrow(ResolverError)
    expect(googleDriveResolver.matches(new URL('https://example.com/file/d/x'))).toBe(false)
  })

  test('downloads a small file at once and passes the virus-scan page of a large one', async () => {
    const small = await client().request(`${drive.base}/file/d/SMALLFILE0001/view?usp=sharing`)
    expect(small.info.name).toBe('small.png')
    expect(await streamUtils.collect(small.body, 1_000_000)).toEqual(PNG)

    const large = await client().request(`${drive.base}/file/d/LARGEFILE0001/view`)
    expect(await streamUtils.collect(large.body, 1_000_000)).toEqual(noise(300_000))
    expect(drive.paths.some(path => path.includes('confirm=t') && path.includes('uuid=u-123'))).toBe(true)
  })

  test('exports editor files in the configured formats', async () => {
    const expected: Array<[string, FileKind]> = [
      [`${drive.base}/document/d/DOCUMENTID01/edit`, FileKind.Document],
      [`${drive.base}/spreadsheets/d/SHEETID00001/edit`, FileKind.Spreadsheet],
      [`${drive.base}/presentation/d/SLIDESID0001/edit`, FileKind.Presentation],
    ]
    for (const [url, kind] of expected) {
      const verdict = await fileInspector.probe(client().source(url))
      expect({ url, status: verdict.status, kind: verdict.detected?.kind }).toEqual({ url, status: 'match', kind })
    }
  })

  test('fails on quotas, private files and forms that post elsewhere', async () => {
    await expect(client().request(`${drive.base}/uc?id=QUOTAFILE0001`)).rejects.toThrow('resolver:google-drive:quota')
    await expect(client().request(`${drive.base}/file/d/PRIVATEFILE01/view`)).rejects.toThrow('resolver:google-drive:not-public')
    await expect(client().request(`${drive.base}/file/d/FOREIGNFORM01/view`)).rejects.toThrow('resolver:google-drive:foreign-form')
  })
})
