/** Ownership of atomic replay protection for a verified authentication challenge. */
export enum AuthChallengeReplayPolicy {
  /** Default: the auth manager consumes the challenge before plugin authentication. */
  Manager = 'manager',
  /** The plugin owns bounded attempts and atomic success consumption. */
  Plugin = 'plugin',
}
