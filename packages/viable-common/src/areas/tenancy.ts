import type { Blueprint } from '../blueprint/types.js'
import { ProjectArea, NO_TENANCY } from './consts.js'
import type { ProjectTenancy } from './types.js'
import type { TenancyHelper } from './tenancy/types.js'

export const createTenancyHelper = (): TenancyHelper => {
  const tenancyOf = (blueprint?: Pick<Blueprint, 'experience'> | null): ProjectTenancy => {
    const tenancy = blueprint?.experience?.tenancy
    const operators = tenancy?.operators === true
    const users = tenancy?.users === true

    return operators || users ? Object.freeze({ operators, users }) : NO_TENANCY
  }

  const tenantedArea = (area: ProjectArea, tenancy: ProjectTenancy): boolean => {
    switch (area) {
      case ProjectArea.User: return tenancy.users === true
      case ProjectArea.Operator: return tenancy.operators === true
      default: return false
    }
  }

  return { tenancyOf, tenantedArea }
}

export const tenancyHelper = createTenancyHelper()

/** @deprecated compat:factory-refactor — use `tenancyHelper.tenancyOf(…)` */
export const tenancyOf = (blueprint?: Pick<Blueprint, 'experience'> | null): ProjectTenancy =>
  tenancyHelper.tenancyOf(blueprint)

/** @deprecated compat:factory-refactor — use `tenancyHelper.tenantedArea(…)` */
export const tenantedArea = (area: ProjectArea, tenancy: ProjectTenancy): boolean =>
  tenancyHelper.tenantedArea(area, tenancy)
