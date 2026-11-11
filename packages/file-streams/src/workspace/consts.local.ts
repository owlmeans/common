/** The private temporary file a file sink writes before it commits (`.<name>.<12 hex>.tmp`). */
export const IN_FLIGHT_FILE = /^\..+\.[0-9a-f]{12}\.tmp$/
