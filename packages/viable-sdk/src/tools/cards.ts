import { ApiStatusError, apiStatusHelper } from '@owlmeans/api'
import { memoHelper } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { IntrinsicStatus, WorkcardKind, type Workcard, type WorkcardQuery } from '@owlmeans/planning'
import {
  ConnectWaitReason, ProjectWorkcardNotFound, TriageKind, VIABLE_USER_STORY_TYPE, VIABLE_WORK_TYPES, WorkProposalStatus,
  viableWorkHelper, type AnyViableWorkCard, type ConnectCardStatus, type ConnectCardsPlanView,
} from '@owlmeans/viable-common'
import { NOT_FOUND } from '../api/consts.local.js'
import { refusalHelper } from './refusal.js'
import { CARD_INPUTS_HEADING, CARD_INPUT_NOTE_MAX, CARD_RERUN_WORDS, CARD_TYPE_KEYS, CARD_TYPE_NAMES, CARDS_PLAN_MEMO_MS } from './cards/consts.js'
import type { CardsPlanMemo, CardsPlanMemoFactory, CardsToolHelper, CardTypeWord } from './cards/types.js'

export const createCardsToolHelper = (): CardsToolHelper => {
  const typeOf: CardsToolHelper['typeOf'] = word => {
    const key = CARD_TYPE_KEYS[word as Exclude<CardTypeWord, 'auto'>]

    // `auto` files a user story and asks the type check to fit it — the platform decides the type.
    return key != null ? { type: key, auto: false } : { type: VIABLE_USER_STORY_TYPE, auto: true }
  }

  const wordOf: CardsToolHelper['wordOf'] = type => CARD_TYPE_NAMES[type] ?? type

  const cardQuery: CardsToolHelper['cardQuery'] = (projectId, filter = {}): WorkcardQuery => ({
    kind: WorkcardKind.Card,
    type: filter.type != null ? filter.type : [...VIABLE_WORK_TYPES],
    // A container's members sit under it as their second parent; the project stays their first.
    ...(filter.container != null ? { within: filter.container } : { parent: projectId }),
    ...(filter.status != null ? { status: filter.status } : {}),
  })

  const ofProject = (card: Workcard | null, projectId: string): card is AnyViableWorkCard =>
    viableWorkHelper.isWorkCard(card) && (card.parent === projectId || card.parents.includes(projectId))

  const resolveCard: CardsToolHelper['resolveCard'] = async (deps, projectId, ref) => {
    const [byId, byCode] = await Promise.all([
      // A code is not an id; a store may refuse it as malformed rather than absent — not this card either way.
      deps.api.planning.cards.load(ref).catch(() => null),
      deps.api.planning.cards.list({
        ...cardQuery(projectId), code: ref === ref.toUpperCase() ? ref : [ref, ref.toUpperCase()], page: 0, size: 1,
      }),
    ])
    if (ofProject(byId, projectId)) return byId
    const found = byCode.items[0] ?? null
    if (ofProject(found, projectId)) return found

    throw new ProjectWorkcardNotFound(ref)
  }

  const describe: CardsToolHelper['describe'] = (description, inputs = []) => {
    const text = description?.trim() ?? ''
    if (inputs.length === 0) return text !== '' ? text : undefined
    const lines = inputs.map(input => `- ${input.name.trim()}${input.secret ? ' (secret)' : ''}`
      + (input.note != null && input.note.trim() !== '' ? ` — ${input.note.trim().slice(0, CARD_INPUT_NOTE_MAX)}` : ''))

    return [...(text !== '' ? [text, ''] : []), CARD_INPUTS_HEADING, ...lines].join('\n')
  }

  const containerNote = (card: Workcard, containers?: ReadonlyMap<string, string>): string => {
    const container = viableWorkHelper.containerIdOf(card)

    return container != null ? ` · in ${containers?.get(container) ?? container}` : ''
  }

  const renderCards: CardsToolHelper['renderCards'] = (items, page, total, containers) => {
    if (items.length < 1) return 'No cards.'
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.intrinsic, (counts.get(item.intrinsic) ?? 0) + 1)
    const summary = [IntrinsicStatus.Planned, IntrinsicStatus.InProgress, IntrinsicStatus.Closed]
      .filter(state => (counts.get(state) ?? 0) > 0)
      .map(state => `${counts.get(state)} ${state.replace('-', ' ')}`)
      .join(', ')

    return `${items.length} of ${total} (page ${page}) — ${summary}:\n` + items.map(item =>
      `  ${item.code ?? item.id ?? ''} · ${wordOf(item.type)} · ${item.status}${containerNote(item, containers)}`
      + `\n      ${item.title.slice(0, 160)}`).join('\n')
  }

  const runLines = (run: ConnectCardStatus['run']): string[] => {
    if (run == null) return []
    const lines = [
      `run ${run.runId} · ${run.pipeline} · ${run.status}${run.step != null ? ` · step: ${run.step}` : ''}`,
      `steps: ${run.completed.length}/${run.completed.length + run.pending.length} completed`,
    ]
    if (run.error != null && run.error !== '') lines.push(`error: ${refusalHelper.refusalPhrase(run.error)}`)

    return lines
  }

  const nextOf = (status: ConnectCardStatus): string => {
    const card = `"projectId": "${status.projectId}", "cardId": "${status.card.id}"`
    if (status.pendingInquiry != null) return `answer_question { "questionId": "${status.pendingInquiry.id}" }`
    if (status.waitingFor === ConnectWaitReason.Person) return 'next_question'
    if (status.waitingFor === ConnectWaitReason.ModelTask) return 'next_task'
    if (status.waitingFor === ConnectWaitReason.LocalConnector) return 'session_status'
    const missing = (status.inputs ?? []).filter(input => !input.set)
    if (missing.length > 0 && status.inputsUrl != null && status.card.intrinsic !== IntrinsicStatus.Closed) {
      return `the user types ${missing.map(input => input.name).join(', ')} at ${status.inputsUrl} (never into this`
        + ` conversation); then run_card { ${card} }`
    }
    switch (status.card.intrinsic) {
      case IntrinsicStatus.Planned:
        return `run_card { ${card} }`
      case IntrinsicStatus.InProgress:
        return `card_status { ${card} } — or project_activity to follow it`
      default:
        return status.card.status === 'failed'
          ? `run_card { ${card} } runs it again${(status.members?.length ?? 0) > 0 ? ' (only the members still open)' : ''}`
          : 'nothing — this card is settled'
    }
  }

  const renderStatus: CardsToolHelper['renderStatus'] = status => {
    const { card } = status
    const lines = [
      `${card.code} · ${wordOf(card.type)} · ${card.title}`,
      `card: ${card.status} (${card.intrinsic})${card.container != null ? ` · in ${card.container}` : ''}`
      + (card.typeBy != null ? ` · type decided by the ${card.typeBy}` : ''),
    ]
    if (status.members != null && status.members.length > 0) {
      lines.push(`members (${status.members.length}):`)
      lines.push(...status.members.map(member => `  ${member.code} · ${wordOf(member.type)} · ${member.status} — ${member.title.slice(0, 120)}`))
    }
    if (status.plan != null) {
      lines.push(`plan: ${status.plan.steps.length} step(s)${status.plan.steps.length > 0 ? ` — ${status.plan.steps.join(', ')}` : ''}`)
      if (status.plan.rationale != null && status.plan.rationale !== '') lines.push(`  why: ${status.plan.rationale.slice(0, 400)}`)
      for (const outcome of status.plan.outcomes ?? []) {
        lines.push(`  ${outcome.card}: ${outcome.outcome}${outcome.reason != null ? ` — ${outcome.reason.slice(0, 200)}` : ''}`)
      }
    }
    const open = (status.proposals ?? []).filter(proposal => proposal.status === WorkProposalStatus.Open)
    if (open.length > 0) {
      lines.push(`proposals (${open.length} open) — accept or dismiss with update_card { "proposals": [{ "id", "decision" }] }:`)
      lines.push(...open.map(proposal => `  ${proposal.id} · ${proposal.kind}${proposal.type != null ? ` · as ${wordOf(proposal.type)}` : ''} — ${proposal.title.slice(0, 160)}`))
    }
    if (status.inputs != null && status.inputs.length > 0) {
      lines.push(`inputs: ${status.inputs.map(input => `${input.name} (${input.kind}) · ${input.set ? 'set' : 'missing'}`).join('; ')}`)
      if (status.inputsUrl != null) lines.push(`  secrets are typed by the user at ${status.inputsUrl} — never here`)
    }
    lines.push(...runLines(status.run))
    if (card.warning != null && card.warning !== '') lines.push(`warning: ${refusalHelper.refusalPhrase(card.warning)}`)
    if (status.pendingInquiry != null) lines.push(`question: ${status.pendingInquiry.question}`)
    lines.push(`next: ${nextOf(status)}`)

    return lines.join('\n')
  }

  const renderPlan: CardsToolHelper['renderPlan'] = (projectId, view) => {
    const loose: string[] = view.assignment.loose ?? []
    if (view.assignment.placements.length === 0 && loose.length === 0) {
      return 'No loose planned cards to run: every planned card already sits in a spec or a feature.'
        + '\nnext: run_card starts one spec; list_cards shows the board'
    }
    const names = new Map([...view.loose, ...view.containers].map(card => [card.id, `${card.code} (${wordOf(card.type)}) ${card.title.slice(0, 80)}`]))
    const groups = new Map<string, string[]>()
    for (const placement of [...view.assignment.placements].sort((a, b) => a.order - b.order)) {
      const into = placement.container ?? ''
      groups.set(into, [...groups.get(into) ?? [], `    ${names.get(placement.card) ?? placement.card}${placement.reason != null ? ` — ${placement.reason.slice(0, 160)}` : ''}`])
    }
    const lines = ['Run all would place the loose planned cards like this (nothing is written yet):']
    for (const container of view.containers) {
      const held = groups.get(container.id)
      if (held == null) continue
      lines.push(`  into ${names.get(container.id)}:`, ...held)
    }
    const fresh = groups.get('') ?? []
    // A new spec is formed only for two or more cards: one card placed there runs on its own, first.
    if (fresh.length > 1) {
      lines.push(`  into a NEW spec "${view.assignment.newSpec?.title ?? 'New spec'}" (runs after the existing specs):`, ...fresh)
    }
    const alone = [...fresh.length === 1 ? fresh : [], ...loose.map(card => `    ${names.get(card) ?? card}`)]
    if (alone.length > 0) {
      lines.push('  on its own (runs after the specs):', ...alone)
    }
    lines.push('The existing specs run first, the new spec next, the cards on their own last, one after another — each'
      + ' start is admitted like the person\'s own Start and spends credits (a spec needs the plan\'s free spec of the'
      + ' month or 100,000 credits; a card on its own spends like run_card).')
    lines.push(`Tell the user and ask; only after they agree, call run_all_cards { "projectId": "${projectId}", "confirm": true }`)

    return lines.join('\n')
  }

  const renderTogether: CardsToolHelper['renderTogether'] = view =>
    `Spec ${view.code ?? view.spec} holds ${view.members.length} card(s)`
    + (view.started ? ' and was started — its members are built together in one run.' : ' — not started.')

  const renderRunAll: CardsToolHelper['renderRunAll'] = view =>
    `Run all started: batch ${view.id} over ${view.stories.length} item(s) — the existing specs first, the new spec next,`
    + ' cards on their own last.'
    + '\nnext: story_batch_status follows the batch; card_status reads one spec or card'

  const renderRerun: CardsToolHelper['renderRerun'] = (view, card) =>
    `Started the ${wordOf(card.type)} ${view.code ?? card.code ?? view.card} again for its ${view.members.length}`
    + ` ${CARD_RERUN_WORDS[view.scope] ?? view.scope} card(s) — the completed ones are left as they are.`

  /** A refused start's sentence: the marshalled refusal rebuilt into its class first, so a balance refusal reads as one. */
  const startRefusalOf = (refusal: string | undefined): string => {
    if (refusal == null || refusal === '') return 'the platform refused the start.'
    const error = ResilientError.ensure(refusal)

    return refusalHelper.personRefusalPhrase(error) ?? refusalHelper.refusalPhrase(error)
  }

  const renderRequest: CardsToolHelper['renderRequest'] = view => {
    switch (view.kind) {
      case TriageKind.Question:
        return 'Read as a QUESTION: the platform\'s agent answers it by reading the project and changes nothing.'
          + ' Follow it with project_activity — its answer is the run\'s last message.'
      case TriageKind.Card: {
        const cards = view.cards ?? []
        const lines = [`Read as WORK for the board: ${cards.length} card(s) filed as the user's own:`,
          ...cards.map(card => `  ${card.code} · ${wordOf(card.type)} — ${card.title.slice(0, 160)}`)]
        if (view.start != null) {
          lines.push(view.start.started
            ? `Started ${cards.find(card => card.id === view.start!.card)?.code ?? view.start.card} as the user asked.`
            : `Not started: ${startRefusalOf(view.start.refusal)}`)
        }
        lines.push(`next: card_status { "cardId": "${view.start?.card ?? cards[0]?.id ?? ''}" }`
          + (view.start?.started === true ? '' : ' — run_card starts it once the user agrees'))

        return lines.join('\n')
      }
      default:
        return 'Read as a small FIX: the platform\'s agent is making it now (an open-ended change).'
    }
  }

  const routeMissing: CardsToolHelper['routeMissing'] = error => error instanceof ApiStatusError
    && apiStatusHelper.httpStatusOf(error) === NOT_FOUND
    && apiStatusHelper.incidentIdOf(error) == null

  return {
    typeOf, wordOf, cardQuery, resolveCard, describe, renderCards, renderStatus, renderPlan, renderTogether,
    renderRunAll, renderRerun, renderRequest, routeMissing,
  }
}

export const cardsToolHelper = createCardsToolHelper()

const makeCardsPlanMemo: CardsPlanMemoFactory = () => {
  const shown = new Map<string, { view: ConnectCardsPlanView, at: number }>()

  const remember: CardsPlanMemo['remember'] = (projectId, view) => { shown.set(projectId, { view, at: Date.now() }) }

  const recall: CardsPlanMemo['recall'] = projectId => {
    const entry = shown.get(projectId)

    return entry != null && Date.now() - entry.at <= CARDS_PLAN_MEMO_MS ? entry.view : null
  }

  const forget: CardsPlanMemo['forget'] = projectId => { shown.delete(projectId) }

  return { remember, recall, forget }
}

/** The Run all proposal last shown through one connector API — one memo per API. */
export const cardsPlanMemoOf = memoHelper.oncePer(makeCardsPlanMemo)
