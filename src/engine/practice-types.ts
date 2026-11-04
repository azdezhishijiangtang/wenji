import type { Item } from './types'

export type DrillKind =
  | 'cloze'
  | 'argument'
  | 'classical'
  | 'writing'
  | 'appreciation'
  | 'syntax'
  | 'foundation'

export interface GroupView {
  id: string
  title: string
  subtitle: string
  kind: DrillKind
  items: Item[]
}
