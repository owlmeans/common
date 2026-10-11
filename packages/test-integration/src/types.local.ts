/**
 * A connection-string variable whose server must answer a TCP connect for the gate to open.
 *
 * Only for a service a developer reaches through a local address that can go away — a
 * port-forward, a container. A populated variable pointing at nothing then closes the gate with
 * a printed reason instead of failing every suite behind it on a refused connection.
 */
export interface Reachable<E> {
  key: keyof E & string
  defaultPort: number
}
