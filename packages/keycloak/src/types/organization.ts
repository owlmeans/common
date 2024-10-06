
export interface OrgListItem {

}

export interface NewOrganization {
  attributes: {}
  description: string
  domains: OrganizationDomain[]
  name: string
}

export interface OrganizationDomain {
  name: string
  verified: boolean
}

export interface Organization extends NewOrganization {
  enabled: boolean
  id: string
}

export interface OrgCreationResult {
  location: string
}
