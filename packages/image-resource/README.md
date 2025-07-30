# @owlmeans/image-resource

The **@owlmeans/image-resource** package provides specialized image management functionality for OwlMeans Common Libraries, extending the core storage functionality with image-specific operations and validation schemas for handling images in object storage systems like S3.

## Purpose

This package serves as an image-specific extension to the storage system, designed for:

- **Image Storage Management**: Specialized handling of image files in object storage
- **Image Metadata**: Enhanced metadata management specific to image files
- **Validation Schemas**: AJV schemas for image data validation
- **Type Safety**: TypeScript interfaces for image-related data structures
- **Storage Integration**: Seamless integration with OwlMeans storage infrastructure

## Key Concepts

### Image-specific Storage
Extends the basic file storage functionality with image-specific operations and metadata handling.

### Type Extensions
Provides specialized TypeScript interfaces that extend the base storage types for image-specific use cases.

### Schema Validation
Includes AJV schemas for validating image metadata and data structures.

### Storage Abstraction
Builds upon the storage-common package to provide higher-level image management capabilities.

## Installation

```bash
npm install @owlmeans/image-resource
```

## API Reference

### Types

#### `ImageMeta`
Metadata interface for stored images.

```typescript
interface ImageMeta extends StoredFileMeta {
  // Extends base file metadata with image-specific properties
}
```

#### `StoredImage`
Interface for stored image files.

```typescript
interface StoredImage extends StoredFile {
  // Extends base stored file interface for images
}
```

#### `ImageData`
Interface for image data with content.

```typescript
interface ImageData extends StoredFileWithData {
  // Extends base file data interface for images
}
```

### Validation Schemas

#### `ImageMetaSchema`
AJV schema for validating image metadata.

```typescript
const ImageMetaSchema: JSONSchemaType<ImageMeta>
```

#### `StoredImageSchema`
AJV schema for validating stored image objects.

```typescript
const StoredImageSchema: JSONSchemaType<StoredImage>
```

#### `ImageDataSchema`
AJV schema for validating image data with content.

```typescript
const ImageDataSchema: JSONSchemaType<ImageData>
```

## Usage Examples

### Basic Image Validation

```typescript
import { ImageMetaSchema, StoredImageSchema, ImageDataSchema } from '@owlmeans/image-resource'
import Ajv from 'ajv'

const ajv = new Ajv()

// Validate image metadata
const validateImageMeta = ajv.compile(ImageMetaSchema)
const isValidMeta = validateImageMeta(imageMetadata)

// Validate stored image
const validateStoredImage = ajv.compile(StoredImageSchema)
const isValidImage = validateStoredImage(imageObject)

// Validate image data
const validateImageData = ajv.compile(ImageDataSchema)
const isValidData = validateImageData(imageDataObject)
```

### Integration with Storage Systems

```typescript
import type { ImageMeta, StoredImage, ImageData } from '@owlmeans/image-resource'
import { ImageMetaSchema } from '@owlmeans/image-resource'

class ImageStorageService {
  async storeImage(file: File, metadata: Partial<ImageMeta>): Promise<StoredImage> {
    // Validate metadata
    const validateMeta = ajv.compile(ImageMetaSchema)
    if (!validateMeta(metadata)) {
      throw new Error('Invalid image metadata')
    }
    
    // Process and store image
    const storedImage: StoredImage = {
      id: generateId(),
      filename: file.name,
      contentType: file.type,
      size: file.size,
      ...metadata
    }
    
    return storedImage
  }
  
  async getImageData(imageId: string): Promise<ImageData> {
    // Retrieve image with data
    const imageData = await this.storage.getWithData(imageId)
    
    // Validate returned data
    const validateData = ajv.compile(ImageDataSchema)
    if (!validateData(imageData)) {
      throw new Error('Invalid image data format')
    }
    
    return imageData as ImageData
  }
}
```

### Type-safe Image Operations

```typescript
import type { ImageMeta, StoredImage } from '@owlmeans/image-resource'

interface ImageProcessor {
  processImage(image: StoredImage): Promise<StoredImage>
  getImageMetadata(imageId: string): Promise<ImageMeta>
  updateImageMetadata(imageId: string, metadata: Partial<ImageMeta>): Promise<void>
}

class BasicImageProcessor implements ImageProcessor {
  async processImage(image: StoredImage): Promise<StoredImage> {
    // Process the image (resize, compress, etc.)
    return {
      ...image,
      // Updated properties after processing
    }
  }
  
  async getImageMetadata(imageId: string): Promise<ImageMeta> {
    const metadata = await this.storage.getMetadata(imageId)
    return metadata as ImageMeta
  }
  
  async updateImageMetadata(imageId: string, metadata: Partial<ImageMeta>): Promise<void> {
    await this.storage.updateMetadata(imageId, metadata)
  }
}
```

## Integration Patterns

### Web Upload Handler

```typescript
import type { ImageData } from '@owlmeans/image-resource'
import { ImageDataSchema } from '@owlmeans/image-resource'

async function handleImageUpload(file: File): Promise<ImageData> {
  // Create image data object
  const imageData: ImageData = {
    id: generateId(),
    filename: file.name,
    contentType: file.type,
    size: file.size,
    data: await file.arrayBuffer(),
    uploadedAt: new Date(),
    // Additional image-specific metadata
  }
  
  // Validate before processing
  const validate = ajv.compile(ImageDataSchema)
  if (!validate(imageData)) {
    throw new Error('Invalid image data')
  }
  
  return imageData
}
```

### Storage Resource Integration

```typescript
import { StorageResource } from '@owlmeans/storage-resource'
import type { StoredImage } from '@owlmeans/image-resource'

class ImageResource extends StorageResource<StoredImage> {
  constructor() {
    super({
      schema: StoredImageSchema,
      bucket: 'images',
      // Image-specific configuration
    })
  }
  
  async uploadImage(file: File, metadata?: Partial<ImageMeta>): Promise<StoredImage> {
    const imageData = await this.processFile(file)
    return await this.store({
      ...imageData,
      ...metadata
    })
  }
}
```

## Best Practices

1. **Validation**: Always validate image data using provided schemas
2. **Type Safety**: Use TypeScript interfaces for compile-time safety
3. **Metadata Management**: Properly manage image-specific metadata
4. **Integration**: Leverage with storage-common and storage-resource packages
5. **Error Handling**: Implement proper error handling for validation failures

## Dependencies

This package depends on:
- `@owlmeans/storage-common` - Core storage types and schemas
- `ajv` - JSON schema validation

## Related Packages

- [`@owlmeans/storage-common`](../storage-common) - Core storage functionality
- [`@owlmeans/storage-resource`](../storage-resource) - Storage resource management
- [`@owlmeans/resource`](../resource) - Base resource management
