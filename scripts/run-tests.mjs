/**
 * 跨平台测试入口：通过 NODE_OPTIONS 给主进程与所有 vitest fork worker
 * 预加载 zstd 兼容 shim（仅 Node < 23 需要）。
 *
 * 不能直接写 `NODE_OPTIONS=... vitest run`（Windows 不兼容），也不能只给
 * 主进程加 --require（fork worker 不会继承），所以统一由这里启动。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const shim = join(here, 'zstd-shim.cjs')
const vitestBin = join(root, 'node_modules', 'vitest', 'vitest.mjs')

if (!existsSync(vitestBin)) {
  console.error('找不到 vitest，请先运行 npm ci / npm install')
  process.exit(1)
}

const preload = `--require=${JSON.stringify(shim)}`
const nodeOptions = [process.env.NODE_OPTIONS, preload].filter(Boolean).join(' ')

const result = spawnSync(
  process.execPath,
  [vitestBin, 'run', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: root, env: { ...process.env, NODE_OPTIONS: nodeOptions } },
)
process.exit(result.status ?? 1)
