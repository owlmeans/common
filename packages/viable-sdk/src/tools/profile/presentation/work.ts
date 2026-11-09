import type { ToolPresentation } from '../types.js'
import { workPresenters } from './work/presenters.js'
import {
  ActivityOutput, BlueprintsOutput, ConversionOutput, ConvertCheckOutput, FileChangesOutput, IntentOutput, KitApplyOutput,
  KitsOutput, LocalStatusOutput, NotificationsOutput, PipelineOutput, ProjectDeletedOutput, ProjectListOutput,
  ProjectStatusOutput, QuestionOutput, RunLocalOutput, SetupReportOutput, SlotListOutput, SteerOutput, StopOutput,
  StoryBatchCancelOutput, StoryBatchOutput, StoryCardOutput, StoryPageOutput, StoryStatusOutput,
} from './work/schemas.js'
import type { WorkPresentation } from './work/types.js'

/**
 * The declared structured output of every work-domain tool that answers one, and the presenter that
 * turns its base result into that shape.
 *
 * A tool absent here answers text alone under a listing profile — `describe_platform`,
 * `session_status`, `delete_story`, `answer_question` and `stop_local` never carry a structured
 * part. Titles, descriptions and annotations are the profile's, not this table's.
 */
export const createWorkPresentation = (): WorkPresentation => {
  const p = workPresenters

  const projectStatus: ToolPresentation = { output: ProjectStatusOutput, present: p.projectStatus }
  const storyStatus: ToolPresentation = { output: StoryStatusOutput, present: p.storyStatus }
  const storyCard: ToolPresentation = { output: StoryCardOutput, present: p.storyCard }
  const storyBatch: ToolPresentation = { output: StoryBatchOutput, present: p.storyBatch }
  const pipeline: ToolPresentation = { output: PipelineOutput, present: p.pipeline }
  const conversion: ToolPresentation = { output: ConversionOutput, present: p.conversion }
  const setupReport: ToolPresentation = { output: SetupReportOutput, present: p.setupReport }

  return Object.freeze({
    describe_blueprints: { output: BlueprintsOutput, present: p.blueprints },

    create_project: projectStatus,
    confirm_project: projectStatus,
    project_status: projectStatus,
    attach_project: projectStatus,
    reinitialize_project: projectStatus,
    modify_project: projectStatus,
    rename_project: projectStatus,
    list_projects: { output: ProjectListOutput, present: p.projectList },
    delete_project: { output: ProjectDeletedOutput, present: p.projectDeleted },

    describe_planning_kits: { output: KitsOutput, present: p.kits },
    apply_planning_kit: { output: KitApplyOutput, present: p.kitApply },

    list_stories: { output: StoryPageOutput, present: p.storyPage },
    search_stories: { output: StoryPageOutput, present: p.storySearch },
    create_story: storyCard,
    update_story: storyCard,
    develop_story: storyStatus,
    reset_story: storyStatus,
    complete_story: storyStatus,
    story_status: storyStatus,

    start_story_batch: storyBatch,
    story_batch_status: storyBatch,
    cancel_story_batch: { output: StoryBatchCancelOutput, present: p.storyBatch },
    steer_agent: { output: SteerOutput, present: p.steer },
    stop_agent: { output: StopOutput, present: p.stop },

    pipeline_status: pipeline,
    resume_pipeline: pipeline,

    check_convertible: { output: ConvertCheckOutput, present: p.convertCheck },
    convert_project: conversion,
    proceed_conversion: conversion,
    conversion_status: conversion,
    purge_origin: conversion,

    next_question: { output: QuestionOutput, present: p.question },

    project_activity: { output: ActivityOutput, present: p.activity },
    notifications: { output: NotificationsOutput, present: p.notifications },
    file_changes: { output: FileChangesOutput, present: p.fileChanges },

    pickup_intent: { output: IntentOutput, present: p.intent },

    local_status: { output: LocalStatusOutput, present: p.localStatus },
    run_local: { output: RunLocalOutput, present: p.runLocal },
    local_setup_guide: setupReport,
    set_local_service: setupReport,

    list_slots: { output: SlotListOutput, present: p.slots },
  })
}

export const workPresentation: Readonly<Record<string, ToolPresentation>> = createWorkPresentation()
