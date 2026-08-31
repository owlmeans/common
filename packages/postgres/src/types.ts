import type { PostgresDbService } from '@owlmeans/postgres-resource'

export interface PostgresService extends PostgresDbService {
  /**
   * Provision a least privileged role, its database and its schema, using a superuser
   * connection held under a *separate* config alias.
   *
   * Idempotent by design — every OwlMeans deployment calls it on each start and each
   * rebuild, so it probes before it creates and never fails on "already exists".
   *
   * @throws {PostgresBootstrapError}
   */
  bootstrap: (configAlias: string, opts: BootstrapOptions) => Promise<BootstrapReport>
}

export interface BootstrapOptions {
  /** Login role to create, or whose password to rotate. */
  role: string
  password: string
  /** Database to create, owned by `role`. Defaults to the role name. */
  database?: string
  /** Schema to create inside it, owned by `role` and set as its `search_path`. */
  schema?: string
  /**
   * Revoke `PUBLIC`'s rights on the database and on `public`, granting them to `role`
   * alone. Defaults to `true` — the point of the admin path is least privilege.
   */
  leastPrivilege?: boolean
  /**
   * Reset the password of a role that already exists. Defaults to `true`, because the
   * caller generated the password it just passed in and the role has to accept it.
   */
  rotatePassword?: boolean
}

export interface BootstrapReport {
  roleCreated: boolean
  passwordRotated: boolean
  databaseCreated: boolean
  schemaCreated: boolean
  grantsApplied: boolean
}
