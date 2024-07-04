
export interface ButtonProps {
  label: string
  onClick?: () => void
}

export interface SubmitProps extends ButtonProps {
  onSubmit?: (data: any) => Promise<void> | void
}
