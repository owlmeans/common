import { useState } from 'react'
import { JsonEditor } from '../../src/editor/index.js'

export const EditorHarness = () => {
  const [value, setValue] = useState('{"title":"Sample","count":2,"enabled":true,"empty":null}')
  const [valid, setValid] = useState(true)
  const [readOnly, setReadOnly] = useState(false)
  const [saved, setSaved] = useState('')
  return (
    <div className="bg-background p-6 text-foreground">
      <JsonEditor
        value={value}
        onChange={setValue}
        onValidityChange={setValid}
        readOnly={readOnly}
        testId="json-input"
        ariaLabel="Document JSON"
      />
      <button type="button" disabled={!valid || readOnly} onClick={() => setSaved(value)}>
        Save document
      </button>
      <button type="button" onClick={() => setValue('{"loaded":true}')}>
        Load another document
      </button>
      <button type="button" onClick={() => setReadOnly((current) => !current)}>
        Toggle read only
      </button>
      <output data-testid="draft">{value}</output>
      <output data-testid="saved">{saved}</output>
    </div>
  )
}
