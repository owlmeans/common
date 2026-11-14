import { readFileSync } from 'node:fs'
import { connect, createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

/**
 * Real local servers for the reader specs — a fixture site, an HTTP proxy and a SOCKS server.
 * Not mocks: every request crosses a socket exactly as it would in production, so a spec proves
 * the bytes on the wire, the proxy authentication and the tunnel.
 */

const FIXTURES = join(import.meta.dir, 'fixtures')

export const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Buffer): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type: string, data: Buffer): Buffer => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** A solid-color PNG — a picture a vision model can describe ("a blue square"). */
export const solidPng = (size: number, [r, g, b]: [number, number, number]): Buffer => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3).map((_, i) => [r, g, b][i % 3]!)])
  const pixels = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Served for every image path. */
export const PNG = solidPng(64, [20, 80, 230])

export interface Site {
  url: string
  /** Paths requested, in order. */
  hits: string[]
  stop: () => void
}

/** The fixture site on 127.0.0.1: pages, the stylesheet, images, and a few protocol edge cases. */
export const startSite = (): Site => {
  const hits: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: request => {
      const url = new URL(request.url)
      hits.push(url.pathname + url.search)
      const html = (name: string, init: ResponseInit = {}) =>
        new Response(fixture(name), { ...init, headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers } })
      switch (url.pathname) {
        case '/stories/tide-pools-winter': return html('article.html')
        case '/': return html('landing.html')
        case '/topics': return html('topics.html')
        case '/app': return html('app.html')
        case '/styles/site.css': return new Response(fixture('site.css'), { headers: { 'content-type': 'text/css' } })
        case '/old-story': return new Response(null, { status: 301, headers: { location: '/stories/tide-pools-winter' } })
        case '/loop': return new Response(null, { status: 302, headers: { location: '/loop' } })
        case '/to-private': return new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/admin' } })
        case '/latin1':
          return new Response(Buffer.from('<html><head><meta charset="windows-1251"><title>\xcf\xf0\xe8\xe2\xe5\xf2</title></head></html>', 'latin1'),
            { headers: { 'content-type': 'text/html' } })
        case '/big': return new Response('x'.repeat(64 * 1024), { headers: { 'content-type': 'text/plain' } })
        case '/slow': return new Promise<Response>(resolve => setTimeout(() => resolve(new Response('late')), 3000))
        case '/pdf': return new Response('%PDF-1.4', { headers: { 'content-type': 'application/pdf' } })
        case '/missing': return html('topics.html', { status: 404 })
        case '/mixed':
          return new Response('<html><body><h1>Mixed</h1><img src="http://169.254.169.254/latest/meta-data"><img src="/images/logo.svg"></body></html>',
            { headers: { 'content-type': 'text/html' } })
        case '/echo':
          return Response.json({ headers: Object.fromEntries(request.headers.entries()) })
        default:
          if (/\.(png|jpe?g|svg|gif|ico|webp)$/.test(url.pathname)) {
            return new Response(PNG, { headers: { 'content-type': 'image/png' } })
          }
          return new Response('not found', { status: 404 })
      }
    },
  })

  return { url: `http://127.0.0.1:${server.port}`, hits, stop: () => server.stop(true) }
}

export interface ProxyServer {
  url: string
  port: number
  /** One line per request the proxy carried: `CONNECT host:port` or `GET http://…`. */
  hits: string[]
  /** Requests turned away for missing or wrong credentials. */
  refused: number
  stop: () => Promise<void>
}

const listen = (server: Server): Promise<number> => new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    resolve(typeof address === 'object' && address != null ? address.port : 0)
  })
})

const close = (server: Server, sockets: Set<Socket>): Promise<void> => new Promise(resolve => {
  sockets.forEach(socket => socket.destroy())
  server.close(() => resolve())
})

/** An HTTP forward proxy: CONNECT tunnels and absolute-form requests, Basic auth with a 407 challenge. */
export const startHttpProxy = (credentials?: { username: string, password: string }): Promise<ProxyServer> => {
  const sockets = new Set<Socket>()
  const state = { hits: [] as string[], refused: 0 }
  const expected = credentials != null
    ? `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
    : undefined
  const server = createServer(client => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => client.destroy())
    let buffered = Buffer.alloc(0)
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const end = buffered.indexOf('\r\n\r\n')
      if (end < 0) return
      client.off('data', onData)
      const [line = '', ...headers] = buffered.subarray(0, end).toString('latin1').split('\r\n')
      const rest = buffered.subarray(end + 4)
      const auth = headers.find(h => /^proxy-authorization:/i.test(h))?.replace(/^[^:]+:\s*/, '')
      if (expected != null && auth !== expected) {
        state.refused++
        client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="test"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
        return
      }
      const [method = '', target = ''] = line.split(' ')
      state.hits.push(`${method} ${target}`)
      if (method === 'CONNECT') {
        const at = target.lastIndexOf(':')
        const upstream = connect(Number(target.slice(at + 1)), target.slice(0, at), () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          if (rest.length > 0) upstream.write(rest)
          client.pipe(upstream)
          upstream.pipe(client)
        })
        upstream.on('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'))
        return
      }
      const url = new URL(target)
      const upstream = connect(Number(url.port) || 80, url.hostname, () => {
        const kept = headers.filter(h => !/^(proxy-authorization|proxy-connection|connection):/i.test(h))
        upstream.write(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n${kept.join('\r\n')}\r\nconnection: close\r\n\r\n`)
        if (rest.length > 0) upstream.write(rest)
        upstream.pipe(client)
      })
      upstream.on('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'))
    }
    client.on('data', onData)
  })

  return listen(server).then(port => ({
    url: `http://${credentials != null ? `${credentials.username}:${credentials.password}@` : ''}127.0.0.1:${port}`,
    port,
    get hits() { return state.hits },
    get refused() { return state.refused },
    stop: () => close(server, sockets),
  }))
}

/** Read exactly `n` bytes from a socket that is fed by `feed`. */
const reader = (socket: Socket) => {
  let buffered = Buffer.alloc(0)
  let waiting: { n: number, resolve: (b: Buffer) => void } | undefined
  const drain = () => {
    if (waiting != null && buffered.length >= waiting.n) {
      const out = buffered.subarray(0, waiting.n)
      buffered = buffered.subarray(waiting.n)
      const { resolve } = waiting
      waiting = undefined
      resolve(out)
    }
  }
  const onData = (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk])
    drain()
  }
  socket.on('data', onData)
  return {
    read: (n: number) => new Promise<Buffer>(resolve => {
      waiting = { n, resolve }
      drain()
    }),
    /** Stop reading and hand back what was over-read. */
    release: () => {
      socket.off('data', onData)
      return buffered
    },
  }
}

/** A SOCKS4/4a/5 server with username/password (RFC 1929; the SOCKS4 user id) and CONNECT only. */
export const startSocksServer = (credentials?: { username: string, password: string }): Promise<ProxyServer> => {
  const sockets = new Set<Socket>()
  const state = { hits: [] as string[], refused: 0 }

  const tunnel = (client: Socket, host: string, port: number, ok: Buffer, fail: Buffer, over: Buffer) => {
    state.hits.push(`CONNECT ${host}:${port}`)
    const upstream = connect(port, host, () => {
      client.write(ok)
      if (over.length > 0) upstream.write(over)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    upstream.on('error', () => client.end(fail))
  }

  const server = createServer(client => {
    sockets.add(client)
    client.on('close', () => sockets.delete(client))
    client.on('error', () => client.destroy())
    const input = reader(client)
    void (async () => {
      const [version] = await input.read(1)
      if (version === 0x04) {
        const head = await input.read(7)
        const port = head.readUInt16BE(1)
        const ip = [...head.subarray(3, 7)].join('.')
        const zeroTerminated = async () => {
          const bytes: number[] = []
          while (true) {
            const [b] = await input.read(1)
            if (b === 0) return Buffer.from(bytes).toString()
            bytes.push(b!)
          }
        }
        const user = await zeroTerminated()
        const host = ip.startsWith('0.0.0.') && ip !== '0.0.0.0' ? await zeroTerminated() : ip
        if (credentials != null && user !== credentials.username) {
          state.refused++
          client.end(Buffer.from([0, 0x5b, 0, 0, 0, 0, 0, 0]))
          return
        }
        tunnel(client, host, port, Buffer.from([0, 0x5a, 0, 0, 0, 0, 0, 0]), Buffer.from([0, 0x5b, 0, 0, 0, 0, 0, 0]), input.release())
        return
      }
      const [count = 0] = await input.read(1)
      const methods = [...await input.read(count)]
      if (credentials != null) {
        if (!methods.includes(0x02)) {
          client.end(Buffer.from([5, 0xff]))
          return
        }
        client.write(Buffer.from([5, 0x02]))
        await input.read(1)
        const [userLength = 0] = await input.read(1)
        const user = (await input.read(userLength)).toString()
        const [passLength = 0] = await input.read(1)
        const pass = (await input.read(passLength)).toString()
        if (user !== credentials.username || pass !== credentials.password) {
          state.refused++
          client.end(Buffer.from([1, 1]))
          return
        }
        client.write(Buffer.from([1, 0]))
      } else {
        client.write(Buffer.from([5, 0]))
      }
      const [, , , type] = await input.read(4)
      let host = ''
      if (type === 1) host = [...await input.read(4)].join('.')
      else if (type === 3) host = (await input.read((await input.read(1))[0]!)).toString()
      else host = (await input.read(16)).toString('hex').match(/.{4}/g)!.join(':')
      const port = (await input.read(2)).readUInt16BE(0)
      tunnel(client, host, port, Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]), Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]), input.release())
    })().catch(() => client.destroy())
  })

  return listen(server).then(port => ({
    url: `socks5://${credentials != null ? `${credentials.username}:${credentials.password}@` : ''}127.0.0.1:${port}`,
    port,
    get hits() { return state.hits },
    get refused() { return state.refused },
    stop: () => close(server, sockets),
  }))
}

/** A port nothing listens on — a dead proxy. */
export const deadPort = async (): Promise<number> => {
  const server = createServer()
  const port = await listen(server)
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

export interface Origin {
  url: string
  /** Paths requested, in order. */
  hits: string[]
  stop: () => void
}

/** Bytes standing in for a font: a woff2 signature and filler. */
export const FONT = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(2048, 7)])

/**
 * A "fonts/CDN" origin, cross-origin to the collect site: a Google-Fonts-like stylesheet whose
 * `@import` and `@font-face` point back at this origin.
 */
export const startCdn = (hostname: string = '127.0.0.1'): Origin => {
  const hits: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname,
    fetch: request => {
      const url = new URL(request.url)
      hits.push(url.pathname + url.search)
      const css = (text: string) => new Response(text, { headers: { 'content-type': 'text/css; charset=utf-8' } })
      switch (url.pathname) {
        case '/css2': return css("@import url(\"/base.css\");\n@font-face { font-family: 'Inter'; src: url(/fonts/inter.woff2) format('woff2'); }\nbody { font-family: Inter, sans-serif; }")
        case '/base.css': return css('.card { background-image: url(/img/pattern.png); }')
        case '/fonts/inter.woff2': return new Response(FONT, { headers: { 'content-type': 'font/woff2' } })
        case '/img/pattern.png': return new Response(PNG, { headers: { 'content-type': 'image/png' } })
        default: return new Response('not found', { status: 404 })
      }
    },
  })
  return { url: `http://${hostname}:${server.port}`, hits, stop: () => server.stop(true) }
}

/** The page the collect site serves at `/`, pointing at the CDN for its web font. */
const collectPage = (cdn: string): string => `<!doctype html>
<html><head><meta charset="windows-1252"><title>Collected page</title>
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="${cdn}/css2?family=Inter:wght@400;700">
<link rel="icon" href="/favicon.png">
<link rel="modulepreload" href="/app.js">
<script src="/app.js"></script><script>window.bad = 1</script>
<meta http-equiv="refresh" content="30;url=/elsewhere">
<style>.hero { background: url(img/hero.png) }</style>
</head><body onload="go()">
<h1 onclick="x()">Collected page</h1>
<p>Café résumé</p>
<a href="javascript:alert(1)">bad link</a> <a href="/about">About</a>
<img src="img/logo.png" srcset="img/logo.png 1x, img/logo@2x.png 2x" alt="logo">
<picture><source srcset="img/hero.webp" type="image/webp"><img src="img/hero.png" alt="hero"></picture>
<div style="background-image: url('img/pattern.png')">pattern</div>
<img src="http://169.254.169.254/latest/meta-data/logo.png" alt="metadata">
<img src="img/missing.png" alt="missing">
<video poster="/img/poster.png"></video>
</body></html>`

/** A page script rendering into an empty mount point and styling it through the CSSOM only. */
const SHELL_SCRIPT = `
const sheet = document.createElement('style'); document.head.appendChild(sheet);
sheet.sheet.insertRule('.shell-title { color: rgb(200, 30, 30); font-size: 40px; }');
document.getElementById('root').innerHTML = '<h1 class="shell-title">Rendered by script</h1><p>' + 'Words of a rendered app. '.repeat(40) + '</p><img src="/img/logo.png" alt="logo">';
`

/** Crawl pages: path → [title, links]. */
const CRAWL_PAGES: Readonly<Record<string, [string, string[]]>> = Object.freeze({
  '/docs/': ['Docs home', ['/docs/pricing', '/docs/guide?utm_source=x', '/docs/guide#top', '/docs/blog', '/secret/x', '/secret/open', '/private/p', '/docs/file.pdf', 'https://example.com/out', 'mailto:a@b.c']],
  '/docs/pricing': ['Pricing plans', ['/docs/pricing/enterprise', '/docs/']],
  '/docs/pricing/enterprise': ['Enterprise pricing', ['/docs/pricing/enterprise/deep']],
  '/docs/pricing/enterprise/deep': ['Too deep', []],
  '/docs/guide': ['Guide', ['/docs/guide/install']],
  '/docs/guide/install': ['Install', []],
  '/docs/blog': ['Blog', ['/docs/blog/1', '/docs/blog/2']],
  '/docs/blog/1': ['Post 1', []],
  '/docs/blog/2': ['Post 2', []],
  '/secret/x': ['Secret', []],
  '/secret/open': ['Open secret', []],
  '/private/p': ['Private for others', []],
})

const crawlPage = (title: string, links: string[]): string =>
  `<!doctype html><html><head><title>${title}</title></head><body><nav>${links.map(href => `<a href="${href}">${href}</a>`).join(' ')}</nav><main><h1>${title}</h1><p>${'Text of the page. '.repeat(30)}</p></main></body></html>`

/**
 * The collect site on 127.0.0.1: a page with stylesheets (an `@import` cycle, a font, pictures in
 * CSS), a cross-origin web font stylesheet on `cdn`, every kind of picture reference, scripts and
 * handlers to strip; files with `Content-Disposition`; an app shell; crawl pages and a robots.txt.
 */
export const startCollectSite = (cdn: string): Origin => {
  const hits: string[] = []
  const big = Buffer.alloc(3 * 1024 * 1024, 1)
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: request => {
      const url = new URL(request.url)
      hits.push(url.pathname + url.search)
      const css = (text: string) => new Response(text, { headers: { 'content-type': 'text/css' } })
      const html = (text: string, status = 200) => new Response(text, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
      const page = CRAWL_PAGES[url.pathname]
      if (page != null) return html(crawlPage(...page))
      switch (url.pathname) {
        case '/': return new Response(Buffer.from(collectPage(cdn), 'latin1'), { headers: { 'content-type': 'text/html; charset=windows-1252' } })
        case '/css/site.css': return css('@import "print.css";\nbody { background: url(../img/bg.png) }\n@font-face { font-family: Local; src: url("../fonts/local.woff2") format("woff2") }')
        case '/css/print.css': return css('@import url(site.css);\nh1 { color: rgb(10, 20, 30) }')
        case '/fonts/local.woff2': return new Response(FONT, { headers: { 'content-type': 'font/woff2' } })
        case '/app.js':
        case '/shell.js': return new Response(url.pathname === '/shell.js' ? SHELL_SCRIPT : 'window.app = 1', { headers: { 'content-type': 'text/javascript' } })
        case '/shell': return html('<!doctype html><html><head><title>Shell</title></head><body><div id="root"></div><script src="/shell.js"></script></body></html>')
        case '/files/report': return new Response('%PDF-1.4 report %%EOF', { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Quarterly Report.pdf"' } })
        case '/files/data': return new Response('résumé', { headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': "attachment; filename=\"fallback.txt\"; filename*=UTF-8''r%C3%A9sum%C3%A9.txt" } })
        case '/files/sneaky': return new Response('x', { headers: { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="../../etc/passwd"' } })
        case '/files/big.bin': return new Response(big, { headers: { 'content-type': 'application/octet-stream' } })
        case '/files/streamed.bin': return new Response(new ReadableStream({
          start: controller => {
            for (let i = 0; i < 48; i++) controller.enqueue(new Uint8Array(64 * 1024).fill(i))
            controller.close()
          },
        }), { headers: { 'content-type': 'application/octet-stream' } })
        case '/to-report': return new Response(null, { status: 302, headers: { location: '/files/report' } })
        case '/moved': return new Response(null, { status: 302, headers: { location: '/docs/' } })
        case '/many': return html(`<!doctype html><html><body>${Array.from({ length: 10 }, (_, i) => `<img src="/img/m${i}.png">`).join('')}</body></html>`)
        case '/robots.txt': return new Response('User-agent: *\nDisallow: /docs/\n\nUser-agent: OwlMeansReader\nUser-agent: OtherBot\nDisallow: /secret/\nAllow: /secret/open\n', { headers: { 'content-type': 'text/plain' } })
        default:
          if (/\.(png|webp)$/.test(url.pathname) && !url.pathname.includes('missing')) {
            return new Response(PNG, { headers: { 'content-type': url.pathname.endsWith('.webp') ? 'image/webp' : 'image/png' } })
          }
          return new Response('not found', { status: 404 })
      }
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, hits, stop: () => server.stop(true) }
}

export interface S3Server extends Origin {
  /** Objects by bucket and key. */
  buckets: Map<string, Map<string, Uint8Array>>
}

const xmlEscape = (text: string): string => text.replace(/[<>&'"]/g, char => `&#${char.charCodeAt(0)};`)

/**
 * An S3-compatible stand-in, path-style: ListObjectsV2 (two keys a page, continuation tokens), object
 * GET, NoSuchKey / AccessDenied error documents. Bucket `locked` refuses anonymous listing. With
 * `markers: false` it sends no `x-amz-*` header — as an S3 behind a CDN that strips them.
 */
export const startS3 = (options: { markers?: boolean } = {}): S3Server => {
  const hits: string[] = []
  const markers = options.markers ?? true
  const buckets = new Map<string, Map<string, Uint8Array>>([
    ['public', new Map(Object.entries({
      'docs/': '',
      'docs/readme.md': '# Readme',
      'docs/guide/intro.md': '# Intro',
      'docs/guide/setup.md': '# Setup',
      'docs/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'docs/a&b <odd>.txt': 'odd name',
      'other/x.txt': 'x',
    }).map(([key, text]) => [key, new TextEncoder().encode(text)]))],
    ['locked', new Map([['secret/plan.md', new TextEncoder().encode('# Plan')]])],
  ])
  const headers = (type: string): Record<string, string> => ({
    'content-type': type, ...(markers ? { 'x-amz-request-id': 'REQ123', server: 'AmazonS3' } : { server: 'cloudflare' }),
  })
  const error = (status: number, code: string, resource: string) => new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${code}</Message><Resource>${xmlEscape(resource)}</Resource><RequestId>REQ123</RequestId></Error>`,
    { status, headers: headers('application/xml') },
  )
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: request => {
      const url = new URL(request.url)
      hits.push(url.pathname + url.search)
      const [bucketName = '', ...rest] = url.pathname.split('/').slice(1).map(decodeURIComponent)
      const bucket = buckets.get(bucketName)
      if (bucket == null) return error(404, 'NoSuchBucket', url.pathname)
      if (rest.length === 0 || (rest.length === 1 && rest[0] === '')) {
        if (bucketName === 'locked') return error(403, 'AccessDenied', url.pathname)
        const prefix = url.searchParams.get('prefix') ?? ''
        const maxKeys = Math.min(Number(url.searchParams.get('max-keys') ?? 1000), 2)
        const start = Number(url.searchParams.get('continuation-token') ?? 0)
        const keys = [...bucket.keys()].filter(key => key.startsWith(prefix)).sort()
        const page = keys.slice(start, start + maxKeys)
        const truncated = start + maxKeys < keys.length
        const contents = page.map(key => `<Contents><Key>${xmlEscape(key)}</Key><LastModified>2026-11-01T00:00:00.000Z</LastModified><ETag>"e"</ETag><Size>${bucket.get(key)!.length}</Size><StorageClass>STANDARD</StorageClass></Contents>`).join('')
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucketName}</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><IsTruncated>${truncated}</IsTruncated>${contents}${truncated ? `<NextContinuationToken>${start + maxKeys}</NextContinuationToken>` : ''}</ListBucketResult>`,
          { headers: headers('application/xml') },
        )
      }
      const key = rest.join('/')
      const object = key.endsWith('/') ? undefined : bucket.get(key)
      if (object == null) return error(404, 'NoSuchKey', url.pathname)
      const type = key.endsWith('.md') ? 'text/markdown' : key.endsWith('.svg') ? 'image/svg+xml' : 'text/plain'
      return new Response(object, { headers: headers(type) })
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, hits, buckets, stop: () => server.stop(true) }
}
