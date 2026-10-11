import type { Blueprint } from '../../blueprint/types.js'
import type { ProjectArea } from '../consts.js'
import type { ProjectTenancy } from '../types.js'

/** Which of a product's audiences act inside a tenant organization. */
export interface TenancyHelper {
  /**
   * The tenancy of a resolved blueprint.
   *
   * Total, like `landingGatePreferenceOf`: an absent layer, an absent key and a value this deploy
   * cannot read all answer {@link NO_TENANCY}. Only a literal `true` turns a flag on, because a flag
   * read as on by mistake splits a product's people into organizations nobody asked for, while one
   * read as off leaves the application exactly as it was before tenancy existed.
   */
  tenancyOf: (blueprint?: Pick<Blueprint, 'experience'> | null) => ProjectTenancy
  /**
   * Whether an AREA's people act inside a tenant organization.
   *
   * Guest has no organization to act in, and admin is the project owner, who stands above every
   * tenant rather than inside one — so both are never tenanted, whatever the flags say.
   */
  tenantedArea: (area: ProjectArea, tenancy: ProjectTenancy) => boolean
}
