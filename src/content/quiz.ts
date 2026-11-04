import { CLASSICAL_ENTRIES } from './classical'
import { IMAGERY, TECHNIQUES } from './appreciation'
import type { ClassicalEntry, Imagery, Technique } from './types'
import { seededShuffle } from '../engine/practice'

const FILLERS = ['与本句无关的义项', '此处无实义', '表示反问语气', '指代前文整体']

function fillToFour(correct: string, pool: string[], seed: string): string[] {
  const picked: string[] = []
  for (const value of pool) {
    if (picked.length >= 3) break
    if (value && value !== correct && !picked.includes(value) && !FILLERS.slice(0, 3).includes(value)) {
      picked.push(value)
    }
  }
  for (const filler of FILLERS) {
    if (picked.length >= 3) break
    if (!picked.includes(filler)) picked.push(filler)
  }
  return seededShuffle([correct, ...picked], seed)
}

/** 认读选项：优先同词的其他义项，再取同词性，最后取全书。 */
export function recognitionOptions(entry: ClassicalEntry): string[] {
  const pool = CLASSICAL_ENTRIES.filter((e) => e.id !== entry.id && e.sense !== entry.sense)
  const ordered = [
    ...pool.filter((e) => e.word === entry.word),
    ...pool.filter((e) => e.type === entry.type),
    ...seededShuffle(pool, entry.id),
  ].map((e) => e.sense)
  return fillToFour(entry.sense, ordered, `${entry.id}-sense`)
}

export function techniqueOptions(tech: Technique): string[] {
  const pool = TECHNIQUES.filter((t) => t.id !== tech.id).map((t) => t.effect)
  return fillToFour(tech.effect, seededShuffle(pool, tech.id), `${tech.id}-effect`)
}

export function imageryOptions(img: Imagery): string[] {
  const pool = IMAGERY.filter((i) => i.id !== img.id).map((i) => i.emotion)
  return fillToFour(img.emotion, seededShuffle(pool, img.id), `${img.id}-emotion`)
}

/** 产出卡词选项：同词性优先，但答案仍要求用户自己输入（这里只做提示，不预设答案）。 */
export function wordHints(entry: ClassicalEntry): string[] {
  const pool = CLASSICAL_ENTRIES.filter(
    (e) => e.id !== entry.id && e.type === entry.type && e.word !== entry.word,
  ).map((e) => e.word)
  return seededShuffle([...new Set(pool)], entry.id).slice(0, 3)
}
