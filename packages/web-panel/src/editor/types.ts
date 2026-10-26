export interface JsonEditorLabels {
  format: string
  copy: string
  copied: string
  copyFailed: string
  readOnly: string
  valid: string
  invalid: string
}

/** JSON stays text until the host saves it, including incomplete and invalid drafts. */
export interface JsonEditorProps {
  value: string
  onChange?: (value: string) => void
  onValidityChange?: (valid: boolean) => void
  readOnly?: boolean
  id?: string
  ariaLabel?: string
  testId?: string
  className?: string
  minHeight?: number
  maxHeight?: number
  labels?: Partial<JsonEditorLabels>
}
