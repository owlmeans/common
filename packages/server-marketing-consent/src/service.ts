import { createLazyService } from '@owlmeans/context'
import { marketingConsentHelper, MARKETING_CONSENT_SERVICE, UnknownMarketingConsentError, type MarketingConsentDecision, type MarketingConsentDefinition, type MarketingConsentStatusView } from '@owlmeans/marketing-consent'
import type { Criteria, Resource } from '@owlmeans/resource'
import type { ServerConfig } from '@owlmeans/server-context'
import { RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE } from './consts.js'
import type { MarketingConsentLogRecord, MarketingConsentStateRecord, MarketingConsentSubject, MakeMarketingConsentServiceOptions, MarketingConsentContext, MarketingConsentObserver, MarketingConsentService } from './types.js'
import { marketingConsentSubjectHelper } from './subject.js'
import { logger } from '@owlmeans/log'

const log = logger('server-marketing-consent')

const nowIso = (): string => new Date().toISOString()

/**
 * Build the `MarketingConsentService`. Database-agnostic: both resources are resolved BY ALIAS
 * from the context lazily, inside each method call — never imported or constructed here. A
 * Mongo/Postgres extension package registers the actual resources at those aliases separately.
 */
export const makeMarketingConsentService = (
  opts: MakeMarketingConsentServiceOptions = {},
): MarketingConsentService => {
  const alias = opts.alias ?? MARKETING_CONSENT_SERVICE
  const stateAlias = opts.state ?? RES_MARKETING_CONSENT_STATE
  const logAlias = opts.log ?? RES_MARKETING_CONSENT_LOG

  let memoizedDefinitions: MarketingConsentDefinition[] | undefined
  const definitions = (): MarketingConsentDefinition[] => {
    memoizedDefinitions ??= marketingConsentHelper.resolveMarketingConsents(opts.config)
    return memoizedDefinitions
  }

  const listeners: MarketingConsentObserver[] = []

  const ctx = (): MarketingConsentContext => service.assertCtx<ServerConfig, MarketingConsentContext>()
  const states = (): Resource<MarketingConsentStateRecord> =>
    ctx().resource<Resource<MarketingConsentStateRecord>>(stateAlias)
  const logs = (): Resource<MarketingConsentLogRecord> =>
    ctx().resource<Resource<MarketingConsentLogRecord>>(logAlias)

  const appendLog = async (record: Omit<MarketingConsentLogRecord, 'id'>): Promise<void> => {
    await logs().create(record)
  }

  const notify = async (subject: MarketingConsentSubject, decisions: MarketingConsentDecision[]): Promise<void> => {
    for (const listener of listeners) {
      try {
        await listener({ subject, decisions })
      } catch (error) {
        // A listener's failure never fails the write that triggered it.
        log.error('Marketing-consent observer failed', { alias, subject: marketingConsentSubjectHelper.subjectKey(subject), error })
      }
    }
  }

  const statusOf = (
    state: MarketingConsentStateRecord | null, gpc?: boolean,
  ): MarketingConsentStatusView => marketingConsentHelper.consentStatus(definitions(), state?.decisions ?? [], {
    gpc, termsAcceptedAt: state?.terms?.acceptedAt, termsVersion: state?.terms?.version,
  })

  /**
   * `create()` never accepts a caller-supplied `id` on either backend — Mongo and Postgres both
   * throw `RecordExists('id-present')` the instant one is present, unconditionally, as a guard
   * against ever handing them a natural key. The record's own id is always backend-generated;
   * `subject` (unique-indexed on both) is what addresses "this person's row". Create-then-fall-
   * back-to-reload-and-update on ANY create failure is the race guard: the unique index is the
   * backstop, and re-querying by `subject` after a failed create covers both a genuine duplicate
   * and a backend-specific error shape neither resource wraps as `RecordExists`.
   */
  const upsertState = async (
    subject: string, patch: (existing: MarketingConsentStateRecord | null) => Partial<MarketingConsentStateRecord>,
  ): Promise<MarketingConsentStateRecord> => {
    const criteria = { subject } as Criteria<MarketingConsentStateRecord>
    const existing = await states().load(criteria)
    if (existing != null) {
      return states().save({ ...existing, ...patch(existing) })
    }
    try {
      return await states().create(patch(null))
    } catch (error) {
      const raced = await states().load(criteria)
      if (raced == null) throw error
      return states().save({ ...raced, ...patch(raced) })
    }
  }

  const service: MarketingConsentService = createLazyService<MarketingConsentService>(alias, {
    definitions,

    status: async (subject, statusOpts) => {
      const state = await states().load({ subject: marketingConsentSubjectHelper.subjectKey(subject) } as Criteria<MarketingConsentStateRecord>)
      return statusOf(state, statusOpts?.gpc)
    },

    save: async (subject, request) => {
      const known = new Set(definitions().map(def => def.key))
      const unknown = request.decisions.find(decision => !known.has(decision.key))
      if (unknown != null) {
        throw new UnknownMarketingConsentError(unknown.key)
      }

      const now = nowIso()
      const decided: MarketingConsentDecision[] = request.decisions.map(decision => {
        // Safe: every key was just checked against `known` above.
        const definition = definitions().find(def => def.key === decision.key)!
        return {
          key: decision.key, granted: decision.granted, revisedAt: definition.revisedAt,
          mode: definition.mode, decidedAt: now, source: request.source,
        }
      })

      for (const decision of decided) {
        await appendLog({
          subject: marketingConsentSubjectHelper.subjectKey(subject), userId: subject.userId, profileId: subject.profileId,
          entityId: subject.entityId, kind: 'consent', key: decision.key, granted: decision.granted,
          revisedAt: decision.revisedAt, mode: decision.mode, decidedAt: decision.decidedAt,
          source: decision.source, locale: request.locale, gpc: request.gpc,
        })
      }

      const id = marketingConsentSubjectHelper.subjectKey(subject)
      const saved = await upsertState(id, existing => {
        const merged = new Map((existing?.decisions ?? []).map(decision => [decision.key, decision]))
        decided.forEach(decision => merged.set(decision.key, decision))
        return {
          subject: id, userId: subject.userId, profileId: subject.profileId, entityId: subject.entityId,
          decisions: [...merged.values()], gpc: request.gpc ?? existing?.gpc,
          createdAt: existing?.createdAt ?? now, updatedAt: now,
        }
      })

      await notify(subject, decided)

      return { ok: true, status: statusOf(saved, request.gpc) }
    },

    recordTerms: async (subject, acceptance, recordOpts) => {
      const now = nowIso()
      const source = recordOpts?.source ?? 'sign-in'

      await appendLog({
        subject: marketingConsentSubjectHelper.subjectKey(subject), userId: subject.userId, profileId: subject.profileId,
        entityId: subject.entityId, kind: 'terms', documents: acceptance.documents,
        notices: acceptance.notices, version: acceptance.version, decidedAt: now, source,
        locale: acceptance.locale,
      })

      const id = marketingConsentSubjectHelper.subjectKey(subject)
      const terms = {
        documents: acceptance.documents, notices: acceptance.notices, version: acceptance.version,
        locale: acceptance.locale, acceptedAt: now,
      }
      await upsertState(id, existing => ({
        subject: id, userId: subject.userId, profileId: subject.profileId, entityId: subject.entityId,
        decisions: existing?.decisions ?? [], terms,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
      }))

      return { ok: true }
    },

    isGranted: async (subject, key, grantOpts) => {
      const view = await service.status(subject, grantOpts)
      const item = view.items.find(candidate => candidate.definition.key === key)
      if (item == null || item.status !== 'current') return false

      return item.granted
    },

    purge: async subject => {
      await states().purge({ subject: marketingConsentSubjectHelper.subjectKey(subject) } as Criteria<MarketingConsentStateRecord>)
    },

    observe: listener => {
      listeners.push(listener)
    },
  })

  return service
}

/** Register the service, unless the application already registered its own under this alias. */
export const appendMarketingConsentService = (
  context: MarketingConsentContext, opts: MakeMarketingConsentServiceOptions = {},
): void => {
  const alias = opts.alias ?? MARKETING_CONSENT_SERVICE
  if (!context.hasService(alias)) {
    context.registerService(makeMarketingConsentService(opts))
  }
}
