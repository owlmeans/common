# @owlmeans/native-db

The **@owlmeans/native-db** package provides React Native database functionality using AsyncStorage for OwlMeans Common Libraries, designed for fullstack microservices and microclients development with focus on security and proper authentication and authorization.

## Purpose

This package serves as the React Native database implementation that:

- **Provides persistent storage for React Native apps** using AsyncStorage
- **Implements client database interface** for consistency across platforms
- **Supports key-value storage operations** with JSON serialization
- **Offers database service abstraction** with context integration
- **Enables multi-store management** with isolated namespaces
- **Provides data persistence** for offline-capable mobile applications

## Core Concepts

### Native Database Service
A service that manages multiple AsyncStorage-based databases with namespace isolation, providing a consistent interface for data persistence in React Native applications.

### AsyncStorage Integration
Leverages React Native's AsyncStorage for persistent data storage, automatically handling JSON serialization and deserialization of stored values.

### Multi-Store Support
Supports multiple isolated storage instances (stores) within a single service, allowing for organized data separation by feature or domain.

### Client Database Interface
Implements the standard ClientDb interface from `@owlmeans/client-resource`, ensuring compatibility with other OwlMeans client packages.

## API Reference

### Factory Functions

#### `makeNativeDbService(alias?): NativeDbService`

Creates a React Native database service that manages AsyncStorage-based databases.

```typescript
import { makeNativeDbService } from '@owlmeans/native-db'

const dbService = makeNativeDbService('app-storage')
```

**Parameters:**
- `alias`: string (optional) - Service alias, defaults to `DEFAULT_ALIAS`

**Returns:** NativeDbService instance

#### `appendNativeDbService<C, T>(context, alias?): T`

Registers a native database service with a client context.

```typescript
import { appendNativeDbService } from '@owlmeans/native-db'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
appendNativeDbService(context, 'storage')
```

**Parameters:**
- `context`: T - Client context instance
- `alias`: string (optional) - Service alias

**Returns:** Context with registered database service

### Service Interface

#### `NativeDbService`

Database service interface extending ClientDbService.

```typescript
interface NativeDbService extends ClientDbService {
  initialize(alias?: string): Promise<ClientDb>
  erase(): Promise<void>
}
```

### Database Operations

#### `initialize(alias?): Promise<ClientDb>`

Initializes and returns a database instance for the specified alias.

```typescript
const dbService = context.service('storage')
const userDb = await dbService.initialize('users')
const settingsDb = await dbService.initialize('settings')
```

**Parameters:**
- `alias`: string (optional) - Database identifier

**Returns:** Promise resolving to ClientDb instance

#### `erase(): Promise<void>`

Clears all data from AsyncStorage.

```typescript
await dbService.erase() // Clears all stored data
```

### ClientDb Interface

The returned database instances implement the ClientDb interface:

#### `get<T>(id): Promise<T | null>`

Retrieves a value by ID.

```typescript
const userData = await userDb.get<User>('current-user')
```

#### `set<T>(id, value): Promise<void>`

Stores a value with the specified ID.

```typescript
await userDb.set('current-user', { id: '123', name: 'John Doe' })
```

#### `has(id): Promise<boolean>`

Checks if a value exists for the given ID.

```typescript
const hasUser = await userDb.has('current-user')
```

#### `del(id): Promise<boolean>`

Deletes a value and returns whether it existed.

```typescript
const wasDeleted = await userDb.del('current-user')
```

### Types

#### `NativeDbService`

Main service interface for native database operations.

```typescript
interface NativeDbService extends ClientDbService {}
```

### Constants

#### `DEFAULT_ALIAS`

Default alias for the database service (imported from `@owlmeans/client-resource`).

```typescript
const DEFAULT_ALIAS = DEFAULT_DB_ALIAS
```

## Usage Examples

### Basic Database Setup

```typescript
import { makeClientContext, makeClientConfig } from '@owlmeans/client-context'
import { appendNativeDbService } from '@owlmeans/native-db'
import { AppType } from '@owlmeans/context'

// Create React Native app context
const config = makeClientConfig(AppType.Frontend, 'mobile-app')
const context = makeClientContext(config)

// Add native database service
appendNativeDbService(context, 'app-db')

// Initialize context
context.configure()
await context.init()

// Use database service
const dbService = context.service('app-db')
const userDb = await dbService.initialize('users')
```

### User Data Management

```typescript
import { appendNativeDbService } from '@owlmeans/native-db'

interface User {
  id: string
  name: string
  email: string
  preferences: UserPreferences
}

const setupUserStorage = async (context) => {
  const dbService = context.service('app-db')
  const userDb = await dbService.initialize('users')
  
  // Store user data
  const saveUser = async (user: User) => {
    await userDb.set(`user:${user.id}`, user)
    await userDb.set('current-user', user.id)
  }
  
  // Load current user
  const getCurrentUser = async (): Promise<User | null> => {
    const currentUserId = await userDb.get<string>('current-user')
    if (!currentUserId) return null
    
    return await userDb.get<User>(`user:${currentUserId}`)
  }
  
  // Update user preferences
  const updatePreferences = async (preferences: UserPreferences) => {
    const user = await getCurrentUser()
    if (user) {
      user.preferences = preferences
      await saveUser(user)
    }
  }
  
  return { saveUser, getCurrentUser, updatePreferences }
}
```

### App Settings Persistence

```typescript
interface AppSettings {
  theme: 'light' | 'dark'
  notifications: boolean
  language: string
  privacy: PrivacySettings
}

const manageAppSettings = async (context) => {
  const dbService = context.service('app-db')
  const settingsDb = await dbService.initialize('settings')
  
  const defaultSettings: AppSettings = {
    theme: 'light',
    notifications: true,
    language: 'en',
    privacy: { analytics: false, crashReports: true }
  }
  
  // Load settings with defaults
  const loadSettings = async (): Promise<AppSettings> => {
    const settings = await settingsDb.get<AppSettings>('app-settings')
    return settings ? { ...defaultSettings, ...settings } : defaultSettings
  }
  
  // Save settings
  const saveSettings = async (settings: AppSettings) => {
    await settingsDb.set('app-settings', settings)
  }
  
  // Update specific setting
  const updateSetting = async <K extends keyof AppSettings>(
    key: K, 
    value: AppSettings[K]
  ) => {
    const settings = await loadSettings()
    settings[key] = value
    await saveSettings(settings)
  }
  
  return { loadSettings, saveSettings, updateSetting }
}
```

### Offline Data Caching

```typescript
interface CacheEntry<T> {
  data: T
  timestamp: number
  expiry?: number
}

const createCacheManager = async (context) => {
  const dbService = context.service('app-db')
  const cacheDb = await dbService.initialize('cache')
  
  const cache = {
    // Set cache entry with optional TTL
    set: async <T>(key: string, data: T, ttlMinutes?: number) => {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiry: ttlMinutes ? Date.now() + (ttlMinutes * 60 * 1000) : undefined
      }
      await cacheDb.set(key, entry)
    },
    
    // Get cache entry if not expired
    get: async <T>(key: string): Promise<T | null> => {
      const entry = await cacheDb.get<CacheEntry<T>>(key)
      if (!entry) return null
      
      // Check expiry
      if (entry.expiry && Date.now() > entry.expiry) {
        await cacheDb.del(key)
        return null
      }
      
      return entry.data
    },
    
    // Remove cache entry
    remove: async (key: string) => {
      return await cacheDb.del(key)
    },
    
    // Clean expired entries
    cleanup: async () => {
      // Note: AsyncStorage doesn't support key enumeration
      // This would require maintaining a separate index
      console.log('Cache cleanup would require key enumeration')
    }
  }
  
  return cache
}
```

### Authentication State Management

```typescript
interface AuthState {
  isAuthenticated: boolean
  token?: string
  refreshToken?: string
  user?: User
  expiresAt?: number
}

const manageAuthState = async (context) => {
  const dbService = context.service('app-db')
  const authDb = await dbService.initialize('auth')
  
  const auth = {
    // Save authentication state
    saveAuth: async (authState: AuthState) => {
      await authDb.set('auth-state', authState)
    },
    
    // Load authentication state
    loadAuth: async (): Promise<AuthState | null> => {
      const state = await authDb.get<AuthState>('auth-state')
      
      // Check if token is expired
      if (state?.expiresAt && Date.now() > state.expiresAt) {
        await auth.clearAuth()
        return null
      }
      
      return state
    },
    
    // Check if authenticated
    isAuthenticated: async (): Promise<boolean> => {
      const state = await auth.loadAuth()
      return state?.isAuthenticated ?? false
    },
    
    // Clear authentication
    clearAuth: async () => {
      await authDb.del('auth-state')
    },
    
    // Update user info
    updateUser: async (user: User) => {
      const state = await auth.loadAuth()
      if (state) {
        state.user = user
        await auth.saveAuth(state)
      }
    }
  }
  
  return auth
}
```

### Form Draft Persistence

```typescript
interface FormDraft {
  formId: string
  data: Record<string, any>
  timestamp: number
}

const createFormDraftManager = async (context) => {
  const dbService = context.service('app-db')
  const draftDb = await dbService.initialize('form-drafts')
  
  const drafts = {
    // Save form draft
    saveDraft: async (formId: string, data: Record<string, any>) => {
      const draft: FormDraft = {
        formId,
        data,
        timestamp: Date.now()
      }
      await draftDb.set(`draft:${formId}`, draft)
    },
    
    // Load form draft
    loadDraft: async (formId: string): Promise<Record<string, any> | null> => {
      const draft = await draftDb.get<FormDraft>(`draft:${formId}`)
      return draft?.data ?? null
    },
    
    // Remove form draft
    removeDraft: async (formId: string) => {
      return await draftDb.del(`draft:${formId}`)
    },
    
    // Check if draft exists
    hasDraft: async (formId: string): Promise<boolean> => {
      return await draftDb.has(`draft:${formId}`)
    }
  }
  
  return drafts
}
```

### Database Migration

```typescript
interface Migration {
  version: number
  migrate: (dbService: NativeDbService) => Promise<void>
}

const createMigrationManager = async (context) => {
  const dbService = context.service('app-db')
  const metaDb = await dbService.initialize('meta')
  
  const migrations: Migration[] = [
    {
      version: 1,
      migrate: async (dbService) => {
        // Initial setup
        const userDb = await dbService.initialize('users')
        await userDb.set('schema-version', 1)
      }
    },
    {
      version: 2,
      migrate: async (dbService) => {
        // Add settings structure
        const settingsDb = await dbService.initialize('settings')
        await settingsDb.set('schema-version', 2)
      }
    }
  ]
  
  const migrate = async () => {
    const currentVersion = await metaDb.get<number>('db-version') ?? 0
    
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        console.log(`Running migration ${migration.version}`)
        await migration.migrate(dbService)
        await metaDb.set('db-version', migration.version)
      }
    }
  }
  
  return { migrate }
}
```

## Integration Patterns

### With React Native Components

```typescript
import React, { useEffect, useState } from 'react'
import { useContext } from '@owlmeans/client'

const useNativeStorage = <T>(key: string, defaultValue: T) => {
  const context = useContext()
  const [value, setValue] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const loadValue = async () => {
      try {
        const dbService = context.service('app-db')
        const db = await dbService.initialize('app-data')
        const stored = await db.get<T>(key)
        setValue(stored ?? defaultValue)
      } catch (error) {
        console.error('Failed to load value:', error)
        setValue(defaultValue)
      } finally {
        setLoading(false)
      }
    }
    
    loadValue()
  }, [key])
  
  const updateValue = async (newValue: T) => {
    try {
      const dbService = context.service('app-db')
      const db = await dbService.initialize('app-data')
      await db.set(key, newValue)
      setValue(newValue)
    } catch (error) {
      console.error('Failed to save value:', error)
    }
  }
  
  return { value, updateValue, loading }
}

// Usage in component
const SettingsScreen: React.FC = () => {
  const { value: settings, updateValue: updateSettings, loading } = 
    useNativeStorage('app-settings', defaultSettings)
  
  if (loading) return <LoadingSpinner />
  
  return (
    <SettingsForm 
      settings={settings} 
      onUpdate={updateSettings} 
    />
  )
}
```

### With Redux/State Management

```typescript
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

// Async thunks for database operations
export const loadUserData = createAsyncThunk(
  'user/loadData',
  async (_, { getState }) => {
    const { context } = getState() as { context: any }
    const dbService = context.service('app-db')
    const userDb = await dbService.initialize('users')
    return await userDb.get('current-user')
  }
)

export const saveUserData = createAsyncThunk(
  'user/saveData',
  async (userData: User, { getState }) => {
    const { context } = getState() as { context: any }
    const dbService = context.service('app-db')
    const userDb = await dbService.initialize('users')
    await userDb.set('current-user', userData)
    return userData
  }
)

const userSlice = createSlice({
  name: 'user',
  initialState: { data: null, loading: false },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadUserData.fulfilled, (state, action) => {
        state.data = action.payload
        state.loading = false
      })
      .addCase(saveUserData.fulfilled, (state, action) => {
        state.data = action.payload
      })
  }
})
```

## Performance Considerations

### AsyncStorage Limitations
- **Synchronous operations** - All operations are asynchronous and should be awaited
- **JSON serialization** - All data is serialized/deserialized as JSON
- **Storage limits** - Be mindful of device storage limitations
- **Key enumeration** - AsyncStorage doesn't support key enumeration natively

### Best Practices

1. **Use appropriate data structures** - Store related data together when possible
2. **Implement error handling** - Always handle AsyncStorage failures gracefully
3. **Consider data size** - Large objects may impact performance
4. **Use namespacing** - Use different database aliases for different data domains
5. **Clean up old data** - Implement cleanup mechanisms for temporary data

## Error Handling

The package handles various error scenarios:

- **AsyncStorage failures** - When the underlying storage system fails
- **JSON parsing errors** - When stored data cannot be parsed as JSON
- **Context errors** - When the service context is not properly configured
- **Memory limitations** - When device storage is full

## Security Considerations

### Data Security
- **Sensitive data** - AsyncStorage is not encrypted by default
- **Secure storage** - Consider using react-native-keychain for sensitive data
- **Data validation** - Always validate data retrieved from storage
- **Access control** - Implement proper access control for different data types

## Dependencies

This package depends on:
- `@owlmeans/context` - For service creation and registration
- `@owlmeans/client-resource` - For client database interface
- `@owlmeans/client-context` - For client context types
- `@react-native-async-storage/async-storage` - For persistent storage

## Related Packages

- [`@owlmeans/client-resource`](../client-resource) - Client-side resource management
- [`@owlmeans/web-db`](../web-db) - Web browser database implementation
- [`@owlmeans/client-context`](../client-context) - Client context management