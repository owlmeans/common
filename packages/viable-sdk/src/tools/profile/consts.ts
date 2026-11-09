/**
 * The tools no listing profile offers: the self-description a listing replaces with its own pages,
 * the agent-setup pair (it writes files on a machine a listing does not have), and the inference
 * switch — a listing's connection never performs the platform's model calls, so `next_task` and
 * `submit_task_result` never appear either (its llm is pinned to the cloud).
 */
export const LISTING_HIDDEN: readonly string[] = Object.freeze([
  'describe_capabilities', 'describe_harness', 'install_harness', 'set_inference_mode', 'inference_settings',
])
