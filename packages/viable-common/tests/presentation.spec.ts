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
      value: [{ name: 'answer', args: { files: ['src/app.tsx'], why: 'screen entrypoint' } }],
    })).toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.ArtifactSelection })
    expect(classifyAgentMessage({ value: { actor: 'human', worker: false, jobs: [], agents: [], kv: false } }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.RuntimeDecision })
    expect(classifyAgentMessage({ value: { unknown: ['still', 'readable'] } }))
      .toMatchObject({ category: AgentMessageCategory.Structured, structure: AgentStructuredKind.GenericRecord })
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
