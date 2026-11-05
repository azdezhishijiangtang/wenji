import { PageHeader, Notice } from '../ui/common'

const SECTIONS = [
  { id: 'start', label: '先读三件事' },
  { id: 'first', label: '第一次打开' },
  { id: 'routine', label: '每天怎么用' },
  { id: 'pages', label: '页面逐个说' },
  { id: 'ai', label: '接入 AI' },
  { id: 'data', label: '数据与隐私' },
  { id: 'rules', label: '引擎规则' },
  { id: 'faq', label: '常见问题' },
]

function jump(id: string) {
  document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function go(path: string) {
  window.location.hash = path
}

export default function Guide() {
  return (
    <div className="page guide-page">
      <PageHeader
        eyebrow="使用说明 · 先读这一页"
        title="文几不是题库，是一套练底层动作的地方。"
        intro="它不按“论述类、文言文、作文”组织，而按辨异、结构、转化、积累四个动作组织。考试只是这些动作的抽样；每天练一点，比一次刷很多更接近语文能力的生长方式。"
        aside={
          <button className="btn btn--primary" onClick={() => go('/')}>
            回今日队列 →
          </button>
        }
      />

      <Notice tone="info" title="如果你只有 3 分钟">
        先读下面的“三件事”，然后去 <button className="linkbtn" onClick={() => go('/foundation')}>基本功</button>{' '}
        做一道辨异题。不要先研究所有功能；用一次，比读完说明更有用。
      </Notice>

      <div className="guide-layout">
        <aside className="guide-toc" aria-label="目录">
          <p className="eyebrow">目录</p>
          {SECTIONS.map((s, i) => (
            <button key={s.id} className="guide-toc__link" onClick={() => jump(s.id)}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {s.label}
            </button>
          ))}
          <button className="guide-toc__top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            回到顶部 ↑
          </button>
        </aside>

        <div className="guide-body">
          <section id="guide-start" className="guide-section">
            <h2>一、先读三件事</h2>
            <div className="guide-three">
              <article className="guide-card">
                <span className="tag">01</span>
                <h3>引擎决定今天做什么</h3>
                <p>
                  首页不是功能目录，是队列。到期复习、新卡、校准偏差大的模型，由 FSRS 和队列规则排序。
                  你不需要每天决定“先练哪个”，只需要开始。
                </p>
              </article>
              <article className="guide-card">
                <span className="tag">02</span>
                <h3>先试，再看</h3>
                <p>
                  任何计分作答，都要先选把握度、先提交自己的答案。没有“看答案”按钮，也没有“标记已掌握”。
                  看懂了不算会，答出来才算证据。
                </p>
              </article>
              <article className="guide-card">
                <span className="tag">03</span>
                <h3>不追求刷题量</h3>
                <p>
                  首页、档案、周报都不把“做了多少题”当成就。看的是达标模型数、校准偏差是否收敛、哪些能力有了可验证的证据。
                </p>
              </article>
            </div>
          </section>

          <section id="guide-first" className="guide-section">
            <h2>二、第一次打开</h2>
            <ol className="guide-steps">
              <li>
                <b>不用注册。</b>数据只存在当前浏览器的 localStorage，没有账号、没有服务器、没有上报。
              </li>
              <li>
                <b>先看首页。</b>如果队列里有内容，点“开始”即可；如果没有，去{' '}
                <button className="linkbtn" onClick={() => go('/foundation')}>基本功</button> 或{' '}
                <button className="linkbtn" onClick={() => go('/daily')}>日课</button>。
              </li>
              <li>
                <b>从一组开始，不要贪多。</b>一组通常 5–8 条，10 分钟左右。做不完就停，剩下的明天会重新排序。
              </li>
              <li>
                <b>第一次先不要配 AI。</b>本地判分、队列、诊断都能用；AI 是可选增强，不是启动条件。
              </li>
            </ol>
          </section>

          <section id="guide-routine" className="guide-section">
            <h2>三、每天怎么用：15–25 分钟</h2>
            <p className="prose">
              语文能力不是靠某一天猛练长出来的。建议把训练拆成“短、固定、可完成”的日常，而不是周末补一大块。
            </p>
            <div className="guide-routine">
              <div><b>2 分钟</b><span>看今日队列，知道今天大概有什么；不重新规划。</span></div>
              <div><b>5–8 分钟</b><span>基本功：一道辨异，或一道重组。先写理由，再看语义轴。</span></div>
              <div><b>8–12 分钟</b><span>应用场：优先做到期复习；一次只做一组，不切来切去。</span></div>
              <div><b>3 分钟</b><span>日课：一字、一象、一技，读一段，写一句自己的话（≥10 字）。</span></div>
            </div>
            <Notice tone="good" title="只有 5 分钟的日子">
              做一道辨异 + 写日课那一句。不要用“今天没时间”换“今天什么都不留”。连续不是靠强度，是靠最低完成线。
            </Notice>
          </section>

          <section id="guide-pages" className="guide-section">
            <h2>四、页面逐个说</h2>

            <article className="guide-block">
              <h3>今日 <span className="muted">/</span></h3>
              <p>
                引擎生成的队列。每张卡是一个题组；点“开始”进入对应训练器。到期越久越靠前，校准偏差大的模型也会优先。
                默认每天最多 40 条、新卡 12 条；做不完不会累积成“欠债”，第二天重新排序。
              </p>
              <ul>
                <li>作答前必须选把握度（10/30/50/70/90），它是校准曲线的原料。</li>
                <li>错题当天不打错因；<b>第二天</b>才会出现六类错因面板（冷静期）。</li>
                <li>23:30–06:00 夜间模式：队列清空、不推送新任务；仍可从「训练」自选练习，日课和词典也可看。</li>
                <li>
                  <b>积累回看</b>：日课写下那句话的约 3 天后，今日页会出现「积累回看 · 转化」——给旧句造个新变体、压到一半、或写一个它管不了的反例。转化的对象是当时写下的快照，之后改日课不影响它。
                </li>
              </ul>
            </article>

            <article className="guide-block">
              <h3>基本功 <span className="muted">/foundation</span></h3>
              <p>
                两个动作，不是两种题型：
              </p>
              <ul>
                <li>
                  <b>辨异</b>：两个词都能进句子，先选，再用一句话说出“为什么不是另一个”，提交后才看语义轴。
                  它练的是范围、程度、预设、语气这些阅读和写作共用的分辨率。
                </li>
                <li>
                  <b>重组</b>：把打乱的句子排成一条思路。提交后不只看对错，还看连接词、指代、因果和收束为什么各就各位。
                </li>
              </ul>
              <p className="muted">
                每题仍然写入 reviews，推进 FSRS 与掌握度；它不是脱离引擎的小游戏。
              </p>
            </article>

            <article className="guide-block">
              <h3>日课 <span className="muted">/daily</span></h3>
              <p>
                每天固定抽一个文言词义、一个意象、一个手法，再轮换一篇精读（诗 / 散文 / 小说）。
                三张卡是输入；真正算“日课完成”的，是你写下的那一句（≥10 字）。
              </p>
              <ul>
                <li>同一天刷新不变，换一天才换；积累簿保留最近 14 天。</li>
                <li>只读不写、只看不作答，不计入日课连续天数。</li>
                <li>配了 AI 后，可以点“让 AI 复盘今天”，它会读当天真实作答数与这句笔记，给一段复盘和一个明日重点。</li>
              </ul>
            </article>

            <article className="guide-block">
              <h3>训练 <span className="muted">/drills</span></h3>
              <p>六个应用场，对应六个底层动作。可以自选，但自选不会绕过引擎：作答仍写 reviews、仍推进 FSRS 与掌握度。</p>
              <div className="guide-table">
                <div><b>语义分辨 · 挖词</b><span>议论文段挖空，5 选 1；答后给原文证据与语义轴。错空 48 小时后回队。</span></div>
                <div><b>篇章逻辑 · 论证</b><span>先逐句标结构，再判断干扰句属于哪类谬误；每类谬误分开统计。</span></div>
                <div><b>文言积累</b><span>42 条词义，认读 + 回译双卡；例句标出处，走 FSRS。</span></div>
                <div><b>表达转化 · 写作</b><span>20 分钟写 150–300 字；本地规则找断点 + 追问；AI 只诊断，不给范文。</span></div>
                <div><b>文本感受 · 鉴赏</b><span>30 个手法、40 组意象；每日精读 + ≥10 字批注，AI 只点评批注。</span></div>
                <div><b>句法控制</b><span>现代文找主干；文言断句，每个断点必须给出依据。</span></div>
                <div><b>模型变式 · 工坊</b><span>AI 按模型定义出新壳（换壳不换核），你逐题确认后才入库；入库变式走正常队列与掌握度。</span></div>
              </div>
              <p className="muted">训练页底部还有「限时抽样卷」入口，见下。</p>
            </article>

            <article className="guide-block">
              <h3>模型变式 · 工坊 <span className="muted">/drills/variant</span></h3>
              <p>
                掌握度升档要求“见多壳”。这里补上了引擎最后一块：选一个模型，AI 生成 3 道变式选择题；
                每道先过质检（候选唯一、恰好一个正确项、题干不自曝答案），你勾选确认后才入库。
              </p>
              <ul>
                <li>入库变式的 variant_level 是 2（换壳），与种子条目同权：进队列、进掌握度、进校准。</li>
                <li>AI 不判定“学会”；同一模型 3 道不同条目连对才升档，答错立即降档，规则不变。</li>
                <li>需要先在设置里启用 AI 接口。</li>
              </ul>
            </article>

            <article className="guide-block">
              <h3>限时抽样卷 <span className="muted">/exam</span></h3>
              <p>
                “考试只是它们的抽样”——那就定期抽一次。从<b>已学过</b>的条目里按六维配比抽 6/10/14 条，
                开卷计时，逐条跳到对应训练页作答（把握度、FSRS、掌握度照常走）。
              </p>
              <ul>
                <li>同一张卷同一份；交卷后给出“答了几条、对了几条”的验收快照，作答记录本身不会被擦除。</li>
                <li>同一时间只有一张活跃卷；可以作废（已作的答仍算数）。</li>
                <li>卷子是验收，不是新题源：池子里只有带 FSRS 卡的条目。</li>
              </ul>
            </article>

            <article className="guide-block">
              <h3>诊断 <span className="muted">/coach</span></h3>
              <p>
                六维：语义分辨、篇章逻辑、文言积累、句法控制、文本感受、表达转化。
                综合指数 = 掌握度 35% + 近 30 天正确率 25% + 覆盖 20% + 校准 20%。
                只有两个及以上维度有证据时，才给综合分；否则明确写“证据不足”。
              </p>
              <ul>
                <li>写作不折算成分数，只记草稿、结构断点与修改过程。</li>
                <li>“最近错题”可以点 AI 追问：它只指出一个冲突并追问，不给正确答案。</li>
                <li>指数是行为证据的压缩，不是高考估分，也不预测卷面分数。</li>
              </ul>
            </article>

            <article className="guide-block">
              <h3>档案 <span className="muted">/me</span></h3>
              <p>
                本周四信号、校准曲线、模型分布。校准曲线越靠近对角线，说明你对自己“会不会”的判断越准；
                高估榜是“以为会了”的雷区，低估榜是被浪费的时间。
              </p>
            </article>

            <article className="guide-block">
              <h3>词典 <span className="muted">/library</span></h3>
              <p>
                30 个手法、40 组意象、42 条文言词义。它只解决“见过”，不进入掌握度，也不计完成。
                查完请回到训练或日课，用一次；只看词典不会长出能力。
              </p>
            </article>

            <article className="guide-block">
              <h3>设置 <span className="muted">/settings</span></h3>
              <p>
                改称呼、每日计划（新卡 0–30、队列 10–80、留存率 0.7–0.97）、AI 接口、数据导入导出与重置。
                计划改小不是偷懒；单用户场景下，“能长期做完”比“一次排满”重要。
              </p>
            </article>
          </section>

          <section id="guide-ai" className="guide-section">
            <h2>五、接入 AI（可选）</h2>
            <p className="prose">
              AI 不参与判分、调度、掌握度或能力指数。它只做六件事：写作诊断、批注点评、错题追问、每日复盘、能力深度诊断、变式出题（生成后必须人工确认）。
              所有调用都由你手动触发，不会在后台偷跑。
            </p>
            <ol className="guide-steps">
              <li>打开 <button className="linkbtn" onClick={() => go('/settings')}>设置 → AI 接口</button>，勾选启用。</li>
              <li>
                填 OpenAI 兼容接口。例：<code>https://api.openai.com/v1</code> + <code>gpt-4o-mini</code>；
                或 <code>https://api.deepseek.com/v1</code> + <code>deepseek-chat</code>。
              </li>
              <li>填 Key，保存，点“测试连接”。</li>
              <li>回到写作、日课或诊断页，按需点 AI 按钮。</li>
            </ol>
            <Notice tone="warn" title="浏览器直连的边界">
              Key 只存本机 localStorage；请求从浏览器直接发给你填的地址，本站没有后端中转。
              有些接口不允许浏览器跨域，会报 CORS；这不是 Key 错，换一个允许浏览器直连的 OpenAI 兼容网关即可。
            </Notice>
          </section>

          <section id="guide-data" className="guide-section">
            <h2>六、数据与隐私</h2>
            <ul className="guide-list">
              <li>没有账号、没有服务器。条目、作答、掌握度、日课、草稿、批注都在当前浏览器的 localStorage。</li>
              <li>换设备或换浏览器：设置 → 数据 → 导出 JSON；到新设备导入。<b>导入会替换当前学习数据</b>，先导出备份。</li>
              <li>导出文件会自动抹掉 AI Key；Key 不会进入备份。</li>
              <li>清理浏览器站点数据、无痕模式关闭、换浏览器，都会让本地数据消失。重要阶段请定期导出。</li>
              <li>“重置学习”只清作答与掌握度；“全部重置”连批注和草稿一起清；两者都不可撤销。</li>
            </ul>
          </section>

          <section id="guide-rules" className="guide-section">
            <h2>七、引擎规则（为什么有些按钮不存在）</h2>
            <div className="guide-rules">
              <div><b>先试后看</b><span>没有“看答案”入口；提交后才显示解释。</span></div>
              <div><b>闭卷验证</b><span>没有“标记已掌握”；等级只由作答数据触发。</span></div>
              <div><b>做题算复习</b><span>浏览词典、翻解析、只读日课，都不计完成。</span></div>
              <div><b>不代输出</b><span>AI 不写范文、不改写、不给完整解答；只诊断、挑错、追问。</span></div>
              <div><b>达标即停</b><span>模型到 LV.3 后，队列不再主动推新条目。</span></div>
              <div><b>FSRS-6</b><span>间隔由算法根据你的作答历史估计，没有 1/2/4/7 天固定序列。</span></div>
              <div><b>夜间模式</b><span>23:30–06:00 不推送新任务；仍可自选练习，但系统不鼓励熬夜。</span></div>
              <div><b>校准先行</b><span>计分作答前必须选把握度；样本少于 5 次不下偏差结论。</span></div>
            </div>
          </section>

          <section id="guide-faq" className="guide-section">
            <h2>八、常见问题</h2>
            <div className="guide-faq">
              <details>
                <summary>为什么训练器按钮是灰的 / 点不动？</summary>
                <p>夜间模式不再锁死作答。如果点了没反应，先看页面有没有提示“先选把握度”；把握度是答题前的必选项。若这一组已经做完，也会没有可提交的题。</p>
              </details>
              <details>
                <summary>为什么没有“看答案”和“标记已掌握”？</summary>
                <p>这两个按钮会绕开“先试后看”和“闭卷验证”。答案只在提交后出现；等级只由作答数据推动。不是功能缺失，是刻意设计。</p>
              </details>
              <details>
                <summary>为什么我做了很多题，能力指数没怎么涨？</summary>
                <p>指数看的是掌握度、近 30 天正确率、覆盖和校准，不是次数。反复做同一条目不会涨掌握度；同一模型要 3 道不同条目连续答对，且没有明显高估，才升一档。</p>
              </details>
              <details>
                <summary>一天做不完队列怎么办？</summary>
                <p>不补。第二天引擎会按到期时间重新排序；没有“欠债”机制。把每日上限调小，比硬撑更可持续。</p>
              </details>
              <details>
                <summary>换手机 / 换浏览器，数据还在吗？</summary>
                <p>不在。数据只在本机浏览器。先在旧设备导出 JSON，再到新设备导入。导入会替换当前数据。</p>
              </details>
              <details>
                <summary>AI 报错 / 一直转圈？</summary>
                <p>先点“测试连接”。常见原因是 Base URL 少了 <code>/v1</code>、模型名不对、Key 失效、额度不足，或接口不允许浏览器跨域（CORS）。AI 是可选功能，关掉不影响本地训练。</p>
              </details>
              <details>
                <summary>为什么内容不多？</summary>
                <p>内容全部预置、可审计，宁可少而真，不批量灌水。基本功 16 题、文言 42 条是起步量；扩充时只需往 <code>src/content/</code> 加条目，seed 会自动生成卡片。</p>
              </details>
              <details>
                <summary>这个指数能预测高考分数吗？</summary>
                <p>不能。它只说明“哪些能力有可验证的行为证据、哪些还空着”。它是学习方向的仪表盘，不是考试估分器。</p>
              </details>
            </div>
          </section>

          <section className="guide-section guide-end">
            <h2>最后：怎么用才真的有用</h2>
            <p className="prose">
              不要把这里当成“完成打卡”的地方。每天真正要带走的，是一个更准的词、一条更清楚的结构、一句自己写出来的话。
              做得少但每次都先想、再答、再看，比做得多但一路点过去有用。
            </p>
            <div className="btn-row">
              <button className="btn btn--primary" onClick={() => go('/')}>开始今天</button>
              <button className="btn" onClick={() => go('/foundation')}>先做一道辨异</button>
              <button className="btn" onClick={() => go('/settings')}>去设置</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
