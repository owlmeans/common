# @owlmeans/web-db

Web database implementation for OwlMeans Common applications. This package provides a robust client-side database service built on IndexedDB through the `idb-keyval` library, offering persistent storage for web applications with a simple key-value interface.

## Overview

The `@owlmeans/web-db` package implements the `ClientDbService` interface from `@owlmeans/client-resource`, providing web-specific database functionality. It offers:

- **IndexedDB Integration**: Leverages browser's IndexedDB for persistent storage
- **Simple Key-Value API**: Clean, promise-based interface for data operations
- **Multiple Database Support**: Manage multiple isolated database instances
- **Automatic Namespacing**: Prevents key collisions between different resources
- **Service Integration**: Seamless integration with OwlMeans context system
- **Data Persistence**: Survives browser sessions and page reloads
- **Cross-Tab Synchronization**: Data changes are visible across browser tabs

This package is part of the OwlMeans database implementation family:
- **@owlmeans/client-resource**: Client resource management interfaces
- **@owlmeans/web-db**: Web IndexedDB implementation *(this package)*
- **@owlmeans/native-db**: React Native database implementation

## Installation

```bash
npm install @owlmeans/web-db
```

## Core Concepts

### IndexedDB Foundation
Built on IndexedDB, the standard web database API, providing reliable persistent storage that works offline and survives browser restarts.

### Namespaced Storage
Each database instance uses a namespace prefix to prevent key collisions, allowing multiple resources to share the same underlying storage safely.

### Service Architecture
Implements the ClientDbService interface, making it compatible with the OwlMeans resource system and context management.

## API Reference

### Factory Functions

#### `makeWebDbService(alias?: string): WebDbService`

Creates a web database service instance that manages IndexedDB storage.

```typescript
import { makeWebDbService } from '@owlmeans/web-db'

const dbService = makeWebDbService('main-db')
```

**Parameters:**
- `alias`: string (optional) - Service alias for registration, defaults to 'client-db'

**Returns:** WebDbService instance ready for registration with context

#### `appendWebDbService<C, T>(context: T, alias?: string): T`

Appends a web database service to the application context.

```typescript
import { appendWebDbService } from '@owlmeans/web-db'
import { makeClientContext } from '@owlmeans/client-context'

const context = makeClientContext(config)
appendWebDbService(context)

// Access the service
const dbService = context.service<WebDbService>('client-db')
```

**Parameters:**
- `context`: T - The client context to append the service to
- `alias`: string (optional) - Service alias, defaults to 'client-db'

**Returns:** Enhanced context with the registered database service

### Core Interfaces

#### `WebDbService`

Main database service interface that extends both InitializedService and ClientDbService.

```typescript
interface WebDbService extends InitializedService, ClientDbService {
  // Inherited from ClientDbService:
  initialize(alias?: string): Promise<ClientDb>    // Create database instance
  erase(): Promise<void>                          // Clear all data
  
  // Inherited from InitializedService:
  initialized: boolean                            // Initialization status
  init?(): Promise<void>                         // Initialization method
}
```

#### `ClientDb`

Database instance interface providing key-value operations.

```typescript
interface ClientDb {
  get<T>(id: string): Promise<T>                  // Retrieve value by key
  set<T>(id: string, value: T): Promise<void>     // Store value by key
  has(id: string): Promise<boolean>               // Check if key exists
  del(id: string): Promise<boolean>               // Delete key and return success
}
```

### Database Methods Detailed Reference

#### `initialize(alias?: string): Promise<ClientDb>`

**Purpose**: Creates and returns a database instance with the specified namespace

**Behavior**:
- Creates a new ClientDb instance if one doesn't exist for the alias
- Returns existing instance if already created for the alias
- Automatically namespaces all keys with the alias prefix
- Uses IndexedDB through idb-keyval for persistent storage

**Usage**: Called by resources to get their database instance

**Parameters**:
- `alias`: string (optional) - Namespace for the database instance

**Returns**: Promise that resolves to ClientDb instance

```typescript
const dbService = context.service<WebDbService>('client-db')

// Create database for users
const userDb = await dbService.initialize('users')

// Create database for settings
const settingsDb = await dbService.initialize('settings')

// Each database is isolated from others
await userDb.set('john', { name: 'John Doe' })
await settingsDb.set('theme', 'dark')
```

#### `erase(): Promise<void>`

**Purpose**: Completely clears all data from IndexedDB

**Behavior**: 
- Removes all data across all database instances
- Irreversible operation that clears entire IndexedDB store
- Affects all namespaces and aliases

**Usage**: Data cleanup, reset operations, testing

**Warning**: This removes ALL data stored by the application

```typescript
const dbService = context.service<WebDbService>('client-db')

// WARNING: This clears ALL application data
await dbService.erase()
console.log('All database data has been erased')
```

### ClientDb Instance Methods

#### `get<T>(id: string): Promise<T>`

**Purpose**: Retrieves a value from storage by its key

**Behavior**:
- Returns the stored value if key exists
- Returns undefined if key doesn't exist
- Automatically deserializes complex objects
- Type-safe with TypeScript generics

**Usage**: Loading stored data

```typescript
const userDb = await dbService.initialize('users')

// Get user data
const user = await userDb.get<UserData>('john')
if (user) {
  console.log('User found:', user.name)
} else {
  console.log('User not found')
}
```

#### `set<T>(id: string, value: T): Promise<void>`

**Purpose**: Stores a value in the database with the specified key

**Behavior**:
- Stores any serializable JavaScript value
- Overwrites existing value if key already exists
- Automatically serializes complex objects
- Type-safe with TypeScript generics

**Usage**: Saving data to persistent storage

```typescript
const userDb = await dbService.initialize('users')

// Store user data
await userDb.set('john', {
  name: 'John Doe',
  email: 'john@example.com',
  preferences: { theme: 'dark' }
})

// Store simple values
await userDb.set('last-login', new Date())
await userDb.set('session-count', 42)
```

#### `has(id: string): Promise<boolean>`

**Purpose**: Checks if a key exists in the database

**Behavior**:
- Returns true if key exists (even if value is null/undefined)
- Returns false if key doesn't exist
- Efficient check without retrieving the full value

**Usage**: Existence checks before operations

```typescript
const userDb = await dbService.initialize('users')

// Check if user exists before loading
const userExists = await userDb.has('john')
if (userExists) {
  const user = await userDb.get('john')
  console.log('Loading existing user:', user.name)
} else {
  console.log('User not found, creating new user')
}
```

#### `del(id: string): Promise<boolean>`

**Purpose**: Deletes a key from the database

**Behavior**:
- Removes the key and its value from storage
- Returns true if key existed and was deleted
- Returns false if key didn't exist
- Atomic operation

**Usage**: Removing data from storage

```typescript
const userDb = await dbService.initialize('users')

// Delete user data
const wasDeleted = await userDb.del('john')
if (wasDeleted) {
  console.log('User john was deleted')
} else {
  console.log('User john was not found')
}

// Verify deletion
const stillExists = await userDb.has('john')
console.log('User still exists:', stillExists) // false
```

### Constants

#### `DEFAULT_ALIAS`
Default service alias (`'client-db'`) imported from `@owlmeans/client-resource`.

## Usage Examples

### Basic Database Setup

```typescript
import { appendWebDbService } from '@owlmeans/web-db'
import { makeClientContext } from '@owlmeans/client-context'

// Create context with database service
const context = makeClientContext(config)
appendWebDbService(context)

// Initialize context
await context.configure().init()

// Access database service
const dbService = context.service<WebDbService>('client-db')
console.log('Database service ready:', dbService.initialized)
```

### Multiple Database Instances

```typescript
const dbService = context.service<WebDbService>('client-db')

// Create separate databases for different purposes
const userDb = await dbService.initialize('users')
const settingsDb = await dbService.initialize('settings')
const cacheDb = await dbService.initialize('cache')

// Each database is completely isolated
await userDb.set('current-user', { id: '123', name: 'John' })
await settingsDb.set('theme', 'dark')
await cacheDb.set('api-response', { data: [...], timestamp: Date.now() })

// No interference between databases
const userTheme = await userDb.get('theme') // undefined
const settingsTheme = await settingsDb.get('theme') // 'dark'
```

### User Data Management

```typescript
interface UserProfile {
  id: string
  name: string
  email: string
  preferences: {
    theme: 'light' | 'dark'
    language: string
    notifications: boolean
  }
  lastLogin: Date
}

const dbService = context.service<WebDbService>('client-db')
const userDb = await dbService.initialize('user-profiles')

// Save user profile
const saveUserProfile = async (profile: UserProfile) => {
  await userDb.set(profile.id, profile)
  console.log('Profile saved for:', profile.name)
}

// Load user profile
const loadUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const hasProfile = await userDb.has(userId)
  if (!hasProfile) {
    return null
  }
  
  return await userDb.get<UserProfile>(userId)
}

// Update last login
const updateLastLogin = async (userId: string) => {
  const profile = await loadUserProfile(userId)
  if (profile) {
    profile.lastLogin = new Date()
    await saveUserProfile(profile)
  }
}

// Usage
await saveUserProfile({
  id: 'user-123',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  preferences: {
    theme: 'dark',
    language: 'en',
    notifications: true
  },
  lastLogin: new Date()
})

const profile = await loadUserProfile('user-123')
console.log('Loaded profile:', profile?.name)
```

### Settings Persistence

```typescript
interface AppSettings {
  theme: 'light' | 'dark' | 'auto'
  language: string
  autoSave: boolean
  apiEndpoint: string
  debugMode: boolean
}

const dbService = context.service<WebDbService>('client-db')
const settingsDb = await dbService.initialize('app-settings')

class SettingsManager {
  private static readonly SETTINGS_KEY = 'app-settings'
  
  static async load(): Promise<AppSettings> {
    const hasSettings = await settingsDb.has(this.SETTINGS_KEY)
    if (!hasSettings) {
      return this.getDefaultSettings()
    }
    
    const saved = await settingsDb.get<AppSettings>(this.SETTINGS_KEY)
    return { ...this.getDefaultSettings(), ...saved }
  }
  
  static async save(settings: Partial<AppSettings>): Promise<void> {
    const current = await this.load()
    const updated = { ...current, ...settings }
    await settingsDb.set(this.SETTINGS_KEY, updated)
  }
  
  static async reset(): Promise<void> {
    await settingsDb.del(this.SETTINGS_KEY)
  }
  
  private static getDefaultSettings(): AppSettings {
    return {
      theme: 'auto',
      language: 'en',
      autoSave: true,
      apiEndpoint: '/api',
      debugMode: false
    }
  }
}

// Usage
const settings = await SettingsManager.load()
console.log('Current theme:', settings.theme)

await SettingsManager.save({ theme: 'dark', debugMode: true })
console.log('Settings updated')
```

### Caching System

```typescript
interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // time to live in milliseconds
}

class WebCache {
  private db: ClientDb
  
  constructor(private dbService: WebDbService) {}
  
  async initialize() {
    this.db = await this.dbService.initialize('cache')
  }
  
  async set<T>(key: string, data: T, ttlMs: number = 300000): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    }
    await this.db.set(key, entry)
  }
  
  async get<T>(key: string): Promise<T | null> {
    const hasKey = await this.db.has(key)
    if (!hasKey) {
      return null
    }
    
    const entry = await this.db.get<CacheEntry<T>>(key)
    if (!entry) {
      return null
    }
    
    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      await this.db.del(key)
      return null
    }
    
    return entry.data
  }
  
  async clear(): Promise<void> {
    // Note: This is a simplified version
    // In practice, you'd need to track cache keys
    console.log('Cache clear not implemented - use dbService.erase() for full clear')
  }
}

// Usage
const dbService = context.service<WebDbService>('client-db')
const cache = new WebCache(dbService)
await cache.initialize()

// Cache API response for 5 minutes
await cache.set('user-list', userData, 5 * 60 * 1000)

// Try to get from cache
const cachedUsers = await cache.get('user-list')
if (cachedUsers) {
  console.log('Using cached data:', cachedUsers)
} else {
  console.log('Cache miss, fetching fresh data')
}
```

### Data Migration

```typescript
class DataMigration {
  private dbService: WebDbService
  
  constructor(dbService: WebDbService) {
    this.dbService = dbService
  }
  
  async migrateUserData() {
    const userDb = await this.dbService.initialize('users')
    const migrationDb = await this.dbService.initialize('migration')
    
    // Check if migration already done
    const migrationDone = await migrationDb.has('user-data-v2')
    if (migrationDone) {
      console.log('Migration already completed')
      return
    }
    
    // Simulate migration from old format to new format
    const oldUserData = await userDb.get('old-format-user')
    if (oldUserData) {
      const newUserData = this.transformUserData(oldUserData)
      await userDb.set('new-format-user', newUserData)
      await userDb.del('old-format-user')
    }
    
    // Mark migration as complete
    await migrationDb.set('user-data-v2', { completed: new Date() })
    console.log('User data migration completed')
  }
  
  private transformUserData(oldData: any): any {
    // Transform old data format to new format
    return {
      ...oldData,
      version: 2,
      migrated: true
    }
  }
}

// Usage
const dbService = context.service<WebDbService>('client-db')
const migration = new DataMigration(dbService)
await migration.migrateUserData()
```

### Integration with React Components

```typescript
import React, { useState, useEffect } from 'react'
import { useContext } from '@owlmeans/client'

interface UserPreferences {
  theme: string
  language: string
  notifications: boolean
}

function UserSettings() {
  const context = useContext()
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const dbService = context.service<WebDbService>('client-db')
        const settingsDb = await dbService.initialize('user-settings')
        
        const saved = await settingsDb.get<UserPreferences>('preferences')
        setPreferences(saved || {
          theme: 'light',
          language: 'en',
          notifications: true
        })
      } catch (error) {
        console.error('Failed to load preferences:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadPreferences()
  }, [])
  
  const savePreferences = async (newPrefs: UserPreferences) => {
    try {
      const dbService = context.service<WebDbService>('client-db')
      const settingsDb = await dbService.initialize('user-settings')
      
      await settingsDb.set('preferences', newPrefs)
      setPreferences(newPrefs)
      console.log('Preferences saved')
    } catch (error) {
      console.error('Failed to save preferences:', error)
    }
  }
  
  if (loading) {
    return <div>Loading preferences...</div>
  }
  
  return (
    <div>
      <h3>User Settings</h3>
      <label>
        Theme:
        <select 
          value={preferences?.theme} 
          onChange={(e) => savePreferences({ ...preferences!, theme: e.target.value })}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      
      <label>
        <input
          type="checkbox"
          checked={preferences?.notifications}
          onChange={(e) => savePreferences({ ...preferences!, notifications: e.target.checked })}
        />
        Enable notifications
      </label>
    </div>
  )
}
```

### Advanced Database Operations

```typescript
class DatabaseManager {
  private dbService: WebDbService
  
  constructor(dbService: WebDbService) {
    this.dbService = dbService
  }
  
  async exportData(): Promise<Record<string, any>> {
    const databases = ['users', 'settings', 'cache']
    const exportData: Record<string, any> = {}
    
    for (const dbName of databases) {
      const db = await this.dbService.initialize(dbName)
      exportData[dbName] = {}
      
      // Note: This is simplified - in practice you'd need to track keys
      // or implement a proper iteration mechanism
    }
    
    return exportData
  }
  
  async importData(data: Record<string, any>): Promise<void> {
    for (const [dbName, dbData] of Object.entries(data)) {
      const db = await this.dbService.initialize(dbName)
      
      for (const [key, value] of Object.entries(dbData)) {
        await db.set(key, value)
      }
    }
  }
  
  async getStorageUsage(): Promise<{ estimated: boolean; quota?: number; usage?: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      return await navigator.storage.estimate()
    }
    return { estimated: false }
  }
  
  async clearAllData(): Promise<void> {
    await this.dbService.erase()
    console.log('All application data cleared')
  }
}

// Usage
const dbService = context.service<WebDbService>('client-db')
const dbManager = new DatabaseManager(dbService)

// Check storage usage
const usage = await dbManager.getStorageUsage()
console.log('Storage usage:', usage)

// Clear all data if needed
// await dbManager.clearAllData()
```

## Browser Compatibility

The package works in all modern browsers that support IndexedDB:

- **Chrome**: 24+
- **Firefox**: 16+
- **Safari**: 10+
- **Edge**: 12+
- **Mobile browsers**: iOS 10+, Android 4.4+

## Performance Considerations

1. **Async Operations**: All database operations are asynchronous and return promises
2. **Namespacing**: Each database instance is isolated for performance and organization
3. **IndexedDB Limits**: Be aware of browser storage quotas (typically 50MB+)
4. **Serialization**: Complex objects are automatically serialized/deserialized
5. **Batching**: Consider batching multiple operations when possible

## Error Handling

```typescript
import { WebDbService } from '@owlmeans/web-db'

const handleDatabaseOperation = async () => {
  try {
    const dbService = context.service<WebDbService>('client-db')
    const db = await dbService.initialize('users')
    
    await db.set('user123', userData)
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('Storage quota exceeded')
    } else if (error.name === 'DataError') {
      console.error('Invalid data for storage')
    } else {
      console.error('Database error:', error.message)
    }
  }
}
```

## Integration with Other Packages

### Client Resource Integration
```typescript
import { appendClientResource } from '@owlmeans/client-resource'
import { appendWebDbService } from '@owlmeans/web-db'

// Setup database service first
appendWebDbService(context)

// Then setup resources that will use it
appendClientResource(context, 'users')
appendClientResource(context, 'settings')
```

### Context Integration
```typescript
import { makeClientContext } from '@owlmeans/client-context'
import { appendWebDbService } from '@owlmeans/web-db'

const context = makeClientContext(config)
appendWebDbService(context)

await context.configure().init()
```

## Best Practices

1. **Namespace Usage**: Use descriptive database aliases to organize data
2. **Error Handling**: Always handle database operation errors gracefully
3. **Data Validation**: Validate data before storing to prevent corruption
4. **Storage Limits**: Monitor storage usage and implement cleanup strategies
5. **Performance**: Use appropriate data structures and avoid storing large objects
6. **Testing**: Test database operations across different browsers
7. **Migration**: Plan for data format changes with migration strategies

## Dependencies

This package depends on:
- `@owlmeans/client-context` - Client context management
- `@owlmeans/client-resource` - Client resource interfaces
- `@owlmeans/context` - Core context system
- `idb-keyval` - IndexedDB key-value library

## Related Packages

- [`@owlmeans/client-resource`](../client-resource) - Client resource management
- [`@owlmeans/native-db`](../native-db) - React Native database implementation
- [`@owlmeans/client-context`](../client-context) - Client context management
- [`@owlmeans/web-client`](../web-client) - Web client with database integration