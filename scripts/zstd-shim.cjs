/**
 * Node < 23 的 zlib 没有 zstd 支持，而 jsdom 30 → undici 8 在模块顶层直接
 * 调用 `createZstdDecompress.bind(...)`，导致 vitest 的 worker 一启动就抛
 * TypeError（表现为某个测试文件完全没跑、npm test 退出码 1）。
 *
 * 这里只补一个占位实现让加载期绑定成立：测试环境不会真的收到 zstd 响应，
 * 真用到时会给出明确错误。Node ≥ 23 自带实现，本文件不会覆盖它。
 * 由 run-tests.mjs 通过 NODE_OPTIONS 预加载，主进程与 fork worker 都会生效。
 */
const zlib = require('node:zlib')
const { Transform } = require('node:stream')

const unsupported = (name) => () =>
  new Transform({
    transform(_chunk, _enc, cb) {
      cb(new Error(`${name} 需要 Node.js 23+（当前 ${process.versions.node}）`))
    },
  })

if (typeof zlib.createZstdDecompress !== 'function') {
  zlib.createZstdDecompress = unsupported('zstd 解压')
}
if (typeof zlib.createZstdCompress !== 'function') {
  zlib.createZstdCompress = unsupported('zstd 压缩')
}
