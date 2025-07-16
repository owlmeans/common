# OwlMeans I18n — Common Library

**@owlmeans/i18n** is a core implementation of the OwlMeans Common Internationalization Subsystem. It provides a flexible, multi-level translation system designed to work across different application contexts with namespace-based organization and priority-based resource loading.

## Installation

```bash
npm install @owlmeans/i18n
```

## Core Concepts

### Translation Levels
The i18n system supports three levels of translations with different priorities:
- **Library Level**: Lowest priority, used for basic library translations
- **App Level**: Medium priority, used for application-specific translations  
- **Service Level**: Highest priority, used for service-specific overrides

### Namespaces
Translations are organized into namespaces to avoid conflicts:
- `translation` - Default namespace for general translations
- `lib` - Library-specific translations
- `service` - Service-specific translations
- Custom namespaces can be defined as needed

### Resources
Each translation resource represents a collection of translations for a specific language and context, with optional priority settings for ordering.

## API Reference

### Types

#### `I18nStorage`
Main storage interface for the i18n system.
```typescript
interface I18nStorage {
  data: I18nNamespaces
}
```

#### `I18nNamespaces`
Collection of namespaces, each containing resources.
```typescript
interface I18nNamespaces extends Record<string, I18nResources> { }
```

#### `I18nResources`
Collection of resources within a namespace.
```typescript
interface I18nResources extends Record<string, I18nLanguages> { }
```

#### `I18nLanguages`
Language-specific data containing resources and initialization status.
```typescript
interface I18nLanguages extends Record<string, {
  resources: I18nResource[],
  lngInitialized: string[]
}> { }
```

#### `I18nResource`
Individual translation resource with metadata.
```typescript
interface I18nResource {
  ns?: string          // Namespace (optional)
  lng?: string         // Language code (optional)
  level: I18nLevel     // Translation level
  resource: string     // Resource identifier
  priority?: number    // Priority for ordering (optional)
  data: Record<string, any>  // Translation data
}
```

#### `I18nResourceOptions`
Options for resource operations.
```typescript
interface I18nResourceOptions {
  priroty?: number     // Priority for resource ordering (note: typo in source)
  ns?: string          // Namespace override
}
```

#### `I18nConfig`
Configuration interface for the i18n system.
```typescript
interface I18nConfig {
  defaultLng?: string  // Default language code
  defaultNs?: string   // Default namespace
}
```

#### `I18nLevel`
Enumeration of translation levels.
```typescript
enum I18nLevel {
  Library = 'library',
  App = 'app', 
  Service = 'service'
}
```

### Functions

#### `addI18nLib(lng, resource, data, opts?)`
Add library-level translations.
```typescript
function addI18nLib(
  lng: string,                              // Language code
  resource: string,                         // Resource identifier
  data: Record<string, any>,                // Translation data
  opts?: I18nResourceOptions | string       // Options or namespace
): void
```

**Example:**
```typescript
import { addI18nLib } from '@owlmeans/i18n'

addI18nLib('en', 'common', {
  'button.save': 'Save',
  'button.cancel': 'Cancel'
})
```

#### `addI18nApp(lng, resource, data, opts?)`
Add application-level translations.
```typescript
function addI18nApp(
  lng: string,                              // Language code
  resource: string,                         // Resource identifier  
  data: Record<string, any>,                // Translation data
  opts?: I18nResourceOptions | string       // Options or namespace
): void
```

**Example:**
```typescript
import { addI18nApp } from '@owlmeans/i18n'

addI18nApp('en', 'user-profile', {
  'title': 'User Profile',
  'form.username': 'Username',
  'form.email': 'Email Address'
})
```

#### `addCommonI18n(lng, resource, data, opts?)`
Add service-level translations (highest priority).
```typescript
function addCommonI18n(
  lng: string,                              // Language code
  resource: string,                         // Resource identifier
  data: Record<string, any>,                // Translation data  
  opts?: I18nResourceOptions | string       // Options or namespace
): void
```

**Example:**
```typescript
import { addCommonI18n } from '@owlmeans/i18n'

addCommonI18n('en', 'api-messages', {
  'error.unauthorized': 'Access denied',
  'error.notfound': 'Resource not found'
})
```

#### `initI18nResource(lng, resource, ns?)`
Initialize translation resources for a specific language and resource.
```typescript
function initI18nResource(
  lng: string,                              // Language code
  resource: string,                         // Resource identifier
  ns?: string                               // Namespace (optional)
): null | I18nResource[]
```

Returns `null` if the resource is already initialized, or an array of `I18nResource` objects sorted by level and priority.

**Example:**
```typescript
import { initI18nResource } from '@owlmeans/i18n'

const resources = initI18nResource('en', 'common')
if (resources) {
  // Process initialized resources
  resources.forEach(resource => {
    console.log(`Loading ${resource.level} level translations:`, resource.data)
  })
}
```

### Constants

#### `DEFAULT_NAMESPACE`
Default namespace for translations.
```typescript
const DEFAULT_NAMESPACE = 'translation'
```

#### `LIB_NAMESPACE`
Namespace for library translations.
```typescript
const LIB_NAMESPACE = 'lib'
```

#### `SRV_NAMESPACE`
Namespace for service translations.
```typescript
const SRV_NAMESPACE = 'service'
```

#### `DEFAULT_LNG`
Default language code.
```typescript
const DEFAULT_LNG = 'en'
```

#### `MAX_PRIORITY`
Maximum priority value for resource ordering.
```typescript
const MAX_PRIORITY = Number.MAX_SAFE_INTEGER
```

### Utils

The package also exports utility functions under the `/utils` subpackage:

```typescript
import { ensureStructure, levelCost } from '@owlmeans/i18n/utils'
```

#### `ensureStructure(lng, resource, ns?)`
Ensures the storage structure exists for the given language, resource, and namespace.
```typescript
function ensureStructure(
  lng: string,                              // Language code
  resource: string,                         // Resource identifier
  ns?: string                               // Namespace (optional)
): I18nLanguages[string]
```

#### `levelCost`
Mapping of translation levels to their priority costs:
```typescript
const levelCost = {
  [I18nLevel.Library]: 0,
  [I18nLevel.App]: 1,
  [I18nLevel.Service]: 2
}
```

#### `_OwlMeansI18nStorage`
Internal storage instance (use with caution):
```typescript
const _OwlMeansI18nStorage: I18nStorage
```

> **Note:** This is an internal storage variable. Direct manipulation is not recommended for normal usage.

## Usage Examples

### Basic Usage
```typescript
import { addI18nLib, addI18nApp, initI18nResource } from '@owlmeans/i18n'

// Add library translations
addI18nLib('en', 'common', {
  'yes': 'Yes',
  'no': 'No'
})

// Add app-specific translations
addI18nApp('en', 'common', {
  'yes': 'OK',  // This will override the library translation
  'save': 'Save Changes'
})

// Initialize resources (sorted by level and priority)
const resources = initI18nResource('en', 'common')
// resources will contain both library and app translations, with app taking priority
```

### Working with Namespaces
```typescript
import { addI18nLib, addI18nApp } from '@owlmeans/i18n'

// Add translations to specific namespace
addI18nLib('en', 'buttons', {
  'save': 'Save',
  'cancel': 'Cancel'
}, 'ui')

// Add with namespace in options
addI18nApp('en', 'forms', {
  'required': 'This field is required'
}, { ns: 'validation' })
```

### Priority-based Loading
```typescript
import { addI18nLib, addI18nApp, addCommonI18n } from '@owlmeans/i18n'

// Add translations with different priorities
addI18nLib('en', 'messages', { 'welcome': 'Welcome' })
addI18nApp('en', 'messages', { 'welcome': 'Welcome to App' })
addCommonI18n('en', 'messages', { 'welcome': 'Service Welcome' })

// When initialized, service translation will have highest priority
const resources = initI18nResource('en', 'messages')
// The 'welcome' key will resolve to 'Service Welcome'
```

## Integration with OwlMeans Common

This package follows the OwlMeans Common library structure:
- **types**: TypeScript interfaces and type definitions
- **consts**: Static values and constants
- **helper**: Consumer-facing utility functions
- **utils**: Internal utility functions for storage management

The i18n system is designed to integrate seamlessly with other OwlMeans Common packages and can be extended with custom resource loaders and translation providers.