import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { ROUTER_SERVICE } from '@owlmeans/router'
import type { RouteObject, RouterService } from '@owlmeans/router'
import { appendWebRouter, Outlet, useLocation, useNavigate, useParams, useSearchParams } from '@owlmeans/web-router'

// The routing app of `../harness`, wired the way an application wires it: a real context whose
// own frontend service carries the base Vite serves this page under (`/app/`, or `/` for the root
// run), the browser plugin appended to it, and the routes compiled through the context's router
// host — so the base reaches the plugin exactly as `@owlmeans/client`'s `<Router>` hands it over.

const SERVICE = 'harness-web'
const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL

const context = makeBasicContext<BasicConfig>({
  ready: false, service: SERVICE, type: AppType.Frontend,
  services: { [SERVICE]: { service: SERVICE, type: AppType.Frontend, host: window.location.host, base } },
})
appendWebRouter(context)
const router = context.service<RouterService>(ROUTER_SERVICE)

const Where = () => {
  const location = useLocation()
  return h('output', { id: 'where' }, `${location.pathname}${location.search}`)
}

const Nav = () => {
  const navigate = useNavigate()
  return h('nav', null,
    h('button', { id: 'nav-home', onClick: () => navigate('/') }, 'home'),
    h('button', { id: 'nav-users', onClick: () => navigate('/users') }, 'users'),
    h('button', { id: 'nav-user', onClick: () => navigate('/users/42?token=abc') }, 'user-42'),
    h('button', { id: 'nav-object', onClick: () => navigate({ pathname: '/users/9', search: '?token=obj' }) }, 'user-9'),
    h('button', { id: 'nav-replace', onClick: () => navigate('/users/settings', { replace: true }) }, 'settings'),
    h('button', { id: 'nav-out', onClick: () => navigate(`${window.location.origin}/outside`) }, 'outside')
  )
}

const Layout = () => h('div', { id: 'layout' }, h(Where), h(Nav), h(Outlet))
const Home = () => h('div', { id: 'home' }, 'home-screen')
const Users = () => h('div', { id: 'users' }, 'users-screen', h(Outlet))
const UsersIndex = () => h('div', { id: 'users-index' }, 'users-index-screen')
const Settings = () => h('div', { id: 'settings' }, 'settings-screen')
const User = () => {
  const { id } = useParams()
  const [query, setQuery] = useSearchParams()
  return h('div', null,
    h('div', { id: 'user' }, `user:${id}:token:${query.get('token') ?? 'none'}`),
    h('button', { id: 'set-token', onClick: () => setQuery({ token: 'zzz' }) }, 'set-token')
  )
}

const routes: RouteObject[] = [
  {
    path: '', Component: Layout, children: [
      { index: true, Component: Home },
      {
        path: 'users', Component: Users, children: [
          { index: true, Component: UsersIndex },
          { path: 'settings', Component: Settings },
          { path: ':id', Component: User }
        ]
      }
    ]
  }
]

const Provider = router.provider()

void Promise.resolve(router.compile(routes)).then(compiled => {
  createRoot(document.getElementById('root')!).render(h(Provider, { router: compiled }))
})
