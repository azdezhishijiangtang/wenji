import { useEffect, useMemo, useState } from 'react'
import { initEngine } from './engine/store'
import { isNight } from './engine/util'
import { useNow } from './ui/useDB'
import Today from './pages/Today'
import Daily from './pages/Daily'
import Coach from './pages/Coach'
import Drills from './pages/Drills'
import Foundation from './pages/Foundation'
import Cloze from './pages/Cloze'
import Argument from './pages/Argument'
import Classical from './pages/Classical'
import Writing from './pages/Writing'
import Appreciation from './pages/Appreciation'
import Syntax from './pages/Syntax'
import Library from './pages/Library'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Guide from './pages/Guide'

const NAV = [
  { path: '/', label: '今日' },
  { path: '/foundation', label: '基本功' },
  { path: '/daily', label: '日课' },
  { path: '/coach', label: '诊断' },
  { path: '/drills', label: '训练' },
  { path: '/library', label: '词典' },
  { path: '/me', label: '档案' },
  { path: '/settings', label: '设置' },
  { path: '/guide', label: '说明' },
]

const TITLES: Record<string, string> = {
  '/': '今日队列',
  '/daily': '日课',
  '/foundation': '基本功',
  '/coach': '能力诊断',
  '/drills': '训练器',
  '/drills/cloze': '语义分辨 · 挖词',
  '/drills/argument': '篇章逻辑 · 论证',
  '/drills/classical': '文言积累',
  '/drills/writing': '表达转化 · 写作',
  '/drills/appreciation': '文本感受 · 鉴赏',
  '/drills/syntax': '句法控制',
  '/library': '词典库',
  '/me': '学习档案',
  '/settings': '设置',
  '/guide': '使用说明',
}

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw || raw === '/') return '/'
  return raw.replace(/\/+$/, '')
}

function go(path: string) {
  window.location.hash = path
}

export default function App() {
  const [route, setRoute] = useState(currentPath)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const now = useNow(60000)

  useEffect(() => {
    const onHash = () => {
      setRoute(currentPath())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    initEngine()
      .then(() => setReady(true))
      .catch((e) => setError(e instanceof Error ? e.message : '初始化失败'))
  }, [])

  useEffect(() => {
    const title = TITLES[route] ?? '语文能力训练'
    document.title = `${title} · 文几`
  }, [route])

  const page = useMemo(() => {
    switch (route) {
      case '/':
        return <Today />
      case '/daily':
        return <Daily />
      case '/foundation':
        return <Foundation />
      case '/coach':
        return <Coach />
      case '/drills':
        return <Drills />
      case '/drills/cloze':
        return <Cloze />
      case '/drills/argument':
        return <Argument />
      case '/drills/classical':
        return <Classical />
      case '/drills/writing':
        return <Writing />
      case '/drills/appreciation':
        return <Appreciation />
      case '/drills/syntax':
        return <Syntax />
      case '/library':
        return <Library />
      case '/me':
        return <Dashboard />
      case '/settings':
        return <Settings />
      case '/guide':
        return <Guide />
      default:
        return (
          <div className="page">
            <h1>这条路没有页面</h1>
            <p className="muted">回到今日队列，让引擎决定下一步。</p>
            <button className="btn btn--primary" onClick={() => go('/')}>回今日队列</button>
          </div>
        )
    }
  }, [route])

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('/')} aria-label="回今日队列">
          文几<span>语文</span>
        </button>
        <nav className="nav">
          {NAV.map((n) => {
            const active = n.path === '/' ? route === '/' : route === n.path || route.startsWith(`${n.path}/`)
            return (
              <button
                key={n.path}
                className={active ? 'nav__item nav__item--on' : 'nav__item'}
                onClick={() => go(n.path)}
              >
                {n.label}
              </button>
            )
          })}
        </nav>
      </header>

      {isNight(now) && (
        <div className="nightbar">
          夜间模式 · 23:30–06:00 不推送新任务；自选练习仍可进行。巩固发生在睡眠里，不是意志力里。
        </div>
      )}

      <main className="main">
        {error ? (
          <div className="page">
            <h1>初始化失败</h1>
            <p className="muted">{error}</p>
            <p className="muted">本机存储可能被禁用。换一个浏览器，或关闭无痕模式后再试。</p>
          </div>
        ) : !ready ? (
          <div className="loading">
            <span className="loading__dot" />
            正在装载引擎与内容库…
          </div>
        ) : (
          page
        )}
      </main>

      <footer className="footer">
        <span>本机运行 · 无账号 · 无服务器</span>
        <span>
          学习逻辑在引擎，页面只负责交互。{' '}
          <button className="linkbtn" onClick={() => go('/guide')}>使用说明</button>
        </span>
      </footer>
    </div>
  )
}
