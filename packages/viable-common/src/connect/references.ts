import { entrypointRef } from '@owlmeans/entrypoint'
import type { RegisteredEntrypoint, RequestShape } from '@owlmeans/entrypoint'
import type { EntrypointReference } from '@owlmeans/context'
import { connect } from './consts.js'
import type { ConnectOp, ConnectOpResult } from './ops.js'
import type { ConverterProjectLlmBody } from '../convert/index.js'
import type {
  ConnectAttachBody, ConnectCapabilitiesView, ConnectConfirmBody, ConnectCreateBody,
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectInquiryAnswerBody,
  ConnectModifyBody, ConnectOpSubmission, ConnectPipelineParams, ConnectPipelineResumeBody,
  ConnectPipelineState, ConnectProjectLlmBody, ConnectProjectSettings, ConnectProjectStatus,
  ConnectProjectSummary, ConnectPullQuery, ConnectSessionOpen, ConnectSessionParams,
  ConnectSessionView, ConnectStoryStatus, ConversionStatusView, ConvertCheck,
} from './types.js'

type ConnectReference<Request extends RequestShape, Response> =
  EntrypointReference<RegisteredEntrypoint<Request, Response>>

export interface ConnectReferences {
  capabilities: ConnectReference<{}, ConnectCapabilitiesView>
  session: {
    open: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    openDelegated: ConnectReference<{ body: ConnectSessionOpen }, ConnectSessionView>
    get: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
    heartbeat: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
    close: ConnectReference<{ params: ConnectSessionParams }, ConnectSessionView>
  }
  op: {
    pull: ConnectReference<{ params: ConnectSessionParams, query: ConnectPullQuery }, ConnectOp[]>
    submit: ConnectReference<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>
  }
  project: {
    create: ConnectReference<{ body: ConnectCreateBody }, ConnectProjectStatus>
    confirm: ConnectReference<{ params: { id: string }, body: ConnectConfirmBody }, ConnectProjectStatus>
    list: ConnectReference<{}, ConnectProjectSummary[]>
    status: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    attach: ConnectReference<{ body: ConnectAttachBody }, ConnectProjectStatus>
    reinit: ConnectReference<{ params: { id: string } }, ConnectProjectStatus>
    modify: ConnectReference<{ params: { id: string }, body: ConnectModifyBody }, ConnectProjectStatus>
    settings: ConnectReference<{ params: { id: string } }, ConnectProjectSettings>
    llm: ConnectReference<{ params: { id: string }, body: ConnectProjectLlmBody }, ConnectProjectSettings>
    converterLlm: ConnectReference<{
      params: { id: string }, body: ConverterProjectLlmBody
    }, ConnectProjectSettings>
  }
  story: {
    status: ConnectReference<{ params: { id: string, storyId: string } }, ConnectStoryStatus>
  }
  files: {
    list: ConnectReference<{ params: { id: string } }, string[]>
  }
  convert: {
    create: ConnectReference<{ body: ConnectConvertCreateBody }, ConversionStatusView>
    check: ConnectReference<{ params: { id: string } }, ConvertCheck>
    start: ConnectReference<{ params: { id: string } }, ConversionStatusView>
    proceed: ConnectReference<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConversionStatusView>
    cancel: ConnectReference<{ params: { id: string } }, ConversionStatusView>
    status: ConnectReference<{ params: { id: string } }, ConversionStatusView>
    purge: ConnectReference<{ params: { id: string } }, ConversionStatusView>
  }
  inquiry: {
    answer: ConnectReference<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>
  }
  pipeline: {
    state: ConnectReference<{ params: ConnectPipelineParams }, ConnectPipelineState>
    resume: ConnectReference<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectPipelineState>
  }
}

/**
 * Typed references for adapter packages that address the connector dynamically.  Applications
 * export protocol objects instead; an adapter may use this compact form because it never exposes
 * aliases to UI or domain code.
 */
export const connectRef: ConnectReferences = {
  capabilities: entrypointRef<{}, ConnectCapabilitiesView>(connect.capabilities),
  session: {
    open: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.open),
    openDelegated: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.openDelegated),
    get: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.get),
    heartbeat: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.heartbeat),
    close: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.close),
  },
  op: {
    pull: entrypointRef<{ params: ConnectSessionParams, query: ConnectPullQuery }, ConnectOp[]>(connect.op.pull),
    submit: entrypointRef<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>(connect.op.submit),
  },
  project: {
    create: entrypointRef<{ body: ConnectCreateBody }, ConnectProjectStatus>(connect.project.create),
    confirm: entrypointRef<{ params: { id: string }, body: ConnectConfirmBody }, ConnectProjectStatus>(connect.project.confirm),
    list: entrypointRef<{}, ConnectProjectSummary[]>(connect.project.list),
    status: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.status),
    attach: entrypointRef<{ body: ConnectAttachBody }, ConnectProjectStatus>(connect.project.attach),
    reinit: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.reinit),
    modify: entrypointRef<{ params: { id: string }, body: ConnectModifyBody }, ConnectProjectStatus>(connect.project.modify),
    settings: entrypointRef<{ params: { id: string } }, ConnectProjectSettings>(connect.project.settings),
    llm: entrypointRef<{
      params: { id: string }, body: ConnectProjectLlmBody
    }, ConnectProjectSettings>(connect.project.llm),
    converterLlm: entrypointRef<{
      params: { id: string }, body: ConverterProjectLlmBody
    }, ConnectProjectSettings>(connect.project.converterLlm),
  },
  story: {
    status: entrypointRef<{
      params: { id: string, storyId: string }
    }, ConnectStoryStatus>(connect.story.status),
  },
  convert: {
    create: entrypointRef<{ body: ConnectConvertCreateBody }, ConversionStatusView>(connect.convert.create),
    check: entrypointRef<{ params: { id: string } }, ConvertCheck>(connect.convert.check),
    start: entrypointRef<{ params: { id: string } }, ConversionStatusView>(connect.convert.start),
    proceed: entrypointRef<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConversionStatusView>(connect.convert.proceed),
    cancel: entrypointRef<{ params: { id: string } }, ConversionStatusView>(connect.convert.cancel),
    status: entrypointRef<{
      params: { id: string }
    }, ConversionStatusView>(connect.convert.status),
    purge: entrypointRef<{ params: { id: string } }, ConversionStatusView>(connect.convert.purge),
  },
  inquiry: {
    answer: entrypointRef<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>(connect.inquiry.answer),
  },
  files: {
    list: entrypointRef<{ params: { id: string } }, string[]>(connect.files.list),
  },
  pipeline: {
    state: entrypointRef<{ params: ConnectPipelineParams }, ConnectPipelineState>(connect.pipeline.state),
    resume: entrypointRef<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectPipelineState>(connect.pipeline.resume),
  },
}
