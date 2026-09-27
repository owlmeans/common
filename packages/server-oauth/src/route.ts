import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { Middleware } from '@owlmeans/context'
import {
  OAUTH_AS_METADATA_PATH, OAUTH_AUTHORIZE_PATH, OAUTH_DEVICE_AUTHORIZATION_PATH,
  OAUTH_PRM_PATH_PREFIX, OAUTH_REGISTER_PATH, OAUTH_REVOKE_PATH, OAUTH_TOKEN_PATH
} from '@owlmeans/oauth'
import type { FastifyRequest } from 'fastify'
import { handleAuthorize } from './handlers/authorize.js'
import { handleDeviceAuthorization } from './handlers/device.js'
import { handleRegister } from './handlers/register.js'
import { handleRevoke } from './handlers/revoke.js'
import { handleToken } from './handlers/token.js'
import { authorizationServerMetadata, protectedResourceMetadata } from './metadata.js'
import type { OAuthServerContext } from './types.js'

const asQuery = (request: FastifyRequest): Record<string, string | undefined> =>
  request.query as Record<string, string | undefined>

const asForm = (request: FastifyRequest): Record<string, string | undefined> =>
  (request.body ?? {}) as Record<string, string | undefined>

const sendResourceMetadata = (oauthCtx: OAuthServerContext, resourcePath: string) =>
  async (_request: FastifyRequest, reply: import('fastify').FastifyReply): Promise<void> => {
    const metadata = protectedResourceMetadata(oauthCtx, resourcePath)
    if (metadata == null) {
      await reply.code(404).send({ error: 'not_found' })

      return
    }
    await reply.header('cache-control', 'public, max-age=3600').send(metadata)
  }

/**
 * Mount the standards-facing OAuth endpoints as raw routes, exactly the way the URL-configured
 * `/mcp` host is mounted in the platform this package serves: a `Loading`-stage context
 * middleware, the one moment the API server's own Fastify instance exists and nothing has called
 * `listen` yet. These can never be entrypoints — the RFCs fix the wire format (form bodies in,
 * `{error, error_description}` out, a redirect that carries no envelope at all), and an
 * entrypoint's schema-driven contract would either reject the protocol or accept anything.
 *
 * Registered inside its OWN `server.register(...)` plugin boundary so the
 * `application/x-www-form-urlencoded` parser it needs is scoped to these routes alone — Fastify
 * encapsulates content-type parsers by registration context, and the platform's own entrypoint
 * routes declare that content type in their schema without anything actually parsing it, a gap
 * this package must not paper over globally.
 */
export const appendOAuthRoutes = (context: OAuthServerContext): void => {
  context.registerMiddleware({
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Loading,
    apply: async ctx => {
      const oauthCtx = ctx as unknown as OAuthServerContext
      const server = oauthCtx.getApiServer().server

      await server.register(async instance => {
        instance.addContentTypeParser(
          'application/x-www-form-urlencoded', { parseAs: 'string' },
          (_req, body, done) => {
            try {
              done(null, Object.fromEntries(new URLSearchParams(body as string)))
            } catch (e) {
              done(e as Error, undefined)
            }
          }
        )

        instance.get(OAUTH_AS_METADATA_PATH, async (_request, reply) => {
          await reply.header('cache-control', 'public, max-age=3600').send(authorizationServerMetadata(oauthCtx))
        })

        // Two routes, not one wildcard, so the captured suffix is unambiguous: the root resource
        // (no path) and every other resource (`/mcp`, say) never share a pattern whose wildcard
        // semantics would need to be reasoned about instead of just read.
        instance.get(OAUTH_PRM_PATH_PREFIX, sendResourceMetadata(oauthCtx, ''))
        instance.get(`${OAUTH_PRM_PATH_PREFIX}/*`, async (request, reply) => {
          const rest = (request.params as { '*': string })['*']
          await sendResourceMetadata(oauthCtx, `/${rest}`)(request, reply)
        })

        instance.get(OAUTH_AUTHORIZE_PATH, async (request, reply) => {
          const outcome = await handleAuthorize(oauthCtx, asQuery(request))
          if (outcome.kind === 'refused') {
            await reply.code(outcome.status).type('text/plain').send(outcome.message)

            return
          }
          await reply.redirect(outcome.location, 302)
        })

        instance.post(OAUTH_DEVICE_AUTHORIZATION_PATH, async (request, reply) => {
          const outcome = await handleDeviceAuthorization(oauthCtx, asForm(request))
          await reply.code(outcome.status).send(outcome.body)
        })

        instance.post(OAUTH_TOKEN_PATH, async (request, reply) => {
          const outcome = await handleToken(oauthCtx, asForm(request))
          await reply.header('cache-control', 'no-store').header('pragma', 'no-cache').code(outcome.status).send(outcome.body)
        })

        instance.post(OAUTH_REGISTER_PATH, async (request, reply) => {
          const outcome = await handleRegister(oauthCtx, request.body)
          await reply.code(outcome.status).send(outcome.body)
        })

        instance.post(OAUTH_REVOKE_PATH, async (request, reply) => {
          await handleRevoke(oauthCtx, asForm(request))
          // RFC 7009 §2.2: 200 whatever the token was, so the response itself gives nothing away.
          await reply.code(200).send()
        })
      })
    },
  } satisfies Middleware)
}

/** What a resource server (this platform's own REST API, or its `/mcp` host) answers a bare or
 * rejected request with — re-exported here so a consumer imports one package for both halves. */
export { protectedResourceChallenge } from './metadata.js'
