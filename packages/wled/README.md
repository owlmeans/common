# @owlmeans/wled

Base types and module declarations for the OwlMeans Common Whitelabeling Subsystem.

## Overview

The `@owlmeans/wled` package provides foundational types, constants, models, and modules for implementing whitelabeling functionality in OwlMeans applications. It serves as the core library for the OwlMeans Common Whitelabeling Subsystem, enabling applications to customize their appearance and branding dynamically.

### Key Features

- **Company Information Management** - Define and manage company branding details
- **Custom Styling System** - Support for custom colors, fonts, and visual styling
- **Media Management** - Handle custom brand assets like logos and media
- **Validation Schemas** - AJV-based schemas for consistent data validation
- **Route Integration** - Module definitions for whitelabeling API endpoints
- **Type Safety** - Comprehensive TypeScript interfaces and types

## Core Concepts

### Whitelabeling Types

The package defines several core types for whitelabeling:

- **CompanyInfo** - Basic company information including name, slug, and description
- **CustomStyles** - Visual styling configuration with colors and fonts
- **CustomMedia** - Brand assets like logos and media files
- **CustomUrls** - Custom URL configurations for different environments

### Provider System

The whitelabeling system uses a provider pattern where different types of whitelabeling data (company info, styles, media, DNS) can be requested and provided through a unified interface.

### Validation Integration

All data structures include corresponding AJV validation schemas, ensuring consistent validation across both frontend and backend implementations in fullstack applications.

## Installation

```bash
npm install @owlmeans/wled
```

## API Reference

### Types

#### CompanyInfo
Interface for company information in whitelabeling.

```typescript
interface CompanyInfo {
  resource?: string     // Optional resource identifier
  entityId: string      // Unique entity identifier
  fullName: string      // Full company name
  shortName: string     // Abbreviated company name
  slug: string          // URL-friendly identifier
  description: string   // Company description
}
```

#### CustomStyles
Interface for custom styling configuration.

```typescript
interface CustomStyles {
  resource?: string     // Optional resource identifier
  entityId: string      // Unique entity identifier
  font: CustomFont      // Font configuration
  colors: CustomColors  // Color palette
}
```

#### CustomColors
Interface for custom color configuration.

```typescript
interface CustomColors {
  primaryColor: string           // Primary brand color (required)
  secondaryColor?: string        // Secondary brand color
  alertColor?: string            // Alert/error color
  successColor?: string          // Success color
  primaryBackground?: string     // Primary background color
  secondaryBackground?: string   // Secondary background color
  alertBackground?: string       // Alert background color
  successBackground?: string     // Success background color
}
```

#### CustomFont
Interface for custom font configuration.

```typescript
interface CustomFont {
  fontFamily: string    // Font family name
  basicSize?: number    // Base font size (minimum 8)
}
```

#### CustomMedia
Interface for custom media assets.

```typescript
interface CustomMedia {
  brand: CustomBrand    // Brand asset configuration
}
```

#### CustomBrand
Interface for brand asset configuration.

```typescript
interface CustomBrand {
  squareLogo?: string   // Square logo URL or path
  wideLogo?: string     // Wide/horizontal logo URL or path
}
```

#### CustomUrls
Interface for custom URL configuration.

```typescript
interface CustomUrls {
  adminUrl: string      // Admin panel URL
  userUrl: string       // User interface URL
}
```

#### ProvideParams
Interface for provider request parameters.

```typescript
interface ProvideParams {
  entity: string        // Entity identifier to provide data for
}
```

#### ProvidedWL
Generic interface for provided whitelabeling data.

```typescript
type ProvidedWL<T extends {} = {}> = T & {
  type: string          // Type identifier for the provided data
  exists: boolean | null // Whether the data exists
}
```

### Constants

#### Route Constants
Constants for whitelabeling routes.

```typescript
const WL_PROVIDE = 'wl-provide'                    // Route alias
const WL_PROVIDE_PATH = '/wl/provide/:entity'      // Route path pattern
```

#### Type Constants
Constants for whitelabeling data types.

```typescript
const WL_TYPE_COMPANY_INFO = 'company-info'        // Company information type
const WL_TYPE_STYLES = 'styles'                    // Styling configuration type
const WL_TYPE_MEDIA = 'media'                      // Media assets type
const WL_TYPE_DNS = 'dns'                          // DNS configuration type
```

### Validation Schemas

The package includes AJV validation schemas for all data structures, ensuring consistent validation across fullstack applications.

#### CompanyInfoSchema
AJV schema for validating CompanyInfo data.

```typescript
const CompanyInfoSchema: JSONSchemaType<CompanyInfo> = {
  type: 'object',
  properties: {
    resource: { type: 'string', minLength: 0, nullable: true },
    entityId: { type: 'string', minLength: 1 },
    fullName: { type: 'string', minLength: 1, maxLength: 128 },
    shortName: { type: 'string', minLength: 0, maxLength: 32 },
    slug: { type: 'string', minLength: 0 },
    description: { type: 'string', minLength: 0, maxLength: 512 }
  },
  required: ['entityId', 'fullName', 'shortName', 'slug', 'description'],
  additionalProperties: false
}
```

#### CustomStylesSchema
AJV schema for validating CustomStyles data.

```typescript
const CustomStylesSchema: JSONSchemaType<CustomStyles> = {
  type: 'object',
  properties: {
    resource: { type: 'string', minLength: 0, nullable: true },
    entityId: { type: 'string', minLength: 1 },
    font: CustomFontSchema,
    colors: CustomColorsSchema
  },
  required: ['entityId', 'font', 'colors'],
  additionalProperties: false
}
```

#### CustomColorsSchema
AJV schema for validating CustomColors data.

```typescript
const CustomColorsSchema: JSONSchemaType<CustomColors> = {
  type: 'object',
  properties: {
    primaryColor: { type: 'string', pattern: '^#(\\d|[a-fA-F]){3,8}$' },
    secondaryColor: { type: 'string', pattern: '^#(\\d|[a-fA-F]){3,8}$', nullable: true },
    // ... other color properties with hex color validation
  },
  required: ['primaryColor'],
  additionalProperties: false
}
```

#### CustomFontSchema
AJV schema for validating CustomFont data.

```typescript
const CustomFontSchema: JSONSchemaType<CustomFont> = {
  type: 'object',
  properties: {
    fontFamily: { type: 'string', minLength: 0, maxLength: 128 },
    basicSize: { type: 'number', minimum: 8, nullable: true }
  },
  required: ['fontFamily'],
  additionalProperties: false
}
```

#### ProvideParamsSchema
AJV schema for validating ProvideParams data.

```typescript
const ProvideParamsSchema: JSONSchemaType<ProvideParams> = {
  type: 'object',
  properties: {
    entity: { type: 'string', minLength: 1 }
  },
  required: ['entity'],
  additionalProperties: false
}
```

### Modules

#### Whitelabeling Provider Module
Pre-configured module for handling whitelabeling data provision.

```typescript
import { modules } from '@owlmeans/wled'

// The package exports a pre-configured module array
const modules = [
  module(
    route(WL_PROVIDE, WL_PROVIDE_PATH, backend()),
    filter(params(ProvideParamsSchema))
  )
]
```

This module provides:
- Route configuration for `/wl/provide/:entity` endpoint
- Parameter validation using the ProvideParamsSchema
- Backend route configuration

## Usage Examples

### Basic Company Information

```typescript
import { CompanyInfo, WL_TYPE_COMPANY_INFO } from '@owlmeans/wled'

// Create company information
const companyInfo: CompanyInfo = {
  entityId: 'company-123',
  fullName: 'Example Corporation',
  shortName: 'ExampleCorp',
  slug: 'example-corp',
  description: 'A leading technology company'
}

// Use with provider system
const providedCompanyInfo: ProvidedWL<CompanyInfo> = {
  ...companyInfo,
  type: WL_TYPE_COMPANY_INFO,
  exists: true
}
```

### Custom Styling Configuration

```typescript
import { CustomStyles, CustomColors, CustomFont, WL_TYPE_STYLES } from '@owlmeans/wled'

// Define custom colors
const customColors: CustomColors = {
  primaryColor: '#007bff',
  secondaryColor: '#6c757d',
  alertColor: '#dc3545',
  successColor: '#28a745',
  primaryBackground: '#ffffff',
  secondaryBackground: '#f8f9fa'
}

// Define custom font
const customFont: CustomFont = {
  fontFamily: 'Inter, sans-serif',
  basicSize: 14
}

// Create custom styles
const customStyles: CustomStyles = {
  entityId: 'company-123',
  font: customFont,
  colors: customColors
}

// Use with provider system
const providedStyles: ProvidedWL<CustomStyles> = {
  ...customStyles,
  type: WL_TYPE_STYLES,
  exists: true
}
```

### Media Assets Configuration

```typescript
import { CustomMedia, CustomBrand, WL_TYPE_MEDIA } from '@owlmeans/wled'

// Define brand assets
const customBrand: CustomBrand = {
  squareLogo: '/assets/logo-square.png',
  wideLogo: '/assets/logo-wide.png'
}

// Create media configuration
const customMedia: CustomMedia = {
  brand: customBrand
}

// Use with provider system
const providedMedia: ProvidedWL<CustomMedia> = {
  ...customMedia,
  type: WL_TYPE_MEDIA,
  exists: true
}
```

### Module Integration

```typescript
import { modules } from '@owlmeans/wled'
import { context } from '@owlmeans/context'

// Add whitelabeling modules to your application context
context.modules.push(...modules)

// The modules will handle requests to /wl/provide/:entity
// with proper parameter validation
```

## Integration Patterns

### Backend Integration

```typescript
import { modules, ProvideParams, CompanyInfo, WL_TYPE_COMPANY_INFO } from '@owlmeans/wled'

// Register the whitelabeling provider module
app.use(modules)

// Implement handler for whitelabeling data provision
const handleProvideWL = async (params: ProvideParams) => {
  const { entity } = params
  
  // Fetch company information for the entity
  const companyInfo = await getCompanyInfo(entity)
  
  if (companyInfo) {
    return {
      ...companyInfo,
      type: WL_TYPE_COMPANY_INFO,
      exists: true
    }
  }
  
  return {
    type: WL_TYPE_COMPANY_INFO,
    exists: false
  }
}
```

### Frontend Integration

```typescript
import { ProvideParams, ProvidedWL, CompanyInfo, WL_TYPE_COMPANY_INFO } from '@owlmeans/wled'

// Fetch whitelabeling data from the provider endpoint
const fetchWhitelabelingData = async (entity: string): Promise<ProvidedWL<CompanyInfo>> => {
  const response = await fetch(`/wl/provide/${entity}`)
  return response.json()
}

// Use in React component
const WhitelabeledHeader = ({ entity }: { entity: string }) => {
  const [companyInfo, setCompanyInfo] = useState<ProvidedWL<CompanyInfo> | null>(null)
  
  useEffect(() => {
    fetchWhitelabelingData(entity).then(setCompanyInfo)
  }, [entity])
  
  if (!companyInfo?.exists) {
    return <DefaultHeader />
  }
  
  return (
    <header>
      <h1>{companyInfo.fullName}</h1>
      <p>{companyInfo.description}</p>
    </header>
  )
}
```

### Multi-Type Provider Implementation

```typescript
import { 
  ProvideParams, 
  ProvidedWL, 
  CompanyInfo, 
  CustomStyles, 
  CustomMedia,
  WL_TYPE_COMPANY_INFO,
  WL_TYPE_STYLES,
  WL_TYPE_MEDIA
} from '@owlmeans/wled'

// Generic provider that can handle different types
const provideWhitelabelingData = async (
  entity: string, 
  type: string
): Promise<ProvidedWL<any>> => {
  switch (type) {
    case WL_TYPE_COMPANY_INFO:
      return await provideCompanyInfo(entity)
    case WL_TYPE_STYLES:
      return await provideCustomStyles(entity)
    case WL_TYPE_MEDIA:
      return await provideCustomMedia(entity)
    default:
      return { type, exists: false }
  }
}
```

## Best Practices

1. **Consistent Validation** - Always use the provided AJV schemas to validate data on both frontend and backend
2. **Type Safety** - Leverage TypeScript interfaces to ensure type safety throughout your application
3. **Resource Management** - Use the optional `resource` field to track data sources and manage resources
4. **Error Handling** - Always check the `exists` property in `ProvidedWL` responses before using the data
5. **Hex Color Validation** - The color schemas enforce hex color format with proper validation patterns
6. **Font Size Constraints** - Ensure font sizes meet the minimum requirement (8) when specified
7. **Entity Identification** - Use consistent entity identifiers across all whitelabeling data types

## Dependencies

This package depends on:
- `@owlmeans/auth` - For authentication and entity validation schemas
- `@owlmeans/module` - For module creation and filtering
- `@owlmeans/route` - For route configuration
- `ajv` - For JSON schema validation (peer dependency)

## Related Packages

- `@owlmeans/client-wl` - Client-side whitelabeling implementations
- `@owlmeans/server-wl` - Server-side whitelabeling implementations
- `@owlmeans/web-wl` - Web-specific whitelabeling components