
import { ResourceError } from '@owlmeans/resource'

/**
 * The resource was asked for something its {@link StateConfig} does not allow. Both cases are
 * wiring mistakes rather than missing data, so they throw instead of answering with nothing.
 */
export class StateConfigError extends ResourceError {
  public static override typeName = `${ResourceError.typeName}StateConfig`

  /**
   * A record was addressed without an id on a resource that holds many of them. Only a `single`
   * resource has a record that needs no naming.
   */
  public static readonly NonSingle: string = 'non-single'

  /** A write carried no value for the resource's id field, and nothing here mints one. */
  public static readonly NoId: string = 'no-id'

  constructor(msg: string) {
    super(`state-config:${msg}`)
    this.type = StateConfigError.typeName
  }
}

ResourceError.registerErrorClass(StateConfigError)
