import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import type { RouteObject } from '@owlmeans/router'
import {
  makeBrowserRouterPlugin, Outlet, useNavigate, useParams, useSearchParams
} from '@owlmeans/web-router'

// A small but real app driven by the OwlMeans in-browser routing plugin. The
// e2e spec navigates this in a real chromium and asserts against the rendered
// DOM + the browser URL/history.

const Nav = () => {
  const navigate = useNavigate()
  return h('nav', null,
    h('button', { id: 'nav-home', onClick: () => navigate('/') }, 'home'),
    h('button', { id: 'nav-users', onClick: () => navigate('/users') }, 'users'),
    h('button', { id: 'nav-user', onClick: () => navigate('/users/42?token=abc') }, 'user-42'),
    h('button', { id: 'nav-settings', onClick: () => navigate('/users/settings') }, 'settings')
  )
}

const Layout = () => h('div', { id: 'layout' }, h('h1', null, 'app'), h(Nav), h(Outlet))
const Home = () => h('div', { id: 'home' }, 'home-screen')
const Users = () => h('div', { id: 'users' }, 'users-screen', h(Outlet))
const UsersIndex = () => h('div', { id: 'users-index' }, 'users-index-screen')
const Settings = () => h('div', { id: 'settings' }, 'settings-screen')
const Leaf = () => h('div', { id: 'leaf' }, 'leaf-screen')
const Deep = () => h('div', { id: 'deep' }, 'deep-screen')
const User = () => {
  const { id } = useParams()
  const [query] = useSearchParams()
  return h('div', { id: 'user' }, `user:${id}:token:${query.get('token') ?? 'none'}`)
}

const routes: RouteObject[] = [
  {
    path: '', Component: Layout, children: [
      { index: true, Component: Home },
      {
        path: 'users', Component: Users, children: [
          { index: true, Component: UsersIndex },
          { path: 'settings', Component: Settings }, // static must outrank :id
          // component-less grouping node between two rendered routes: <Outlet/> must
          // fall through it instead of stopping (react-router's implicit outlet)
          { path: 'nested', children: [{ path: 'deep', Component: Deep }] },
          { path: ':id', Component: User }
        ]
      }
    ]
  },
  // component-less grouping node at the very top of the chain — this is the shape
  // `@owlmeans/client` emits for entrypoints without a handler (e.g. `client-authentication`)
  { path: 'group', children: [{ path: 'leaf', Component: Leaf }] }
]

const plugin = makeBrowserRouterPlugin()
const Provider = plugin.provider()
const router = plugin.compile(routes)

createRoot(document.getElementById('root')!).render(h(Provider, { router }))
