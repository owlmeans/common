/** How long a service probe waits before calling a port unreachable. */
export const PROBE_TIMEOUT_MS = 1_500

export const DEFAULT_PORTS: Record<string, number> = { postgres: 5432, postgresql: 5432, redis: 6379, rediss: 6379, valkey: 6379 }
