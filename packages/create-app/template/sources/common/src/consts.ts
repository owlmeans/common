/** Service aliases shared between web and api. */
export const APP = '__APP_SLUG__'
export const APP_WEB = '__APP_SLUG__-web'
export const APP_API = '__APP_SLUG__-api'

/** Local development ports. */
export const WEB_PORT = 3001
export const API_PORT = 3000

/** Backend (API) entrypoint identifiers. */
export const session = {
  base: '__APP_SLUG__:api:session',
  list: '__APP_SLUG__:api:session:list',
  add: '__APP_SLUG__:api:session:add',
  remove: '__APP_SLUG__:api:session:remove',
}

/** Frontend (web) entrypoint identifiers. */
export const web = {
  session: '__APP_SLUG__:web:session',
}
