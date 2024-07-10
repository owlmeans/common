
export interface Toggleable {
  opened: boolean
  open: () => void
  close: () => void
  set: (opened: boolean) => void
  toggle: (opened: boolean) => void
}
