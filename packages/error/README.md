# @owlmeans/error

A fully typed error system for seamless error handling between backend and frontend, allowing errors to be marshaled/unmarshaled while preserving type information across network boundaries.

## Overview

The `@owlmeans/error` package provides a robust error handling system that enables type-safe error propagation between server and client applications. The core concept revolves around the `ResilientError` class, which can be:

- **Marshaled** (serialized) on the server side
- **Transmitted** over the network as regular Error objects  
- **Unmarshaled** (deserialized) on the client side back to the same typed error class

This ensures that error handling remains consistent and type-safe across the entire application stack.

## Installation

```bash
npm install @owlmeans/error
```

## Core Concepts

### ResilientError Class

The `ResilientError` class is the foundation of the error system. It extends the standard JavaScript `Error` class and provides additional functionality for marshaling, unmarshaling, and type conversion.

### Error Conversion System

The package includes a flexible converter system that allows registration of custom error types and their conversion logic through the `Converter` interface.

### Marshaling & Unmarshaling

- **Marshaling**: Converting a ResilientError into a transferable format
- **Unmarshaling**: Reconstructing a ResilientError from its marshaled form

## API Reference

### ResilientError Class

#### Properties

- `type: string` - The error type identifier
- `originalStack?: string` - The original stack trace when the error was created

#### Static Properties

- `separator: string` - The separator used in marshaled error messages (default: `'|||'`)
- `typeName: string` - The default type name for ResilientError instances (default: `'ResilientError'`)
- `converters: Converter[]` - Array of registered error converters

#### Static Methods

##### `registerErrorClass(resilientErrorClass, errorClass?)`

Registers a custom error class with the converter system.

**Parameters:**
- `resilientErrorClass: ResilientErrorConstructor` - The ResilientError subclass to register
- `errorClass?: ErrorConstructor` - Optional native Error class to convert from

**Returns:** `Converter` - The created converter instance

**Example:**
```typescript
class CustomError extends ResilientError {
  static typeName = 'CustomError'
}

ResilientError.registerErrorClass(CustomError, TypeError)
```

##### `ensure(err, throwOnUnknown?)`

Ensures an error is converted to a ResilientError instance.

**Parameters:**
- `err: Error | string` - The error to convert
- `throwOnUnknown?: boolean` - Whether to throw on unknown error types (default: false)

**Returns:** `ResilientError` - The converted error

**Example:**
```typescript
const resilientError = ResilientError.ensure(new Error('Something went wrong'))
const typedError = ResilientError.ensure('Error message')
```

##### `marshal(err)`

Marshals an error for network transmission.

**Parameters:**
- `err: Error` - The error to marshal

**Returns:** `Error` - A marshaled error object

**Example:**
```typescript
const original = new ResilientError('CustomError', 'Something failed')
const marshaled = ResilientError.marshal(original)
// marshaled.message contains: "CustomError|||Something failed|||[stack trace]"
```

#### Instance Methods

##### `marshal()`

Marshals the current error instance.

**Returns:** `Error` - A marshaled error object

**Example:**
```typescript
const error = new ResilientError('MyError', 'Description')
const marshaled = error.marshal()
```

##### `finalizeUnmarshal()`

Called after unmarshaling to perform any post-processing. Override in subclasses for custom behavior.

**Returns:** `void`

#### Constructor

```typescript
constructor(type: string, message: string, stack?: string)
constructor(message: string, stack?: string)
```

**Parameters:**
- `type: string` - The error type identifier
- `message: string` - The error message
- `stack?: string` - Optional stack trace

**Example:**
```typescript
const error1 = new ResilientError('ValidationError', 'Invalid input')
const error2 = new ResilientError('Network error') // uses default type
```

### Helper Functions

#### `enuserError<T>(err, throwOnUnknown?)`

Convenience function that ensures an error is a ResilientError instance.

**Parameters:**
- `err: Error | string` - The error to ensure
- `throwOnUnknown?: boolean` - Whether to throw on unknown error types

**Returns:** `T extends ResilientError` - The ensured error

**Example:**
```typescript
import { enuserError } from '@owlmeans/error'

const resilientError = enuserError(new Error('Something went wrong'))
const typedError = enuserError<MyCustomError>(someError)
```

#### `marshalError(err)`

Convenience function that marshals an error after ensuring it's a ResilientError.

**Parameters:**
- `err: Error | string` - The error to marshal

**Returns:** `Error` - The marshaled error

**Example:**
```typescript
import { marshalError } from '@owlmeans/error'

const marshaled = marshalError(new Error('Server error'))
```

### Utility Functions

#### `createErrorConverter(resilientErrorClass, errorClass?)`

Creates a converter for transforming native errors to ResilientError instances.

**Parameters:**
- `resilientErrorClass: ResilientErrorConstructor` - The target ResilientError class
- `errorClass?: ErrorConstructor` - Optional source Error class to match against

**Returns:** `Converter` - The created converter

**Example:**
```typescript
import { createErrorConverter } from '@owlmeans/error'

const converter = createErrorConverter(MyResilientError, TypeError)
ResilientError.converters.push(converter)
```

#### `unmarshal<T>(errorClass)`

Creates an unmarshaling function for a specific error class.

**Parameters:**
- `errorClass: ResilientErrorConstructor` - The error class to unmarshal to

**Returns:** `(err: Error) => T` - Function that unmarshals errors to the specified type

**Example:**
```typescript
import { unmarshal } from '@owlmeans/error'

const unmarshalMyError = unmarshal(MyResilientError)
const restored = unmarshalMyError(marshaledError)
```

### Type Definitions

#### `ValueOrError<T>`

A utility type that represents either a value or a ResilientError.

```typescript
type ValueOrError<T> = T | ResilientError
```

**Example:**
```typescript
function processData(): ValueOrError<string> {
  if (someCondition) {
    return "success"
  }
  return new ResilientError('ProcessingError', 'Failed to process')
}
```

#### `Converter`

Interface for error conversion logic.

```typescript
interface Converter {
  match: (err: Error) => boolean
  convert: (err: Error) => ResilientError
  isMarshaled: (err: Error) => boolean
  unmarshal: (err: Error) => ResilientError
}
```

**Methods:**
- `match(err)` - Determines if the converter can handle the error
- `convert(err)` - Converts the error to a ResilientError
- `isMarshaled(err)` - Checks if the error is in marshaled form
- `unmarshal(err)` - Unmarshals the error back to ResilientError

#### `ResilientErrorConstructor<T>`

Constructor interface for ResilientError classes.

```typescript
interface ResilientErrorConstructor<T extends ResilientError = ResilientError> {
  new (type: string, message: string, stack?: string): T
  new (message: string, stack?: string): T
  typeName: string
}
```

### Constants

#### `SEPARATOR`

The default separator used in marshaled error messages.

```typescript
const SEPARATOR = '|||'
```

#### `RESILIENT_ERROR`

The default type name for ResilientError instances.

```typescript
const RESILIENT_ERROR = 'ResilientError'
```

## Usage Examples

### Basic Error Handling

```typescript
import { ResilientError, enuserError } from '@owlmeans/error'

// Create a resilient error
const error = new ResilientError('ValidationError', 'Invalid email format')

// Ensure any error is resilient
const resilientError = enuserError(new Error('Something went wrong'))
```

### Custom Error Types

```typescript
import { ResilientError } from '@owlmeans/error'

class ValidationError extends ResilientError {
  static typeName = 'ValidationError'
  
  constructor(field: string, message: string) {
    super(ValidationError.typeName, `${field}: ${message}`)
  }
}

// Register the custom error type
ResilientError.registerErrorClass(ValidationError)
```

### Network Error Transmission

```typescript
import { ResilientError, marshalError, enuserError } from '@owlmeans/error'

// Server side - marshal error for transmission
function handleServerError(error: Error) {
  const marshaled = marshalError(error)
  return { error: marshaled.message }
}

// Client side - unmarshal received error
function handleClientError(errorMessage: string) {
  const error = new Error(errorMessage)
  const resilientError = enuserError(error)
  return resilientError
}
```

### Error Conversion System

```typescript
import { ResilientError, createErrorConverter } from '@owlmeans/error'

class NetworkError extends ResilientError {
  static typeName = 'NetworkError'
}

// Register converter for fetch errors
const converter = createErrorConverter(NetworkError, TypeError)
ResilientError.converters.push(converter)

// Now TypeError instances will be automatically converted
const converted = ResilientError.ensure(new TypeError('Network failure'))
// converted will be a NetworkError instance
```

### Working with ValueOrError

```typescript
import { ValueOrError, ResilientError } from '@owlmeans/error'

function fetchUserData(id: string): ValueOrError<User> {
  try {
    // Simulate API call
    return { id, name: 'John Doe' }
  } catch (error) {
    return new ResilientError('FetchError', 'Failed to fetch user')
  }
}

const result = fetchUserData('123')
if (result instanceof ResilientError) {
  console.error('Error:', result.message)
} else {
  console.log('User:', result.name)
}
```

## Best Practices

1. **Define Custom Error Types**: Create specific error classes for different error categories
2. **Register Error Classes**: Use `registerErrorClass()` to enable automatic conversion
3. **Use Helper Functions**: Leverage `enuserError()` and `marshalError()` for common operations
4. **Implement finalizeUnmarshal()**: Override in custom error classes for post-processing
5. **Type Safety**: Use `ValueOrError<T>` type for functions that may return errors

## Integration with OwlMeans Common

This package integrates with the broader OwlMeans Common library ecosystem, following the established patterns for:
- **Types**: Error-related type definitions
- **Helpers**: Utility functions for error handling
- **Service**: Domain-specific error handling logic
- **i18n**: Internationalization support for error messages

The error system is designed to work seamlessly across different OwlMeans packages including server, client, and web implementations.