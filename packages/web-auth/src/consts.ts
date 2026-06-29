import { AuthenticationType } from '@owlmeans/auth'

/**
 * Front-end path that renders the supervisor login form. It reuses the standard
 * typed authentication route (`/authentication/login/:type`, alias
 * `CAUTHEN_AUTHEN_TYPED`) with the supervisor type, so no extra route
 * registration is required - registering the client plugin is enough.
 */
export const SUPERVISOR_LOGIN_PATH = `/authentication/login/${AuthenticationType.Supervisor}`
