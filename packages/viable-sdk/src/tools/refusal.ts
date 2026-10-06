import { ResilientError } from '@owlmeans/error'
import { ConnectConfirmationRequired, ConnectConsentRequired, ConnectOutOfCredits, type ConnectConfirmation } from '@owlmeans/viable-common'
import { settingsHelper } from './settings.js'
import { MARKER_SHAPE, MODERATION, STACK_FRAME } from './consts.local.js'
import { UNKNOWN_REFUSAL, UNPHRASED_REFUSAL } from './consts.js'
import type { RefusalPhrase } from './types.js'
import type { RefusalHelper } from './refusal/types.js'

export const createRefusalHelper = (): RefusalHelper => {
  /** The last day a purchase can still be withdrawn from — the day before its EXCLUSIVE deadline. */
  const lastDayOf = (deadline: Date | undefined): string | null => deadline != null && !Number.isNaN(deadline.getTime())
    ? new Date(deadline.getTime() - 1).toISOString().slice(0, 10)
    : null

  const consentRequiredPhrase = (url: string, deadline?: Date): string => {
    const until = lastDayOf(deadline)

    return 'Nothing was started. This organization bought credits less than 14 days ago, and under EU'
      + ' consumer rules the platform may only start using them once a person has expressly asked it'
      + ` to (until then the purchase can still be withdrawn from${until != null ? `, up to ${until}` : ''}).`
      + ` Ask the user to open ${url !== '' ? url : 'Billing in the OwlMeans web application'}`
      + ' and confirm there in the browser. Do not retry this call automatically — call it again only'
      + ' after the user says they have confirmed.'
  }

  /** Credits as a person reads them: whole, with thousands separators. Never money. */
  const creditsOf = (credits: number): string => Math.round(Math.max(0, credits)).toLocaleString('en-US')

  /** Where a conversion stage's estimate would come from, in the order the ledger spends it. */
  const splitOf = (fields: ConnectConfirmation): string => {
    const parts = [
      ...(fields.fromAllowance > 0 ? [`${creditsOf(fields.fromAllowance)} from the conversion limit`] : []),
      ...(fields.fromCreditLimits > 0 ? [`${creditsOf(fields.fromCreditLimits)} from the organization's credit limits`] : []),
      ...(fields.moneyUsd > 0 ? [`$${fields.moneyUsd.toFixed(2)} of topped-up credits`] : []),
    ]

    return parts.length > 0 ? parts.join(', ') : 'nothing from any balance yet'
  }

  const confirmationRequiredPhrase = (fields: ConnectConfirmation, retry?: string): string => {
    const limited = fields.cap > 0
    const said = ['Nothing was started.']
    if (fields.action === 'convert-proceed') {
      said.push(`The next conversion stage is estimated at about ${creditsOf(fields.estimate)} credits: ${splitOf(fields)}.`)
      said.push(limited
        ? `Conversion limit: ${creditsOf(fields.spent)} of ${creditsOf(fields.cap)} credits used,`
          + ` ${creditsOf(fields.cap - fields.spent)} left (updated shortly after each stage).`
        : 'No plan conversion covers this conversion, so it has no conversion limit: every stage is paid'
          + ' from the organization\'s credit limits first, then from topped-up credits.')
    } else {
      said.push(limited
        ? 'This conversion would use the project conversion the plan includes: its AI work is free up to'
          + ` ${creditsOf(fields.cap)} credits (the conversion limit). If it needs more, the rest is paid from`
          + ' the organization\'s credit limits first, then from topped-up credits, and every stage shows'
          + ' its estimate and asks again before it spends any of them.'
        : 'This conversion is paid from the organization\'s credit limits first, then from topped-up'
          + ' credits, and every stage shows its estimate first.')
      if (fields.estimate > 0) {
        said.push(`Its first stage is estimated at about ${creditsOf(fields.estimate)} credits: ${splitOf(fields)}.`)
      }
    }
    said.push('Tell the user exactly this and ask whether to go ahead. Only after they agree, call'
      + ` ${retry ?? 'this tool again with the same arguments and "confirm": true'} — never send confirm: true on`
      + ' your own.')

    return said.join(' ')
  }

  const unconfirmedConversionPhrase = (retry: string): string =>
    'Nothing was started: the platform waits for the user\'s go-ahead. A conversion step is refused like'
    + ' this when it would use the project conversion the plan includes (its AI work is free up to the'
    + ' conversion limit) or spend the organization\'s credit limits or topped-up credits; conversion_status'
    + ` shows the stage estimates. Tell the user and ask; only after they agree, call ${retry}. If that call is`
    + ' refused the same way again, the organization bought credits less than 14 days ago and a person must'
    + ' first confirm in Billing in the OwlMeans web application, in the browser — do not retry until they say'
    + ' they did.'

  const personRefusalPhrase = (e: unknown, retry?: string): string | null => {
    if (e instanceof ConnectOutOfCredits) {
      return `Not enough balance to do this — it needs about $${e.requiredUsd.toFixed(2)} and the account has `
        + `$${e.balanceUsd.toFixed(2)} left. Nothing was started. Ask the user to top up here: `
        + `${e.topUpUrl} — then retry.`
    }
    if (e instanceof ConnectConsentRequired) {
      return consentRequiredPhrase(e.consentUrl, e.deadline)
    }
    if (e instanceof ConnectConfirmationRequired) {
      return confirmationRequiredPhrase(e, retry)
    }

    return null
  }

  /** `<gate>:<deadline epoch ms | 0>:<encodeURIComponent(url)>` — `ConnectConsentRequired`'s packed body. */
  const consentDetail = (detail: string): { url: string, deadline?: Date } => {
    const [, ms = '0', encoded = ''] = detail.split(':')
    let url = encoded
    try {
      url = decodeURIComponent(encoded)
    } catch { /* keep it as it came */ }
    const at = Number(ms)

    return { url, ...(Number.isFinite(at) && at > 0 ? { deadline: new Date(at) } : {}) }
  }

  /** ` (detail)`, or nothing at all: a phrase must read as a sentence when there is no detail. */
  const aside = (detail: string): string => detail !== '' ? ` (${detail})` : ''

  const refusals: RefusalPhrase[] = [
    // ── The connector itself is not signed in ───────────────────────────────────────────────────
    // The detail is `<url> <code>`; the code is absent when no device sign-in is pending yet.
    {
      marker: 'oauth:sign-in-required:',
      phrase: detail => {
        const [url = '', code = ''] = detail.split(/\s+/)

        return 'You are not signed in to Viable. Ask the person to open'
          + ` ${url}${code !== '' ? ` and enter the code ${code}` : ''} and approve the connection with their`
          + ' OwlMeans account (a browser has been opened for them where one could be). Then call this tool'
          + ' again — nothing else needs configuring, and the code stays valid for ten minutes.'
      },
    },
    {
      marker: 'oauth:token-rejected:',
      phrase: variable => `The token in ${variable !== '' ? variable : 'the environment'} was refused —`
        + ' it is expired or was revoked. It was not replaced: signing in as somebody else behind the'
        + ' person\'s back is not something this server does. Ask them to unset it to sign in with a'
        + ' browser, or to export a fresh token.',
    },
    {
      marker: 'api:auth:guard:auth-token',
      phrase: () => 'The platform did not accept the access token this server presented — it is expired,'
        + ' or was revoked in Settings. A token from ~/.owlmeans has been forgotten, so the next call'
        + ' starts a browser sign-in; call this tool again.',
    },

    // ── A conversion refused by the platform ────────────────────────────────────────────────────
    {
      marker: 'conversion:unsupported:monorepo',
      phrase: paths => 'This repository points at code that is not inside it — a git submodule, or a'
        + ' workspace package that lives elsewhere. Converting needs everything in one repository.'
        + (paths !== '' ? `\nunlinked: ${paths}` : ''),
    },
    {
      marker: 'conversion:unsupported:bad-origin-url',
      phrase: url => 'That is not a repository address the platform can clone. Give the repository\'s'
        + ' own address, in the form https://github.com/owner/repository.'
        + (url !== '' ? `\ngiven: ${url}` : ''),
    },
    {
      marker: 'conversion:unsupported:not-linked',
      phrase: () => 'The platform has no way to read that repository: no GitHub connection is'
        + ' recorded for this project, or its access was revoked. The user connects it in the web'
        + ' application, and the conversion is started again afterwards.',
    },
    {
      marker: 'conversion:unsupported:no-origin',
      phrase: () => 'This project was generated by the platform rather than imported, so there is'
        + ' nothing to convert. develop_story is what changes a generated project.',
    },
    {
      marker: 'conversion:unsupported:not-convertible',
      phrase: () => 'The intake refused this origin: a conversion needs an application with source'
        + ' code it can read, not an empty repository, a documentation site or a bundle of binaries.'
        + ' check_convertible carries the reasons it gave.',
    },
    {
      marker: 'conversion:unsupported:',
      phrase: reason => `This origin cannot be converted${aside(reason)}, and no retry changes that.`
        + ' check_convertible carries the reasons.',
    },
    {
      marker: 'conversion:stage:',
      phrase: asked => `That decision is not available from where the conversion stands${aside(asked)}.`
        + ' Call conversion_status for the stage it is on and the decision it takes now.',
    },
    {
      marker: 'conversion:clone-failed:',
      phrase: () => 'The origin\'s sources could not be fetched. Check the repository still exists and'
        + ' that the project\'s GitHub connection still reaches it, then'
        + ' proceed_conversion { "decision": "retry" }.',
    },
    {
      marker: 'conversion:purge-in-place',
      phrase: () => 'Nothing to purge: the original sources are the project itself (an in-place'
        + ' repair). It was converted where it stood rather than rebuilt beside a filed-away copy,'
        + ' so there is no __viable_converted/ to delete and nothing has been removed.',
    },
    {
      marker: 'conversion:publish-origin',
      phrase: () => 'That would publish onto the repository this project was imported FROM, and its'
        + ' original sources are still on the volume — the push would write over the user\'s own'
        + ' code. purge_origin first, or publish to a different repository.',
    },
    {
      marker: 'conversion:relocate-declined',
      phrase: () => 'The conversion builds the new application around the existing code, which means'
        + ' moving that code one level down into __viable_converted/; nothing is deleted. The move'
        + ' was declined, so the conversion stopped here. Start it again and answer yes when it asks.',
    },

    // ── A conversion refused by the converter itself, usually reaching a parent on a failed run ──
    {
      marker: 'viable-converter:not-convertible:',
      phrase: reason => `The origin is not an application this platform can convert${aside(reason)}.`,
    },
    {
      marker: 'viable-converter:unsupported-stack:',
      phrase: stack => `The origin is built on a stack this converter carries no knowledge of${aside(stack)}.`
        + ' Nothing retries into a stack it cannot read.',
    },
    {
      marker: 'viable-converter:unlinked:',
      phrase: paths => 'The origin depends on code that is not inside it, so there is no one tree to'
        + ' convert.' + (paths !== '' ? `\nunlinked: ${paths}` : ''),
    },
    {
      marker: 'viable-converter:stage-order:',
      phrase: asked => `A conversion stage was asked for out of order${aside(asked)}.`
        + ' conversion_status says which one comes next.',
    },
    {
      marker: 'viable-converter:capability:',
      phrase: name => `The conversion needs something this deployment does not provide${aside(name)}.`
        + ' Nothing the parent agent does changes that; report it.',
    },
    {
      marker: 'viable-converter:too-large:',
      phrase: bytes => 'The origin is larger than a conversion reads'
        + (bytes !== '' ? ` (${bytes} bytes)` : '') + '.'
        + ' Convert a sub-project of it, or bring in a smaller tree.',
    },
    {
      marker: 'viable-converter:taxonomy-missing',
      phrase: () => 'This step needs what the ANALYSIS stage records, and the volume holds none of'
        + ' it. Run that stage first — proceed_conversion { "decision": "analyze" }.',
    },
    {
      marker: 'viable-converter:stack-missing',
      phrase: () => 'This step needs what the INTAKE stage records about the stack, and the volume'
        + ' holds none of it. The intake is what convert_project runs.',
    },
    {
      marker: 'viable-converter:origin-missing',
      phrase: () => 'The origin\'s sources are not on the volume: the stage that brings them in has'
        + ' not run. convert_project starts it.',
    },
    {
      marker: 'viable-converter:origin-purged',
      phrase: () => 'The original sources were deleted by purge_origin and this needs them. A purge'
        + ' cannot be undone.',
    },

    // ── What the platform refuses to build, whatever asked for it ────────────────────────────────
    {
      marker: 'content-refused:',
      phrase: category => 'The platform will not build this: it describes an application for '
        + (MODERATION[category] ?? 'something the platform does not host') + '.'
        + ' The refusal is about the SHAPE of the product, never its sector — say so to the user;'
        + ' re-sending the same description is refused the same way.',
    },
    {
      marker: 'reserved-name:',
      phrase: brand => (brand !== ''
        ? `"${brand}" is another company's name`
        : 'That name belongs to another company')
        + ', and a project name becomes part of its public web address. Choose a name of the user\'s'
        + ' own — the product may still work with that company.',
    },
    {
      marker: 'target-integrity:',
      phrase: files => 'The files in this project are not a Viable application, so nothing will be'
        + ' built or started from them.' + (files !== '' ? `\n${files}` : ''),
    },
    {
      marker: 'legacy-target:',
      phrase: () => 'This project was generated with an earlier application layout the platform no'
        + ' longer writes into. It keeps running, but no story or change can be applied to it.'
        + ' reinitialize_project rebuilds it with the current layout and keeps its stories.',
    },
    {
      marker: 'viable-project:missconfigured:',
      phrase: () => 'This project\'s analysis is missing from its sandbox, so there is nothing to'
        + ' build a story from. reinitialize_project restores it.',
    },

    // ── A consent or a confirmation only a person can give ───────────────────────────────────────
    // Above the planning markers on purpose: a story start refused for the consent reaches a
    // connector as `planning:commit-failed:<transition>:<the refusal>`, and it is the consent that
    // the person has to act on. The thrown `ConnectConsentRequired` is phrased by `registerCatalogue`
    // itself; this entry answers the same refusal stored as text on a run.
    {
      marker: 'viable-connect:consent-required:',
      phrase: detail => {
        const { url, deadline } = consentDetail(detail)

        return consentRequiredPhrase(url, deadline)
      },
    },
    {
      // The web refusal (`@owlmeans/payment` `PerformanceConsentRequired`) reaching a connector
      // through a stored run error or a planning commit: no URL travels with it.
      marker: 'performance-consent-required',
      phrase: () => consentRequiredPhrase(''),
    },
    {
      // A conversion's confirmation, where the class did not survive: the fields are in the detail.
      // The thrown class is phrased by the conversion tools themselves, with the call to repeat.
      marker: 'viable-connect:confirmation-required:',
      phrase: detail => confirmationRequiredPhrase(ConnectConfirmationRequired.decode(detail)),
    },

    // ── A story refused by the platform's planning ───────────────────────────────────────────────
    // Stories are planning cards, and every change to one is a transition the platform validates:
    // the flow decides which move is open from a status, the head decides whether the story changed
    // under the caller, and a transition is durable before it has committed.
    {
      marker: 'viable-project:story:not-found:',
      phrase: ref => `This project has no story${ref !== '' ? ` ${ref}` : ''}. list_stories shows the`
        + ' codes it has; a story of another project is named together with that projectId.',
    },
    {
      marker: 'viable-project:story:missconfigured:',
      phrase: reason => `The story is not in a state that change applies to${aside(reason)}. A completed`
        + ' story has generated code behind it and is neither reworded nor deleted; story_status says'
        + ' where it stands.',
    },
    {
      marker: 'planning:illegal-transition:',
      phrase: move => `That move is not open from the status the story is in${aside(move)}. A story in`
        + ' progress is already being developed — read story_status; a completed one is reset'
        + ' in the web application before it is developed again. story_status says where it stands.',
    },
    {
      marker: 'planning:workcard-conflict:',
      phrase: () => 'The story changed between reading it and this change, so nothing was written. Read'
        + ' it again with story_status and repeat the change if it still applies.',
    },
    {
      marker: 'planning:workcard-not-found:',
      phrase: () => 'The platform has no such story or project for this account. list_projects and'
        + ' list_stories show what exists.',
    },
    {
      marker: 'planning:fields-invalid:',
      phrase: detail => `The platform refused the story as malformed${aside(detail)}. Say it again as one`
        + ' plain narrative sentence.',
    },
    {
      marker: 'planning:commit-timeout:',
      phrase: () => 'The platform accepted the change and has not applied it yet. It is neither lost nor'
        + ' undone: read story_status or list_stories in a moment rather than repeating the call.',
    },
    {
      marker: 'planning:commit-failed:',
      phrase: cause => `The platform accepted the change and then could not apply it${aside(cause)}.`
        + ' Read story_status for where the story stands before retrying.',
    },

    // ── A balance, rather than a fault ───────────────────────────────────────────────────────────
    {
      marker: 'out-of-tokens:conversion-budget',
      phrase: () => 'The account balance will not cover this conversion stage. conversion_status'
        + ' carries the estimate; the balance is topped up in the web application.',
    },
    {
      marker: 'out-of-tokens:project-budget',
      phrase: () => 'The account balance is below the floor a new project needs. It is topped up in'
        + ' the web application.',
    },
    {
      marker: 'out-of-tokens:story-budget',
      phrase: () => 'The account balance will not cover developing a story. It is topped up in the'
        + ' web application.',
    },

    // ── The project is busy ──────────────────────────────────────────────────────────────────────
    {
      marker: 'viable-project:agent:occupied:',
      phrase: verb => `The platform is already working on this project${aside(verb)}.`
        + ' Read project_status and ask again once it settles.',
    },
    {
      // Spelled with its package prefix, unlike every marker above: `locked:` alone is a substring of
      // ordinary English and of `unlocked:`, and a false match would answer some other refusal with
      // this sentence.
      marker: 'viable-agent-common:locked:',
      phrase: task => `The platform holds this project's lock${aside(task)}.`
        + ' Read project_status and ask again once it settles.',
    },
    {
      marker: 'git-busy:',
      phrase: () => 'A git operation is already running on this project. Retry once it settles.',
    },

    // ── The connector, from the platform's side of it ────────────────────────────────────────────
    {
      marker: 'viable-connect:local-unsupported:',
      phrase: op => `That addresses infrastructure a local project does not have${aside(op)}:`
        + ' sandbox lifecycle, production, preview watching and remote git are cloud-target only.',
    },
    {
      marker: 'viable-connect:session-gone:',
      phrase: () => 'No connector is attached to this project any more, and this needs one. Call the'
        + ' tool again — a session is opened on demand — then resume_pipeline for the run that'
        + ' stopped.',
    },
    {
      marker: 'viable-connect:session-not-found:',
      phrase: () => 'That session has expired or belongs to another profile. Call the tool again; a'
        + ' session is opened on demand.',
    },
    {
      marker: 'viable-connect:op-timeout:',
      phrase: () => 'The connector did not answer within the operation\'s own deadline. Retry it.',
    },
    {
      marker: 'viable-connect:op-refused:',
      phrase: detail => `The connector ran the operation and refused it${aside(detail)}.`,
    },
    {
      marker: 'viable-connect:op-unknown:',
      phrase: () => 'That operation is unknown, already answered, or belongs to another session.',
    },

    // ── A value the platform will not store ──────────────────────────────────────────────────────
    // `AuthenPayloadError(<field>)` — the web branding save's refusal, and the connector save's,
    // which reuses its validation. The detail is the wire field, so a project setting is answered with
    // its own rule; any other field still reads as a sentence.
    {
      marker: 'authen:payload:',
      phrase: field => {
        const setting = settingsHelper.projectSettingOf(field)

        return setting != null
          ? `The platform refused the ${setting.label} setting: it takes ${setting.rule}. Nothing was`
            + ' changed — project_settings shows what is stored.'
          : `The platform refused a value in this call as malformed${aside(field)}. Nothing was changed;`
            + ' correct that value and call the tool again.'
      },
    },

    // ── The call itself ──────────────────────────────────────────────────────────────────────────
    {
      marker: 'viable-api:agent:',
      phrase: verb => `The platform's agent could not complete this${aside(verb)}.`
        + ' project_status and conversion_status say where things stand; the call is retryable.',
    },
    {
      marker: 'api:client:auth:',
      phrase: () => 'The platform refused this access token. It is issued in the web application and'
        + ' can be revoked there — check VIABLE_API_TOKEN.',
    },
    {
      marker: 'api:client:crashed:',
      phrase: () => 'The platform errored on this call. Retry it, and read project_status for where'
        + ' the project actually stands before assuming nothing happened.',
    },
    {
      marker: 'api:client:forbidden',
      phrase: () => 'This token may not do that: the project belongs to another account, or the'
        + ' capability is not on this plan.',
    },
    // A production body carries only an incident id, so a refusal whose class never reaches this
    // process is known by its STATUS alone (`@owlmeans/api` `ApiStatusError`).
    {
      marker: 'api:client:status:428',
      phrase: () => consentRequiredPhrase(''),
    },
    {
      marker: 'api:client:status:402',
      phrase: () => 'Nothing was started: the account balance will not cover this. Ask the user to top up'
        + ' in Billing in the OwlMeans web application, then call this tool again.',
    },
  ]

  /** Everything up to the first stack frame — a parent agent can act on none of what follows. */
  const withoutStack = (text: string): string => {
    const lines = text.split('\n')
    const frame = lines.findIndex(line => STACK_FRAME.test(line))

    return (frame < 0 ? lines : lines.slice(0, frame)).join('\n').trim()
  }

  /**
   * Whether this error is what `ResilientError.ensure` leaves when NOTHING recognised the class.
   *
   * Its fall-through converter is `new resilientErrorClass(err.message, err.stack)` against a
   * constructor whose signature is `(type, message, stack)` — so `type` holds the original MESSAGE
   * and `message` holds the original STACK, with no marshalling separator anywhere to give the shape
   * away. Nothing about that path is exotic: `processResponse` in `@owlmeans/api` ensures ANY string
   * response body, and an edge 502/503 answers in plain text (`upstream connect error …`), so a
   * gateway failure was handed to the parent agent as a trace of the SDK's own frames.
   *
   * It is recognised by the head every runtime prints for a stack — `<Name>: <message>` followed by
   * the frames — and what survives is the message the runtime put there, which for the plain-text
   * body IS the refusal. The check is deliberately positional rather than a regex over `<Name>`: the
   * type can itself be a whole marshalled string carrying newlines, and only the segment BEFORE the
   * match has to be a single-line error name.
   */
  const baseConverted = (e: ResilientError): boolean => {
    if (e.type === '') return false
    const at = e.message.indexOf(`: ${e.type}`)
    if (at < 0) return false
    const rest = e.message.slice(at + e.type.length + 2)

    return !e.message.slice(0, at).includes('\n') && (rest === '' || rest.startsWith('\n'))
  }

  /**
   * Where the marker actually is, for anything that can carry one.
   *
   * `ResilientError.ensure` rebuilds a class this process never registered by putting the whole
   * marshalled string in `type` and its own local STACK in `message` — and every refusal the
   * platform raises is such a class, since they are declared in packages the SDK does not depend on.
   * So the marker can be in either field, and a stored run error carries it as a bare string.
   *
   * {@link baseConverted} is asked FIRST, because that rebuild is the one shape where the stack sits
   * outside the marshalling and the fields are swapped: everything below reads `message` as text and
   * would hand the trace straight to the reader.
   */
  const textOf = (e: unknown): string => {
    if (typeof e === 'string') return e
    if (!(e instanceof Error)) return String(e ?? '')
    if (e instanceof ResilientError && baseConverted(e)) return e.type
    const type = e instanceof ResilientError ? e.type : ''
    if (e.message.includes(ResilientError.separator)) return e.message
    if (type.includes(ResilientError.separator)) return type

    return e.message !== '' ? e.message : type
  }

  const refusalMessage = (e: unknown): string => {
    const parts = textOf(e).split(ResilientError.separator)

    return parts.length > 1 ? withoutStack(parts[1] ?? '') : (parts[0] ?? '')
  }

  const refusalPhrase = (e: unknown): string => {
    const message = refusalMessage(e)
    if (message === '') return UNKNOWN_REFUSAL

    const known = refusals.find(entry => message.includes(entry.marker))
    if (known == null) {
      return MARKER_SHAPE.test(message) ? `${message}\n${UNPHRASED_REFUSAL}` : message
    }

    const detail = message.slice(message.indexOf(known.marker) + known.marker.length)
      .replace(/^:/, '').trim()

    return known.phrase(detail)
  }

  return {
    consentRequiredPhrase, confirmationRequiredPhrase, unconfirmedConversionPhrase, personRefusalPhrase,
    refusalMessage, refusalPhrase, refusals,
  }
}

export const refusalHelper = createRefusalHelper()
