import { LoginOutcome, ResumeAction } from './consts.js'
import type { LoginResumeHelper } from './resume/types.js'

export const createLoginResumeHelper = (): LoginResumeHelper => {
  const loginAttemptError = (outcome: LoginOutcome | null): string | null => {
    switch (outcome) {
      case LoginOutcome.Gesture:
      case LoginOutcome.Blocked:
        // The window never opened. That is the popup blocker, and it has its own copy.
        return 'login.error.blocked'
      case LoginOutcome.Failed:
      case LoginOutcome.Passed:
        return 'login.error.failed'
      default:
        // Handled, Redirected and Orphaned all did something; Orphaned reports itself elsewhere.
        return null
    }
  }

  const resumeAction = (outcome: LoginOutcome): ResumeAction => {
    switch (outcome) {
      case LoginOutcome.Handled:
      case LoginOutcome.Redirected:
        return ResumeAction.Stop
      case LoginOutcome.Orphaned:
      case LoginOutcome.Failed:
      case LoginOutcome.Gesture:
      case LoginOutcome.Blocked:
        return ResumeAction.Render
      default:
        return ResumeAction.Navigate
    }
  }

  return { loginAttemptError, resumeAction }
}

export const loginResumeHelper = createLoginResumeHelper()

/** @deprecated compat:factory-refactor — use `loginResumeHelper.loginAttemptError(…)` */
export const loginAttemptError = (outcome: LoginOutcome | null): string | null =>
  loginResumeHelper.loginAttemptError(outcome)

/** @deprecated compat:factory-refactor — use `loginResumeHelper.resumeAction(…)` */
export const resumeAction = (outcome: LoginOutcome): ResumeAction => loginResumeHelper.resumeAction(outcome)
