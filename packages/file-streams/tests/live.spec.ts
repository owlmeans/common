import { describe, expect, test } from 'bun:test'
import { isSkip } from '@owlmeans/test'
import { createHttpClient, fileInspector, FileKind, httpClient } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { live } from './context.js'

/** Opt-in: real internet downloads (`FILE_STREAMS_LIVE=1`), and a public Drive file (`FILE_STREAMS_LIVE_DRIVE_URL`). */
describe('@owlmeans/file-streams — live internet', () => {
  const internet = isSkip(live.internet) ? test.skip : test
  const drive = isSkip(live.drive) ? test.skip : test

  internet(`downloads and verifies a public file over HTTPS ${isSkip(live.internet) ? live.internet.reason : ''}`, async () => {
    const ranged = await fileInspector.probe(httpClient.source('https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'))
    expect(ranged).toMatchObject({ status: 'match', detected: { kind: FileKind.Pdf }, probe: { randomAccess: true } })
    const headOnly = await fileInspector.probe(httpClient.source('https://www.rfc-editor.org/rfc/rfc9110.pdf'))
    expect(headOnly.detected?.kind).toBe(FileKind.Pdf)
    expect(headOnly.probe.bytesRead).toBeLessThanOrEqual(1024 * 1024)
  }, 60_000)

  drive(`passes Google Drive's interstitial for a public file ${isSkip(live.drive) ? live.drive.reason : ''}`, async () => {
    const response = await createHttpClient().request(process.env.FILE_STREAMS_LIVE_DRIVE_URL as string)
    const head = await streamUtils.peek(response.body, 4096)
    streamUtils.discard(head.stream)
    const verdict = await fileInspector.inspect(head.head, { name: response.info.name, mime: response.info.mime })
    expect(verdict.detected?.kind).not.toBe(FileKind.Html)
  }, 120_000)
})
