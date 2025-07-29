# @owlmeans/storage-common

Common storage interfaces and utilities for OwlMeans file storage systems. This package provides shared types, validation schemas, and error handling for object storage solutions including S3-compatible storage, image storage, and file management systems.

## Overview

The `@owlmeans/storage-common` package serves as the foundation for OwlMeans storage implementations. It provides:

- **File Storage Interfaces**: Common types for stored files and file metadata
- **Validation Schemas**: AJV schemas for file validation and integrity
- **Status Management**: File status tracking and lifecycle management
- **Format Support**: Multiple file formats and encoding support
- **Scope-Based Access**: Authorization scopes for file access control
- **Error Types**: Specialized error types for storage operations
- **Instance Management**: Multiple file instances and versions support

This package is part of the OwlMeans storage ecosystem:
- **@owlmeans/storage-common**: Common storage interfaces *(this package)*
- **@owlmeans/storage-resource**: Storage resource implementations
- **@owlmeans/static-resource**: Static resource management
- **@owlmeans/image-resource**: Image-specific storage features

## Installation

```bash
npm install @owlmeans/storage-common ajv
```

## Core Concepts

### Stored Files
Files are represented with metadata, multiple instances (different sizes/formats), and access control through scopes.

### File Instances
Each file can have multiple instances representing different versions, sizes, or formats of the same file.

### Scope-Based Access
Files use scope-based authorization to control who can access, modify, or delete files.

### Status Tracking
Files have status indicators to track their lifecycle from upload to processing to availability.

## API Reference

### Core Types

#### `StoredFileMeta`

Metadata interface for stored files with authorization and identification.

```typescript
interface StoredFileMeta {
  entityId?: string           // Associated entity identifier
  sourceName?: string         // Original filename from upload
  name?: string              // Display name for the file
  title?: string             // Human-readable title
  scopes: string[]           // Authorization scopes
  mimeType: string           // MIME type of the file
  alias: string              // Unique file identifier
  status: StoredFileStatus   // Current file status
}
```

#### `StoredFileInstance`

Represents a specific instance of a stored file.

```typescript
interface StoredFileInstance {
  size: number               // File size in bytes
  alias: string              // Instance identifier
  url: string                // Access URL for this instance
}
```

#### `StoredFilePayload`

Extended instance with actual file data for upload/download operations.

```typescript
interface StoredFilePayload extends StoredFileInstance {
  format?: StoredFileFormat  // File format information
  bytes?: Uint8Array         // Raw file bytes
  base64?: string           // Base64 encoded file data
}
```

#### `StoredFile`

Complete file representation with metadata and all instances.

```typescript
interface StoredFile extends StoredFileMeta {
  instances: { [key: string]: StoredFileInstance }
}
```

#### `StoredFileWithData`

File representation including actual file data for each instance.

```typescript
interface StoredFileWithData extends StoredFileMeta {
  format?: StoredFileFormat
  instances: { [key: string]: StoredFilePayload }
}
```

### Enums and Constants

#### `StoredFileStatus`

Enumeration of possible file statuses.

```typescript
enum StoredFileStatus {
  Uploaded = 'uploaded',      // File has been uploaded
  Processing = 'processing',  // File is being processed
  Available = 'available',    // File is available for use
  Error = 'error',           // File processing failed
  Deleted = 'deleted'        // File has been deleted
}
```

#### `StoredFileFormat`

Enumeration of supported file formats.

```typescript
enum StoredFileFormat {
  Original = 'original',      // Original uploaded format
  Thumbnail = 'thumbnail',    // Thumbnail version
  Compressed = 'compressed',  // Compressed version
  Optimized = 'optimized'     // Optimized version
}
```

### Validation Schemas

The package provides AJV schemas for runtime validation:

#### `StoredFileMetaSchema`

Validates stored file metadata.

```typescript
const StoredFileMetaSchema: JSONSchemaType<StoredFileMeta>
```

#### `StoredFileInstanceSchema`

Validates file instance data.

```typescript
const StoredFileInstanceSchema: JSONSchemaType<StoredFileInstance>
```

#### `StoredFilePayloadSchema`

Validates file payload including data.

```typescript
const StoredFilePayloadSchema: JSONSchemaType<StoredFilePayload>
```

### Error Types

The package defines storage-specific error types for comprehensive error handling.

```typescript
import { StorageError } from '@owlmeans/storage-common'

// Storage operation errors
class StorageError extends OwlMeansError {
  // Storage-specific error handling
}
```

## Usage Examples

### Basic File Metadata Management

```typescript
import { 
  StoredFileMeta, 
  StoredFileStatus, 
  StoredFileMetaSchema 
} from '@owlmeans/storage-common'
import Ajv from 'ajv'

const ajv = new Ajv()
const validateMeta = ajv.compile(StoredFileMetaSchema)

// Create file metadata
const fileMeta: StoredFileMeta = {
  entityId: 'user-123',
  sourceName: 'document.pdf',
  name: 'Important Document',
  title: 'Project Requirements Document',
  scopes: ['read:documents', 'entity:user-123'],
  mimeType: 'application/pdf',
  alias: 'doc-abc123',
  status: StoredFileStatus.Uploaded
}

// Validate metadata
if (validateMeta(fileMeta)) {
  console.log('File metadata is valid')
} else {
  console.error('Validation errors:', validateMeta.errors)
}
```

### File Instance Management

```typescript
import { 
  StoredFile, 
  StoredFileInstance, 
  StoredFileFormat 
} from '@owlmeans/storage-common'

// Create file with multiple instances
const fileWithInstances: StoredFile = {
  // ... metadata
  entityId: 'user-123',
  sourceName: 'photo.jpg',
  name: 'Profile Photo',
  scopes: ['read:photos', 'entity:user-123'],
  mimeType: 'image/jpeg',
  alias: 'photo-xyz789',
  status: StoredFileStatus.Available,
  
  instances: {
    original: {
      size: 2048000,
      alias: 'photo-xyz789-original',
      url: 'https://storage.example.com/photos/original/photo-xyz789.jpg'
    },
    thumbnail: {
      size: 51200,
      alias: 'photo-xyz789-thumb',
      url: 'https://storage.example.com/photos/thumbnails/photo-xyz789.jpg'
    },
    compressed: {
      size: 512000,
      alias: 'photo-xyz789-compressed',
      url: 'https://storage.example.com/photos/compressed/photo-xyz789.jpg'
    }
  }
}

// Access different file instances
const originalUrl = fileWithInstances.instances.original.url
const thumbnailUrl = fileWithInstances.instances.thumbnail.url
```

### File Upload with Payload

```typescript
import { 
  StoredFileWithData, 
  StoredFilePayload, 
  StoredFileFormat 
} from '@owlmeans/storage-common'

// File upload with data
const uploadFile = async (fileData: Uint8Array, metadata: StoredFileMeta): Promise<StoredFileWithData> => {
  const fileWithData: StoredFileWithData = {
    ...metadata,
    format: StoredFileFormat.Original,
    instances: {
      original: {
        size: fileData.length,
        alias: `${metadata.alias}-original`,
        url: '', // Will be set after upload
        format: StoredFileFormat.Original,
        bytes: fileData
      }
    }
  }
  
  return fileWithData
}

// Usage
const fileBytes = new Uint8Array([/* file data */])
const metadata: StoredFileMeta = {
  sourceName: 'upload.png',
  name: 'User Upload',
  scopes: ['read:uploads'],
  mimeType: 'image/png',
  alias: 'upload-123',
  status: StoredFileStatus.Uploaded
}

const uploadedFile = await uploadFile(fileBytes, metadata)
```

### Base64 File Handling

```typescript
import { StoredFilePayload, StoredFileFormat } from '@owlmeans/storage-common'

// Convert base64 to file payload
const base64ToPayload = (base64Data: string, alias: string): StoredFilePayload => {
  // Decode base64 to calculate size
  const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
  
  return {
    size: bytes.length,
    alias,
    url: '', // Will be set after storage
    format: StoredFileFormat.Original,
    base64: base64Data,
    bytes
  }
}

// Convert file payload to base64
const payloadToBase64 = (payload: StoredFilePayload): string => {
  if (payload.base64) {
    return payload.base64
  }
  
  if (payload.bytes) {
    return btoa(String.fromCharCode(...payload.bytes))
  }
  
  throw new Error('No data available for base64 conversion')
}
```

### Scope-Based Authorization

```typescript
import { StoredFileMeta } from '@owlmeans/storage-common'

class FileAuthorizationManager {
  canAccess(file: StoredFileMeta, userScopes: string[]): boolean {
    return file.scopes.some(scope => userScopes.includes(scope))
  }
  
  canModify(file: StoredFileMeta, userScopes: string[], entityId?: string): boolean {
    // Check if user has modify access
    const hasModifyScope = userScopes.some(scope => 
      scope.startsWith('write:') || scope.startsWith('modify:')
    )
    
    // Check entity-specific access
    const hasEntityAccess = entityId && file.entityId === entityId &&
      userScopes.includes(`entity:${entityId}`)
    
    return hasModifyScope && (hasEntityAccess || !file.entityId)
  }
  
  filterAccessibleFiles(files: StoredFileMeta[], userScopes: string[]): StoredFileMeta[] {
    return files.filter(file => this.canAccess(file, userScopes))
  }
}

// Usage
const authManager = new FileAuthorizationManager()
const userScopes = ['read:documents', 'entity:user-123']

const canRead = authManager.canAccess(fileMeta, userScopes)
const canWrite = authManager.canModify(fileMeta, ['write:documents', 'entity:user-123'], 'user-123')
```

### File Status Management

```typescript
import { StoredFile, StoredFileStatus } from '@owlmeans/storage-common'

class FileStatusManager {
  updateStatus(file: StoredFile, newStatus: StoredFileStatus): StoredFile {
    return {
      ...file,
      status: newStatus
    }
  }
  
  isAvailable(file: StoredFile): boolean {
    return file.status === StoredFileStatus.Available
  }
  
  isProcessing(file: StoredFile): boolean {
    return file.status === StoredFileStatus.Processing
  }
  
  hasError(file: StoredFile): boolean {
    return file.status === StoredFileStatus.Error
  }
  
  getProcessingFiles(files: StoredFile[]): StoredFile[] {
    return files.filter(file => this.isProcessing(file))
  }
  
  getAvailableFiles(files: StoredFile[]): StoredFile[] {
    return files.filter(file => this.isAvailable(file))
  }
}

// Usage
const statusManager = new FileStatusManager()

// Update file status after processing
const processedFile = statusManager.updateStatus(file, StoredFileStatus.Available)

// Check file availability
if (statusManager.isAvailable(file)) {
  console.log('File is ready for use')
}
```

### File Format Management

```typescript
import { 
  StoredFileWithData, 
  StoredFileFormat, 
  StoredFilePayload 
} from '@owlmeans/storage-common'

class FileFormatManager {
  addInstance(
    file: StoredFileWithData, 
    format: StoredFileFormat, 
    payload: StoredFilePayload
  ): StoredFileWithData {
    return {
      ...file,
      instances: {
        ...file.instances,
        [format]: {
          ...payload,
          format
        }
      }
    }
  }
  
  getInstanceByFormat(file: StoredFileWithData, format: StoredFileFormat): StoredFilePayload | null {
    return file.instances[format] || null
  }
  
  hasFormat(file: StoredFileWithData, format: StoredFileFormat): boolean {
    return format in file.instances
  }
  
  getAvailableFormats(file: StoredFileWithData): StoredFileFormat[] {
    return Object.keys(file.instances)
      .filter(key => file.instances[key].format)
      .map(key => file.instances[key].format!)
  }
}

// Usage
const formatManager = new FileFormatManager()

// Add thumbnail instance
const thumbnailPayload: StoredFilePayload = {
  size: 10240,
  alias: 'file-thumb',
  url: 'https://storage.example.com/thumbnails/file-thumb.jpg',
  format: StoredFileFormat.Thumbnail,
  bytes: thumbnailBytes
}

const fileWithThumbnail = formatManager.addInstance(
  originalFile, 
  StoredFileFormat.Thumbnail, 
  thumbnailPayload
)

// Get specific format
const thumbnail = formatManager.getInstanceByFormat(fileWithThumbnail, StoredFileFormat.Thumbnail)
```

### Validation and Error Handling

```typescript
import { 
  StoredFileMetaSchema, 
  StoredFileInstanceSchema,
  StorageError 
} from '@owlmeans/storage-common'
import Ajv from 'ajv'

const ajv = new Ajv()
const validateMeta = ajv.compile(StoredFileMetaSchema)
const validateInstance = ajv.compile(StoredFileInstanceSchema)

class FileValidator {
  validateMetadata(meta: unknown): StoredFileMeta {
    if (!validateMeta(meta)) {
      throw new StorageError('Invalid file metadata', {
        code: 'VALIDATION_ERROR',
        details: validateMeta.errors
      })
    }
    return meta as StoredFileMeta
  }
  
  validateInstance(instance: unknown): StoredFileInstance {
    if (!validateInstance(instance)) {
      throw new StorageError('Invalid file instance', {
        code: 'VALIDATION_ERROR', 
        details: validateInstance.errors
      })
    }
    return instance as StoredFileInstance
  }
  
  validateFile(file: unknown): StoredFile {
    const meta = this.validateMetadata(file)
    
    if (typeof file === 'object' && file !== null && 'instances' in file) {
      const instances = (file as any).instances
      
      if (typeof instances !== 'object') {
        throw new StorageError('Invalid instances object')
      }
      
      // Validate each instance
      Object.values(instances).forEach(instance => {
        this.validateInstance(instance)
      })
      
      return file as StoredFile
    }
    
    throw new StorageError('Invalid file structure')
  }
}

// Usage
const validator = new FileValidator()

try {
  const validFile = validator.validateFile(untrustedFileData)
  console.log('File validation passed')
} catch (error) {
  if (error instanceof StorageError) {
    console.error('Storage validation error:', error.message)
    console.error('Details:', error.details)
  }
}
```

## Integration with Other Packages

### Authentication Integration
```typescript
import { ScopeValueSchema } from '@owlmeans/auth'
import { StoredFileMeta } from '@owlmeans/storage-common'

// File scopes use authentication scope validation
```

### Error System Integration
```typescript
import { OwlMeansError } from '@owlmeans/error'
import { StorageError } from '@owlmeans/storage-common'

// Storage errors extend the OwlMeans error system
```

### Resource Integration
```typescript
import { StoredFile } from '@owlmeans/storage-common'
import { Resource } from '@owlmeans/resource'

// Storage resources can use these types for consistent file management
```

## Best Practices

1. **Scope Management**: Use specific scopes for fine-grained access control
2. **Status Tracking**: Always update file status during processing
3. **Instance Management**: Use appropriate instances for different use cases
4. **Validation**: Always validate file data using provided schemas
5. **Error Handling**: Use storage-specific error types for better debugging
6. **Format Support**: Provide multiple formats for better user experience
7. **Security**: Validate all file metadata and content before storage

## Dependencies

This package depends on:
- `@owlmeans/auth` - Authentication and authorization utilities
- `@owlmeans/error` - Error handling system
- `ajv` - JSON Schema validation (peer dependency)

## Related Packages

- [`@owlmeans/storage-resource`](../storage-resource) - Storage resource implementations
- [`@owlmeans/static-resource`](../static-resource) - Static resource management
- [`@owlmeans/image-resource`](../image-resource) - Image-specific storage
- [`@owlmeans/auth`](../auth) - Authentication and authorization