import { FLOW_PLACEHOLDER, OidcAuthStep, STD_OIDC_FLOW } from '@owlmeans/flow'
import type { FlowModel } from '@owlmeans/flow'
import { DEFAULT_ENTITY } from '../consts.js'

/**
 * Bring a freshly booted standard OIDC flow to the step an authorization request can be made from.
 *
 * `stdOidcFlow` starts at `Dispatch`, but `OidcAuthService.authenticate` refuses any state that is
 * not `Ephemeral` and returns null — so an application whose flow was only booted can ask for an
 * authorization URL all day and be told nothing, forever. The dispatcher in this package has always
 * done this transition inline; a relying party that replaces that dispatcher (`web-oidc-rp`,
 * `mui-oidc-rp`) inherited the requirement without the code, which is what left a sign-in button
 * that reported no error and did nothing at all.
 *
 * `Ephemeral` is the branch for an application that is its OWN authority — its flow configuration
 * maps the auth service to a placeholder, which is exactly the generated-application case. An app
 * federated with a real auth service keeps its target and is left alone.
 *
 * Idempotent, and safe to call on every attempt: a flow already past `Dispatch`, or one that is
 * not the standard OIDC flow at all, is returned untouched.
 */
export const enterOidcAuthorization = (model: FlowModel): FlowModel => {
  const state = model.state()
  if (state.flow !== STD_OIDC_FLOW || state.step !== OidcAuthStep.Dispatch) {
    return model
  }

  const target = model.step().service
  if (state.service == null || state.service === '') {
    model.target(target)
  }

  // The entity travels to this app's own backend, which resolves its default provider by `def`
  // alone. It still has to BE there: the init endpoint rejects a body without one.
  if (state.entityId == null) {
    model.entity(DEFAULT_ENTITY)
  }

  if (target === FLOW_PLACEHOLDER) {
    model.transit(OidcAuthStep.Ephemeral, true)
  }

  return model
}
