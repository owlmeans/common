# @owlmeans/native-panel

React Native panel components and infrastructure for OwlMeans Common Libraries. This package provides a comprehensive set of standardized UI components and panel architecture for building administrative interfaces, user dashboards, and management applications in React Native mobile applications with Material Design 3 support.

## Overview

The `@owlmeans/native-panel` package serves as the React Native implementation of the OwlMeans panel system, designed for fullstack applications with focus on security and proper mobile user experience. It provides:

- **React Native Panel Components**: Complete set of mobile-optimized UI components
- **Material Design 3**: Built on React Native Paper with MD3 theming support
- **Authentication Integration**: Built-in authentication flows and protected components
- **Cross-platform Compatibility**: Consistent UI across iOS and Android platforms
- **Theme Customization**: Flexible theming system with font and color customization
- **Panel Architecture**: Structured panel system for complex administrative interfaces
- **Form Management**: Advanced form components with validation and error handling

This package follows the OwlMeans "quadra" pattern as the **React Native** implementation, complementing:
- **@owlmeans/client-panel**: Common panel declarations and base functionality *(base package)*
- **@owlmeans/web-panel**: Web browser panel implementation
- **@owlmeans/native-panel**: React Native panel implementation *(this package)*

## Installation

```bash
npm install @owlmeans/native-panel
```

### Peer Dependencies

This package requires several peer dependencies for React Native development:

```bash
npm install react react-native react-native-paper react-native-reanimated react-native-safe-area-context react-native-vector-icons react-hook-form @hookform/resolvers ajv
```

## Dependencies

This package builds upon the OwlMeans ecosystem:
- `@owlmeans/client-panel`: Base panel functionality and context
- `@owlmeans/native-client`: Native client framework and context
- `@owlmeans/client-auth`: Authentication components and services
- `@owlmeans/client-i18n`: Internationalization support
- `@owlmeans/client-module`: Module system integration
- React Native Paper: Material Design components
- React Native Vector Icons: Icon support

## Key Concepts

### Panel Architecture
Structured panel system that provides:
- **Panel Context**: Shared context for panel-wide settings and state
- **Authentication Integration**: Built-in authentication guards and user management
- **Theme Management**: Consistent theming across all panel components
- **Navigation Integration**: Integration with React Native navigation systems

### Material Design 3
Modern Material Design implementation with:
- **Adaptive Themes**: Light and dark theme support
- **Dynamic Colors**: Customizable color schemes
- **Typography System**: Consistent typography with custom font support
- **Icon System**: Comprehensive icon library integration

### Mobile-first Design
Components optimized for mobile with:
- **Touch Interactions**: Optimized for touch gestures and interactions
- **Responsive Layouts**: Adaptive layouts for different screen sizes
- **Performance**: Optimized rendering for mobile performance
- **Accessibility**: Built-in accessibility support

## API Reference

### Factory Functions

#### `PanelApp`

Main panel application wrapper that provides theming, authentication, and core panel functionality.

```typescript
interface PanelAppProps {
  context: AppContext                    // Native app context
  provide?: ProvideFunction             // Custom provider function
  children: React.ReactNode             // Panel content
  fonts?: MD3Fonts                      // Custom font configuration
  colors?: Partial<MD3Colors>           // Custom color scheme
  name?: string                         // Panel resource name
  icons?: Record<string, IconComponent> // Custom icon mappings
}

const PanelApp: FC<PanelAppProps> = (props) => { /* ... */ }
```

**Usage:**
```typescript
import { PanelApp } from '@owlmeans/native-panel'
import { makeContext } from '@owlmeans/native-client'

const context = makeContext(config)

function MyAdminApp() {
  return (
    <PanelApp 
      context={context}
      name="admin-panel"
      colors={{
        primary: '#1976d2',
        secondary: '#dc004e'
      }}
    >
      <AdminDashboard />
    </PanelApp>
  )
}
```

### Core Components

#### Button Component

Enhanced button component with internationalization and theming support.

```typescript
interface ButtonProps extends I18nProps {
  onPress: () => void                   // Button press handler
  name: string                          // Button text key for i18n
  color?: string                        // Button color theme key
  textColor?: string                    // Text color theme key
  textVariant?: string                  // Typography variant
  disabled?: boolean                    // Disabled state
  variant?: 'text' | 'outlined' | 'contained' | 'elevated' | 'contained-tonal'
  icon?: string                         // Icon name
  dark?: boolean                        // Dark theme override
  style?: ViewStyle                     // Custom styles
}

const Button: FC<ButtonProps> = (props) => { /* ... */ }
```

**Usage:**
```typescript
import { Button } from '@owlmeans/native-panel'

<Button
  name="save"
  onPress={handleSave}
  variant="contained"
  icon="content-save"
  color="primary"
/>
```

#### Text Component

Typography component with theme integration and internationalization.

```typescript
interface TextProps extends PropsWithChildren<I18nProps> {
  variant?: string                      // Typography variant
  name?: string                         // Text key for i18n
  color?: string                        // Color theme key
  style?: TextStyle                     // Custom styles
  cut?: boolean                         // Truncate text
  center?: boolean                      // Center alignment
}

const Text: FC<TextProps> = (props) => { /* ... */ }
```

**Usage:**
```typescript
import { Text } from '@owlmeans/native-panel'

<Text 
  name="welcome.title" 
  variant="headlineMedium" 
  color="primary" 
  center 
/>
```

#### Dots Component

Visual indicator component for pagination, progress, or status.

```typescript
interface DotsProps {
  qty?: number                          // Total number of dots
  active?: number                       // Active dot index
  gap?: number                          // Gap between dots
  color?: string                        // Inactive dot color
  activeColor?: string                  // Active dot color
}

const Dots: FC<DotsProps> = (props) => { /* ... */ }
```

**Usage:**
```typescript
import { Dots } from '@owlmeans/native-panel'

<Dots 
  qty={5} 
  active={2} 
  activeColor="primary" 
  color="outline" 
/>
```

#### List Component

Generic list component with customizable item rendering.

```typescript
interface ListProps<T = any> {
  items: T[]                            // Array of list items
  renderer: FC<ListItemProps<T>>        // Item renderer component
  onClick?: ListClick<T>                // Item click handler
}

interface ListItemProps<T = any> {
  onClick?: ListClick<T>                // Click handler
  data: T                               // Item data
}

interface ListClick<T> {
  (data: T): void | Promise<void>
}

const List: FC<ListProps> = (props) => { /* ... */ }
```

**Usage:**
```typescript
import { List } from '@owlmeans/native-panel'

const UserListItem: FC<ListItemProps<User>> = ({ data, onClick }) => (
  <TouchableOpacity onPress={() => onClick?.(data)}>
    <Text>{data.name}</Text>
  </TouchableOpacity>
)

<List
  items={users}
  renderer={UserListItem}
  onClick={handleUserSelect}
/>
```

#### Status Component

Status indicator component for displaying state, errors, or messages.

```typescript
interface StatusProps extends PropsWithChildren<I18nProps> {
  name?: string                         // Status text key for i18n
  ok?: boolean                          // Success/error state
  variant?: string                      // Visual variant
  error?: Error                         // Error object
  message?: string                      // Custom message
}

const Status: FC<StatusProps> = (props) => { /* ... */ }
```

**Usage:**
```typescript
import { Status } from '@owlmeans/native-panel'

<Status 
  ok={isSuccess} 
  name="operation.status" 
  error={operationError}
  variant="outlined" 
/>
```

### Layout Components

#### Header Components

Panel header components with navigation and branding support.

```typescript
// Header component with title and navigation
import { Header } from '@owlmeans/native-panel'

<Header 
  title="Admin Panel"
  showBack={true}
  onBackPress={goBack}
  actions={[
    { icon: 'account', onPress: openProfile },
    { icon: 'logout', onPress: handleLogout }
  ]}
/>
```

#### Layout Components

Container and layout components for organizing panel content.

```typescript
import { Layout, Container, Section } from '@owlmeans/native-panel'

<Layout>
  <Container padding="medium">
    <Section title="User Management">
      <UserList />
    </Section>
    <Section title="System Settings">
      <SettingsForm />
    </Section>
  </Container>
</Layout>
```

#### Tab Components

Tabbed interface components for organizing panel sections.

```typescript
import { Tabs, Tab } from '@owlmeans/native-panel'

<Tabs>
  <Tab label="Users" icon="account-group">
    <UserManagement />
  </Tab>
  <Tab label="Settings" icon="cog">
    <SystemSettings />
  </Tab>
  <Tab label="Reports" icon="chart-line">
    <ReportsPanel />
  </Tab>
</Tabs>
```

### Form Components

#### Form Infrastructure

Advanced form components with validation and error handling.

```typescript
import { Form, FormField, FormButton, FormValidation } from '@owlmeans/native-panel'

<Form onSubmit={handleSubmit} validation={formValidation}>
  <FormField
    name="username"
    label="Username"
    type="text"
    required
    validation={{
      minLength: 3,
      pattern: /^[a-zA-Z0-9_]+$/
    }}
  />
  
  <FormField
    name="email"
    label="Email Address"
    type="email"
    required
  />
  
  <FormButton 
    type="submit"
    name="submit"
    loading={isSubmitting}
  />
</Form>
```

### Permission Components

Access control components for securing panel features.

```typescript
import { PermissionGuard, PermissionCheck } from '@owlmeans/native-panel'

<PermissionGuard permissions={['admin', 'user-management']}>
  <UserAdministration />
</PermissionGuard>

<PermissionCheck permission="delete-users">
  {(hasPermission) => (
    <Button 
      name="delete" 
      onPress={deleteUser}
      disabled={!hasPermission}
    />
  )}
</PermissionCheck>
```

### Progress Components

Progress indication components for loading states and operations.

```typescript
import { Progress, LoadingIndicator, ProgressBar } from '@owlmeans/native-panel'

<Progress 
  value={uploadProgress} 
  label="Uploading files..." 
  showPercentage 
/>

<LoadingIndicator 
  visible={isLoading}
  message="Please wait..."
/>

<ProgressBar 
  indeterminate={isProcessing}
  color="primary"
/>
```

### Modal Components

Modal and dialog components for overlay content.

```typescript
import { Modal, Dialog, ConfirmDialog } from '@owlmeans/native-panel'

<Modal 
  visible={showModal}
  onDismiss={closeModal}
  title="Edit User"
>
  <UserEditForm />
</Modal>

<ConfirmDialog
  visible={showConfirm}
  title="Delete User"
  message="Are you sure you want to delete this user?"
  onConfirm={confirmDelete}
  onCancel={cancelDelete}
/>
```

## Usage Examples

### Basic Panel Application

```typescript
import React from 'react'
import { PanelApp, Header, Layout, Tabs, Tab } from '@owlmeans/native-panel'
import { makeContext } from '@owlmeans/native-client'

const config = {
  service: 'admin-panel',
  type: AppType.Frontend,
  layer: Layer.Service
}

const context = makeContext(config)

export default function AdminPanelApp() {
  return (
    <PanelApp 
      context={context}
      name="admin-panel"
      colors={{
        primary: '#2196F3',
        secondary: '#FF9800',
        surface: '#FFFFFF'
      }}
      fonts={{
        labelLarge: {
          fontFamily: 'Roboto-Medium',
          fontSize: 16,
          fontWeight: '500'
        }
      }}
    >
      <Layout>
        <Header 
          title="Administration Panel"
          showProfile
          onProfilePress={openUserProfile}
        />
        
        <Tabs>
          <Tab label="Dashboard" icon="view-dashboard">
            <DashboardPanel />
          </Tab>
          
          <Tab label="Users" icon="account-group">
            <UserManagementPanel />
          </Tab>
          
          <Tab label="Settings" icon="cog">
            <SettingsPanel />
          </Tab>
        </Tabs>
      </Layout>
    </PanelApp>
  )
}
```

### User Management Panel

```typescript
import React, { useState, useEffect } from 'react'
import { 
  Container, 
  List, 
  Button, 
  Text, 
  Status, 
  PermissionGuard 
} from '@owlmeans/native-panel'

interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

const UserManagementPanel: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/users')
      const userData = await response.json()
      setUsers(userData)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  const handleUserEdit = async (user: User) => {
    // Navigate to user edit screen
    navigation.navigate('UserEdit', { userId: user.id })
  }

  const handleUserDelete = async (user: User) => {
    try {
      await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      setUsers(users.filter(u => u.id !== user.id))
    } catch (err) {
      setError(err as Error)
    }
  }

  const UserListItem: FC<ListItemProps<User>> = ({ data, onClick }) => (
    <Container padding="small" style={styles.userItem}>
      <Text variant="titleMedium">{data.name}</Text>
      <Text variant="bodyMedium" color="outline">{data.email}</Text>
      <Text variant="labelSmall">{data.role}</Text>
      
      <Status ok={data.active} name={data.active ? 'active' : 'inactive'} />
      
      <Container row gap="small">
        <Button
          name="edit"
          variant="outlined"
          onPress={() => onClick?.(data)}
          size="small"
        />
        
        <PermissionGuard permissions={['delete-users']}>
          <Button
            name="delete"
            variant="text"
            color="error"
            onPress={() => handleUserDelete(data)}
            size="small"
          />
        </PermissionGuard>
      </Container>
    </Container>
  )

  if (loading) {
    return (
      <Container center>
        <Progress indeterminate message="Loading users..." />
      </Container>
    )
  }

  if (error) {
    return (
      <Container center>
        <Status 
          ok={false} 
          name="error.loading" 
          error={error}
          variant="outlined"
        />
        <Button 
          name="retry" 
          onPress={loadUsers}
          variant="contained"
        />
      </Container>
    )
  }

  return (
    <Container>
      <Container row justify="space-between" padding="medium">
        <Text variant="headlineSmall" name="users.title" />
        
        <PermissionGuard permissions={['create-users']}>
          <Button
            name="create.user"
            variant="contained"
            icon="account-plus"
            onPress={() => navigation.navigate('UserCreate')}
          />
        </PermissionGuard>
      </Container>

      <List
        items={users}
        renderer={UserListItem}
        onClick={handleUserEdit}
      />
    </Container>
  )
}
```

### Custom Form Component

```typescript
import React from 'react'
import { useForm } from 'react-hook-form'
import { ajvResolver } from '@hookform/resolvers/ajv'
import { 
  Form, 
  FormField, 
  FormButton, 
  Container, 
  Text 
} from '@owlmeans/native-panel'

const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2 },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['admin', 'user', 'moderator'] }
  },
  required: ['name', 'email', 'role']
}

interface UserFormData {
  name: string
  email: string
  role: string
}

const UserForm: React.FC<{ user?: User; onSubmit: (data: UserFormData) => void }> = ({ 
  user, 
  onSubmit 
}) => {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<UserFormData>({
    resolver: ajvResolver(userSchema),
    defaultValues: user ? {
      name: user.name,
      email: user.email,
      role: user.role
    } : {}
  })

  return (
    <Container padding="medium">
      <Text variant="headlineSmall" name="user.form.title" />
      
      <Form onSubmit={handleSubmit(onSubmit)}>
        <FormField
          name="name"
          label="Full Name"
          control={control}
          error={errors.name?.message}
          autoCapitalize="words"
        />
        
        <FormField
          name="email"
          label="Email Address"
          control={control}
          error={errors.email?.message}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        
        <FormField
          name="role"
          label="User Role"
          control={control}
          error={errors.role?.message}
          type="select"
          options={[
            { value: 'user', label: 'Regular User' },
            { value: 'moderator', label: 'Moderator' },
            { value: 'admin', label: 'Administrator' }
          ]}
        />
        
        <Container row gap="medium" justify="flex-end">
          <FormButton 
            name="cancel"
            variant="outlined"
            onPress={navigation.goBack}
          />
          
          <FormButton
            name="save"
            variant="contained"
            type="submit"
            loading={isSubmitting}
            icon="content-save"
          />
        </Container>
      </Form>
    </Container>
  )
}
```

### Theme Customization

```typescript
import { PanelApp } from '@owlmeans/native-panel'

const customTheme = {
  colors: {
    primary: '#1976D2',
    secondary: '#388E3C',
    surface: '#FFFFFF',
    background: '#F5F5F5',
    error: '#D32F2F',
    warning: '#F57C00',
    success: '#388E3C'
  },
  fonts: {
    headlineLarge: {
      fontFamily: 'Roboto-Bold',
      fontSize: 32,
      fontWeight: '700'
    },
    titleMedium: {
      fontFamily: 'Roboto-Medium',
      fontSize: 16,
      fontWeight: '500'
    },
    bodyMedium: {
      fontFamily: 'Roboto-Regular',
      fontSize: 14,
      fontWeight: '400'
    }
  }
}

const customIcons = {
  'custom-dashboard': (props) => <CustomDashboardIcon {...props} />,
  'custom-users': (props) => <CustomUsersIcon {...props} />
}

<PanelApp
  context={context}
  colors={customTheme.colors}
  fonts={customTheme.fonts}
  icons={customIcons}
>
  <AdminInterface />
</PanelApp>
```

## Authentication Integration

### Protected Panel Components

```typescript
import { useContext, useAuth } from '@owlmeans/native-panel'

const ProtectedPanel: React.FC = () => {
  const context = useContext()
  const auth = useAuth()

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      const isAuthenticated = await auth.authenticated()
      if (!isAuthenticated) {
        navigation.navigate('Login')
      }
    }
    
    checkAuth()
  }, [])

  return (
    <PanelApp context={context}>
      <AuthenticatedContent />
    </PanelApp>
  )
}
```

### Authentication Guards

```typescript
import { PermissionGuard } from '@owlmeans/native-panel'

<PermissionGuard 
  permissions={['admin']}
  fallback={<UnauthorizedMessage />}
>
  <AdminOnlyFeatures />
</PermissionGuard>
```

## Internationalization Support

### Multi-language Panel

```typescript
import { addI18nApp } from '@owlmeans/i18n'

// Add translations
addI18nApp('en', 'panel', {
  'users.title': 'User Management',
  'users.create': 'Create User',
  'users.edit': 'Edit User',
  'save': 'Save',
  'cancel': 'Cancel'
})

addI18nApp('es', 'panel', {
  'users.title': 'Gestión de Usuarios',
  'users.create': 'Crear Usuario',
  'users.edit': 'Editar Usuario',
  'save': 'Guardar',
  'cancel': 'Cancelar'
})

// Use in components
<Text name="users.title" />
<Button name="save" onPress={handleSave} />
```

## Module Integration

The package automatically integrates authentication and configuration modules:

```typescript
// From modules.ts
import { modules as authModules } from '@owlmeans/client-auth'
import { modules as configModules } from '@owlmeans/native-client'

export const modules = [...authModules, ...configModules]
```

These modules provide:
- **Authentication modules**: Login, logout, token management
- **Configuration modules**: App settings and configuration management

## Performance Optimization

### Component Optimization

```typescript
import React, { memo, useMemo, useCallback } from 'react'

const OptimizedUserList = memo<ListProps<User>>(({ users, onUserSelect }) => {
  const memoizedUsers = useMemo(() => users.sort((a, b) => a.name.localeCompare(b.name)), [users])
  
  const handleUserSelect = useCallback((user: User) => {
    onUserSelect(user)
  }, [onUserSelect])

  return (
    <List
      items={memoizedUsers}
      renderer={UserListItem}
      onClick={handleUserSelect}
    />
  )
})
```

### Theme Performance

```typescript
// Pre-compute theme values for better performance
const computedTheme = useMemo(() => ({
  ...baseTheme,
  computed: {
    headerHeight: 56,
    tabBarHeight: 72,
    contentPadding: 16
  }
}), [baseTheme])
```

## Best Practices

1. **Component Structure**: Use consistent component hierarchy and naming
2. **Theme Consistency**: Maintain consistent theming across all components
3. **Performance**: Optimize list rendering and minimize re-renders
4. **Accessibility**: Include accessibility labels and hints
5. **Internationalization**: Always use i18n for user-facing text
6. **Security**: Implement proper permission checking and authentication
7. **Error Handling**: Provide graceful error handling and user feedback

## Related Packages

- **@owlmeans/client-panel**: Base panel functionality and context
- **@owlmeans/web-panel**: Web browser panel implementation
- **@owlmeans/native-client**: Native client framework and context
- **@owlmeans/client-auth**: Authentication components and services
- **@owlmeans/client-i18n**: Internationalization support

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { 
  ButtonProps, 
  TextProps, 
  ListProps, 
  PanelAppProps 
} from '@owlmeans/native-panel'

const MyButton: FC<ButtonProps> = (props) => { /* ... */ }
const MyList: FC<ListProps<User>> = (props) => { /* ... */ }
```