/* @vitest-environment jsdom */
import { beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const ROUTES = [
  '/',
  '/daily',
  '/coach',
  '/foundation',
  '/drills',
  '/drills/cloze',
  '/drills/argument',
  '/drills/classical',
  '/drills/writing',
  '/drills/appreciation',
  '/drills/syntax',
  '/library',
  '/me',
  '/settings',
  '/guide',
]

let container: HTMLDivElement

async function visit(path: string) {
  await act(async () => {
    window.location.hash = path
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await new Promise((r) => setTimeout(r, 30))
  })
}

describe('App 路由冒烟', () => {
  beforeAll(async () => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    window.scrollTo = () => {}
    window.location.hash = '#/'
    container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<App />)
    })
    for (let i = 0; i < 50 && !container.querySelector('.topbar'); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20))
      })
    }
  })

  it('初始化后出现顶栏与今日队列', () => {
    expect(container.querySelector('.topbar')).toBeTruthy()
    expect(container.textContent).toContain('文几')
    expect(container.textContent).toContain('今日')
    expect(container.textContent).not.toContain('初始化失败')
  })

  it('基本功页能渲染辨异题，而不是空壳', async () => {
    await visit('/foundation')
    expect(container.textContent).toContain('辨异')
    expect(container.textContent).toContain('为什么不是另一个')
    expect(container.querySelectorAll('.choice-card').length).toBe(2)
  })

  it('辨异题能完成一次作答并显示语义轴', async () => {
    await visit('/foundation')
    const conf = container.querySelector('.confidence .chip') as HTMLButtonElement | null
    expect(conf).toBeTruthy()
    await act(async () => conf!.click())
    const choice = [...container.querySelectorAll('.choice-card')].find((b) =>
      (b.textContent ?? '').includes('只要'),
    ) as HTMLButtonElement | undefined
    expect(choice).toBeTruthy()
    await act(async () => choice!.click())
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(ta, '“就能”说明愿意是足够条件，不是不可少的条件。')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const submit = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('提交，看语义轴'),
    ) as HTMLButtonElement | undefined
    expect(submit).toBeTruthy()
    await act(async () => {
      submit!.click()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(container.textContent).toContain('充分条件')
    expect(container.textContent).toContain('语义轴')
  })

  it('使用说明页有正文，不是空壳', async () => {
    await visit('/guide')
    expect(container.textContent).toContain('文几不是题库')
    expect(container.textContent).toContain('先读三件事')
    expect(container.textContent).toContain('接入 AI')
  })

  it('每条路由都能渲染，不落到“这条路没有页面”', async () => {
    for (const path of ROUTES) {
      await visit(path)
      expect(container.textContent).not.toContain('这条路没有页面')
      expect(container.querySelector('.main')).toBeTruthy()
    }
  })
})
