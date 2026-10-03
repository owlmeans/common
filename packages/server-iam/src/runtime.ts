import { AuthForbidden, AuthorizationError, AuthUnavailable } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import { IAM_RUNTIME_ROUTES, IamClientError, IamError } from '@owlmeans/iam'
import type {
  IamRuntimeAck, IamRuntimeGrant, IamRuntimeGrantList, IamRuntimeGrantQuery, IamRuntimeGrantRequest,
  IamRuntimeMember, IamRuntimeMemberInvite, IamRuntimeMemberList, IamRuntimeMemberUpdate, IamRuntimeOrganization,
  IamRuntimeOrganizationCreate, IamRuntimeOrganizationList, IamRuntimeOrganizationUpdate, IamRuntimePermission,
  IamRuntimePermissionList,
} from '@owlmeans/iam'
import { IAM_API_METADATA, ORGANIZATION_OWNER_REFUSAL, ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import { DEFAULT_ALIAS as OIDC_CLIENT_SERVICE } from '@owlmeans/server-oidc-rp'
import type { Config, Context, OidcClientService } from '@owlmeans/server-oidc-rp'
import { sessionOf } from './organization.js'

/**
 * The runtime IAM API as the signed-in subject of one request: its organizations, their members,
 * the grantable definitions and the grants. Every call acts as that subject — the provider decides
 * owner and member rights from the access token, never from anything sent here.
 */
export interface IamRuntimeClient {
  organizations: {
    list: () => Promise<IamRuntimeOrganization[]>
    /** The subject becomes the new organization's owner. */
    create: (body?: IamRuntimeOrganizationCreate) => Promise<IamRuntimeOrganization>
    update: (entitySlug: string, body: IamRuntimeOrganizationUpdate) => Promise<IamRuntimeOrganization>
  }
  members: {
    list: (entitySlug: string) => Promise<IamRuntimeMember[]>
    /** Find-or-create by e-mail: adding an address twice answers the same member. */
    add: (entitySlug: string, invite: IamRuntimeMemberInvite) => Promise<IamRuntimeMember>
    update: (entitySlug: string, profileId: string, update: IamRuntimeMemberUpdate) => Promise<IamRuntimeMember>
    remove: (entitySlug: string, profileId: string) => Promise<void>
  }
  permissions: {
    list: (entitySlug: string) => Promise<IamRuntimePermission[]>
  }
  grants: {
    list: (entitySlug: string, query?: IamRuntimeGrantQuery) => Promise<IamRuntimeGrant[]>
    assign: (entitySlug: string, grant: IamRuntimeGrantRequest) => Promise<IamRuntimeGrant>
    revoke: (entitySlug: string, grant: IamRuntimeGrantRequest) => Promise<void>
  }
}

/** Who a route admits — and therefore which refusal a bare 403 from it means. */
type Access = 'subject' | 'member' | 'owner'

interface Call {
  method: 'GET' | 'POST'
  path: string
  access: Access
  params?: Record<string, string>
  query?: object
  body?: object
}

/** `@owlmeans/server-api`'s incident header; a production error body is nothing but this id. */
const INCIDENT_ID_HEADER = 'x-incident-id'

/**
 * Discovered runtime bases, per context and per client. Discovery is a network round trip the OIDC
 * client service does not memoise, and the base never changes while a provider runs. A failed
 * lookup is forgotten, so the next request asks again rather than inheriting the error.
 */
const bases = new WeakMap<object, Map<string, Promise<string>>>()

const runtimeBase = <C extends Config, T extends Context<C>>(context: T, clientId: string): Promise<string> => {
  const known = bases.get(context) ?? new Map<string, Promise<string>>()
  bases.set(context, known)
  const cached = known.get(clientId)
  if (cached != null) {
    return cached
  }

  const attempt = (async () => {
    const client = await context.service<OidcClientService>(OIDC_CLIENT_SERVICE).getClient(clientId)
    const base = client.getMetadata()[IAM_API_METADATA]
    if (typeof base !== 'string' || base === '') {
      // A provider that advertises no runtime API — Keycloak, or an integrated provider that does not
      // serve it — has nothing to call.
      throw new IamClientError(`runtime-api:${clientId}`)
    }

    return base.replace(/\/+$/, '')
  })()
  known.set(clientId, attempt)
  attempt.catch(() => {
    if (known.get(clientId) === attempt) {
      known.delete(clientId)
    }
  })

  return attempt
}

const pathOf = (path: string, params: Record<string, string> = {}): string =>
  path.replace(/:(\w+)/g, (_, key: string) => {
    const value = params[key]
    if (value == null || value === '') {
      throw new IamError(`runtime:param:${key}`)
    }

    return encodeURIComponent(value)
  })

/**
 * The error a refused call rejects with.
 *
 * A development server sends the marshalled error, which is rebuilt into its own class. A production
 * one sends only an incident id, so the status and the route's access level are all there is to go
 * on: a 403 from an owner-level route is the subject not owning the organization, from any other
 * route the subject not being in it.
 */
const failureOf = async (response: Response, access: Access): Promise<Error> => {
  const text = await response.text().catch(() => '')
  const incidentId = response.headers.get(INCIDENT_ID_HEADER) ?? undefined

  if (text.includes(ResilientError.separator)) {
    try {
      const error = ResilientError.ensure(text, true)
      error.incidentId ??= incidentId
      return error
    } catch {
      // Not a marshalled error after all — fall through to the status.
    }
  }

  const error = response.status === 401 ? new AuthorizationError('iam-runtime')
    : response.status === 403 ? new AuthForbidden(access === 'owner' ? ORGANIZATION_OWNER_REFUSAL : ORGANIZATION_REFUSAL)
      : new IamError(`runtime:status:${response.status}`)
  if (incidentId != null) {
    error.incidentId = incidentId
  }

  return error
}

/**
 * A typed client of the provider's runtime IAM API, bound to one request.
 *
 * It calls as the request's subject: the bearer is the provider access token of that request's
 * session record, read afresh on every call, so a token the guard has just refreshed is the one
 * sent. The base URL is the provider's discovery field `IAM_API_METADATA`. Calls travel over plain
 * `fetch`, because the API is another service's tree and a relying party binds none of it.
 */
export const iamRuntime = <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest
): IamRuntimeClient => {
  const call = async <R>({ method, path, access, params, query, body }: Call): Promise<R> => {
    const record = await sessionOf<C, T>(context, request)
    const clientId = record.client ?? context.service<OidcClientService>(OIDC_CLIENT_SERVICE).getDefault()
    if (clientId == null) {
      throw new AuthUnavailable('oidc-client')
    }
    const token = record.payload?.access_token
    if (token == null || token === '') {
      throw new AuthForbidden('record')
    }

    const url = new URL(`${await runtimeBase<C, T>(context, clientId)}${pathOf(path, params)}`)
    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value != null) {
        url.searchParams.set(key, String(value))
      }
    })

    const response = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      // A JSON content type with an empty body is refused by the server, so a POST always sends one.
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    })

    if (!response.ok) {
      throw await failureOf(response, access)
    }

    return await response.json() as R
  }

  const R = IAM_RUNTIME_ROUTES

  return {
    organizations: {
      list: async () => (await call<IamRuntimeOrganizationList>({
        method: 'GET', path: R.organizations, access: 'subject',
      })).items,
      create: async body => call<IamRuntimeOrganization>({
        method: 'POST', path: R.organizations, access: 'subject', body: body ?? {},
      }),
      update: async (entitySlug, body) => call<IamRuntimeOrganization>({
        method: 'POST', path: R.organization, access: 'owner', params: { entitySlug }, body,
      }),
    },
    members: {
      list: async entitySlug => (await call<IamRuntimeMemberList>({
        method: 'GET', path: R.members, access: 'member', params: { entitySlug },
      })).items,
      add: async (entitySlug, invite) => call<IamRuntimeMember>({
        method: 'POST', path: R.members, access: 'owner', params: { entitySlug }, body: invite,
      }),
      update: async (entitySlug, profileId, update) => call<IamRuntimeMember>({
        method: 'POST', path: R.member, access: 'owner', params: { entitySlug, profileId }, body: update,
      }),
      remove: async (entitySlug, profileId) => {
        await call<IamRuntimeAck>({
          method: 'POST', path: R.memberRemove, access: 'owner', params: { entitySlug, profileId },
        })
      },
    },
    permissions: {
      list: async entitySlug => (await call<IamRuntimePermissionList>({
        method: 'GET', path: R.permissions, access: 'member', params: { entitySlug },
      })).items,
    },
    grants: {
      list: async (entitySlug, query) => (await call<IamRuntimeGrantList>({
        method: 'GET', path: R.grants, access: 'owner', params: { entitySlug }, query,
      })).items,
      assign: async (entitySlug, grant) => call<IamRuntimeGrant>({
        method: 'POST', path: R.grants, access: 'owner', params: { entitySlug }, body: grant,
      }),
      revoke: async (entitySlug, grant) => {
        await call<IamRuntimeAck>({
          method: 'POST', path: R.grantsRevoke, access: 'owner', params: { entitySlug }, body: grant,
        })
      },
    },
  }
}
