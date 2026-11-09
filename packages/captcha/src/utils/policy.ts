import type { PolicyUtils } from './policy/types.js'

export const createPolicyUtils = (): PolicyUtils => {
  const listOf: PolicyUtils['listOf'] = value =>
    typeof value === 'string' ? value.split(/[\s,]+/).map(entry => entry.trim()).filter(entry => entry !== '') : []

  const hostOf: PolicyUtils['hostOf'] = value =>
    value.trim().toLowerCase().replace(/\.$/, '').replace(/^\*?\./, '')

  const hostAllowed: PolicyUtils['hostAllowed'] = (hosts, hostname) => {
    const host = typeof hostname === 'string' ? hostOf(hostname) : ''

    return host !== '' && hosts.some(entry => host === entry || host.endsWith(`.${entry}`))
  }

  return { listOf, hostOf, hostAllowed }
}

export const policyUtils = createPolicyUtils()
