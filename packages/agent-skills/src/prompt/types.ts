/** The installer's interactive questions on the terminal. */
export interface PromptUtils {
  /** Close the readline interface a {@link PromptUtils.confirm} opened, if any. */
  closeReadline: () => void
  /** Ask a yes/no question; only `y` / `yes` answer yes. */
  confirm: (question: string) => Promise<boolean>
  /** Whether stdin is an interactive terminal. */
  isTTY: () => boolean
}
