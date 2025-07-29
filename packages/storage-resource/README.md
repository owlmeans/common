# @owlmeans/storage-resource

Object storage resource integration for OwlMeans Common applications. This package provides S3-compatible object storage functionality with file upload, download, type validation, and stream processing capabilities designed for secure file management in distributed applications.

## Overview

The `@owlmeans/storage-resource` package extends the OwlMeans resource system to provide object storage functionality including:

- **S3-Compatible Storage**: Integration with AWS S3 and S3-compatible storage services
- **File Upload/Download**: Secure file operations with validation and type checking
- **Stream Processing**: Efficient handling of file streams for large files
- **Type Validation**: Automatic file type detection and validation
- **Prefix Management**: Organized file storage with configurable prefixes
- **Resource Integration**: Seamless integration with OwlMeans resource management system

This package follows the OwlMeans resource pattern and provides server-side storage capabilities for applications requiring file management.

## Installation

```bash
npm install @owlmeans/storage-resource
```

## Dependencies

This package requires and integrates with:
- `@owlmeans/resource`: Base resource management system
- `@owlmeans/server-context`: Server context management
- `@owlmeans/storage-common`: Storage utilities and error types
- `@aws-sdk/client-s3`: AWS S3 SDK for storage operations
- `file-type`: File type detection utilities

## Core Concepts

### Storage Resource

A specialized resource that manages file storage operations including upload, download, and metadata management through S3-compatible APIs.

### File Validation

Built-in file type validation ensures that uploaded files match their declared MIME types, providing security against file type spoofing.

### Stream Processing

Efficient handling of file streams allows for processing large files without excessive memory usage.

### Bucket Configuration

Support for multiple storage buckets with different configurations for organizing files by purpose or security level.

## API Reference

### Types

#### `StoredRecord`
Interface for stored file records extending ResourceRecord.

```typescript
interface StoredRecord extends ResourceRecord {
  url?: string                    // File URL for access
  size?: number                   // File size in bytes
  prefix: string                  // Storage prefix/path
  stream?: Readable               // File stream for upload
  format?: StoredFileFormat       // File format information
  type?: string                   // MIME type
  bytes?: Uint8Array             // File bytes (alternative to stream)
  base64?: string                // Base64 encoded file data
}
```

#### `StorageConfig`
Configuration for storage bucket access.

```typescript
interface StorageConfig {
  url: string          // Storage service URL
  apiKey: string       // API key in format "keyId:keySecret"
  basePrefix: string   // Base prefix for all files in this bucket
}
```

#### `StorageResource`
Resource interface for storage operations.

```typescript
interface StorageResource extends Resource<StoredRecord> {
  // Inherits all Resource methods for CRUD operations
  // Specialized for file storage with validation
}
```

#### `StoredConfigAppend`
Configuration extension for storage bucket definitions.

```typescript
interface StoredConfigAppend {
  storageBuckets: { [key: string]: StorageConfig }
}
```

### Factory Functions

#### `createStorageResource(alias?: string, configKey?: string): StorageResource`

Creates a storage resource instance with S3-compatible operations.

**Parameters:**
- `alias` (optional): Resource alias (default: `DEFAULT_ALIAS`)
- `configKey` (optional): Configuration key for bucket selection (defaults to alias)

**Returns:** StorageResource instance

**Features:**
- File upload with type validation
- Stream processing for efficient memory usage
- S3-compatible storage operations
- Automatic file type detection
- Error handling for storage operations

**Example:**
```typescript
import { createStorageResource } from '@owlmeans/storage-resource'

const storageResource = createStorageResource('files', 'main-bucket')

// Use with context
context.registerResource(storageResource)
await context.configure().init()

// Upload file
const uploadedFile = await storageResource.create({
  stream: fileStream,
  size: fileSize,
  type: 'image/jpeg',
  prefix: 'uploads/images'
})
```

### Storage Operations

#### File Upload

Upload files with validation and type checking:

```typescript
const fileRecord = {
  stream: fileStream,           // Readable stream
  size: fileSize,              // File size in bytes
  type: 'image/jpeg',          // Expected MIME type
  prefix: 'uploads/avatars'    // Storage prefix
}

try {
  const storedFile = await storageResource.create(fileRecord)
  console.log(`File uploaded: ${storedFile.url}`)
} catch (error) {
  if (error instanceof FileTypeError) {
    // Handle file type mismatch
  } else if (error instanceof FileStreamError) {
    // Handle stream errors
  }
}
```

#### File Retrieval

Retrieve file metadata and URLs:

```typescript
// Get file by ID
const file = await storageResource.get(fileId)
console.log(`File URL: ${file.url}`)

// Search files by prefix
const files = await storageResource.list({
  filter: { prefix: 'uploads/images' }
})
```

### Error Handling

The package provides specific error types for storage operations:

#### `FileStreamError`
Thrown when file stream is missing or invalid.

```typescript
if (record.stream == null) {
  throw new FileStreamError('no')
}
```

#### `FilePropertyError`
Thrown when required file properties are missing.

```typescript
if (record.size == null) {
  throw new FilePropertyError('size')
}
```

#### `FileTypeError`
Thrown when file type doesn't match declared MIME type.

```typescript
if (type?.mime !== record.type) {
  throw new FileTypeError('mime-mismatch')
}
```

#### `StorageApiError`
Thrown when storage API operations fail.

### Constants

#### `DEFAULT_ALIAS`
Default alias for storage resources.

```typescript
const DEFAULT_ALIAS = 'storage'
```

## Usage Examples

### Basic Storage Setup

```typescript
import { createStorageResource } from '@owlmeans/storage-resource'
import { makeServerContext } from '@owlmeans/server-context'

// Configure server context with storage buckets
const context = makeServerContext({
  service: 'file-service',
  type: AppType.Backend,
  layer: Layer.Service,
  storageBuckets: {
    'main': {
      url: 'my-bucket.s3.amazonaws.com',
      apiKey: 'AKIAIOSFODNN7EXAMPLE:wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      basePrefix: 'files'
    }
  }
})

// Create and register storage resource
const storageResource = createStorageResource('storage', 'main')
context.registerResource(storageResource)

await context.configure().init()

// Storage resource is now ready for use
```

### File Upload with Validation

```typescript
import { Readable } from 'stream'

const uploadFile = async (fileBuffer: Buffer, mimeType: string, filename: string) => {
  const fileStream = Readable.from(fileBuffer)
  
  try {
    const uploadedFile = await storageResource.create({
      stream: fileStream,
      size: fileBuffer.length,
      type: mimeType,
      prefix: `uploads/${new Date().getFullYear()}`
    })
    
    return {
      id: uploadedFile.id,
      url: uploadedFile.url,
      size: uploadedFile.size
    }
  } catch (error) {
    if (error instanceof FileTypeError) {
      throw new Error('File type mismatch - uploaded file doesn\'t match declared type')
    } else if (error instanceof FilePropertyError) {
      throw new Error('Missing required file properties')
    } else {
      throw new Error('File upload failed')
    }
  }
}
```

### Multiple Storage Buckets

```typescript
const context = makeServerContext({
  service: 'multi-storage-app',
  storageBuckets: {
    'public': {
      url: 'public-bucket.s3.amazonaws.com',
      apiKey: 'public-key:public-secret',
      basePrefix: 'public'
    },
    'private': {
      url: 'private-bucket.s3.amazonaws.com', 
      apiKey: 'private-key:private-secret',
      basePrefix: 'private'
    }
  }
})

// Create resources for different buckets
const publicStorage = createStorageResource('public-storage', 'public')
const privateStorage = createStorageResource('private-storage', 'private')

context.registerResource(publicStorage)
context.registerResource(privateStorage)

await context.configure().init()

// Upload to public bucket
const publicFile = await publicStorage.create({
  stream: publicFileStream,
  size: fileSize,
  type: 'image/jpeg',
  prefix: 'avatars'
})

// Upload to private bucket
const privateFile = await privateStorage.create({
  stream: privateFileStream,
  size: fileSize,
  type: 'application/pdf',
  prefix: 'documents'
})
```

### File Type Validation

```typescript
const uploadWithValidation = async (fileStream: Readable, declaredType: string, size: number) => {
  try {
    const result = await storageResource.create({
      stream: fileStream,
      size: size,
      type: declaredType,
      prefix: 'validated-uploads'
    })
    
    console.log('File upload successful with type validation')
    return result
  } catch (error) {
    if (error instanceof FileTypeError) {
      console.error('File type validation failed - file content doesn\'t match declared MIME type')
      throw error
    }
    throw error
  }
}

// Example usage
const jpegStream = fs.createReadStream('image.jpg')
await uploadWithValidation(jpegStream, 'image/jpeg', jpegStats.size)
```

### Alternative Upload Methods

```typescript
// Upload from bytes
const uploadFromBytes = async (bytes: Uint8Array, type: string) => {
  const stream = Readable.from(Buffer.from(bytes))
  
  return await storageResource.create({
    stream: stream,
    size: bytes.length,
    type: type,
    prefix: 'byte-uploads'
  })
}

// Upload from base64
const uploadFromBase64 = async (base64Data: string, type: string) => {
  const buffer = Buffer.from(base64Data, 'base64')
  const stream = Readable.from(buffer)
  
  return await storageResource.create({
    stream: stream,
    size: buffer.length,
    type: type,
    prefix: 'base64-uploads'
  })
}
```

### File Retrieval and Management

```typescript
// Get file metadata
const getFileInfo = async (fileId: string) => {
  const file = await storageResource.get(fileId)
  
  return {
    id: file.id,
    url: file.url,
    size: file.size,
    type: file.type,
    prefix: file.prefix
  }
}

// List files by prefix
const listFilesByPrefix = async (prefix: string) => {
  const files = await storageResource.list({
    filter: { prefix: prefix }
  })
  
  return files.map(file => ({
    id: file.id,
    url: file.url,
    size: file.size
  }))
}

// Delete file
const deleteFile = async (fileId: string) => {
  await storageResource.remove(fileId)
}
```

## Configuration

### Storage Bucket Configuration

Configure storage buckets in your server configuration:

```typescript
interface ServerConfig {
  // ... other configuration
  storageBuckets: {
    [bucketAlias: string]: {
      url: string          // S3 endpoint URL
      apiKey: string       // Access key ID and secret key separated by ':'
      basePrefix: string   // Base prefix for all files
    }
  }
}
```

### Environment Variables

Typical environment-based configuration:

```typescript
const config = {
  storageBuckets: {
    main: {
      url: process.env.S3_BUCKET_URL,
      apiKey: `${process.env.S3_ACCESS_KEY}:${process.env.S3_SECRET_KEY}`,
      basePrefix: process.env.S3_BASE_PREFIX || 'files'
    }
  }
}
```

## Security Considerations

### File Type Validation
- Always validate file types to prevent malicious uploads
- Use MIME type detection from file content, not just extensions
- Implement file size limits to prevent abuse

### Access Control
- Use separate buckets for different security levels
- Implement proper API key management and rotation
- Consider signed URLs for temporary access

### Storage Security
- Use HTTPS for all storage operations
- Implement proper bucket policies and access controls
- Monitor storage access and usage patterns

## Performance Considerations

- **Stream Processing**: Use streams for large files to minimize memory usage
- **File Size Limits**: Implement appropriate file size limits
- **Concurrent Uploads**: Consider rate limiting for multiple concurrent uploads
- **CDN Integration**: Use CDN for frequently accessed files

## Integration with OwlMeans Ecosystem

This package integrates with:

- **@owlmeans/resource**: Base resource management patterns
- **@owlmeans/server-context**: Server context and configuration
- **@owlmeans/storage-common**: Shared storage utilities and errors

## Best Practices

1. **Validate file types** always from content, not just filename
2. **Use appropriate prefixes** to organize files logically
3. **Implement file size limits** to prevent abuse
4. **Handle errors gracefully** with specific error types
5. **Use separate buckets** for different security levels
6. **Monitor storage usage** and implement cleanup policies

## Related Packages

- **@owlmeans/storage-common**: Storage utilities and error types
- **@owlmeans/resource**: Base resource management
- **@owlmeans/server-context**: Server context management

## AWS S3 Compatibility

This package works with:
- **AWS S3**: Native Amazon S3 service
- **MinIO**: Self-hosted S3-compatible storage
- **DigitalOcean Spaces**: S3-compatible cloud storage
- **Other S3-compatible services**: Any service implementing S3 API
