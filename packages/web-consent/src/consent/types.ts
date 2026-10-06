export interface ConsentToggleProps {
  id: string
  label: string
  description: string
  checked: boolean
  /** A required category is disclosure, not a question: locked on, and labelled as such. */
  required?: boolean
  requiredLabel: string
  onChange: (value: boolean) => void
}
