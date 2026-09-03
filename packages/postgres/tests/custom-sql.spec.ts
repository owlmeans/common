import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { makePostgresResource, PostgresPlaceholderError } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'

import { gate, makeSuite } from './context.js'
import type { PostgresService } from './context.js'

interface Author extends ResourceRecord {
  id?: string
  name: string
  email?: string
}

interface Book extends ResourceRecord {
  id?: string
  authorId: string
  title: string
  price?: number
  meta?: Record<string, unknown>
}

const authorSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    /** Renamed on purpose — every placeholder form has to emit the *physical* column. */
    email: { type: 'string', nullable: true, pg: { column: 'email_address' } }
  },
  required: ['id', 'name']
} as never

const bookSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    authorId: { type: 'string', format: 'uuid', pg: { references: { resource: 'sql-authors' } } },
    title: { type: 'string' },
    price: { type: 'number', nullable: true },
    meta: { type: 'object', nullable: true }
  },
  required: ['id', 'authorId', 'title']
} as never

/** The value every one of these specs is really about: it must never become SQL. */
const HOSTILE = `'); DROP TABLE "sql_books"; --`

const suite = makeSuite('sql')
const it = gate.skip ? test.skip : test

describe('@owlmeans/postgres — custom SQL with alias placeholders', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let pg: PostgresService
  let authors: PostgresResource<Author>
  let books: PostgresResource<Book>
  let tolkien: Author

  beforeAll(async () => {
    const author = makePostgresResource<Author, PostgresResource<Author>>('sql-authors')
    author.schema = authorSchema
    const book = makePostgresResource<Book, PostgresResource<Book>>('sql-books')
    book.schema = bookSchema

    const booted = await suite.boot({ resources: [author, book] })
    pg = booted.pg
    authors = booted.context.resource<PostgresResource<Author>>('sql-authors')
    books = booted.context.resource<PostgresResource<Book>>('sql-books')

    tolkien = await authors.create({ name: 'Tolkien', email: 'jrr@shire.me' })
    await books.create({ authorId: tolkien.id as string, title: 'The Hobbit', price: 9.5 })
    await books.create({
      authorId: tolkien.id as string, title: 'The Silmarillion', price: 14, meta: { posthumous: true }
    })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('answers the same qualified name through every route to it', () => {
    const qualified = `"${suite.schema}"."sql_authors"`

    expect(authors.ref()).toBe(qualified)
    expect(authors.table.qualified).toBe(qualified)
    expect(books.ref('sql-authors')).toBe(qualified)
    expect(pg.qualify('sql-authors')).toBe(qualified)
  })

  it('substitutes the table, its columns, its bare name and its schema', async () => {
    const [row] = await books.query<{ title: string, author: string }>(
      `SELECT {{sql-books.title}} AS title, {{sql-authors.name}} AS author
         FROM {{}} JOIN {{sql-authors}} ON {{sql-books.authorId}} = {{sql-authors.id}}
        WHERE {{sql-books.title}} = $1`,
      ['The Hobbit']
    )

    expect(row).toEqual({ title: 'The Hobbit', author: 'Tolkien' })

    /** `{{$}}` and `{{#alias}}` compose into the same reference `{{alias}}` emits. */
    const [counted] = await books.query<{ n: number }>('SELECT count(*)::int AS n FROM {{$}}.{{#sql-books}}')
    expect(counted.n).toBe(2)
  })

  it('emits the physical column a property was renamed to', async () => {
    const [row] = await authors.query<{ email_address: string }>(
      'SELECT {{sql-authors.email}} FROM {{}} WHERE "name" = $1', ['Tolkien']
    )

    /** The property is `email`; nothing but `email_address` exists in the database. */
    expect(row.email_address).toBe('jrr@shire.me')
    await expect(authors.query('SELECT {{sql-authors.emailAddress}} FROM {{}}'))
      .rejects.toThrow(PostgresPlaceholderError)
  })

  it('keeps values in parameters, never in the statement', async () => {
    const created = await authors.create({ name: HOSTILE })

    const [row] = await authors.query<{ name: string }>(
      'SELECT "name" FROM {{}} WHERE "id" = $1', [created.id]
    )
    expect(row.name).toBe(HOSTILE)

    /** The statement the value tried to become would have dropped this table. */
    const [alive] = await books.query<{ n: number }>('SELECT count(*)::int AS n FROM {{}}')
    expect(alive.n).toBe(2)

    await authors.delete(created.id as string)
  })

  it('marshals through select where query hands back the raw row', async () => {
    const raw = await authors.queryOne<{ email_address: string, email?: string }>(
      'SELECT * FROM {{}} WHERE "name" = $1', ['Tolkien']
    )
    expect(raw?.email_address).toBe('jrr@shire.me')
    expect(raw?.email).toBeUndefined()

    /** The resource is typed once, at the call to `resource()` — never per method. */
    const record = await authors.selectOne('SELECT * FROM {{}} WHERE "name" = $1', ['Tolkien'])
    expect(record?.email).toBe('jrr@shire.me')
    expect(record?.id).toBe(tolkien.id as string)

    /** jsonb comes back parsed, not as a string, on both routes. */
    const [book] = await books.select(`SELECT * FROM {{}} WHERE "title" = $1`, ['The Silmarillion'])
    expect(book.meta).toEqual({ posthumous: true })
  })

  it('reports affected rows from execute', async () => {
    expect(await books.execute('UPDATE {{}} SET "price" = "price" + $1', [1])).toBe(2)
    expect(await books.execute('UPDATE {{}} SET "price" = $1 WHERE "title" = $2', [10.5, 'The Hobbit'])).toBe(1)
    expect(await books.execute('UPDATE {{}} SET "price" = $1 WHERE "title" = $2', [0, 'Nothing'])).toBe(0)
  })

  it('refuses an alias it cannot resolve instead of emitting it', async () => {
    await expect(books.query('SELECT * FROM {{ghosts}}')).rejects.toThrow(PostgresPlaceholderError)
    /** A service level query is scopeless — it has no owning table for `{{}}` to mean. */
    await expect(pg.query('SELECT * FROM {{}}')).rejects.toThrow(PostgresPlaceholderError)
    expect(await pg.query('SELECT count(*)::int AS n FROM {{sql-books}}')).toEqual([{ n: 2 }])
  })

  it('commits a transaction and rolls back a failed one', async () => {
    const added = await books.transaction(async tx => {
      await tx.execute('INSERT INTO {{}} ("authorId", "title") VALUES ($1, $2)', [tolkien.id, 'Unfinished Tales'])

      return await tx.queryOne<{ n: number }>('SELECT count(*)::int AS n FROM {{}}')
    })
    expect(added?.n).toBe(3)
    expect(await books.count()).toBe(3)

    await expect(books.transaction(async tx => {
      await tx.execute('DELETE FROM {{}}')
      expect(tx.ref()).toBe(`"${suite.schema}"."sql_books"`)
      expect(tx.ref('sql-authors')).toBe(`"${suite.schema}"."sql_authors"`)

      throw new Error('deliberate')
    })).rejects.toThrow('deliberate')

    /** Nothing the transaction did survives it. */
    expect(await books.count()).toBe(3)
  })

  it('exposes the same transaction façade at service level', async () => {
    const total = await pg.transaction(async tx => {
      await tx.execute('DELETE FROM {{sql-books}} WHERE "title" = $1', ['Unfinished Tales'])

      return await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM {{sql-books}}')
    })

    expect(total).toEqual([{ n: 2 }])
    expect(await books.count()).toBe(2)
  })
})
