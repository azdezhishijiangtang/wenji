/**
 * 基本功：不是题型，是三种底层操作。
 *  - 辨异：一个词的选择，改变句子的预设、范围或语气。
 *  - 重组：句子的顺序，就是思路的顺序。
 *  - 转化（放在表达工坊）：同一意义在概括、展开、改写之间移动。
 *
 * 这里的题目故意不做成“考试选择题”的样子：先选，再写一句为什么，
 * 最后才看到语义轴。答案本身不值钱，能说出差别才值钱。
 */

export interface SemanticItem {
  id: string
  title: string
  context: string
  a: string
  b: string
  answer: 'a' | 'b'
  /** 一句话点出这两个词真正的差别，而不是背词典。 */
  axis: string
  aNote: string
  bNote: string
  model_tag: 'foundation.semantic'
}

export const FOUNDATION_SEMANTIC: SemanticItem[] = [
  {
    id: 'sem-1',
    title: '充分，还是必要',
    context: '____你愿意，这件事今天就能定下来。',
    a: '只要',
    b: '只有',
    answer: 'a',
    axis: '充分条件 / 必要条件：“只要 P 就 Q”说 P 足够了；“只有 P 才 Q”说 P 不可少。',
    aNote: '“就能”说明“你愿意”是足够的条件；只要出现，结果就能发生。',
    bNote: '“只有”后面通常接“才”，把条件说成不可少；本句没有“才”，语气也不对。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-2',
    title: '可能不，还是确定不',
    context: '他____不知道这件事，可能只是装作不知道。',
    a: '未必',
    b: '并非',
    answer: 'a',
    axis: '或然否定 / 必然否定：未必 = 可能不；并非 = 确定不。',
    aNote: '后文“可能只是”说明作者留了余地，没有把否定说死。',
    bNote: '“并非”是确定否定，会和“可能”打架。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-3',
    title: '差一点，还是夸张',
    context: '他____站不稳，伸手扶住了墙。',
    a: '几乎',
    b: '简直',
    answer: 'a',
    axis: '接近 / 夸张：几乎 = 差一点就这样；简直 = 夸张地等于。',
    aNote: '人确实扶了墙，说明“站不稳”接近发生，但还没有完全发生。',
    bNote: '“简直”是修辞上的夸张，不表示“接近事实”。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-4',
    title: '到某时为止，还是到此停止',
    context: '报名工作将于本周五下午五点____。',
    a: '截至',
    b: '截止',
    answer: 'b',
    axis: '统计截止点 / 动作终止：截至 = 到某时为止（后面常接数据）；截止 = 到某时停止。',
    aNote: '“截至”后面通常接“目前”“某日”等统计范围，不说“将于……截至”。',
    bNote: '“将于……截止”表示报名到五点停止。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-5',
    title: '资格，还是支配力',
    context: '公民依法行使自己的____。',
    a: '权利',
    b: '权力',
    answer: 'a',
    axis: '依法可主张的资格 / 支配他人的力量：权利对应“可以做什么”，权力对应“能支配谁”。',
    aNote: '公民行使的是法律赋予的资格。',
    bNote: '“权力”通常属于机关、职位，不是公民个人的资格。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-6',
    title: '固定搭配里的否定',
    context: '他的结论有完整数据支撑，不容____。',
    a: '质疑',
    b: '置疑',
    answer: 'b',
    axis: '一般动词 / 否定式固定搭配：置疑只用于“不容置疑、无可置疑”；质疑可以独立使用。',
    aNote: '“质疑”本身可以独立使用，但“不容质疑”不是固定说法。',
    bNote: '“不容置疑”是固定搭配，表示没有怀疑的余地。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-7',
    title: '不认同，还是不在意',
    context: '大家劝他早点睡，他____，照样熬到凌晨。',
    a: '不以为然',
    b: '不以为意',
    answer: 'b',
    axis: '认为不对 / 不放在心上：不以为然 = 不同意；不以为意 = 不重视、不理会。',
    aNote: '“不以为然”是觉得别人的说法不对，不是“没当回事”。',
    bNote: '后文“照样熬到凌晨”说明他把劝告放在一边，不重视。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-8',
    title: '好坏混杂，还是以假乱真',
    context: '展台上真品与赝品____，参观者很难分辨。',
    a: '鱼龙混杂',
    b: '鱼目混珠',
    answer: 'a',
    axis: '成分混杂 / 以假充真：鱼龙混杂 = 好的坏的混在一起；鱼目混珠 = 拿假的冒充真的。',
    aNote: '“真品与赝品”是两种成分混在一起，不是拿赝品去冒充真品。',
    bNote: '“鱼目混珠”是动词性的“以假乱真”，主语通常是赝品或造假者。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-9',
    title: '被环境浸润，还是听得多了',
    context: '他从小在戏班长大，____，对昆曲的腔调烂熟于心。',
    a: '耳濡目染',
    b: '耳熟能详',
    answer: 'a',
    axis: '长期环境影响 / 听得多而熟悉：耳濡目染强调被环境改变；耳熟能详强调听得多了、熟悉到能细说。',
    aNote: '“在戏班长大”强调的是环境长期浸润。',
    bNote: '“耳熟能详”只说明熟悉，不说明环境对人的塑造。',
    model_tag: 'foundation.semantic',
  },
  {
    id: 'sem-10',
    title: '写作快，还是事情容易',
    context: '这篇短文他____，半小时就写完了。',
    a: '一挥而就',
    b: '一蹴而就',
    answer: 'a',
    axis: '写作/书画完成得快 / 事情轻易成功：一挥而就用于写作、书画；一蹴而就用于事业、任务。',
    aNote: '“这篇短文”是写作对象，用“一挥而就”。',
    bNote: '“一蹴而就”多指事业、改革、任务，不指写文章。',
    model_tag: 'foundation.semantic',
  },
]

export interface CoherenceSentence {
  id: string
  text: string
}

export interface CoherenceItem {
  id: string
  title: string
  sentences: CoherenceSentence[]
  /** 正确顺序，存句子 id。 */
  order: string[]
  /** 为什么这样排：指出连接词、指代、因果或转折。 */
  logic: string
  model_tag: 'foundation.coherence'
}

export const FOUNDATION_COHERENCE: CoherenceItem[] = [
  {
    id: 'coh-1',
    title: '读书的两种速度',
    sentences: [
      { id: 's1', text: '有些书只需要知道结论，快读即可。' },
      { id: 's2', text: '但有些书的价值不在结论，而在论证的过程。' },
      { id: 's3', text: '因此，读书之前先要判断：这本书属于哪一种。' },
      { id: 's4', text: '对后者，慢下来跟着作者走一遍，才算真正读过。' },
      { id: 's5', text: '用同一种速度对付所有书，是浪费。' },
    ],
    order: ['s1', 's2', 's3', 's4', 's5'],
    logic: '先分两类（有些……但有些……），再由“因此”给出行动，最后用“同一种速度”收束。',
    model_tag: 'foundation.coherence',
  },
  {
    id: 'coh-2',
    title: '初稿不是成品',
    sentences: [
      { id: 's1', text: '初稿的作用，是把模糊的想法先倒出来。' },
      { id: 's2', text: '这时候的文字往往粗糙，甚至前后矛盾。' },
      { id: 's3', text: '所以初稿写完，不要立刻把它当成成品。' },
      { id: 's4', text: '放一放再回来看，才容易发现结构上的断点。' },
      { id: 's5', text: '修改不是给句子抛光，而是重新检查思路。' },
    ],
    order: ['s1', 's2', 's3', 's4', 's5'],
    logic: '先定义初稿，再说它的粗糙，由“所以”推出“不要当成品”，最后把“修改”重新定义。',
    model_tag: 'foundation.coherence',
  },
  {
    id: 'coh-3',
    title: '让步不是认输',
    sentences: [
      { id: 's1', text: '让步不是承认自己错了。' },
      { id: 's2', text: '它先把对方最强的理由说出来。' },
      { id: 's3', text: '然后指出，这个理由为什么还不足以推翻自己的观点。' },
      { id: 's4', text: '这样做，反而让论证更可信。' },
      { id: 's5', text: '回避对方的理由，才会让人觉得心虚。' },
    ],
    order: ['s1', 's2', 's3', 's4', 's5'],
    logic: '先否定误解，再解释“先……然后……”的动作，最后用“反而”和“回避”对照效果。',
    model_tag: 'foundation.coherence',
  },
  {
    id: 'coh-4',
    title: '词义的边界',
    sentences: [
      { id: 's1', text: '一个词的含义，往往由它排除的东西决定。' },
      { id: 's2', text: '比如“可能”排除的是“必然”。' },
      { id: 's3', text: '所以读文章时，要留意那些看起来不起眼的副词。' },
      { id: 's4', text: '它们常常在暗中限定句子的范围。' },
      { id: 's5', text: '忽略这些词，就会把作者的话读得过满。' },
    ],
    order: ['s1', 's2', 's3', 's4', 's5'],
    logic: '先给判断，再用“比如”举例，由“所以”转向阅读方法，最后说忽略的后果。',
    model_tag: 'foundation.coherence',
  },
  {
    id: 'coh-5',
    title: '传统是一条河',
    sentences: [
      { id: 's1', text: '传统不是一件放在博物馆里的东西。' },
      { id: 's2', text: '它更像一条河，每一代人都在其中添水。' },
      { id: 's3', text: '因此，继承传统不等于照搬。' },
      { id: 's4', text: '真正的继承，是在理解之后做出自己的选择。' },
      { id: 's5', text: '只把旧形式搬过来，反而会让传统失去生命。' },
    ],
    order: ['s1', 's2', 's3', 's4', 's5'],
    logic: '先破“博物馆”的比喻，再立“河”的比喻，由“因此”推出“不等于照搬”，最后对照两种继承。',
    model_tag: 'foundation.coherence',
  },
  {
    id: 'coh-6',
    title: 'AI 与先写一遍',
    sentences: [
      { id: 's1', text: 'AI 可以在一秒内生成一段通顺的文字。' },
      { id: 's2', text: '但通顺不等于想清楚。' },
      { id: 's3', text: '写作的真正难点，是把模糊的感觉逼成明确的判断。' },
      { id: 's4', text: '这个过程只能由写作者自己完成。' },
      { id: 's5', text: '所以，AI 越方便，越要保留自己先写一遍的习惯。' },
    ],
    order: ['s1', 's2', 's3', 's4', 's5'],
    logic: '先承认 AI 的能力，用“但”转折到“想清楚”，再指出写作难点，由“所以”落到习惯。',
    model_tag: 'foundation.coherence',
  },
]
