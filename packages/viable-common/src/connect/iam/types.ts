/**
 * The connector's twins of the owner console's IAM (`connect.iam`): the same bodies, answers and
 * refusals as the browser's `back.iam` routes (`../../iam-console/types.ts`), addressed under the
 * connector's project path (`/project/:id/iam/…`) — so the project travels as `id`, like every other
 * connector route. A read takes `scope` in its query, a write in its body.
 */

/** One subject of the project's client, by its pairwise `profileId`. */
export interface ConnectIamUserParams {
  id: string
  profileId: string
}

/** One organization the project's client has members in, by its slug. */
export interface ConnectIamOrganizationParams {
  id: string
  entitySlug: string
}

/** One member of an organization, as the project's client sees them. */
export interface ConnectIamMemberParams extends ConnectIamOrganizationParams {
  profileId: string
}

/** One group of (organization, the project's client), by its key. */
export interface ConnectIamGroupParams extends ConnectIamOrganizationParams {
  group: string
}
