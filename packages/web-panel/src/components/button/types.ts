
export interface SelectorProps<T = any> {
  name?: string
  current: T
  options: T[]
  onSelect?: (value: T) => void
}
