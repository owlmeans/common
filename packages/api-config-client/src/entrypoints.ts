
import { advertise } from '@owlmeans/api-config'
import { bind } from '@owlmeans/client-entrypoint'

/** The browser-local binding of the shared runtime-config protocol. */
export const bindings = [bind(advertise)]
