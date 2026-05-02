# @owlmeans/image-resource

Image-specific type extensions for OwlMeans object storage — AJV schemas for image metadata.

## Overview

- `ImageMeta` / `StoredImage` / `ImageData` — typed image record interfaces
- `ImageMetaSchema` / `StoredImageSchema` / `ImageDataSchema` — AJV JSON schemas for validation
- Extends `@owlmeans/storage-common` types with image semantics

## Installation

```bash
bun add @owlmeans/image-resource
```

## Usage

```typescript
import { StoredImageSchema, ImageDataSchema } from '@owlmeans/image-resource'
import type { StoredImage, ImageData } from '@owlmeans/image-resource'

// Use AJV schema for validation
const validate = ajv.compile<StoredImage>(StoredImageSchema)
```

## API

### Types

- `ImageMeta` — extends `StoredFileMeta` with image-specific fields
- `StoredImage` — extends `StoredFile` for stored image records
- `ImageData` — extends `StoredFileWithData` for image upload payloads

### Schemas

- `ImageMetaSchema: JSONSchemaType<ImageMeta>`
- `StoredImageSchema: JSONSchemaType<StoredImage>`
- `ImageDataSchema: JSONSchemaType<ImageData>`

## Related Packages

- [`@owlmeans/storage-common`](../storage-common) — `StoredFileMeta`, `StoredFile`, `StoredFileWithData` base types
- [`@owlmeans/storage-resource`](../storage-resource) — S3 resource used to persist images
