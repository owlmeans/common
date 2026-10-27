import { useState } from 'react'
import type { FC } from 'react'
import {
  ColorDot, ColorPicker, ColorSwatches, IconColorPicker, IconGrid, IconPicker, IconTile, usePickerTranslate,
} from '../../src/picker/index.js'
import type { IconColorChange, PickerTranslate } from '../../src/picker/index.js'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../../src/@/components/ui/sheet.js'

/**
 * The picker's scenarios, picked by query parameters:
 *
 * - `?custom=1` — `customColors` on every picker;
 * - `?surface=popover|sheet` — forces the surface (default `auto`);
 * - `?compact=1` — the `tile` / `dot` triggers;
 * - `?empty=1` — nothing chosen yet;
 * - `?inSheet=1` — the composite picker inside a Radix Sheet of the page's own;
 * - `?inline=1` — the inline parts (`ColorSwatches`, `IconGrid`) on the page;
 * - `?bare=1` — mounted with no `PanelApp` and no i18n instance at all (mount.tsx);
 * - `?dark=1` — `.dark` on the document element.
 */
const params = new URLSearchParams(window.location.search)
const custom = params.get('custom') === '1'
const compact = params.get('compact') === '1'
const empty = params.get('empty') === '1'
const inSheet = params.get('inSheet') === '1'
const inline = params.get('inline') === '1'
const surfaceParam = params.get('surface')
const surface = surfaceParam === 'popover' || surfaceParam === 'sheet' ? surfaceParam : 'auto'

if (params.get('dark') === '1') {
  document.documentElement.classList.add('dark')
}

const SAMPLES: Array<[string, string]> = [
  ['rocket', 'blue'], ['bug', 'red'], ['handshake', 'emerald'], ['flag', 'amber'], ['users', 'violet'],
  ['package', 'brown'], ['map-pin', 'navy'], ['siren', 'maroon'], ['leaf', 'olive'], ['star', 'graphite'],
]

export const PickerScreen: FC<{ translate?: PickerTranslate }> = ({ translate }) => {
  const [mark, setMark] = useState<IconColorChange>(empty ? {} : { icon: 'rocket', color: 'indigo' })
  const [color, setColor] = useState<string | undefined>(empty ? undefined : 'teal')
  const [icon, setIcon] = useState<string | undefined>(empty ? undefined : 'briefcase')
  const [submits, setSubmits] = useState(0)

  const form = (id: string) => <form
    id={id} className="flex flex-col gap-4"
    onSubmit={event => { event.preventDefault(); setSubmits(count => count + 1) }}
  >
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-mark`} className="text-sm font-medium">Mark</label>
      <IconColorPicker
        id={`${id}-mark`} label="Mark" value={mark} onChange={setMark} customColors={custom} surface={surface}
        trigger={compact ? 'tile' : 'button'} translate={translate}
      />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-color`} className="text-sm font-medium">Colour</label>
        <ColorPicker
          id={`${id}-color`} label="Colour" value={color} onChange={setColor} customColors={custom} surface={surface}
          trigger={compact ? 'dot' : 'button'} translate={translate}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-icon`} className="text-sm font-medium">Icon</label>
        <IconPicker
          id={`${id}-icon`} label="Icon" value={icon} onChange={setIcon} color={color} surface={surface}
          trigger={compact ? 'tile' : 'button'} translate={translate}
        />
      </div>
    </div>
    <button type="submit" className="self-start rounded-md border px-3 py-1.5 text-sm">Save</button>
  </form>

  return <main id="picker" className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
    <h1 className="text-xl font-semibold">Icon and colour picker</h1>
    {inSheet
      ? <Sheet>
        <SheetTrigger id="open-sheet" className="self-start rounded-md border px-3 py-1.5 text-sm">Open sheet</SheetTrigger>
        <SheetContent side="right" aria-describedby={undefined} className="gap-0 p-6 text-foreground">
          <SheetTitle className="mb-4">Edit type</SheetTitle>
          {form('sheet-form')}
        </SheetContent>
      </Sheet>
      : <section className="rounded-xl border p-4">{form('picker-form')}</section>}
    {inline && <section id="inline" className="flex flex-col gap-4 rounded-xl border p-4">
      <ColorSwatches value={mark.color} onChange={next => setMark({ ...mark, color: next })} customColors={custom} translate={translate} />
      <div className="max-h-72 overflow-y-auto">
        <IconGrid value={mark.icon} onChange={next => setMark({ ...mark, icon: next })} color={mark.color} translate={translate} />
      </div>
    </section>}
    <section id="samples" className="flex flex-wrap items-center gap-3 rounded-xl border p-4">
      {SAMPLES.map(([sampleIcon, sampleColor]) =>
        <IconTile key={sampleColor} icon={sampleIcon} color={sampleColor} label={`${sampleIcon} ${sampleColor}`} />)}
      <IconTile icon="rocket" color="blue" variant="plain" size="lg" label="plain rocket" />
      <IconTile icon="not-an-icon" color="not-a-colour" label="fallback" />
      <ColorDot color="blue" size="md" label="blue dot" />
      <ColorDot color="#ff00aa" size="md" label="custom dot" />
    </section>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt>mark</dt><dd><output id="mark-value">{JSON.stringify(mark)}</output></dd>
      <dt>colour</dt><dd><output id="color-value">{color ?? ''}</output></dd>
      <dt>icon</dt><dd><output id="icon-value">{icon ?? ''}</output></dd>
      <dt>submits</dt><dd><output id="submits">{submits}</output></dd>
    </dl>
  </main>
}

/** The screen as an application rendered by `PanelApp` mounts it: strings from the packaged bundle. */
export const TranslatedPickerScreen: FC = () => <PickerScreen translate={usePickerTranslate()} />
