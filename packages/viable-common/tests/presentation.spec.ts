import { describe, expect, test } from 'bun:test'
import {
  AgentCodeLanguage, AgentMarkdownKind, AgentMessageCategory, AgentMessageRole,
  AgentStructuredKind, classifyAgentMessage, isAgentMessageHidden,
} from '../src/agent/presentation.js'

describe('@owlmeans/viable-common — agent message presentation', () => {
  test('classifies source and unified diffs with their display language', () => {
    expect(classifyAgentMessage({ action: 'code', text: 'export const App = () => <main />' }))
      .toMatchObject({ category: AgentMessageCategory.Code, language: AgentCodeLanguage.ReactTsx })
    expect(classifyAgentMessage({ action: 'update-code', text: '--- a/app.css\n+++ b/app.css\n@@ -1 +1 @@\n-.old {}\n+.new {}' }))
      .toMatchObject({ category: AgentMessageCategory.Diff, language: AgentCodeLanguage.Css })
    expect(classifyAgentMessage({ text: '{"ready": true}' }))
      .toMatchObject({ category: AgentMessageCategory.Code, language: AgentCodeLanguage.Json })
  })

  test('unwraps schema tool calls into semantic cards instead of a JSON fallback', () => {
    expect(classifyAgentMessage({
      outputType: 'tool_calls',
      action: 'choose-files-for-fix',
      value: [{ name: 'answer', args: { files: ['src/app.tsx'], why: 'screen entrypoint' } }],
    })).toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.ArtifactSelection })
    expect(classifyAgentMessage({ value: { actor: 'human', worker: false, jobs: [], agents: [], kv: false } }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.RuntimeDecision })
    // The model's own runtime-decision call never carries `actor`/`worker` — those are added only
    // once the decision is persisted onto a StoryDesign.
    expect(classifyAgentMessage({ value: { kv: true, feedback: null, jobs: [], agents: [] } }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.RuntimeDecision })
    // A scaffold plan carries its own `stories` array — checked ahead of StoryPlan's bare check.
    expect(classifyAgentMessage({
      value: { identity: { name: 'App', description: '' }, guestHome: {}, areas: [], stories: [], motifs: '' },
    })).toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.ScaffoldPlan })
    expect(classifyAgentMessage({ value: { unknown: ['still', 'readable'] } }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.GenericRecord })
  })

  test('routes unconstrained tool-calling loops to ToolCalls even when args shape-match a schema', () => {
    // A single free-flight file read whose args happen to carry `files` — without the action
    // check this reads as an ArtifactSelection card instead of a tool call.
    expect(classifyAgentMessage({
      outputType: 'tool_calls',
      action: 'coding-agent-ask',
      value: [{ name: 'read_sources', args: { files: ['src/app.tsx'] } }],
    })).toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.ToolCalls })
    // Several calls in the same turn are always ToolCalls, regardless of action.
    expect(classifyAgentMessage({
      outputType: 'tool_calls',
      value: [
        { name: 'read_file', args: { path: 'a.ts' } },
        { name: 'read_file', args: { path: 'b.ts' } },
      ],
    })).toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.ToolCalls })
    // A single call whose args shape-match nothing known stays ToolCalls rather than falling
    // through to a generic JSON dump.
    expect(classifyAgentMessage({
      outputType: 'tool_calls',
      value: [{ name: 'run_bun', args: { args: 'install' } }],
    })).toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.ToolCalls })
  })

  test('uses producer metadata for roles and action metadata for documents and decisions', () => {
    expect(classifyAgentMessage({ agent: 'ba-service', helper: 'ba-helper', action: 'write-specification', text: '# Brief' }))
      .toMatchObject({ category: AgentMessageCategory.Markdown, document: AgentMarkdownKind.Specification, role: AgentMessageRole.Analytical })
    expect(classifyAgentMessage({ agent: 'ui-helper', action: 'describe-ui-screen', text: '## Layout' }))
      .toMatchObject({ role: AgentMessageRole.VisualDesign })
    expect(classifyAgentMessage({ agent: 'api-helper', action: 'should-update-handler', text: 'true' }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.Decision, role: AgentMessageRole.Architect })
    expect(classifyAgentMessage({ agent: 'runtime-architect', action: 'runtime-gate' }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.RuntimeDecision, role: AgentMessageRole.Architect })
    expect(classifyAgentMessage({ helper: 'navigation-analyst', action: 'detect-story-with-home-screen' }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.CandidateRanking, role: AgentMessageRole.Analytical })
  })

  test('keeps ordinary conversation as plain text', () => {
    expect(classifyAgentMessage({ agent: 'client', action: 'prompt', text: 'Please add a dashboard.' }))
      .toEqual({ category: AgentMessageCategory.Plain, role: AgentMessageRole.Technical })
  })

  test('hides source-extractor range selections from the user-facing journal', () => {
    expect(isAgentMessageHidden({ action: 'source-extract', value: [{
      name: 'select_ranges', args: { ranges: [{ start: 12, end: 18 }] },
    }] })).toBe(true)
    expect(isAgentMessageHidden({ action: 'declaration-lookup' })).toBe(false)
  })
})
