import type { FC } from 'react'
import { loginFailureHelper } from './failure.js'
import { box, failureAction, page } from './consts.local.js'
import type { LoginFailureViewProps } from './failure/types.js'

/**
 * The end state of a sign-in that did not complete: one phrased sentence, the incident reference of
 * a failure, and the way on — back to the sign-in choice for a refusal, the same attempt again
 * otherwise.
 *
 * Plain like `FallbackLoginScreen` — raw elements, inline styles, no class a consumer's stylesheet
 * must scan for — so any OwlMeans surface can end on it, whatever UI family it belongs to. Hooks for
 * tests and styling: `[data-login-failure="<kind>"]`, `[data-login-failure-message]`,
 * `[data-login-failure-incident]`, `[data-login-failure-action]`.
 */
export const LoginFailureView: FC<LoginFailureViewProps> = ({ failure, translate, onAction, page: full, style }) => {
  const phrase = loginFailureHelper.phrase(failure, translate)

  const notice = <div
    role="alert"
    data-login-failure={failure.kind}
    data-login-refused={failure.refused ? 'true' : undefined}
    style={{ ...box, ...style }}
  >
    <p data-login-failure-message style={{ margin: 0 }}>{phrase.message}</p>
    {phrase.incident != null && <p data-login-failure-incident style={{ marginTop: '.5rem', fontSize: '.75rem', opacity: .7 }}>
      {phrase.incident}
    </p>}
    {onAction != null && <button type="button" data-login-failure-action style={failureAction} onClick={onAction}>
      {phrase.action}
    </button>}
  </div>

  return full === true ? <div data-login-failure-page style={page}>{notice}</div> : notice
}
