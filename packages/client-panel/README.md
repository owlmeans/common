# @owlmeans/client-panel

React client panel library for OwlMeans Common applications. This package provides a comprehensive set of UI components and utilities for building administrative panels, forms, and user interfaces with integrated internationalization, validation, and layout management.

## Overview

The `@owlmeans/client-panel` package extends the OwlMeans client ecosystem with pre-built UI components designed for panel applications. It provides:

- **Form Components**: Advanced form handling with validation and internationalization
- **Layout Components**: Flexible layout system for panel interfaces
- **Authentication Components**: Pre-built authentication UI components
- **Helper Utilities**: Form helpers, context providers, and utility functions
- **Internationalization**: Full i18n support with contextual translations
- **Validation Integration**: AJV schema validation with React Hook Form
- **Error Handling**: Comprehensive error display and management
- **Responsive Design**: Mobile-friendly responsive layout components

This package is part of the OwlMeans panel UI ecosystem:
- **@owlmeans/client-panel**: React panel components *(this package)*
- **@owlmeans/web-panel**: Web-specific panel implementations
- **@owlmeans/native-panel**: React Native panel components

## Installation

```bash
npm install @owlmeans/client-panel react react-hook-form
```

## Core Concepts

### Panel Architecture
The library follows a component-based architecture where panels are composed of reusable UI elements with consistent styling and behavior.

### Form Management
Built on React Hook Form with AJV schema validation, providing type-safe forms with automatic validation and error handling.

### Internationalization
Full integration with OwlMeans i18n system for translatable UI components with context-aware translations.

### Authentication Integration
Optional authentication components that integrate with the OwlMeans authentication system.

## API Reference

### Components

#### Form Components

The form system provides comprehensive form handling with validation, internationalization, and error management.

##### `<Form />`

Main form component with integrated validation and submission handling.

```typescript
interface FormProps extends PropsWithChildren<I18nProps> {
  name?: string                           // Form identifier for i18n
  formRef?: MutableRefObject<FormRef<any> | null>  // Form reference
  defaults?: Record<string, any>          // Default form values
  validation?: AnySchema                  // AJV validation schema
  decorate?: boolean                      // Apply form decoration
  horizontal?: BlockScaling               // Horizontal layout scaling
  vertical?: BlockScaling                 // Vertical layout scaling
  onSubmit?: FormOnSubmit<any>           // Submit handler
}

const Form: FC<FormProps>
```

**Usage:**
```typescript
import { Form, useFormRef } from '@owlmeans/client-panel'

function UserForm() {
  const formRef = useFormRef()
  
  const handleSubmit = async (data, update) => {
    try {
      await api.saveUser(data)
      console.log('User saved successfully')
    } catch (error) {
      formRef.current?.error(error)
    }
  }
  
  return (
    <Form
      name="user-form"
      formRef={formRef}
      defaults={{ name: '', email: '' }}
      validation={userSchema}
      onSubmit={handleSubmit}
    >
      <input name="name" placeholder="Name" />
      <input name="email" placeholder="Email" />
      <button type="submit">Save User</button>
    </Form>
  )
}
```

#### Layout Components

Layout components provide structured panel layouts with responsive design.

##### Layout Helper

```typescript
import { LayoutHelper } from '@owlmeans/client-panel'

// Layout utilities and components
```

### Hooks and Utilities

#### `useFormRef<T>(): MutableRefObject<FormRef<T> | null>`

Creates a reference for form component interaction.

```typescript
import { useFormRef } from '@owlmeans/client-panel'

function FormComponent() {
  const formRef = useFormRef<UserData>()
  
  const resetForm = () => {
    formRef.current?.form.reset()
  }
  
  const updateForm = (data: UserData) => {
    formRef.current?.update(data)
  }
  
  return (
    <div>
      <Form formRef={formRef}>
        {/* form fields */}
      </Form>
      <button onClick={resetForm}>Reset</button>
    </div>
  )
}
```

#### `useFormI18n(): I18nFunction`

Provides internationalization for form components with contextual prefixes.

```typescript
import { useFormI18n } from '@owlmeans/client-panel'

function FormField() {
  const t = useFormI18n()
  
  return (
    <div>
      <label>{t('name.label')}</label>
      <input placeholder={t('name.placeholder')} />
    </div>
  )
}
```

#### `useFormError(name: string, error?: FieldError): string | undefined`

Provides internationalized error messages for form fields.

```typescript
import { useFormError } from '@owlmeans/client-panel'
import { useFormState } from 'react-hook-form'

function FormField({ name }) {
  const { errors } = useFormState()
  const errorMessage = useFormError(name, errors[name])
  
  return (
    <div>
      <input name={name} />
      {errorMessage && <span className="error">{errorMessage}</span>}
    </div>
  )
}
```

#### `useClientFormContext(): TFormContext`

Accesses the current form context for configuration and state.

```typescript
import { useClientFormContext } from '@owlmeans/client-panel'

function CustomFormField() {
  const formContext = useClientFormContext()
  
  return (
    <div className={formContext.horizontal ? 'horizontal' : 'vertical'}>
      {/* field content */}
    </div>
  )
}
```

### Types and Interfaces

#### `FormRef<T>`

Reference interface for form component control.

```typescript
interface FormRef<T extends FieldValues = FieldValues> {
  form: UseFormReturn<T>        // React Hook Form instance
  update: (data: T) => void     // Update form data
  loader: Toggleable            // Loading state control
  error: (error: unknown, target?: string) => void  // Error handling
}
```

#### `FormOnSubmit<T>`

Submit handler interface for form components.

```typescript
interface FormOnSubmit<T> {
  (data: T, update?: (data: T) => void): Promise<void> | void
}
```

#### `TFormContext`

Form context interface for component communication.

```typescript
interface TFormContext extends Omit<FormProps, 'defaults' | 'children'> {
  loader: Toggleable            // Loading state management
}
```

#### `FormFieldProps`

Base properties for form field components.

```typescript
interface FormFieldProps {
  name: string                  // Field name
  def?: any                     // Default value
}
```

### Helper Functions

#### `schemaToFormDefault(schema: AnySchema): Record<string, any>`

Extracts default values from AJV schema for form initialization.

```typescript
import { schemaToFormDefault } from '@owlmeans/client-panel'

const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', default: 'John Doe' },
    email: { type: 'string', default: '' },
    age: { type: 'number', default: 18 }
  }
}

const defaults = schemaToFormDefault(userSchema)
// Result: { name: 'John Doe', email: '', age: 18 }
```

### Constants

#### `BlockScaling`

Enumeration for layout scaling options.

```typescript
enum BlockScaling {
  // Layout scaling values
}
```

### Authentication Components

The package includes optional authentication components accessible via the `/auth` export:

```typescript
import { AuthComponents } from '@owlmeans/client-panel/auth'
import { AuthPlugins } from '@owlmeans/client-panel/auth/plugins'
```

These components provide:
- Pre-built authentication forms
- Login and registration components
- Authentication plugins and extensions
- Integration with OwlMeans authentication system

## Usage Examples

### Basic Form with Validation

```typescript
import React from 'react'
import { Form, useFormRef, schemaToFormDefault } from '@owlmeans/client-panel'
import { useFormState } from 'react-hook-form'

interface UserData {
  name: string
  email: string
  age: number
}

const userSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 2, default: '' },
    email: { type: 'string', format: 'email', default: '' },
    age: { type: 'number', minimum: 18, default: 18 }
  },
  required: ['name', 'email']
}

function UserRegistrationForm() {
  const formRef = useFormRef<UserData>()
  const defaults = schemaToFormDefault(userSchema)
  
  const handleSubmit = async (data: UserData, update) => {
    try {
      // Show loading state
      formRef.current?.loader.on()
      
      // Submit data
      await api.createUser(data)
      
      // Success - reset form
      formRef.current?.form.reset()
      
      console.log('User created successfully')
    } catch (error) {
      // Handle error
      formRef.current?.error(error)
    } finally {
      // Hide loading state
      formRef.current?.loader.off()
    }
  }
  
  return (
    <Form
      name="user-registration"
      formRef={formRef}
      defaults={defaults}
      validation={userSchema}
      onSubmit={handleSubmit}
      decorate={true}
    >
      <UserFormFields />
    </Form>
  )
}

function UserFormFields() {
  const { errors } = useFormState<UserData>()
  const t = useFormI18n()
  const nameError = useFormError('name', errors.name)
  const emailError = useFormError('email', errors.email)
  
  return (
    <div>
      <div>
        <label>{t('name.label')}</label>
        <input
          name="name"
          placeholder={t('name.placeholder')}
          className={errors.name ? 'error' : ''}
        />
        {nameError && <span className="error-text">{nameError}</span>}
      </div>
      
      <div>
        <label>{t('email.label')}</label>
        <input
          name="email"
          type="email"
          placeholder={t('email.placeholder')}
          className={errors.email ? 'error' : ''}
        />
        {emailError && <span className="error-text">{emailError}</span>}
      </div>
      
      <div>
        <label>{t('age.label')}</label>
        <input
          name="age"
          type="number"
          min="18"
        />
      </div>
      
      <button type="submit">{t('submit')}</button>
    </div>
  )
}
```

### Form with Dynamic Validation

```typescript
import { Form, useFormRef } from '@owlmeans/client-panel'
import { useState } from 'react'

function DynamicForm() {
  const formRef = useFormRef()
  const [formType, setFormType] = useState<'basic' | 'advanced'>('basic')
  
  const basicSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2 },
      email: { type: 'string', format: 'email' }
    },
    required: ['name', 'email']
  }
  
  const advancedSchema = {
    type: 'object',
    properties: {
      ...basicSchema.properties,
      phone: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' },
      company: { type: 'string', minLength: 2 }
    },
    required: [...basicSchema.required, 'phone', 'company']
  }
  
  const currentSchema = formType === 'basic' ? basicSchema : advancedSchema
  
  const handleSubmit = async (data) => {
    console.log('Form data:', data)
    console.log('Form type:', formType)
  }
  
  return (
    <div>
      <div>
        <button onClick={() => setFormType('basic')}>Basic Form</button>
        <button onClick={() => setFormType('advanced')}>Advanced Form</button>
      </div>
      
      <Form
        name={`${formType}-form`}
        formRef={formRef}
        validation={currentSchema}
        onSubmit={handleSubmit}
      >
        <input name="name" placeholder="Name" />
        <input name="email" placeholder="Email" />
        
        {formType === 'advanced' && (
          <>
            <input name="phone" placeholder="Phone" />
            <input name="company" placeholder="Company" />
          </>
        )}
        
        <button type="submit">Submit {formType} Form</button>
      </Form>
    </div>
  )
}
```

### Internationalized Form

```typescript
import { Form, useFormI18n, useFormError } from '@owlmeans/client-panel'
import { addI18nApp } from '@owlmeans/i18n'

// Add translations
addI18nApp('en', 'user-form', {
  'name.label': 'Full Name',
  'name.placeholder': 'Enter your full name',
  'email.label': 'Email Address',
  'email.placeholder': 'Enter your email',
  'submit': 'Create Account',
  'name.errors.minLength': 'Name must be at least 2 characters',
  'email.errors.format': 'Please enter a valid email address'
})

addI18nApp('es', 'user-form', {
  'name.label': 'Nombre Completo',
  'name.placeholder': 'Ingrese su nombre completo',
  'email.label': 'Dirección de Correo',
  'email.placeholder': 'Ingrese su correo',
  'submit': 'Crear Cuenta',
  'name.errors.minLength': 'El nombre debe tener al menos 2 caracteres',
  'email.errors.format': 'Por favor ingrese un correo válido'
})

function InternationalizedForm() {
  const formRef = useFormRef()
  
  const handleSubmit = async (data) => {
    console.log('Localized form data:', data)
  }
  
  return (
    <Form
      name="user-form"
      formRef={formRef}
      validation={userSchema}
      onSubmit={handleSubmit}
      i18n={{
        resource: 'user-form',
        ns: 'user-form'
      }}
    >
      <LocalizedFormFields />
    </Form>
  )
}

function LocalizedFormFields() {
  const { errors } = useFormState()
  const t = useFormI18n()
  const nameError = useFormError('name', errors.name)
  const emailError = useFormError('email', errors.email)
  
  return (
    <div>
      <div>
        <label>{t('name.label')}</label>
        <input
          name="name"
          placeholder={t('name.placeholder')}
        />
        {nameError && <div className="error">{nameError}</div>}
      </div>
      
      <div>
        <label>{t('email.label')}</label>
        <input
          name="email"
          placeholder={t('email.placeholder')}
        />
        {emailError && <div className="error">{emailError}</div>}
      </div>
      
      <button type="submit">{t('submit')}</button>
    </div>
  )
}
```

### Form with Custom Error Handling

```typescript
import { Form, useFormRef } from '@owlmeans/client-panel'
import { OwlMeansError } from '@owlmeans/error'

function FormWithErrorHandling() {
  const formRef = useFormRef()
  const [serverErrors, setServerErrors] = useState({})
  
  const handleSubmit = async (data) => {
    try {
      setServerErrors({})
      formRef.current?.loader.on()
      
      await api.submitData(data)
      
      // Success
      formRef.current?.form.reset()
    } catch (error) {
      if (error instanceof OwlMeansError) {
        // Handle specific OwlMeans errors
        if (error.code === 'VALIDATION_ERROR') {
          setServerErrors(error.details || {})
        } else {
          formRef.current?.error(error, 'general')
        }
      } else {
        // Handle generic errors
        formRef.current?.error(error)
      }
    } finally {
      formRef.current?.loader.off()
    }
  }
  
  return (
    <Form
      name="error-handling-form"
      formRef={formRef}
      onSubmit={handleSubmit}
    >
      <div>
        <input name="email" />
        {serverErrors.email && (
          <div className="server-error">{serverErrors.email}</div>
        )}
      </div>
      
      <button type="submit">Submit</button>
    </Form>
  )
}
```

### Layout Components Usage

```typescript
import { LayoutHelper } from '@owlmeans/client-panel'

function PanelLayout() {
  return (
    <LayoutHelper>
      <div className="panel-container">
        <header className="panel-header">
          <h1>Admin Panel</h1>
        </header>
        
        <main className="panel-content">
          <Form name="admin-form">
            {/* form content */}
          </Form>
        </main>
        
        <footer className="panel-footer">
          <p>© 2024 My Company</p>
        </footer>
      </div>
    </LayoutHelper>
  )
}
```

### Authentication Panel Integration

```typescript
import { AuthComponents } from '@owlmeans/client-panel/auth'
import { useContext } from '@owlmeans/client'

function AuthPanel() {
  const context = useContext()
  const authService = context.service('auth')
  
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  useEffect(() => {
    const checkAuth = async () => {
      const token = await authService.authenticated()
      setIsAuthenticated(token != null)
    }
    
    checkAuth()
  }, [])
  
  if (!isAuthenticated) {
    return <AuthComponents.LoginForm />
  }
  
  return (
    <div>
      <h1>Authenticated Panel</h1>
      {/* panel content */}
    </div>
  )
}
```

### Responsive Panel Design

```typescript
import { Form } from '@owlmeans/client-panel'
import { useState, useEffect } from 'react'

function ResponsivePanel() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  return (
    <Form
      name="responsive-form"
      horizontal={isMobile ? 'sm' : 'lg'}
      vertical={isMobile ? 'sm' : 'md'}
    >
      <div className={isMobile ? 'mobile-layout' : 'desktop-layout'}>
        {/* form fields */}
      </div>
    </Form>
  )
}
```

## Integration with Other Packages

### Client Integration
```typescript
import { useContext } from '@owlmeans/client'
import { Form } from '@owlmeans/client-panel'

// Form components automatically integrate with client context
```

### Internationalization Integration
```typescript
import { useI18n } from '@owlmeans/client-i18n'
import { Form, useFormI18n } from '@owlmeans/client-panel'

// Automatic i18n integration for form components
```

### Authentication Integration
```typescript
import { AuthComponents } from '@owlmeans/client-panel/auth'
import { useContext } from '@owlmeans/client'

// Authentication panel components
```

### Module Integration
```typescript
import { modules } from '@owlmeans/client-module'
import { Form } from '@owlmeans/client-panel'

// Forms can be used within module-based routing
```

## Error Handling

The package integrates with the OwlMeans error system:

```typescript
import { OwlMeansError } from '@owlmeans/error'
import { Form, useFormRef } from '@owlmeans/client-panel'

const handleFormError = (error: unknown) => {
  if (error instanceof OwlMeansError) {
    // Handle specific error types
    switch (error.code) {
      case 'VALIDATION_ERROR':
        // Handle validation errors
        break
      case 'AUTHENTICATION_ERROR':
        // Handle auth errors
        break
      default:
        // Handle other errors
        break
    }
  }
}
```

## Best Practices

1. **Form Validation**: Use AJV schemas for consistent validation
2. **Internationalization**: Provide translations for all user-facing text
3. **Error Handling**: Implement comprehensive error handling for forms
4. **Responsive Design**: Use layout components for responsive interfaces
5. **Accessibility**: Ensure forms are accessible with proper labels and ARIA attributes
6. **Performance**: Use form refs to avoid unnecessary re-renders
7. **Type Safety**: Use TypeScript interfaces for form data types

## Dependencies

This package depends on:
- `@owlmeans/client` - React client library
- `@owlmeans/client-i18n` - Client internationalization
- `@owlmeans/client-module` - Client module system
- `@owlmeans/error` - Error handling system
- `react` - React library (peer dependency)
- `react-hook-form` - Form management (peer dependency)

## Related Packages

- [`@owlmeans/client`](../client) - React client library
- [`@owlmeans/web-panel`](../web-panel) - Web-specific panel components
- [`@owlmeans/native-panel`](../native-panel) - React Native panel components
- [`@owlmeans/client-i18n`](../client-i18n) - Client internationalization
- [`@owlmeans/client-auth`](../client-auth) - Authentication integration