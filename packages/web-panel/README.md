# @owlmeans/web-panel

Web-based panel components and infrastructure for OwlMeans Common Libraries. This package extends the `@owlmeans/client-panel` functionality with React web components, Material-UI integration, and web-specific implementations for building comprehensive administrative interfaces and user panels.

## Overview

The `@owlmeans/web-panel` package serves as the web-specific implementation of the OwlMeans panel system, designed for fullstack applications with focus on security and modern web user interfaces. It provides:

- **Material-UI Integration**: Complete Material Design component system with theming
- **Web Panel Components**: Comprehensive React components for building web admin panels
- **Authentication Integration**: Built-in authentication components and flows
- **Form Management**: Advanced form components with validation and error handling
- **File Upload**: File and media upload components with progress tracking
- **Layout System**: Flexible layout components for organizing panel content
- **Theme Customization**: Material-UI theme integration with customizable styling
- **Internationalization**: Built-in i18n support with browser language detection

This package follows the OwlMeans "quadra" pattern as the **web** implementation, complementing:
- **@owlmeans/client-panel**: Common panel declarations and base functionality *(base package)*
- **@owlmeans/native-panel**: React Native panel implementation
- **@owlmeans/web-panel**: Web browser panel implementation *(this package)*

## Installation

```bash
npm install @owlmeans/web-panel
```

### Peer Dependencies

This package requires several peer dependencies for web development:

```bash
npm install react react-dom @mui/material @emotion/react @emotion/styled react-hook-form @hookform/resolvers ajv
```

## Dependencies

This package builds upon the OwlMeans ecosystem and web technologies:
- `@owlmeans/client-panel`: Base panel functionality and context
- `@owlmeans/web-client`: Web client framework and rendering
- `@owlmeans/client-auth`: Authentication components and services
- `@owlmeans/client-flow`: Flow management integration
- `@owlmeans/web-flow`: Web-specific flow implementations
- Material-UI: React component library for Material Design
- React Hook Form: Form management and validation

## Key Concepts

### Material-UI Integration
Built on Material-UI (MUI) providing:
- **Material Design**: Modern Material Design 3 component system
- **Theme System**: Comprehensive theming with custom color schemes
- **Responsive Design**: Mobile-first responsive components
- **Accessibility**: Built-in accessibility support and ARIA compliance

### Panel Architecture
Structured panel system with:
- **Panel Context**: Shared context for panel-wide settings and state
- **Authentication Guards**: Built-in authentication and authorization
- **Layout Management**: Flexible layout system for complex interfaces
- **Navigation Integration**: Integration with React Router and client routing

### Form Management
Advanced form capabilities with:
- **React Hook Form**: Performance-optimized form management
- **AJV Validation**: Schema-based validation using JSON Schema
- **Error Handling**: Comprehensive error display and user feedback
- **File Uploads**: Integrated file and media upload components

## API Reference

### Main Functions

#### `render<C, T>(context, theme?, opts?): void`

Main rendering function for web panel applications.

```typescript
function render<C extends ClientConfig, T extends ClientContext<C>>(
  context: T,
  theme?: Theme,
  opts?: RenderOptions
): void
```

**Parameters:**
- `context`: Client context with configuration and services
- `theme`: Optional Material-UI theme customization
- `opts`: Optional rendering options

**Usage:**
```typescript
import { render } from '@owlmeans/web-panel'
import { makeWebContext } from '@owlmeans/web-client'
import { createTheme } from '@mui/material/styles'

const context = makeWebContext(config)
const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#dc004e' }
  }
})

render(context, theme, { rootId: 'app' })
```

### Core Components

#### `PanelApp`

Main panel application wrapper with Material-UI theming and context integration.

```typescript
interface PanelAppProps {
  context: AppContext<any>           // Application context
  provide?: ProvideFunction          // Custom provider function
  children?: React.ReactNode         // Panel content
  theme?: Theme                      // Material-UI theme
}

const PanelApp: FC<PanelAppProps> = (props) => { /* ... */ }
```

**Features:**
- Material-UI theme provider integration
- CSS baseline normalization
- I18n context with browser language detection
- OwlMeans client app wrapper

**Usage:**
```typescript
import { PanelApp } from '@owlmeans/web-panel'

<PanelApp context={context} theme={customTheme}>
  <AdminInterface />
</PanelApp>
```

### Layout Components

#### Panel Layout System

Flexible layout components for organizing panel content.

```typescript
import { 
  PanelLayout, 
  PanelHeader, 
  PanelSidebar, 
  PanelContent,
  PanelFooter 
} from '@owlmeans/web-panel'

<PanelLayout>
  <PanelHeader title="Administration Panel">
    <UserMenu />
  </PanelHeader>
  
  <PanelSidebar>
    <NavigationMenu />
  </PanelSidebar>
  
  <PanelContent>
    <MainContent />
  </PanelContent>
  
  <PanelFooter>
    <StatusBar />
  </PanelFooter>
</PanelLayout>
```

### Form Components

#### Advanced Form System

React Hook Form integration with Material-UI components and AJV validation.

```typescript
import { 
  PanelForm, 
  FormField, 
  FormButton, 
  FormSelect,
  FormCheckbox,
  FormValidation 
} from '@owlmeans/web-panel'

interface UserFormData {
  name: string
  email: string
  role: string
  active: boolean
}

const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2 },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: ['admin', 'user'] },
    active: { type: 'boolean' }
  },
  required: ['name', 'email', 'role']
}

<PanelForm<UserFormData>
  schema={userSchema}
  onSubmit={handleSubmit}
  defaultValues={defaultValues}
>
  <FormField
    name="name"
    label="Full Name"
    type="text"
    required
  />
  
  <FormField
    name="email"
    label="Email Address"
    type="email"
    required
  />
  
  <FormSelect
    name="role"
    label="User Role"
    options={[
      { value: 'admin', label: 'Administrator' },
      { value: 'user', label: 'Regular User' }
    ]}
    required
  />
  
  <FormCheckbox
    name="active"
    label="Active User"
  />
  
  <FormButton type="submit" variant="contained">
    Save User
  </FormButton>
</PanelForm>
```

### Button Components

Enhanced button components with loading states and Material-UI integration.

```typescript
import { PanelButton, IconButton, FloatingActionButton } from '@owlmeans/web-panel'

<PanelButton
  variant="contained"
  color="primary"
  startIcon={<SaveIcon />}
  loading={isSaving}
  onClick={handleSave}
>
  Save Changes
</PanelButton>

<IconButton
  color="secondary"
  onClick={handleEdit}
  tooltip="Edit Item"
>
  <EditIcon />
</IconButton>

<FloatingActionButton
  color="primary"
  onClick={handleAdd}
  position="bottom-right"
>
  <AddIcon />
</FloatingActionButton>
```

### File Upload Components

Comprehensive file upload system with progress tracking and validation.

```typescript
import { 
  FileUploader, 
  ImageUploader, 
  MultiFileUploader,
  DropZone 
} from '@owlmeans/web-panel'

<FileUploader
  accept=".pdf,.doc,.docx"
  maxSize={10 * 1024 * 1024} // 10MB
  onUpload={handleFileUpload}
  onProgress={handleProgress}
  onError={handleError}
/>

<ImageUploader
  accept="image/*"
  maxSize={5 * 1024 * 1024} // 5MB
  cropAspectRatio={16/9}
  onUpload={handleImageUpload}
  preview={true}
/>

<MultiFileUploader
  maxFiles={5}
  accept="*/*"
  onUploadAll={handleMultipleUpload}
  showProgress={true}
/>

<DropZone
  onDrop={handleFileDrop}
  accept=".zip,.tar.gz"
  multiple={false}
>
  Drop files here or click to browse
</DropZone>
```

### Text and Display Components

Typography and content display components.

```typescript
import { 
  PanelText, 
  PanelLink, 
  StatusIndicator, 
  InfoBlock 
} from '@owlmeans/web-panel'

<PanelText variant="h4" color="primary" gutterBottom>
  Panel Title
</PanelText>

<PanelLink href="/admin/users" external={false}>
  Manage Users
</PanelLink>

<StatusIndicator 
  status="success" 
  message="Operation completed successfully"
/>

<InfoBlock 
  title="Important Notice"
  severity="warning"
  actions={[
    { label: 'Dismiss', onClick: handleDismiss },
    { label: 'Learn More', onClick: openDetails }
  ]}
>
  This action cannot be undone.
</InfoBlock>
```

### Authentication Components

Built-in authentication UI components and flows.

```typescript
import { 
  LoginForm, 
  LogoutButton, 
  UserProfile, 
  AuthGuard,
  PermissionGuard 
} from '@owlmeans/web-panel/auth'

<AuthGuard fallback={<LoginForm />}>
  <PanelApp context={context}>
    <PermissionGuard permissions={['admin']}>
      <AdminPanel />
    </PermissionGuard>
  </PanelApp>
</AuthGuard>

<LoginForm
  onSuccess={handleLoginSuccess}
  onError={handleLoginError}
  showRegister={true}
  showForgotPassword={true}
/>

<UserProfile
  showAvatar={true}
  showMenu={true}
  menuActions={[
    { label: 'Settings', onClick: openSettings },
    { label: 'Logout', onClick: handleLogout }
  ]}
/>
```

## Usage Examples

### Complete Panel Application

```typescript
import React from 'react'
import { render } from '@owlmeans/web-panel'
import { makeWebContext } from '@owlmeans/web-client'
import { createTheme } from '@mui/material/styles'
import {
  PanelApp,
  PanelLayout,
  PanelHeader,
  PanelSidebar,
  PanelContent,
  AuthGuard
} from '@owlmeans/web-panel'

const config = {
  service: 'admin-panel',
  type: AppType.Frontend,
  layer: Layer.Service
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#dc004e'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    }
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500
    }
  },
  shape: {
    borderRadius: 8
  }
})

const AdminPanelApp: React.FC = () => {
  const context = makeWebContext(config)

  return (
    <PanelApp context={context} theme={theme}>
      <AuthGuard>
        <PanelLayout>
          <PanelHeader title="Administration Panel">
            <UserProfile />
          </PanelHeader>
          
          <PanelSidebar>
            <AdminNavigation />
          </PanelSidebar>
          
          <PanelContent>
            <AdminRouter />
          </PanelContent>
        </PanelLayout>
      </AuthGuard>
    </PanelApp>
  )
}

// Render the application
render(makeWebContext(config), theme)
```

### User Management Interface

```typescript
import React, { useState, useEffect } from 'react'
import {
  PanelForm,
  FormField,
  FormSelect,
  FormButton,
  PanelButton,
  StatusIndicator,
  InfoBlock
} from '@owlmeans/web-panel'
import { Grid, Card, CardContent, Typography } from '@mui/material'

interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  createdAt: Date
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleUserSave = async (userData: Partial<User>) => {
    try {
      const url = editing ? `/api/users/${editing.id}` : '/api/users'
      const method = editing ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
      
      if (response.ok) {
        await loadUsers()
        setEditing(null)
      } else {
        setError('Failed to save user')
      }
    } catch (err) {
      setError('Network error')
    }
  }

  const handleUserDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    
    try {
      const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
      if (response.ok) {
        await loadUsers()
      } else {
        setError('Failed to delete user')
      }
    } catch (err) {
      setError('Network error')
    }
  }

  const userSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      email: { type: 'string', format: 'email' },
      role: { type: 'string', enum: ['admin', 'user', 'moderator'] },
      active: { type: 'boolean' }
    },
    required: ['name', 'email', 'role']
  }

  if (loading) {
    return <StatusIndicator status="loading" message="Loading users..." />
  }

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h4" gutterBottom>
          User Management
        </Typography>
        
        {error && (
          <InfoBlock severity="error" onClose={() => setError(null)}>
            {error}
          </InfoBlock>
        )}
      </Grid>

      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Users
            </Typography>
            
            <PanelButton
              variant="contained"
              color="primary"
              onClick={() => setEditing({} as User)}
              sx={{ mb: 2 }}
            >
              Add New User
            </PanelButton>

            {users.map(user => (
              <Card key={user.id} variant="outlined" sx={{ mb: 1 }}>
                <CardContent>
                  <Grid container alignItems="center" spacing={2}>
                    <Grid item xs>
                      <Typography variant="subtitle1">{user.name}</Typography>
                      <Typography variant="body2" color="textSecondary">
                        {user.email} • {user.role}
                      </Typography>
                    </Grid>
                    <Grid item>
                      <StatusIndicator 
                        status={user.active ? 'success' : 'warning'}
                        message={user.active ? 'Active' : 'Inactive'}
                      />
                    </Grid>
                    <Grid item>
                      <PanelButton
                        size="small"
                        onClick={() => setEditing(user)}
                      >
                        Edit
                      </PanelButton>
                      <PanelButton
                        size="small"
                        color="error"
                        onClick={() => handleUserDelete(user.id)}
                        sx={{ ml: 1 }}
                      >
                        Delete
                      </PanelButton>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={4}>
        {editing && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {editing.id ? 'Edit User' : 'Add User'}
              </Typography>
              
              <PanelForm
                schema={userSchema}
                defaultValues={editing}
                onSubmit={handleUserSave}
              >
                <FormField
                  name="name"
                  label="Full Name"
                  required
                  fullWidth
                  margin="normal"
                />
                
                <FormField
                  name="email"
                  label="Email Address"
                  type="email"
                  required
                  fullWidth
                  margin="normal"
                />
                
                <FormSelect
                  name="role"
                  label="Role"
                  required
                  fullWidth
                  margin="normal"
                  options={[
                    { value: 'user', label: 'Regular User' },
                    { value: 'moderator', label: 'Moderator' },
                    { value: 'admin', label: 'Administrator' }
                  ]}
                />
                
                <FormField
                  name="active"
                  label="Active User"
                  type="checkbox"
                  margin="normal"
                />
                
                <Grid container spacing={2} sx={{ mt: 2 }}>
                  <Grid item>
                    <FormButton
                      type="submit"
                      variant="contained"
                      color="primary"
                    >
                      {editing.id ? 'Update' : 'Create'}
                    </FormButton>
                  </Grid>
                  <Grid item>
                    <PanelButton
                      variant="outlined"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </PanelButton>
                  </Grid>
                </Grid>
              </PanelForm>
            </CardContent>
          </Card>
        )}
      </Grid>
    </Grid>
  )
}

export default UserManagement
```

### File Upload Interface

```typescript
import React, { useState } from 'react'
import {
  FileUploader,
  ImageUploader,
  MultiFileUploader,
  StatusIndicator,
  PanelButton
} from '@owlmeans/web-panel'
import { Grid, Card, CardContent, Typography, LinearProgress } from '@mui/material'

const FileManagement: React.FC = () => {
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])

  const handleFileUpload = async (file: File, progressCallback: (progress: number) => void) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const xhr = new XMLHttpRequest()
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100
          progressCallback(progress)
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setUploadedFiles(prev => [...prev, file.name])
          setUploadProgress(prev => {
            const updated = { ...prev }
            delete updated[file.name]
            return updated
          })
        }
      })

      xhr.open('POST', '/api/upload')
      xhr.send(formData)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }

  const handleImageUpload = async (file: File, cropData?: any) => {
    console.log('Uploading image:', file.name, 'Crop data:', cropData)
    // Implement image upload with crop data
  }

  const handleMultipleUpload = async (files: File[]) => {
    for (const file of files) {
      await handleFileUpload(file, () => {})
    }
  }

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h4" gutterBottom>
          File Management
        </Typography>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Document Upload
            </Typography>
            
            <FileUploader
              accept=".pdf,.doc,.docx,.txt"
              maxSize={10 * 1024 * 1024} // 10MB
              onUpload={handleFileUpload}
              multiple={false}
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Image Upload
            </Typography>
            
            <ImageUploader
              accept="image/*"
              maxSize={5 * 1024 * 1024} // 5MB
              cropAspectRatio={16/9}
              onUpload={handleImageUpload}
              preview={true}
              cropperOptions={{
                guides: false,
                center: false,
                highlight: false,
                background: false,
                autoCropArea: 1,
                checkOrientation: false
              }}
            />
          </CardContent>
        </Card>
      </Grid>

      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Multiple File Upload
            </Typography>
            
            <MultiFileUploader
              maxFiles={5}
              accept="*/*"
              onUploadAll={handleMultipleUpload}
              showProgress={true}
            />
            
            {Object.entries(uploadProgress).map(([fileName, progress]) => (
              <div key={fileName}>
                <Typography variant="body2" gutterBottom>
                  {fileName}
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={progress} 
                  sx={{ mb: 1 }}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </Grid>

      {uploadedFiles.length > 0 && (
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Uploaded Files
              </Typography>
              
              {uploadedFiles.map(fileName => (
                <StatusIndicator
                  key={fileName}
                  status="success"
                  message={`${fileName} uploaded successfully`}
                />
              ))}
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  )
}

export default FileManagement
```

## Authentication Integration

### Protected Routes and Components

```typescript
import { AuthGuard, PermissionGuard } from '@owlmeans/web-panel/auth'
import { Navigate } from 'react-router-dom'

// Protect entire application
<AuthGuard fallback={<Navigate to="/login" />}>
  <PanelApp context={context}>
    <Router>
      <Routes>
        <Route path="/admin" element={
          <PermissionGuard permissions={['admin']}>
            <AdminPanel />
          </PermissionGuard>
        } />
        <Route path="/users" element={
          <PermissionGuard permissions={['user-management']}>
            <UserManagement />
          </PermissionGuard>
        } />
      </Routes>
    </Router>
  </PanelApp>
</AuthGuard>

// Conditional rendering based on permissions
const AdminActions: React.FC = () => (
  <PermissionGuard permissions={['admin', 'moderator']}>
    {(hasPermission) => (
      <PanelButton 
        disabled={!hasPermission}
        onClick={handleAdminAction}
      >
        Admin Action
      </PanelButton>
    )}
  </PermissionGuard>
)
```

## Theme Customization

### Custom Material-UI Theme

```typescript
import { createTheme, ThemeProvider } from '@mui/material/styles'

const customTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff'
    },
    secondary: {
      main: '#dc004e',
      light: '#f06292',
      dark: '#c2185b',
      contrastText: '#ffffff'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    },
    text: {
      primary: '#212121',
      secondary: '#757575'
    }
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500,
      lineHeight: 1.2
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
      lineHeight: 1.3
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5
    }
  },
  shape: {
    borderRadius: 8
  },
  spacing: 8,
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
          }
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500
        }
      }
    }
  }
})

// Apply theme to panel app
<PanelApp context={context} theme={customTheme}>
  <AdminInterface />
</PanelApp>
```

## Internationalization

### Multi-language Support

```typescript
import { addI18nApp } from '@owlmeans/i18n'

// Add translations for panel
addI18nApp('en', 'panel', {
  'panel.title': 'Administration Panel',
  'users.title': 'User Management',
  'users.add': 'Add New User',
  'users.edit': 'Edit User',
  'users.delete': 'Delete User',
  'form.save': 'Save',
  'form.cancel': 'Cancel',
  'status.loading': 'Loading...',
  'status.error': 'An error occurred',
  'status.success': 'Operation completed successfully'
})

addI18nApp('es', 'panel', {
  'panel.title': 'Panel de Administración',
  'users.title': 'Gestión de Usuarios',
  'users.add': 'Agregar Nuevo Usuario',
  'users.edit': 'Editar Usuario',
  'users.delete': 'Eliminar Usuario',
  'form.save': 'Guardar',
  'form.cancel': 'Cancelar',
  'status.loading': 'Cargando...',
  'status.error': 'Ocurrió un error',
  'status.success': 'Operación completada exitosamente'
})

// Use translations in components
import { useTranslation } from '@owlmeans/client-i18n'

const UserPanel: React.FC = () => {
  const { t } = useTranslation()
  
  return (
    <Typography variant="h4">
      {t('users.title')}
    </Typography>
  )
}
```

## Performance Optimization

### Code Splitting and Lazy Loading

```typescript
import React, { lazy, Suspense } from 'react'
import { StatusIndicator } from '@owlmeans/web-panel'

// Lazy load panel sections
const UserManagement = lazy(() => import('./UserManagement'))
const SystemSettings = lazy(() => import('./SystemSettings'))
const Reports = lazy(() => import('./Reports'))

const AdminRouter: React.FC = () => (
  <Routes>
    <Route path="/users" element={
      <Suspense fallback={<StatusIndicator status="loading" message="Loading users..." />}>
        <UserManagement />
      </Suspense>
    } />
    <Route path="/settings" element={
      <Suspense fallback={<StatusIndicator status="loading" message="Loading settings..." />}>
        <SystemSettings />
      </Suspense>
    } />
    <Route path="/reports" element={
      <Suspense fallback={<StatusIndicator status="loading" message="Loading reports..." />}>
        <Reports />
      </Suspense>
    } />
  </Routes>
)
```

### Memoization and Optimization

```typescript
import React, { memo, useMemo, useCallback } from 'react'

const OptimizedUserList = memo<{ users: User[]; onUserSelect: (user: User) => void }>(({ 
  users, 
  onUserSelect 
}) => {
  const sortedUsers = useMemo(() => 
    users.sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  )
  
  const handleUserClick = useCallback((user: User) => {
    onUserSelect(user)
  }, [onUserSelect])

  return (
    <div>
      {sortedUsers.map(user => (
        <UserCard 
          key={user.id} 
          user={user} 
          onClick={handleUserClick}
        />
      ))}
    </div>
  )
})
```

## Best Practices

1. **Component Structure**: Use consistent component hierarchy and naming conventions
2. **Theme Management**: Leverage Material-UI theme system for consistent styling
3. **Form Validation**: Use AJV schemas for robust form validation
4. **Error Handling**: Provide comprehensive error feedback and recovery options
5. **Performance**: Implement code splitting and memoization for large applications
6. **Accessibility**: Ensure all components meet WCAG accessibility standards
7. **Internationalization**: Always use i18n for user-facing text
8. **Testing**: Write comprehensive tests for form validation and user interactions

## Authentication Modules

The package provides authentication-specific modules and components:

```typescript
import { modules } from '@owlmeans/web-panel/auth/modules'
import { AuthProvider, LoginForm } from '@owlmeans/web-panel/auth'

// Register authentication modules
context.registerModules(modules)

// Use authentication components
<AuthProvider context={context}>
  <LoginForm 
    onSuccess={handleLogin}
    features={{
      showRegister: true,
      showForgotPassword: true,
      showRememberMe: true
    }}
  />
</AuthProvider>
```

## Related Packages

- **@owlmeans/client-panel**: Base panel functionality and context
- **@owlmeans/native-panel**: React Native panel implementation
- **@owlmeans/web-client**: Web client framework and rendering
- **@owlmeans/client-auth**: Authentication components and services
- **@owlmeans/client-flow**: Flow management integration
- **@owlmeans/web-flow**: Web-specific flow implementations

## TypeScript Support

This package is written in TypeScript and provides full type safety:

```typescript
import type { 
  PanelAppProps,
  FormFieldProps,
  FileUploaderProps,
  AuthGuardProps 
} from '@owlmeans/web-panel'

const MyPanel: FC<PanelAppProps> = (props) => { /* ... */ }
const MyForm: FC<{ onSubmit: (data: FormData) => void }> = ({ onSubmit }) => { /* ... */ }
```