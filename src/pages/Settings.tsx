import { useEffect, useRef, useState } from 'react'
import { testAI } from '../engine/ai'
import { vault } from '../engine/byokVault'
import {
  deleteEverything,
  exportJSON,
  importJSON,
  resetAll,
  resetLearning,
  updateSettings,
  updateUserName,
} from '../engine/store'
import { clamp, dayKey, isNight } from '../engine/util'
import { useDB } from '../ui/useDB'
import { Notice } from '../ui/common'

function go(path: string) {
  window.location.hash = path
}

export default function Settings() {
  const db = useDB()
  const [name, setName] = useState(db.user.name)
  const [newCap, setNewCap] = useState(db.settings.newItemCap)
  const [dailyCap, setDailyCap] = useState(db.settings.dailyCap)
  const [retention, setRetention] = useState(db.settings.desiredRetention)
  const [ai, setAi] = useState(db.settings.ai)
  const [msg, setMsg] = useState('')
  const [tone, setTone] = useState<'good' | 'warn' | 'bad' | 'info'>('good')
  const [aiMsg, setAiMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const vaultHostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!vaultHostRef.current) return
    return vault.mountVaultControls(vaultHostRef.current)
  }, [])

  function say(text: string, t: typeof tone = 'good') {
    setMsg(text)
    setTone(t)
  }

  async function savePlan() {
    const nextNew = clamp(Math.round(newCap) || 0, 0, 30)
    const nextDaily = clamp(Math.round(dailyCap) || 10, 10, 80)
    if (nextNew > nextDaily) {
      say('新卡上限不能超过每日队列上限。', 'warn')
      return
    }
    setNewCap(nextNew)
    setDailyCap(nextDaily)
    await updateSettings({ newItemCap: nextNew, dailyCap: nextDaily, desiredRetention: retention })
    say('每日计划已保存。新参数从下一次队列开始生效。')
  }

  async function saveAI() {
    const typed = ai.apiKey.trim()
    let handle = db.settings.ai.apiKey
    if (typed && !vault.isHandle(typed)) {
      vault.set('ai', typed)
      handle = vault.handleFor('ai')
    }
    await updateSettings({ ai: { ...ai, apiKey: handle } })
    say(ai.enabled ? 'AI 设置已保存。密钥仅在内存中，刷新后需重新输入或凭口令解锁。' : 'AI 已关闭，规则诊断和本地功能不受影响。')
  }

  async function checkAI() {
    const typed = ai.apiKey.trim()
    if (typed && !vault.isHandle(typed)) vault.set('ai', typed)
    const probe = { ...ai, apiKey: typed ? (vault.isHandle(typed) ? typed : vault.handleFor('ai')) : db.settings.ai.apiKey }
    setTesting(true)
    setAiMsg('')
    try {
      const reply = await testAI(probe)
      setAiMsg(`接口返回：${reply}`)
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : '连接失败')
    } finally {
      setTesting(false)
    }
  }

  function doExport() {
    const blob = new Blob([exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wenyi-${dayKey(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
    say('已导出。建议同时存到电脑或网盘，浏览器清缓存会丢本机数据。')
  }

  async function doImport(file: File) {
    try {
      const text = await file.text()
      await importJSON(text)
      const next = JSON.parse(text) as { settings?: { newItemCap?: number; dailyCap?: number } }
      if (next.settings?.newItemCap != null) setNewCap(next.settings.newItemCap)
      if (next.settings?.dailyCap != null) setDailyCap(next.settings.dailyCap)
      say('导入成功。当前页面数据已刷新。')
    } catch (e) {
      say(e instanceof Error ? e.message : '导入失败：文件不是有效的备份', 'bad')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const night = isNight(new Date())

  return (
    <div className="page">
      <div className="drill-head">
        <button className="link" onClick={() => go('/')}>← 今日队列</button>
        <span className="tag">设置 · 本机数据</span>
      </div>

      <h1>把规则调对，然后少管它。</h1>
      <p className="page-head__intro">
        本站没有服务器：条目、作答、模型档案、批注与草稿都在这个浏览器的 localStorage 里。换设备要靠导出/导入。
      </p>

      {night && (
        <Notice tone="warn">
          现在是夜间模式（23:30–06:00）：队列不推送新任务，但你仍可自选练习，作答会正常记录。
        </Notice>
      )}

      <section className="section">
        <h2>称呼</h2>
        <div className="form-row">
          <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
          <button
            className="btn"
            onClick={() => {
              if (!name.trim()) return say('称呼不能为空。', 'warn')
              updateUserName(name)
              say('已保存。')
            }}
          >
            保存
          </button>
        </div>
      </section>

      <section className="section">
        <h2>每日计划</h2>
        <p className="muted">宁可少而真。队列总量是硬上限，不是目标；完成度不进入成就。</p>

        <div className="form-grid">
          <label>
            <span>新卡上限 / 天</span>
            <input
              className="input"
              type="number"
              min={0}
              max={30}
              value={newCap}
              onChange={(e) => setNewCap(Number(e.target.value))}
            />
          </label>
          <label>
            <span>队列总量上限 / 天</span>
            <input
              className="input"
              type="number"
              min={10}
              max={80}
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="range-row">
          <span>FSRS 目标留存率：{Math.round(retention * 100)}%</span>
          <input
            type="range"
            min={0.7}
            max={0.97}
            step={0.01}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
          />
        </label>
        <p className="muted tiny">
          留存率越高，复习越密。90% 是常用折中；不要为了“安心”调到最高，那会把时间烧在已会内容上。
        </p>

        <button className="btn btn--primary" onClick={savePlan}>保存每日计划</button>
      </section>

      <section className="section">
        <h2>AI 诊断（可选）</h2>
        <p className="muted">
          可选 AI 用在五处：写作结构诊断、精读批注点评、错题追问、每日复盘、能力深度诊断。判分、调度、掌握度、能力指数全部在本地算；AI 只解释，不能改写数据。
        </p>

        <label className="check">
          <input type="checkbox" checked={ai.enabled} onChange={(e) => setAi({ ...ai, enabled: e.target.checked })} />
          开启 AI 诊断
        </label>

        <div className="form-grid">
          <label>
            <span>接口地址（OpenAI 兼容）</span>
            <input className="input" value={ai.baseUrl} onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            <span>模型名</span>
            <input className="input" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="gpt-4o-mini" />
          </label>
        </div>
        <label>
          <span>API Key</span>
          <input
            className="input"
            type="password"
            value={vault.isHandle(ai.apiKey) ? '' : ai.apiKey}
            onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
            placeholder={db.settings.ai.apiKey ? '已配置 · 留空保持不变，或粘贴新密钥替换' : 'sk-…'}
            autoComplete="off"
          />
        </label>
        <div ref={vaultHostRef} />

        <div className="btn-row">
          <button className="btn btn--primary" onClick={saveAI}>保存 AI 设置</button>
          <button className="btn" onClick={checkAI} disabled={testing || !ai.enabled || !ai.apiKey}>
            {testing ? '测试中…' : '测试连接'}
          </button>
        </div>
        {aiMsg && <Notice tone={aiMsg.startsWith('接口返回') ? 'good' : 'warn'}>{aiMsg}</Notice>}
        <p className="muted tiny">
          密钥默认只存在内存中、刷新即消失，绝不写入 localStorage；请求直接发往你填的接口，本站没有后端。AI 调用全部由你手动触发，不后台偷跑。建议使用额度受限、可随时撤销的专用子密钥。
        </p>
      </section>

      <section className="section">
        <h2>数据</h2>
        <div className="data-stats">
          <span>条目 {Object.keys(db.items).length}</span>
          <span>作答记录 {db.reviews.length}</span>
          <span>模型 {Object.keys(db.models).length}</span>
          <span>批注 {db.annotations.length}</span>
          <span>草稿 {db.drafts.length}</span>
        </div>
        <p className="muted tiny">
          作答记录只增不改，这是所有统计与调度的原始事实；算法升级后可以在历史上重放。导出的 JSON 会抹掉 AI Key。
        </p>

        <div className="btn-row">
          <button className="btn" onClick={doExport}>导出备份（不含 Key）</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>导入备份</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
            }}
          />
        </div>

        <div className="danger-zone">
          <p className="muted">导入会覆盖当前学习数据；覆盖前先导出。</p>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (!window.confirm('清空全部作答、掌握度与队列进度，但保留批注和草稿。确定？')) return
              resetLearning()
              say('学习记录已重置，内容库重新建档。', 'warn')
            }}
          >
            重置学习记录
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (!window.confirm('连同批注、草稿一起清空，恢复到初始内容。这个操作不可撤销。确定？')) return
              if (!window.confirm('最后确认：所有本机学习记录都会消失。')) return
              resetAll()
              say('已恢复初始状态。', 'warn')
            }}
          >
            全部重置
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => {
              if (!window.confirm('删除本机全部数据（含设置）？建议先导出。')) return
              deleteEverything()
              say('已删除本机数据。', 'warn')
            }}
          >
            删除本机数据
          </button>
        </div>
      </section>

      {msg && <Notice tone={tone}>{msg}</Notice>}

      <section className="section">
        <h2>这个站在坚持什么</h2>
        <ul className="plain-list">
          <li>先试后看：看解析前必须提交选择与把握度，没有“直接看答案”。</li>
          <li>闭卷验证：没有“标为已掌握”的按钮，档位只由作答数据触发。</li>
          <li>做题算复习：浏览词典不计入完成；到期复习必须作答。</li>
          <li>不代输出：AI 只诊断、挑错、追问、出题，不给范文与完整解答。</li>
          <li>达标即停：LV.3 起停止主动推送新变式，只按 FSRS 低频复习。</li>
        </ul>
        <p className="muted tiny">
          架构上，调度与掌握度判定都在 engine/ 内；页面只上报行为、消费队列。以后接第二个场景站时，不需要重写学习逻辑。
        </p>
      </section>
    </div>
  )
}
