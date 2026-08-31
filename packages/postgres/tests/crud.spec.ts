import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { makePostgresResource } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import { RecordExists, UnknownRecordError } from '@owlmeans/resource'
import type { ResourceRecord } from '@owlmeans/resource'

import { gate, makeSuite, shapeOf } from './context.js'
import type { PostgresService } from '@owlmeans/postgres'

interface User extends ResourceRecord {
  id?: string
  email: string
  status?: string
  age?: number
  tags?: string[]
  profile?: Record<string, unknown>
  createdAt?: Date
}

interface Post extends ResourceRecord {
  id?: string
  ownerId: string
  title: string
}

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', pg: { type: 'varchar', length: 320, unique: true } },
    status: { type: 'string', enum: ['active', 'banned'], nullable: true, default: 'active' },
    age: { type: 'integer', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    profile: { type: 'object', nullable: true },
    createdAt: { type: 'object', format: 'date-time', nullable: true, pg: { defaultRaw: 'now()' } }
  },
  required: ['id', 'email'],
  pg: { indexes: [{ name: 'idx_crud_users_status', columns: ['status'] }] }
} as never

const postSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    ownerId: { type: 'string', format: 'uuid', pg: { references: { resource: 'crud-users', onDelete: 'cascade' } } },
    title: { type: 'string' }
  },
  required: ['id', 'ownerId', 'title']
} as never

const suite = makeSuite('crud')
const it = gate.skip ? test.skip : test

describe('@owlmeans/postgres — resource CRUD against a real context', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let pg: PostgresService
  let users: PostgresResource<User>
  let posts: PostgresResource<Post>
  let seeded: User

  beforeAll(async () => {
    const user = makePostgresResource<User, PostgresResource<User>>('crud-users')
    user.schema = userSchema
    const post = makePostgresResource<Post, PostgresResource<Post>>('crud-posts')
    post.schema = postSchema

    /** Posts first: registration order is not dependency order, and must not have to be. */
    const booted = await suite.boot({ resources: [post, user] })
    pg = booted.pg
    users = booted.context.resource<PostgresResource<User>>('crud-users')
    posts = booted.context.resource<PostgresResource<Post>>('crud-posts')

    seeded = await users.create({ email: 'a@b.c', age: 21, tags: ['x', 'y'], profile: { city: 'Kyiv' } })
    await posts.create({ ownerId: seeded.id as string, title: 'hello' })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('creates the table the AJV schema describes', async () => {
    expect(users.table.qualified).toBe(`"${suite.schema}"."crud_users"`)

    expect(await shapeOf(pg, suite.schema, 'crud_users')).toEqual({
      id: 'uuid NOT NULL',
      email: 'character varying(320) NOT NULL',
      status: 'text',
      age: 'integer',
      tags: 'text[]',
      profile: 'jsonb',
      createdAt: 'timestamp with time zone'
    })
  })

  it('creates the constraints and indexes the schema implies', async () => {
    const constraints = await pg.query<{ conname: string, def: string }>(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass`,
      [`"${suite.schema}".crud_users`]
    )
    const definitions = constraints.map(row => row.def)

    expect(definitions).toContain('PRIMARY KEY (id)')
    expect(definitions).toContain('UNIQUE (email)')
    /** A string enum becomes a CHECK — a native enum can't drop values or be altered in a transaction. */
    expect(definitions.some(def => def.includes('CHECK') && def.includes("'banned'"))).toBe(true)

    const indexes = await pg.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
      [suite.schema, 'crud_users']
    )
    expect(indexes.map(row => row.indexname)).toContain('idx_crud_users_status')
  })

  /**
   * The key targets a table another resource owns, and resource `init()` runs in
   * registration order. It is applied by the Loading middleware instead — the first moment
   * every table is known to exist.
   */
  it('applies a deferred foreign key after every resource has initialized', async () => {
    const keys = await pg.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = $1::regclass AND contype = 'f'`,
      [`"${suite.schema}".crud_posts`]
    )

    expect(keys).toHaveLength(1)
    expect(keys[0].def).toContain(`REFERENCES ${suite.schema}.crud_users(id)`)
    expect(keys[0].def).toContain('ON DELETE CASCADE')
  })

  it('round-trips a record through create and get', async () => {
    const loaded = await users.get(seeded.id as string)

    expect(loaded.email).toBe('a@b.c')
    expect(loaded.age).toBe(21)
    expect(loaded.tags).toEqual(['x', 'y'])
    expect(loaded.profile).toEqual({ city: 'Kyiv' })
    /** Schema defaults are applied on the way in, not only in DDL. */
    expect(loaded.status).toBe('active')
    /** Drizzle's node-postgres session replaces the driver's date parsers; the marshaller restores them. */
    expect(loaded.createdAt).toBeInstanceOf(Date)
  })

  it('loads by a field other than the primary key, and refuses an unknown record', async () => {
    const byEmail = await users.load('a@b.c', 'email')
    expect(byEmail?.id).toBe(seeded.id as string)

    expect(await users.load('nobody@nowhere', 'email')).toBeNull()
    await expect(users.get('nobody@nowhere', 'email')).rejects.toThrow(UnknownRecordError)
  })

  it('patches by merge where update replaces the whole record', async () => {
    const patched = await users.patch<User>({ id: seeded.id, age: 22 })
    expect(patched.age).toBe(22)
    expect(patched.email).toBe('a@b.c')

    const replaced = await users.update({ id: seeded.id, email: 'a@b.c', status: 'banned' })
    expect(replaced.status).toBe('banned')
    /** Mongo's `replaceOne` semantics: a field absent from the record is absent afterwards. */
    expect(replaced.age ?? null).toBeNull()
  })

  it('lists by criteria and reports a total independent of the page', async () => {
    await users.create({ email: 'second@b.c', status: 'banned' })
    await users.create({ email: 'third@b.c', status: 'active' })

    const banned = await users.list({ status: 'banned' })
    expect(banned.pager?.total).toBe(2)
    expect(banned.items.every(item => item.status === 'banned')).toBe(true)

    const paged = await users.list({}, { pager: { page: 0, size: 2 } })
    expect(paged.items).toHaveLength(2)
    expect(paged.pager?.total).toBe(3)

    const sorted = await users.list({}, { pager: { sort: [['email', false]] } })
    expect(sorted.items.map(item => item.email)).toEqual(['a@b.c', 'second@b.c', 'third@b.c'])
  })

  it('counts and purges by criteria', async () => {
    expect(await users.count()).toBe(3)
    expect(await users.count({ status: 'banned' })).toBe(2)

    expect(await users.purge({ email: 'third@b.c' })).toBe(1)
    expect(await users.count()).toBe(2)
  })

  it('refuses a caller supplied id in create and accepts one in insert', async () => {
    await expect(users.create({ id: '00000000-0000-4000-8000-000000000001', email: 'no@b.c' }))
      .rejects.toThrow(RecordExists)

    const inserted = await users.insert<User>({
      id: '00000000-0000-4000-8000-000000000002', email: 'explicit@b.c'
    })
    expect(inserted.id).toBe('00000000-0000-4000-8000-000000000002')
    await users.delete(inserted.id as string)
  })

  it('upserts on an arbiter that is not the primary key', async () => {
    const upserted = await users.upsert<User>({ email: 'a@b.c', age: 44 }, ['email'])

    expect(upserted.id).toBe(seeded.id as string)
    expect(upserted.age).toBe(44)
    expect(await users.count()).toBe(2)
  })

  it('reports a unique violation as RecordExists', async () => {
    await expect(users.create({ email: 'a@b.c' })).rejects.toThrow(RecordExists)
  })

  it('picks a record by deleting it, atomically', async () => {
    const before = await users.count()
    expect(await posts.count()).toBe(1)

    const picked = await users.pick(seeded.id as string)

    expect(picked.email).toBe('a@b.c')
    expect(await users.count()).toBe(before - 1)
    /** The cascade is the database's, not the resource's — the post goes with its owner. */
    expect(await posts.count()).toBe(0)
    await expect(users.pick(seeded.id as string)).rejects.toThrow(UnknownRecordError)
  })
})
