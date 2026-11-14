import { ResilientError } from '@owlmeans/error'

export class WebResearchError extends ResilientError {
  public static override typeName = `WebResearch${ResilientError.typeName}`

  constructor(message: string = 'error') {
    super(WebResearchError.typeName, `web-research:${message}`)
  }
}

/** A pipeline was asked for something its wiring or input cannot give: no inspector, no URL, a bad skill name. */
export class ResearchConfigError extends WebResearchError {
  public static override typeName = `Config${WebResearchError.typeName}`

  constructor(message: string = 'error') {
    super(`config:${message}`)
    this.type = ResearchConfigError.typeName
  }
}

/** A store refused a path (absolute, `..`, NUL) or could not be written. */
export class ResearchStoreError extends WebResearchError {
  public static override typeName = `Store${WebResearchError.typeName}`

  constructor(message: string = 'error') {
    super(`store:${message}`)
    this.type = ResearchStoreError.typeName
  }
}

/** A model's structured answer did not match the schema it was asked for. */
export class ResearchModelError extends WebResearchError {
  public static override typeName = `Model${WebResearchError.typeName}`

  constructor(message: string = 'error') {
    super(`model:${message}`)
    this.type = ResearchModelError.typeName
  }
}

/** A written skill failed its validation again after the one repair round. */
export class ResearchSkillError extends WebResearchError {
  public static override typeName = `Skill${WebResearchError.typeName}`

  /** What the validator found, one line each. */
  public errors: string[] = []

  constructor(message: string = 'error') {
    super(`skill:${message}`)
    this.type = ResearchSkillError.typeName
  }
}
