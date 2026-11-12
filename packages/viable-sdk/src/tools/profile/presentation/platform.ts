import type { ToolPresentation } from '../types.js'
import { accountPresentHelper as account } from './platform/account.js'
import { appsPresentHelper as apps } from './platform/apps.js'
import {
  APPS_OUTPUT, APP_GRANT_OUTPUT, APP_GRANTS_OUTPUT, APP_GROUP_OUTPUT, APP_GROUPS_OUTPUT, APP_ORGANIZATION_OUTPUT,
  APP_ORGANIZATIONS_OUTPUT, APP_PERMISSION_OUTPUT, APP_PERMISSIONS_OUTPUT, APP_USER_OUTPUT, APP_USERS_OUTPUT,
  BACKFILL_OUTPUT, CONFIGURATION_OUTPUT, CUSTOM_DOMAIN_OUTPUT, FILE_READ_OUTPUT, FILE_WRITTEN_OUTPUT, FILES_OUTPUT,
  GIT_COMMIT_OUTPUT, GIT_DISCARD_OUTPUT, GIT_HISTORY_OUTPUT, GIT_REVERT_OUTPUT, GIT_STATUS_OUTPUT,
  GITHUB_AUTHORIZE_OUTPUT, GITHUB_CONNECTION_OUTPUT, GITHUB_DISCONNECTED_OUTPUT, GITHUB_LINKED_OUTPUT,
  GITHUB_REPOSITORIES_OUTPUT, GITHUB_SYNC_OUTPUT, INTENT_OUTPUT, MATERIAL_TEXT_OUTPUT, MATERIALS_OUTPUT,
  ORGANIZATION_BRANDING_OUTPUT, PREVIEW_OUTPUT, PROJECT_WITH_FILES_OUTPUT,
  PRIVACY_OUTPUT, PRODUCTION_AUTH_OUTPUT, PRODUCTION_OUTPUT, REDIRECTS_OUTPUT, SETTINGS_OUTPUT, TOKEN_REVOKED_OUTPUT,
  TOKENS_OUTPUT, WITHDRAW_OUTPUT,
} from './platform/consts.js'
import { gitPresentHelper as git } from './platform/git.js'
import { iamPresentHelper as iam } from './platform/iam.js'
import { materialsPresentHelper as materials } from './platform/materials.js'
import { productionPresentHelper as production } from './platform/production.js'
import { settingsPresentHelper as settings } from './platform/settings.js'
import { workspacePresentHelper as workspace } from './platform/workspace.js'

/**
 * The declared structured output and its presenter for every PLATFORM-domain tool of the listing
 * profiles — settings, configuration, branding, the account, a new project's files, files and the preview, a project's
 * applications, git and GitHub,
 * production and the generated application's sign-in.
 *
 * Keyed by the BASE tool name: a split variant (`attach_custom_domain`, `invite_app_user`, …)
 * inherits its base's entry, so each presenter here accepts the result of every action of its tool.
 */
export const platformPresentation: Readonly<Record<string, ToolPresentation>> = Object.freeze({
  project_settings: { output: SETTINGS_OUTPUT, present: settings.settings },
  update_project_settings: { output: SETTINGS_OUTPUT, present: settings.settings },
  set_platform_credit: { output: SETTINGS_OUTPUT, present: settings.settings },
  project_configuration: { output: CONFIGURATION_OUTPUT, present: settings.configuration },
  update_project_configuration: { output: CONFIGURATION_OUTPUT, present: settings.configuration },
  recollect_configuration: { output: CONFIGURATION_OUTPUT, present: settings.configuration },
  organization_branding: { output: ORGANIZATION_BRANDING_OUTPUT, present: settings.organization },
  update_organization_branding: { output: ORGANIZATION_BRANDING_OUTPUT, present: settings.organization },
  backfill_project_branding: { output: BACKFILL_OUTPUT, present: settings.backfill },

  list_access_tokens: { output: TOKENS_OUTPUT, present: account.tokens },
  revoke_access_token: { output: TOKEN_REVOKED_OUTPUT, present: account.revokedToken },
  privacy_choices: { output: PRIVACY_OUTPUT, present: account.privacy },
  withdraw_marketing_consent: { output: WITHDRAW_OUTPUT, present: account.withdrawn },
  pickup_intent: { output: INTENT_OUTPUT, present: account.intent },

  create_project_with_files: { output: PROJECT_WITH_FILES_OUTPUT, present: materials.created },
  list_materials: { output: MATERIALS_OUTPUT, present: materials.catalogue },
  read_material: { output: MATERIAL_TEXT_OUTPUT, present: materials.text },

  list_files: { output: FILES_OUTPUT, present: workspace.files },
  read_file: { output: FILE_READ_OUTPUT, present: workspace.file },
  write_file: { output: FILE_WRITTEN_OUTPUT, present: workspace.written },
  delete_file: { output: FILE_WRITTEN_OUTPUT, present: workspace.written },
  preview_control: { output: PREVIEW_OUTPUT, present: workspace.preview },
  project_apps: { output: APPS_OUTPUT, present: apps.apps },
  restart_project_app: { output: APPS_OUTPUT, present: apps.apps },

  git_status: { output: GIT_STATUS_OUTPUT, present: git.status },
  git_history: { output: GIT_HISTORY_OUTPUT, present: git.history },
  git_commit: { output: GIT_COMMIT_OUTPUT, present: git.commit },
  git_discard: { output: GIT_DISCARD_OUTPUT, present: git.discard },
  git_revert: { output: GIT_REVERT_OUTPUT, present: git.revert },
  connect_github: { output: GITHUB_AUTHORIZE_OUTPUT, present: git.authorize },
  publish_to_github: { output: GITHUB_CONNECTION_OUTPUT, present: git.published },
  github_sync: { output: GITHUB_SYNC_OUTPUT, present: git.sync },
  disconnect_github: { output: GITHUB_DISCONNECTED_OUTPUT, present: git.disconnected },
  github_repositories: { output: GITHUB_REPOSITORIES_OUTPUT, present: git.repositories },
  link_github_origin: { output: GITHUB_LINKED_OUTPUT, present: git.linked },

  production_status: { output: PRODUCTION_OUTPUT, present: production.status },
  publish_production: { output: PRODUCTION_OUTPUT, present: production.status },
  production_control: { output: PRODUCTION_OUTPUT, present: production.status },
  custom_domain: { output: CUSTOM_DOMAIN_OUTPUT, present: production.domain },
  production_auth: { output: PRODUCTION_AUTH_OUTPUT, present: production.auth },
  set_production_redirects: { output: REDIRECTS_OUTPUT, present: production.redirects },

  app_users: { output: APP_USERS_OUTPUT, present: iam.users },
  manage_app_user: { output: APP_USER_OUTPUT, present: iam.user },
  app_permissions: { output: APP_PERMISSIONS_OUTPUT, present: iam.permissions },
  set_app_permission_default: { output: APP_PERMISSION_OUTPUT, present: iam.permission },
  app_grants: { output: APP_GRANTS_OUTPUT, present: iam.grants },
  manage_app_grant: { output: APP_GRANT_OUTPUT, present: iam.grant },
  app_organizations: { output: APP_ORGANIZATIONS_OUTPUT, present: iam.organizations },
  manage_app_organization: { output: APP_ORGANIZATION_OUTPUT, present: iam.organization },
  app_groups: { output: APP_GROUPS_OUTPUT, present: iam.groups },
  manage_app_group: { output: APP_GROUP_OUTPUT, present: iam.group },
})
