import { AIMessage, HumanMessage, type AIMessageChunk, type BaseMessage, type MessageFieldWithRole } from '@langchain/core/messages'
import { logger } from '@owlmeans/log'
import { DEFAULT_TOOL_ROUNDS } from '../consts.js'
import { cacheHelper } from '../helpers/cache.js'
import { jsonHelper } from '../helpers/json.js'
import { normalizeInput } from '../helpers/messages.js'
import { spectate } from '../helpers/spectate.js'
import { toolCallsHelper } from '../helpers/tool-calls.js'
import type { ActiveRung, PreparedRequest, StreamOptions } from '../types.local.js'
import type { ModelInput, ModelInputItem, ModelMessage } from '../types.js'
import { configUtils } from './config.js'
import { mediaUtils } from './media.js'
import { promptUtils } from './prompt.js'
import { FINAL_TURN_REASKS, OUTPUT_TOOL_REQUIRED, STOP_TOOL_ACCEPTED, TOOL_CALL_NOT_RUN, TOOL_ROUNDS_NOTE_HEADER, TOOL_ROUNDS_SPENT } from './rounds/consts.js'
import type { CallRounds, RoundPhase, RoundsAnswer, RoundsCall, RoundsHost, RoundsUtils } from './rounds/types.js'
import { streamUtils } from './stream.js'
import { toolCallUtils } from './tool-calls.js'

const log = logger('llm')

const items = (input: ModelInput): ModelInputItem[] => Array.isArray(input) ? input : [input]

/** The messages of a turn as the request list types them — langchain messages are sent as they are. */
const asWire = (messages: readonly (BaseMessage | MessageFieldWithRole)[]): MessageFieldWithRole[] =>
  messages as unknown as MessageFieldWithRole[]

/**
 * The tool rounds of `ask` / `invoke` (`LlmCallTools`), run INSIDE one attempt of the call's retry
 * ladder, so a call that converses keeps its fallbacks, output budget, filter, guide and cache marks.
 *
 * What one attempt sends, in order: the opening exactly as the call would send it without tools (the
 * same preparation — system, project message, the caller's turn with its Tail), then whatever an
 * earlier attempt of this rung looked up, then the guidance of the last refusal, then this attempt's
 * rounds. The first turn of a first attempt is therefore byte for byte the plain request with tools
 * declared; every later turn is re-marked by the rung's `loopCache`, so each reads back the one before.
 */
export const makeRoundsUtils = (host: RoundsHost): RoundsUtils => {
  const of = <T>(call: RoundsCall<T>): CallRounds<T> => {
    const { kind, tools, action, input, request, prepared, fatal, output } = call
    const stops = tools.stop ?? []
    toolCallUtils.assertDistinct([
      ...tools.tools.map(tool => tool.name), ...stops.map(tool => tool.name), ...(output != null ? [output.toolName] : []),
    ])
    const look = tools.tools
    const stopOf = new Map(stops.map(tool => [tool.name, tool]))
    const maxRounds = Math.max(0, Math.floor(tools.maxRounds ?? DEFAULT_TOOL_ROUNDS))
    const roundAction = tools.action ?? action

    // Carried between attempts. Look rounds go out again as the messages they were while the same rung
    // answers — its own blocks, its cached prefix; to any other rung they travel as one note.
    let raw: BaseMessage[] = []
    let rawRung = -1
    const noted: BaseMessage[] = []

    // The attempt that ran last, for `conversation`.
    let opening: ModelMessage[] = []
    let followed: BaseMessage[] = []
    let closing: BaseMessage[] | undefined
    let tooledLast = false
    let roundsLast = 0
    let stopLast: string | undefined

    const neutralOf = (message: BaseMessage): BaseMessage =>
      message instanceof AIMessage ? toolCallUtils.neutral(message) : message

    /** Guidance appended after the rounds rather than prepared: copies, unmarked, no blank text, the rung's media. */
    const appendable = (guided: ModelInputItem[], rung: ActiveRung): MessageFieldWithRole[] => {
      const kept = guided.filter(item => typeof item !== 'string' || item.trim() !== '')
      if (kept.length === 0) {
        return []
      }
      const msgs = normalizeInput(kept)
      promptUtils.stripCacheMarkers(msgs)
      promptUtils.dropBlankContent(msgs)
      mediaUtils.render(msgs, rung.plugin, rung.config)

      return msgs
    }

    /** The request of one turn: the opening as prepared while nothing follows it, re-marked once something does. */
    const wireOf = (base: PreparedRequest, after: MessageFieldWithRole[], rung: ActiveRung): Pick<PreparedRequest, 'msgs' | 'options' | 'placed'> => {
      if (after.length === 0) {
        return base
      }
      const patch = base.cached && request.cacheMax !== 0
        ? rung.plugin?.loopCache?.([...base.plain, ...after], rung.model, base.hints)
        : undefined

      return patch != null
        ? { msgs: patch.messages, options: patch.options ?? {}, placed: patch.placed }
        : { msgs: [...base.msgs, ...after], options: base.options, placed: base.placed }
    }

    const restart = (tooled: boolean, opened: ModelMessage[]): void => {
      tooledLast = tooled
      opening = opened
      followed = []
      closing = undefined
      roundsLast = 0
      stopLast = undefined
    }

    // An `ask` with nothing to declare has nothing to converse with — and a provider refuses a tool choice without tools.
    const declares = output != null || look.length > 0 || stops.length > 0

    const tooled: CallRounds<T>['tooled'] = rung =>
      declares && typeof rung.refined.bindTools === 'function' && rung.plugin?.toolCalling?.(rung.config) !== false

    const plain: CallRounds<T>['plain'] = guidance => {
      // A rung without tools cannot be handed tool messages: everything looked up travels as the note.
      noted.push(...raw)
      raw = []
      rawRung = -1
      const carried = noted.length > 0 ? [...items(input), toolCallUtils.noteOf(noted)] : undefined
      const opened = guidance.input(carried ?? input)
      restart(false, normalizeInput(opened))

      return carried != null ? opened : undefined
    }

    /**
     * `ask`'s answer once looking is over, with NO tool bound: whatever this call looked up rides the
     * input as one note, then the guidance and "answer now" — so no provider is handed tool messages
     * without the tools they answer, and the answer cannot be another call. A turn that still comes
     * back as calls only is asked again ({@link FINAL_TURN_REASKS}) before the attempt fails.
     */
    const answerPlain = async (
      active: ActiveRung, attempt: number, guided: ModelInputItem[], looked: readonly BaseMessage[],
    ): Promise<RoundsAnswer> => {
      const lookups = [...noted, ...raw, ...looked]
      const note = lookups.length > 0 ? toolCallUtils.noteOf(lookups, TOOL_ROUNDS_NOTE_HEADER) : undefined
      const request0 = note == null && guided.length === 0
        ? await prepared(active)
        : await host.prepare({
          ...request, input: [...items(input), ...(note != null ? [note, ...guided, TOOL_ROUNDS_SPENT] : guided)],
        }, active)
      for (let asked = 0; ; asked++) {
        const answered = await host.answer(active, request0, action, attempt, request.stable)
        if (asked >= FINAL_TURN_REASKS || !toolCallUtils.onlyCalls(answered.message)) {
          return answered
        }
        log.debug('A tool-less answer came back as tool calls; asked again', { action, calls: answered.message.tool_calls?.length })
      }
    }

    const converse: CallRounds<T>['converse'] = async (active, attempt, guidance) => {
      const { plugin, config, refined } = active
      if (rawRung !== active.index) {
        noted.push(...raw)
        raw = []
        rawRung = active.index
      }
      const note = noted.length > 0 ? toolCallUtils.noteOf(noted) : undefined
      const lead = note != null ? [...items(input), note] : items(input)
      const guided = items(guidance.input([]))
      // A retry whose look budget is already spent answers at once: `ask` with no tool bound, `invoke`
      // with its output tool pinned.
      const spentBefore = attempt > 0 && tools.exhausted?.() === true

      if (spentBefore && output == null) {
        restart(true, [...normalizeInput(lead), ...raw.map(neutralOf), ...normalizeInput(guided)])
        return { answer: await answerPlain(active, attempt, guided, []) }
      }

      let base: PreparedRequest
      let after: MessageFieldWithRole[] = []
      if (raw.length > 0) {
        // The carried rounds answer the opening, so they stay right after it; the guidance follows them.
        base = note != null ? await host.prepare({ ...request, input: lead }, active) : await prepared(active)
        after = [...asWire(raw), ...appendable(guided, active)]
        restart(true, [...normalizeInput(lead), ...raw.map(neutralOf), ...normalizeInput(guided)])
      } else {
        base = note != null || guided.length > 0
          ? await host.prepare({ ...request, input: [...lead, ...guided] }, active)
          : await prepared(active)
        restart(true, normalizeInput([...lead, ...guided]))
      }

      const definitions = toolCallUtils.definitions(look, stops, output != null
        ? {
          name: output.toolName, parameters: output.innerSchema,
          strict: plugin?.strictTool?.(config, output.innerSchema) === true,
        }
        : undefined)
      // `invoke` must call one of its tools; a model that refuses a forced choice is asked in words (the
      // opening carries the instruction) and given `auto`. Once looking is over, the output tool is pinned
      // exactly as the plain call pins it; `ask` answers with no tool bound (`answerPlain`).
      const lookChoice = output != null ? (plugin?.pinsTool?.(config) === false ? 'auto' : 'any') : undefined
      const finalChoice = output != null
        ? plugin?.toolChoice(output.toolName, config) ?? { type: 'function', function: { name: output.toolName } }
        : undefined

      const sent: BaseMessage[] = []
      const rounds: BaseMessage[] = []
      let phase: RoundPhase = spentBefore ? 'final' : 'look'
      let reasked = 0
      try {
        for (;;) {
          if (phase === 'look' && (roundsLast >= maxRounds || tools.exhausted?.() === true)) {
            phase = stops.length > 0 ? 'spent' : 'final'
            if (roundsLast > 0) {
              const now = new HumanMessage(TOOL_ROUNDS_SPENT)
              sent.push(now)
              followed.push(now)
            }
          }
          if (phase === 'final' && output == null) {
            return { answer: await answerPlain(active, attempt, guided, rounds) }
          }
          const choice = phase === 'final' ? finalChoice : lookChoice
          const { msgs, options, placed } = wireOf(base, [...after, ...asWire(sent)], active)
          const bound = refined.bindTools!(definitions, choice != null ? { tool_choice: choice } : undefined)
          const startedAt = Date.now()
          let piece: AIMessageChunk | null = null
          for await (const chunk of streamUtils.streamWithDeadline(
            signal => bound.stream(msgs, { ...options, runName: action, metadata: { purpose: host.purpose }, signal } as StreamOptions),
            configUtils.idleTimeout(config),
          )) {
            piece = piece == null ? chunk : piece.concat(chunk)
          }
          if (piece == null) {
            throw await host.nullResult(kind, config, {
              action, attempt, startedAt, refined, msgs, raw: piece, useCache: placed > 0, stable: request.stable,
            })
          }
          cacheHelper.withCacheTiers(piece)

          // The calls as the provider recorded them: streamed fragments of parallel calls can lose their arguments.
          const message = toolCallsHelper.messageOf(piece, plugin)
          const calls = message.tool_calls ?? []
          const stopCall = calls.find(candidate => stopOf.has(candidate.name))
          const outputCall = output != null ? calls.find(candidate => candidate.name === output.toolName) : undefined
          const lookCalls = calls.filter(candidate => candidate !== stopCall && candidate !== outputCall)
          const asked = stopCall == null && outputCall == null && lookCalls.length > 0
          const looking = asked && phase === 'look'
          const entry = await spectate(host.spectator, kind)(
            msgs, message, looking ? roundAction : action, attempt, startedAt, config.model,
          )

          if (stopCall != null) {
            tools.onToolCall?.(stopCall.name, stopCall.args)
            const value = await stopOf.get(stopCall.name)!.value(stopCall.args)
            stopLast = stopCall.name
            closing = [toolCallUtils.neutral(message, [stopCall]), toolCallUtils.reply(stopCall, STOP_TOOL_ACCEPTED, true)]

            return { stopped: { value, message, entry } }
          }

          if (looking) {
            for (const lookCall of lookCalls) {
              tools.onToolCall?.(lookCall.name, lookCall.args)
            }
            log.debug('Model tool round', { action: roundAction, round: roundsLast, calls: lookCalls.map(each => each.name) })
            const results = await Promise.all(lookCalls.map(lookCall => toolCallUtils.run(lookCall, look, fatal)))
            sent.push(message, ...results)
            rounds.push(message, ...results)
            followed.push(toolCallUtils.neutral(message, lookCalls), ...results)
            roundsLast++
            continue
          }

          // A look-up asked for once looking is over is not run; the answer is asked for again — `ask` with
          // no tool bound, `invoke` with its output tool pinned (at most FINAL_TURN_REASKS times on that turn).
          if (asked && (phase === 'spent' || (phase === 'final' && reasked < FINAL_TURN_REASKS))) {
            const unrun = lookCalls.map(lookCall => toolCallUtils.reply(lookCall, TOOL_CALL_NOT_RUN, false))
            sent.push(message, ...unrun)
            followed.push(toolCallUtils.neutral(message, lookCalls), ...unrun)
            if (phase === 'final') {
              reasked++
              log.debug('The output turn came back as look calls; asked again', { action, calls: lookCalls.length })
            }
            phase = 'final'
            continue
          }

          if (output == null) {
            return { answer: { piece, message, msgs, placed, startedAt, entry } }
          }
          const args = outputCall?.args as unknown
          const result = args != null
            ? (typeof args === 'string' ? jsonHelper.parseJsonContent(args) : args)
            // Content fallback, as the plain call: the schema-shaped JSON sent as text.
            : jsonHelper.parseJsonContent(piece.content)

          // `invoke` answered in words, with no output tool and nothing parseable: a provider that ignores a
          // forced "any tool" choice lets the model do that. Asked again within the attempt with the output
          // tool pinned by name, which every provider honours — never fails the attempt on the first such turn.
          if (outputCall == null && (result == null || typeof result !== 'object' || Array.isArray(result)) && reasked < FINAL_TURN_REASKS) {
            reasked++
            const said = new AIMessage({ content: piece.content })
            const require = new HumanMessage(OUTPUT_TOOL_REQUIRED(output.toolName))
            sent.push(said, require)
            followed.push(said, require)
            log.debug('The structured answer came back as text; asked again with the output tool pinned', { action })
            phase = 'final'
            continue
          }

          return { answer: { piece, message, msgs, placed, startedAt, entry, result: result ?? null } }
        }
      } finally {
        // A refusal after this attempt — its filter, its schema, a stalled stream — must not cost the reads again.
        raw.push(...rounds)
      }
    }

    const conversation: CallRounds<T>['conversation'] = answer => ({
      tooled: tooledLast,
      rounds: roundsLast,
      ...(stopLast != null ? { stop: stopLast } : {}),
      messages: [...opening, ...followed, ...(closing ?? [new AIMessage({ content: answer ?? '' })])],
    })

    return { tooled, plain, converse, conversation }
  }

  return { of }
}
