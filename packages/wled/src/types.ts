
export interface CompanyInfo {
  resource?: string
  entityId: string
  fullName: string
  shortName: string
  slug: string
  description: string
}

export interface CustomStyles {
  resource?: string
  entityId: string
  font: CustomFont
  colors: CustomColors
}

export interface CustomColors {
  primaryColor: string
  secondaryColor?: string
  alertColor?: string
  successColor?: string
  primaryBackground?: string
  secondaryBackground?: string
  alertBackground?: string
  successBackground?: string
}

export interface CustomFont {
  fontFamily: string
  basicSize?: number
}

export interface CustomMedia {
  brand: CustomBrand
}

export interface CustomBrand {
  squareLogo?: string
  wideLogo?: string
}

export interface ProvideParams {
  entity: string
}

  export interface CustomUrls {
  adminUrl: string
  userUrl: string
}

export type ProvidedWL<T extends {} = {}> = T & {
  type: string
  exists: boolean | null
}
