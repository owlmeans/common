import { describe, expect, test } from 'bun:test'
import { FileKind, FileKindError, fileInspector } from '../src/index.js'
import { sourceOf } from './context.js'
import {
  DRAWIO, DRAWIO_PROLOG, DRAWIO_SVG, EXCALIDRAW, FBX, GLB, GLTF, JSON_TEXT, OBJ, OTF, PNG, pngWithText, SOLID_PROSE, STL_ASCII,
  STL_BINARY, SVG, TTF, WOFF, WOFF2,
} from './fixtures.js'

describe('@owlmeans/file-inspector — fonts, 3D models, diagrams', () => {
  test('identifies fonts, 3D models and diagrams under their own names', async () => {
    const cases: Array<[string, Uint8Array, string, FileKind]> = [
      ['brand.woff', WOFF, 'woff', FileKind.Font], ['brand.woff2', WOFF2, 'woff2', FileKind.Font],
      ['brand.ttf', TTF, 'ttf', FileKind.Font], ['brand.otf', OTF, 'otf', FileKind.Font],
      ['scene.glb', GLB, 'glb', FileKind.Model3d], ['scene.gltf', GLTF, 'gltf', FileKind.Model3d],
      ['part.stl', STL_ASCII, 'stl', FileKind.Model3d], ['part.stl', STL_BINARY, 'stl', FileKind.Model3d],
      ['mesh.obj', OBJ, 'obj', FileKind.Model3d], ['rig.fbx', FBX, 'fbx', FileKind.Model3d],
      ['flow.drawio', DRAWIO, 'drawio', FileKind.Diagram], ['flow.dio', DRAWIO_PROLOG, 'drawio', FileKind.Diagram],
      ['sketch.excalidraw', EXCALIDRAW, 'excalidraw', FileKind.Diagram],
    ]
    for (const [name, data, ext, kind] of cases) {
      const verdict = await fileInspector.inspect(data, { name }, { complete: true })
      expect({ name, status: verdict.status, ext: verdict.detected?.ext, kind: verdict.detected?.kind, differs: verdict.details.formatDiffers })
        .toEqual({ name, status: 'match', ext, kind, differs: undefined })
    }
    expect((await fileInspector.inspect(DRAWIO, { name: 'flow.drawio' }, { complete: true })).details.diagram).toBe('drawio')
    expect((await fileInspector.inspect(EXCALIDRAW, { name: 'a.excalidraw' }, { complete: true })).details.diagram).toBe('excalidraw')
    expect((await fileInspector.inspect(GLB, { mime: 'model/gltf-binary' }, { complete: true })).status).toBe('match')
    expect((await fileInspector.inspect(STL_BINARY, { name: 'part.stl', mime: 'application/vnd.ms-pki.stl' }, { complete: true })).status).toBe('match')
  })

  test('a format carried in text matches a text claim and passes an allow-list of text', async () => {
    for (const [name, data, kind] of [
      ['flow.xml', DRAWIO_PROLOG, FileKind.Diagram], ['scene.json', GLTF, FileKind.Model3d], ['sketch.json', EXCALIDRAW, FileKind.Diagram],
      ['part.txt', STL_ASCII, FileKind.Model3d],
    ] as const) {
      const verdict = await fileInspector.inspect(data, { name }, { complete: true })
      expect({ name, status: verdict.status, kind: verdict.detected?.kind }).toEqual({ name, status: 'match', kind })
      expect(fileInspector.enforce(verdict, { allow: [FileKind.Text] })).toBe(verdict)
      expect(() => fileInspector.enforce(verdict, { allow: [FileKind.Image] })).toThrow(FileKindError)
    }
    // Plain JSON stays text; prose that opens with "solid" is no STL; a JSON named .gltf without a model is refused.
    expect((await fileInspector.inspect(JSON_TEXT, { name: 'data.json' }, { complete: true })).detected?.kind).toBe(FileKind.Text)
    expect(await fileInspector.inspect(SOLID_PROSE, { name: 'notes.txt' }, { complete: true }))
      .toMatchObject({ status: 'match', detected: { kind: FileKind.Text, method: 'text' } })
    expect((await fileInspector.inspect(JSON_TEXT, { name: 'scene.gltf' }, { complete: true })).status).toBe('mismatch')
  })

  test('an image keeps its kind and names the diagram it was exported with', async () => {
    const svg = await fileInspector.inspect(DRAWIO_SVG, { name: 'flow.drawio.svg' }, { complete: true })
    expect(svg).toMatchObject({ status: 'match', detected: { kind: FileKind.Image, ext: 'svg' }, details: { diagram: 'drawio' } })
    expect((await fileInspector.inspect(DRAWIO_SVG, { name: 'flow.svg' }, { complete: true })).details.diagram).toBe('drawio')

    const png = pngWithText('mxfile', '%3Cmxfile%20host%3D%22app.diagrams.net%22%3E%3C%2Fmxfile%3E')
    expect(await fileInspector.inspect(png, { name: 'flow.png' }, { complete: true }))
      .toMatchObject({ status: 'match', detected: { ext: 'png' }, details: { diagram: 'drawio' } })
    expect((await fileInspector.inspect(PNG, { name: 'flow.drawio.png' }, { complete: true })).details.diagram).toBe('drawio')
    expect((await fileInspector.inspect(PNG, { name: 'dot.png' }, { complete: true })).details.diagram).toBeUndefined()
    expect((await fileInspector.inspect(SVG, { name: 'logo.svg' }, { complete: true })).details.diagram).toBeUndefined()
  })

  test('a binary STL is told by its size: whole bytes, a probe over ranges, a head with a declared size', async () => {
    expect((await fileInspector.inspect(STL_BINARY.subarray(0, 120), { name: 'part.stl' })).status).toBe('inconclusive')
    expect((await fileInspector.inspect(STL_BINARY.subarray(0, 120), { name: 'part.stl' }, { size: STL_BINARY.length })).detected?.ext).toBe('stl')
    expect((await fileInspector.probe(sourceOf(STL_BINARY, { name: 'part.stl' }))).detected?.kind).toBe(FileKind.Model3d)
    expect((await fileInspector.probe(sourceOf(STL_BINARY, { name: 'part.stl', ranges: false }))).detected?.kind).toBe(FileKind.Model3d)
  })
})
