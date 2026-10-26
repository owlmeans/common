---
name: forms
description: The web form family (Form, TextInput, Button, SubmitButton, ButtonSelector) and the Toaster surface for sonner toasts.
metadata:
  purposes: form, feedback
  mentions: TextInput, SubmitButton, ButtonSelector, useFormRef, WebFormProps, Toaster, sonner, appendPermissionDeniedToast
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/web-panel — Forms and toasts

| Export | Description |
|--------|-------------|
| `Form` / `TextInput` / `Button` / `SubmitButton` / `ButtonSelector` | The web form family. `Form` builds its own `useForm` + `ajvResolver` and borrows only `FormContext` and `schemaToFormDefault` from `@owlmeans/client-panel`; `TextInput` drives `react-hook-form`'s `Controller` directly, and the buttons call `handleSubmit` directly — none of them wraps `ClientForm`, `InputCtrl` or `ActionCtrl` |

## Forms — `Form`, `TextInput`, the buttons

`WebFormProps` is `@owlmeans/client-panel`'s `FormProps` plus `className` and `style`. `Form` holds
the whole model itself — `useForm` with `mode: 'all'`, `delayError: 300`, an `ajvResolver` over
`validation` with `coerceTypes` and the `ajv-formats` formats — and publishes it through
`FormProvider` plus `FormContext`, so every control below reads one form.

```tsx
import { Form, TextInput, SubmitButton, Button } from '@owlmeans/web-panel'

<Form decorate validation={schema} onSubmit={async (data, update) => { await save(data); update(data) }}>
  <TextInput name="email" label placeholder hint />
  <TextInput name="password" type="password" label="Password" />
</Form>
```

- **`decorate` switches the whole rendering.** With `decorate={true}` the fields go inside a shadcn
  `Card`, the root error surfaces through `Status`, and a `SubmitButton` is rendered in the
  `CardFooter` **whenever `onSubmit` is given** — the caller writes no action. Without it (the
  default) `Form` is a bare flex column: no card, no root-error surface, no submit button, so the
  caller renders its own action. `horizontal`/`vertical` scaling, `className` and `style` land on
  the `Card` when decorated and on that column otherwise.
- **`formRef`** — a `useFormRef()` ref filled with `{ form, update, loader, error }`, which is how a
  caller drives the form, flips the loader, or plants a field/root error from outside.
- **`TextInput` takes `label`, `placeholder` and `hint` as `string | boolean`.** `true` resolves
  `<name>.label` / `<name>.placeholder` / `<name>.hint` from the form namespace; a string is used
  verbatim; anything else renders nothing. It also takes `name`, `def`, `type` (any HTML input type,
  default `text`) and `disableAutocomplete`. A field error replaces the hint line.
- **`Button`** takes a required `label`, `onClick`, `loader` (a `Toggleable` — open disables the
  button and shows the spinner), `size` (`small`/`medium`/`large`), `fullWidth`, and `variant`,
  which maps the MUI vocabulary onto shadcn (`contained` → `default`, `outlined` → `outline`,
  `text` → `ghost`) and forwards a shadcn variant name unchanged.
- **`SubmitButton`** is that button bound to `handleSubmit`, taking `onSubmit` (or `onClick`) and a
  `label` defaulting to `submit`. It resolves the label with the form `t` itself and passes it down
  with `i18n.suppress` set, so the label is translated once.
- **`ButtonSelector`** renders one `Button` per entry of `options`, the one equal to `current`
  `contained` and the rest `outlined`, calling `onSelect(option)`. `name` prefixes each option's
  label key as `<name>.<option>`.

## Toasts — `Toaster`

An action that succeeded or failed says so in a toast. The surface is `Toaster`; the messages are
`toast.success(...)` / `toast.error(...)` imported from **`sonner`** by whatever raised them.

```tsx
import { NavLayout, Toaster } from '@owlmeans/web-panel'

export const MainLayout: FC<PropsWithChildren> = ({ children }) => <>
  <NavLayout nav={navConfig} title="My App">{children}</NavLayout>
  <Toaster />
</>
```

- **Mount it exactly once, in the layout.** `toast()` writes to a module-global store, so two
  mounted `Toaster`s render every message twice and none renders any of them — both failures are
  silent, which is why `tests/toaster.spec.ts` asserts the count rather than the presence.
- **Colours come from the app's own tokens** — `--popover`, `--popover-foreground`, `--border` —
  so a toast matches every other floating surface. A caller's `style` merges over them.
- **The theme follows the `.dark` class on the document element**, not a theme provider: the
  package reads the class an app's `next-themes`, the owl theme provider, or a hand-written
  toggle all set, and depends on none of them. Pass `theme` explicitly to override.
- Defaults are `richColors`, `closeButton`, `duration={5000}`, `position="top-right"`; every one
  of them, and every other `ToasterProps` field, is overridable per app.
- `sonner` is a dependency of this package, so nothing is required of the consumer — but an app
  raising its own toasts should declare `sonner` too, at a range that resolves to the same copy.

`appendPermissionDeniedToast(context)` plugs into the client entrypoint failure service and
shows a localized access-denied toast for errors carrying the server IAM marker. Mount `Toaster`
once as usual. The toast exposes the technical message and incident id in a separate details
section. The app supplies its locale through its i18n context.
