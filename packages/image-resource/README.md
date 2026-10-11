# @owlmeans/image-resource

Image-shaped names and AJV schemas over the stored-file types of `@owlmeans/storage-common`:
`ImageMeta`, `StoredImage`, `ImageData` and their schemas. An app uses it to type the record that
describes an image and to validate an image upload or response against a schema of its own, so a
signature says it carries an image rather than an arbitrary file. It registers no resource and
stores nothing: the bytes go to a bucket through `@owlmeans/storage-resource`, the describing record
goes to a database resource (`@owlmeans/mongo-resource`, `@owlmeans/postgres-resource`), and a
non-image file uses the `StoredFile*` types of `@owlmeans/storage-common` directly.

## Installation

```bash
bun add @owlmeans/image-resource@^0.1.18-rc.43
```

`ajv` is a peer dependency. Install `@owlmeans/storage-common` explicitly as well — the schemas are
built from its runtime values, and it is not a declared dependency of this package.

## Concepts

- **Image meta** — `ImageMeta`, the descriptive fields of an image: `entityId?`, `sourceName?`,
  `name?`, `title?`, `scopes`, `mimeType`, `alias`, `status` (`StoredFileStatus`).
- **Stored image** — `StoredImage`, the meta plus `instances`: a map of renditions (original,
  thumbnail, converted format), each `{ size, alias, url }`.
- **Image data** — `ImageData`, the upload payload: the meta plus `format?` and `instances` whose
  entries may carry `bytes` or `base64` (`StoredFileFormat`).
- **Bucket vs. record** — a bucket (`StorageResource`) only accepts an upload and returns a URL; the
  record that answers criteria, sorting and paging lives in a database resource.

## Usage

### Validate an upload or a response

```typescript
import Ajv from 'ajv'
import { ImageDataSchema, StoredImageSchema } from '@owlmeans/image-resource'
import type { ImageData, StoredImage } from '@owlmeans/image-resource'

const ajv = new Ajv()
const validateUpload = ajv.compile<ImageData>(ImageDataSchema)
const validateImage = ajv.compile<StoredImage>(StoredImageSchema)

if (!validateUpload(payload)) {
  throw new SyntaxError(ajv.errorsText(validateUpload.errors))
}
```

The schemas set `additionalProperties: false`, so an extra field fails validation.

### Keep image records in a database resource

```typescript
import type { Resource } from '@owlmeans/resource'
import type { StoredImage } from '@owlmeans/image-resource'

const images = ctx.resource<Resource<StoredImage>>('images')
const page = await images.list({ entityId, mimeType: { $startsWith: 'image/' } }, { sort: ['name'], size: 20 })

// Pick a rendition from the map; never derive one url from another
const thumbnailUrl = page.items[0]?.instances.thumbnail?.url
```

## API

### Types

| Symbol | Extends | Purpose |
|---|---|---|
| `ImageMeta` | `StoredFileMeta` | descriptive fields of an image |
| `StoredImage` | `StoredFile` | a stored image with its `instances` renditions |
| `ImageData` | `StoredFileWithData` | an upload payload carrying bytes or base64 per instance |

### Schemas

| Symbol | Type | Built from |
|---|---|---|
| `ImageMetaSchema` | `JSONSchemaType<ImageMeta>` | `StoredFileMetaSchema` |
| `StoredImageSchema` | `JSONSchemaType<StoredImage>` | `StoredFileSchema` |
| `ImageDataSchema` | `JSONSchemaType<ImageData>` | `StoredFileWithDataSchema` |

Each copies the base schema's `properties` and `required` and closes the object.

## Common pitfalls

- This package registers no resource — `ctx.resource('images')` needs a resource the app registered
  with a database backend.
- A bucket accepts only `create`; listing or reading images goes through the record resource.
- `instances` keys are renditions; read the `url` of the one a screen needs instead of rebuilding a
  url by string surgery.
- A missing `@owlmeans/storage-common` install fails at import, since the schemas spread its runtime
  values.

## Related packages

- [`@owlmeans/storage-common`](../storage-common) — `StoredFileMeta`, `StoredFile`, `StoredFileWithData`, their schemas and enums
- [`@owlmeans/storage-resource`](../storage-resource) — the upload-only bucket resource that stores the bytes
- [`@owlmeans/resource`](../resource) — the `Resource<T>` contract the image record store implements

The `image-resource` skill covers the same contract for agents.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
