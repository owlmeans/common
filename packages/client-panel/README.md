# @owlmeans/client-panel

Schema-driven React form components with react-hook-form integration, i18n, and action buttons.

## Overview

- `ClientForm` — form wrapper with react-hook-form, AJV schema validation, and submit handling
- `ActionCtrl` — i18n-aware button component for form actions (submit, cancel, etc.)
- `InputCtrl` — labeled input field component backed by react-hook-form
- `useFormRef()` — hook to get a ref for programmatic form operations
- `FormOnSubmit` — type for form submission handler functions
- Platform-agnostic: used by React web and React Native frontends

## Installation

```bash
bun add @owlmeans/client-panel
```

## Usage

A complete form with submit and cancel actions:

```typescript
import { ClientForm, InputCtrl, ActionCtrl, useFormRef } from '@owlmeans/client-panel'
import type { FormOnSubmit } from '@owlmeans/client-panel'

function CreateProjectForm() {
  const formRef = useFormRef()

  const onSubmit: FormOnSubmit<CreateProject> = async (data) => {
    await ctx.module<ClientModule<Project>>('project-create').call({ body: data })
  }

  return (
    <ClientForm schema={createProjectSchema} onSubmit={onSubmit} ref={formRef}>
      <InputCtrl name="title" />
      <InputCtrl name="description" />
      <ActionCtrl i18nKey="project.create.submit" type="submit" />
      <ActionCtrl i18nKey="project.create.cancel" onClick={() => navigate.go('project-list')} />
    </ClientForm>
  )
}
```

## API

### `ClientForm`

React component. Props:
- `schema: AJVSchema` — AJV schema used for validation and default values
- `onSubmit: FormOnSubmit<T>` — called with validated form data
- `ref?` — `useFormRef()` ref for programmatic reset/submit

### `ActionCtrl`

React component for buttons. Props:
- `i18nKey: string` — translation key for button label
- `type?: 'submit' | 'button' | 'reset'`
- `onClick?: () => void`
- `disabled?: boolean`

### `InputCtrl`

React component for labeled inputs. Props:
- `name: string` — field name from the schema
- `type?: string` — input type (text, email, password, etc.)
- `i18nKey?: string` — translation key for label (defaults to field name)

### `useFormRef(): FormRef`

Returns a ref object for programmatic form control.

### `FormOnSubmit<T>`

```typescript
type FormOnSubmit<T> = (data: T) => void | Promise<void>
```

### `schemaToFormDefault(schema): Record<string, any>`

Derives default form values from an AJV schema's `default` fields.

## Related Packages

- [`@owlmeans/client`](../client) — `useContext`, `useNavigate` used within form components
- [`@owlmeans/client-i18n`](../client-i18n) — i18n provider required by `ActionCtrl`/`InputCtrl`
