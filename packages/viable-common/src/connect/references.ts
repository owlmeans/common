import { entrypointRef } from '@owlmeans/entrypoint'
import { connect } from './consts.js'
import type { ConnectOp, ConnectOpResult } from './ops.js'
import type { ConverterProjectLlmBody } from '../convert/index.js'
import type {
  ConnectAttachBody, ConnectCapabilitiesView, ConnectConfirmBody, ConnectCreateBody, ConnectJob,
  ConnectConvertCreateBody, ConnectConvertProceedBody, ConnectInquiryAnswerBody, ConnectJobParams,
  ConnectModifyBody, ConnectOpSubmission, ConnectPipelineParams, ConnectPipelineResumeBody,
  ConnectPipelineState, ConnectProjectLlmBody, ConnectProjectSettings, ConnectProjectStatus,
  ConnectProjectSummary, ConnectSessionOpen, ConnectSessionParams, ConnectSessionView,
  ConnectStoryBody, ConnectStoryDeletion, ConnectStoryItem, ConnectStoryList, ConnectStoryMutation,
  ConnectStoryQuery, ConnectWaitQuery, ConversionStatusView, ConvertCheck,
} from './types.js'

/**
 * Typed references for adapter packages that address the connector dynamically.  Applications
 * export protocol objects instead; an adapter may use this compact form because it never exposes
 * aliases to UI or domain code.
 */
export const connectRef = {
  capabilities: entrypointRef<{}, ConnectCapabilitiesView>(connect.capabilities),
  session: {
    open: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.open),
    openDelegated: entrypointRef<{ body: ConnectSessionOpen }, ConnectSessionView>(connect.session.openDelegated),
    get: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.get),
    heartbeat: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.heartbeat),
    close: entrypointRef<{ params: ConnectSessionParams }, ConnectSessionView>(connect.session.close),
  },
  op: {
    pull: entrypointRef<{ params: ConnectSessionParams, query: ConnectWaitQuery }, ConnectOp[]>(connect.op.pull),
    submit: entrypointRef<{
      params: { sessionId: string, opId: string }, body: ConnectOpResult
    }, ConnectOpSubmission>(connect.op.submit),
  },
  project: {
    create: entrypointRef<{ body: ConnectCreateBody }, ConnectJob>(connect.project.create),
    confirm: entrypointRef<{ params: { id: string }, body: ConnectConfirmBody }, ConnectJob>(connect.project.confirm),
    list: entrypointRef<{}, ConnectProjectSummary[]>(connect.project.list),
    status: entrypointRef<{ params: { id: string } }, ConnectProjectStatus>(connect.project.status),
    attach: entrypointRef<{ body: ConnectAttachBody }, ConnectProjectStatus>(connect.project.attach),
    reinit: entrypointRef<{ params: { id: string } }, ConnectJob>(connect.project.reinit),
    modify: entrypointRef<{ params: { id: string }, body: ConnectModifyBody }, ConnectJob>(connect.project.modify),
    settings: entrypointRef<{ params: { id: string } }, ConnectProjectSettings>(connect.project.settings),
    llm: entrypointRef<{
      params: { id: string }, body: ConnectProjectLlmBody
    }, ConnectProjectSettings>(connect.project.llm),
    converterLlm: entrypointRef<{
      params: { id: string }, body: ConverterProjectLlmBody
    }, ConnectProjectSettings>(connect.project.converterLlm),
    job: entrypointRef<{ params: ConnectJobParams, query: ConnectWaitQuery }, ConnectJob>(connect.project.job),
  },
  convert: {
    create: entrypointRef<{ body: ConnectConvertCreateBody }, ConnectJob>(connect.convert.create),
    check: entrypointRef<{ params: { id: string } }, ConvertCheck>(connect.convert.check),
    start: entrypointRef<{ params: { id: string } }, ConnectJob>(connect.convert.start),
    proceed: entrypointRef<{
      params: { id: string }, body: ConnectConvertProceedBody
    }, ConnectJob>(connect.convert.proceed),
    cancel: entrypointRef<{ params: { id: string } }, ConnectJob>(connect.convert.cancel),
    status: entrypointRef<{
      params: { id: string }
    }, ConversionStatusView>(connect.convert.status),
    purge: entrypointRef<{ params: { id: string } }, ConnectJob>(connect.convert.purge),
  },
  inquiry: {
    answer: entrypointRef<{
      params: { id: string, inquiryId: string }, body: ConnectInquiryAnswerBody
    }, unknown>(connect.inquiry.answer),
  },
  story: {
    list: entrypointRef<{ params: { id: string }, query: ConnectStoryQuery }, ConnectStoryList>(connect.story.list),
    get: entrypointRef<{ params: { id: string, storyId: string } }, ConnectStoryItem>(connect.story.get),
    create: entrypointRef<{ params: { id: string }, body: ConnectStoryBody }, ConnectStoryMutation>(connect.story.create),
    update: entrypointRef<{
      params: { id: string, storyId: string }, body: ConnectStoryBody
    }, ConnectStoryMutation>(connect.story.update),
    delete: entrypointRef<{ params: { id: string, storyId: string } }, ConnectStoryDeletion>(connect.story.delete),
    develop: entrypointRef<{ params: { id: string, storyId: string } }, ConnectJob>(connect.story.develop),
  },
  pipeline: {
    state: entrypointRef<{ params: ConnectPipelineParams }, ConnectPipelineState>(connect.pipeline.state),
    resume: entrypointRef<{
      params: ConnectPipelineParams, body: ConnectPipelineResumeBody
    }, ConnectJob>(connect.pipeline.resume),
  },
}
