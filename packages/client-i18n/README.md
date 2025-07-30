# @owlmeans/client-i18n

The **@owlmeans/client-i18n** package provides React-based internationalization functionality for OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as the client-side React integration layer for the OwlMeans i18n system that:

- **Integrates with React applications** using React Context and hooks
- **Provides React hooks for translations** with automatic resource loading
- **Supports dynamic resource loading** with automatic caching
- **Integrates with client context** for configuration-driven internationalization
- **Offers multi-level translation support** (library, app, service levels)
- **Enables namespace-based organization** for different translation contexts

## Core Concepts

### I18n Context Provider
A React Context Provider that initializes and manages the i18next instance for the entire React application, integrated with OwlMeans client configuration.

### Automatic Resource Loading
Translation resources are automatically loaded and registered with i18next when requested through hooks, with intelligent caching to prevent duplicate loading.

### Multi-Level Translation Hooks
Different hooks for accessing translations at different levels:
- Library-level translations (`useI18nLib`)
- Application-level translations (`useI18nApp`) 
- Service-level translations (`useCommonI18n`)

### Client Context Integration
Seamless integration with OwlMeans client context system for configuration-driven internationalization setup.

## API Reference

### Components

#### `I18nContext`

React Context Provider component that provides i18n functionality to the entire React application.

```typescript
import { I18nContext } from '@owlmeans/client-i18n'
import { ClientConfig } from '@owlmeans/client-context'

const App: React.FC = () => {
  const config = useClientConfig() // Your client configuration
  
  return (
    <I18nContext config={config}>
      <AppContent />
    </I18nContext>
  )
}
```

**Props:**
- `config`: ClientConfig - The client configuration object
- `children`: ReactNode - Child components

### Hooks

#### `useCommonI18n(resourceName, ns?, prefix?): TFunction`

Main hook for accessing translations with automatic resource loading.

```typescript
import { useCommonI18n } from '@owlmeans/client-i18n'

const MyComponent: React.FC = () => {
  const t = useCommonI18n('user-forms', 'ui', 'profile')
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </div>
  )
}
```

**Parameters:**
- `resourceName`: string - Name of the translation resource to load
- `ns`: string (optional) - Namespace for the translations (defaults to default namespace)
- `prefix`: string (optional) - Key prefix for translation lookups

**Returns:** `TFunction` - i18next translation function

**Behavior:**
- Automatically loads translation resources for the current language
- Caches loaded resources to prevent duplicate loading
- Falls back to default language if current language resources are not available
- Supports multi-level translation priority (service > app > library)

#### `useI18nLib(libName, prefix?): TFunction`

Hook for accessing library-level translations in the 'lib' namespace.

```typescript
import { useI18nLib } from '@owlmeans/client-i18n'

const LibraryComponent: React.FC = () => {
  const t = useI18nLib('common-ui', 'buttons')
  
  return (
    <button>{t('save')}</button>
  )
}
```

**Parameters:**
- `libName`: string - Name of the library translation resource
- `prefix`: string (optional) - Key prefix for translation lookups

**Returns:** `TFunction` - i18next translation function configured for library namespace

#### `useI18nApp(appName?, prefix?): TFunction`

Hook for accessing application-level translations using the service name from context.

```typescript
import { useI18nApp } from '@owlmeans/client-i18n'

const AppComponent: React.FC = () => {
  const t = useI18nApp(undefined, 'navigation')
  
  return (
    <nav>
      <a href="/">{t('home')}</a>
      <a href="/profile">{t('profile')}</a>
    </nav>
  )
}
```

**Parameters:**
- `appName`: string (optional) - Name of the app (defaults to service name from context)
- `prefix`: string (optional) - Key prefix for translation lookups

**Returns:** `TFunction` - i18next translation function configured for app namespace

### Types

#### `I18nContextProps`

Props interface for the I18nContext component.

```typescript
interface I18nContextProps extends PropsWithChildren {
  config: ClientConfig
}
```

#### `I18nProps`

Generic interface for components that accept i18n properties.

```typescript
interface I18nProps {
  i18n?: I18nBaseProps
}
```

#### `I18nBaseProps`

Base properties for i18n configuration.

```typescript
interface I18nBaseProps {
  resource?: string    // Resource name override
  ns?: string         // Namespace override
  prefix?: string     // Key prefix override
  suppress?: boolean  // Suppress translation loading
}
```

### Utilities

The package also exports utilities under the `/utils` subpackage:

```typescript
import { useI18nInstance } from '@owlmeans/client-i18n/utils'
```

#### `useI18nInstance(config): i18n`

Hook that creates and configures an i18next instance based on client configuration.

```typescript
import { useI18nInstance } from '@owlmeans/client-i18n/utils'

const config = useClientConfig()
const i18n = useI18nInstance(config)
```

## Usage Examples

### Basic Setup

```typescript
import React from 'react'
import { render } from 'react-dom'
import { I18nContext } from '@owlmeans/client-i18n'
import { makeClientConfig, ClientContext } from '@owlmeans/client-context'
import { AppType } from '@owlmeans/context'

const config = makeClientConfig(AppType.Frontend, 'my-app', {
  // Client configuration
  defaultLng: 'en',
  debug: { i18n: true }
})

const App: React.FC = () => (
  <ClientContext.Provider value={context}>
    <I18nContext config={config}>
      <MainApp />
    </I18nContext>
  </ClientContext.Provider>
)

render(<App />, document.getElementById('root'))
```

### Component with Translations

```typescript
import React from 'react'
import { useCommonI18n, useI18nLib, useI18nApp } from '@owlmeans/client-i18n'

const UserProfileForm: React.FC = () => {
  // Different translation levels
  const tLib = useI18nLib('forms') // Library translations
  const tApp = useI18nApp() // App-specific translations
  const tUser = useCommonI18n('user-profile', 'ui') // Service translations
  
  return (
    <form>
      <h1>{tApp('profile.title')}</h1>
      
      <label>
        {tUser('name.label')}
        <input placeholder={tUser('name.placeholder')} />
      </label>
      
      <label>
        {tUser('email.label')}
        <input type="email" placeholder={tUser('email.placeholder')} />
      </label>
      
      <div>
        <button type="submit">{tLib('save')}</button>
        <button type="button">{tLib('cancel')}</button>
      </div>
    </form>
  )
}
```

### Custom Hook for Component Translations

```typescript
import { useCommonI18n } from '@owlmeans/client-i18n'

const useProductTranslations = (prefix?: string) => {
  return useCommonI18n('products', 'ecommerce', prefix)
}

const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const t = useProductTranslations('card')
  
  return (
    <div className="product-card">
      <h3>{product.name}</h3>
      <p>{t('price')}: ${product.price}</p>
      <button>{t('addToCart')}</button>
    </div>
  )
}
```

### Dynamic Resource Loading

```typescript
import React, { useState } from 'react'
import { useCommonI18n } from '@owlmeans/client-i18n'

const DynamicContent: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState('dashboard')
  
  // Translations are loaded dynamically based on selected module
  const t = useCommonI18n(selectedModule, 'modules')
  
  return (
    <div>
      <select 
        value={selectedModule} 
        onChange={(e) => setSelectedModule(e.target.value)}
      >
        <option value="dashboard">Dashboard</option>
        <option value="analytics">Analytics</option>
        <option value="settings">Settings</option>
      </select>
      
      <div>
        <h2>{t('title')}</h2>
        <p>{t('description')}</p>
      </div>
    </div>
  )
}
```

### Error Handling and Fallbacks

```typescript
import React from 'react'
import { useCommonI18n } from '@owlmeans/client-i18n'

const SafeTranslatedComponent: React.FC = () => {
  const t = useCommonI18n('user-interface', 'ui')
  
  // Translation function handles missing keys gracefully
  return (
    <div>
      {/* Will show key if translation missing */}
      <h1>{t('welcome', 'Welcome')}</h1>
      
      {/* Will use fallback value */}
      <p>{t('description', { defaultValue: 'Default description' })}</p>
      
      {/* With interpolation */}
      <p>{t('greeting', { name: 'User', defaultValue: 'Hello, {{name}}!' })}</p>
    </div>
  )
}
```

### Multi-Language Support

```typescript
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useCommonI18n } from '@owlmeans/client-i18n'

const LanguageSwitcher: React.FC = () => {
  const { i18n } = useTranslation()
  const t = useCommonI18n('language-switcher', 'ui')
  
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }
  
  return (
    <div>
      <h3>{t('selectLanguage')}</h3>
      <button onClick={() => changeLanguage('en')}>
        {t('languages.english')}
      </button>
      <button onClick={() => changeLanguage('es')}>
        {t('languages.spanish')}
      </button>
      <button onClick={() => changeLanguage('fr')}>
        {t('languages.french')}
      </button>
    </div>
  )
}
```

## Integration Patterns

### With Component Libraries

```typescript
// Create a wrapper component for your design system
import React from 'react'
import { useI18nLib } from '@owlmeans/client-i18n'

interface ButtonProps {
  variant: 'primary' | 'secondary'
  i18nKey: string
  children?: React.ReactNode
}

const TranslatedButton: React.FC<ButtonProps> = ({ 
  variant, 
  i18nKey, 
  children 
}) => {
  const t = useI18nLib('ui-components', 'buttons')
  
  return (
    <button className={`btn btn-${variant}`}>
      {children || t(i18nKey)}
    </button>
  )
}

// Usage
<TranslatedButton variant="primary" i18nKey="save" />
```

### With Forms

```typescript
import React from 'react'
import { useForm } from 'react-hook-form'
import { useCommonI18n } from '@owlmeans/client-i18n'

const LoginForm: React.FC = () => {
  const t = useCommonI18n('auth-forms', 'auth')
  const { register, handleSubmit, formState: { errors } } = useForm()
  
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label>{t('email.label')}</label>
        <input
          {...register('email', { required: t('email.required') })}
          placeholder={t('email.placeholder')}
        />
        {errors.email && <span>{errors.email.message}</span>}
      </div>
      
      <div>
        <label>{t('password.label')}</label>
        <input
          type="password"
          {...register('password', { required: t('password.required') })}
          placeholder={t('password.placeholder')}
        />
        {errors.password && <span>{errors.password.message}</span>}
      </div>
      
      <button type="submit">{t('submit')}</button>
    </form>
  )
}
```

## Performance Considerations

### Resource Loading Caching
The package implements intelligent caching:

```typescript
// Resources are cached per language and resource name
const i18nLoadingCache = new Set<string>()

// Cache key format: "{language}:{resourceName}:{namespace}"
const key = `${i18n.language}:${resourceName}:${ns}`
```

### Automatic Resource Management
- **Lazy Loading** - Resources are only loaded when first requested
- **Duplicate Prevention** - Multiple components using the same resource won't trigger multiple loads
- **Fallback Loading** - Default language resources are loaded as fallbacks

### Best Practices

1. **Use specific resource names** - Avoid loading large translation bundles
2. **Leverage namespaces** - Organize translations by functional area
3. **Implement prefixes** - Use prefixes to scope translations to specific components
4. **Cache translation functions** - Don't recreate translation functions unnecessarily

## Error Handling

The package handles various error scenarios gracefully:

- **Missing resources** - Falls back to translation keys or default values
- **Network failures** - Uses cached resources or fallback languages
- **Invalid configurations** - Provides sensible defaults
- **Component unmounting** - Prevents memory leaks from resource loading

## Dependencies

This package depends on:
- `@owlmeans/client` - Client-side context hooks
- `@owlmeans/client-context` - Client context management
- `@owlmeans/i18n` - Core i18n functionality and resource management
- `react` - React framework (peer dependency)
- `react-i18next` - React integration for i18next
- `i18next` - Core i18n library

## Related Packages

- [`@owlmeans/i18n`](../i18n) - Core i18n functionality and resource management
- [`@owlmeans/client-context`](../client-context) - Client-side context management
- [`@owlmeans/client`](../client) - Client-side utilities and hooks