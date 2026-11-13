/**
 * 模组菜单（dsh-modmenu）Host 半边。
 *
 * 只做三件事：
 *   1. 扫 ~/.dsh/patches 和 ~/.dsh/tools 下的脚本，读出名字、大小、首行说明；
 *   2. 列出当前注册的工具（ctx.tools.schemas）和已装插件（pluginManager.listBundles）；
 *   3. 提供受控的执行与更新通道：跑脚本、查更新、单个更新、批量更新。
 *
 * 数据走 /modmenu/*。执行侧只认白名单目录里的文件，且要求自定义请求头
 * （跨站请求带不了它，预检会先挡住）。
 */

import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join, extname, sep } from 'node:path'
import { spawn } from 'node:child_process'

export const name = 'modmenu'
export const inject = ['webServer']

const HOME = homedir()
const DSH_DIR = join(HOME, '.dsh')

/** 默认扫描两个约定目录；别人可以在 config.scanDirs 里换成自己的。 */
const DEFAULT_DIRS = [
  { dir: join(DSH_DIR, 'patches'), kind: 'patch' },
  { dir: join(DSH_DIR, 'tools'), kind: 'tool' },
]

/** 运行期配置（apply 时按 config 覆盖一次）。 */
const OPTS = {
  dirs: DEFAULT_DIRS,
  runTimeoutMs: 60_000,
  checkTimeoutMs: 8_000,
}

const OUTPUT_LIMIT = 40_000
const PREFIX = '/modmenu'

function expandHome(p) {
  const s = String(p ?? '').trim()
  if (!s) return ''
  if (s === '~') return HOME
  if (s.startsWith('~/') || s.startsWith('~\\')) return join(HOME, s.slice(2))
  return s
}

/** 目录名里能看出类别的就沿用，看不出来就叫 script。 */
function kindOf(dir) {
  if (/[\\/]patches[\\/]?$/i.test(dir)) return 'patch'
  if (/[\\/]tools[\\/]?$/i.test(dir)) return 'tool'
  return 'script'
}

function applyConfig(config) {
  const dirs = Array.isArray(config?.scanDirs)
    ? config.scanDirs.map((d) => expandHome(d)).filter(Boolean).map((dir) => ({ dir, kind: kindOf(dir) }))
    : []
  if (dirs.length) OPTS.dirs = dirs

  const run = Number(config?.runTimeoutMs)
  if (Number.isFinite(run) && run >= 5_000 && run <= 600_000) OPTS.runTimeoutMs = Math.round(run)

  const check = Number(config?.checkTimeoutMs)
  if (Number.isFinite(check) && check >= 2_000 && check <= 60_000) OPTS.checkTimeoutMs = Math.round(check)
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function writeJson(res, body, status = 200) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

/** 从文件头几行里猜一句说明：第一个注释块的第一行有效内容。 */
async function firstComment(file) {
  let text = ''
  try {
    const fh = await fs.open(file, 'r')
    try {
      const buf = Buffer.alloc(4096)
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
      text = buf.subarray(0, bytesRead).toString('utf8')
    } finally {
      await fh.close()
    }
  } catch {
    return ''
  }
  const lines = text.split(/\r?\n/).slice(0, 40)
  const cleaned = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#!/')) continue
    if (line.startsWith('/**') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('//') || line.startsWith('#')) {
      const body = line.replace(/^(\/\*\*?|\*|#+|\/\/)\s?/, '').replace(/\*\/$/, '').trim()
      if (body) cleaned.push(body)
      continue
    }
    if (cleaned.length) break
  }
  const first = cleaned.find((s) => s && !/^@/.test(s)) ?? ''
  return first.slice(0, 120)
}

function runtimeOf(ext) {
  if (ext === '.mjs' || ext === '.js' || ext === '.cjs') return 'node'
  if (ext === '.ps1') return 'powershell'
  if (ext === '.bat' || ext === '.cmd') return 'cmd'
  return ''
}

async function scanScripts() {
  const out = []
  for (const root of OPTS.dirs) {
    let entries = []
    try {
      entries = await fs.readdir(root.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const full = join(root.dir, entry.name)
      const ext = extname(entry.name).toLowerCase()
      const runtime = runtimeOf(ext)
      if (!runtime) continue
      const st = await fs.stat(full).catch(() => null)
      if (!st) continue
      out.push({
        id: `${root.kind}:${entry.name}`,
        name: entry.name,
        kind: root.kind,
        path: full,
        ext,
        runtime,
        size: st.size,
        mtime: st.mtimeMs,
        summary: await firstComment(full),
        checkable: runtime === 'node',
      })
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)))
}

function listTools(tools) {
  if (!tools?.schemas) return { error: 'tools 服务不可用' }
  try {
    const schemas = tools.schemas() ?? []
    return schemas
      .map((s) => ({ name: String(s?.name ?? ''), description: String(s?.description ?? '') }))
      .filter((t) => t.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    return { error: String(err?.message ?? err) }
  }
}

async function listPlugins(pm) {
  if (!pm?.listBundles) return { error: 'pluginManager 不可用' }
  try {
    const bundles = await pm.listBundles()
    return (Array.isArray(bundles) ? bundles : []).map((b) => ({
      name: String(b?.name ?? ''),
      version: String(b?.version ?? ''),
      enabled: b?.enabled !== false,
      official: Boolean(b?.official),
      availability: String(b?.availability ?? ''),
      installed: Boolean(b?.installed),
      removable: Boolean(b?.removable),
      update: b?.update ? String(b.update) : '',
      source: String(b?.installTarget?.spec ?? b?.source ?? ''),
      description: String(b?.description ?? ''),
    }))
  } catch (err) {
    return { error: String(err?.message ?? err) }
  }
}

/** 只在 profile 里、且声明可更新的包才去问 registry。 */
function updatableNames(bundles) {
  return (Array.isArray(bundles) ? bundles : [])
    .filter((b) => b?.update && b?.installed && b?.availability === 'profile')
    .map((b) => String(b.name))
}

/**
 * 把 listVersions 的三种返回归成统一形状。
 * 「listed 但版本列表为空」是**已是最新**，不是失败——这条曾经判错过。
 */
function classifyVersionList(list) {
  const installed = String(list?.installed ?? '')
  if (list?.status === 'listed' && list.versions?.length) {
    return {
      installed,
      latest: String(list.versions[0].version ?? ''),
      count: list.versions.length,
      registry: String(list.registry ?? ''),
      status: 'listed',
    }
  }
  if (list?.status === 'listed') {
    return { installed, latest: '', upToDate: true, status: 'listed' }
  }
  return {
    installed,
    latest: '',
    status: String(list?.status ?? 'unknown'),
    problem: String(list?.problem ?? ''),
    reason: String(list?.reason ?? ''),
  }
}

/** 按 id 取脚本；只认扫描结果里的原文，路径穿越自然匹配不上。 */
function pickScript(scripts, id) {
  const key = String(id ?? '')
  if (!key) return null
  return scripts.find((s) => s.id === key) ?? null
}

/** 逐个问 registry：有没有比装着的更新的版本。四个并发，失败的重试一次。 */
async function checkUpdates(pm, names) {
  if (!pm?.listVersions) return { error: 'pluginManager 不可用' }
  const out = []

  const ask = async (name) => {
    try {
      return await pm.listVersions(name, undefined, AbortSignal.timeout(OPTS.checkTimeoutMs))
    } catch (err) {
      return { status: 'error', problem: 'network', reason: String(err?.message ?? err) }
    }
  }

  const queue = [...names]
  const worker = async () => {
    while (queue.length) {
      const name = queue.shift()
      let list = await ask(name)
      // registry 直连常常抖一下：refused / 异常时等一拍再问一次
      if (list?.status !== 'listed') {
        await new Promise((r) => setTimeout(r, 1200))
        const again = await ask(name)
        if (again?.status === 'listed') list = again
        else if (!list?.reason && again?.reason) list = again
      }

      const c = classifyVersionList(list)
      out.push({ name, ...c })
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, queue.length)) }, worker))
  return out
}

/** 全部更新的后台任务（同一时间只允许一个）。 */
let updateAllJob = null

async function runUpdateAll(pm, job) {
  try {
    const bundles = await pm.listBundles()
    const names = updatableNames(bundles)
    job.total = names.length

    for (const name of names) {
      if (!updateAllJob || updateAllJob.id !== job.id) return
      job.current = name
      try {
        const list = await pm.listVersions(name, undefined, AbortSignal.timeout(Math.min(60_000, OPTS.checkTimeoutMs * 3)))
        if (list?.status !== 'listed' || !list.versions?.length) {
          job.results.push({
            name,
            ok: false,
            skipped: true,
            error: String(list?.reason ?? list?.problem ?? (list?.status === 'listed' ? '已是最新' : '没有可读的版本列表')),
          })
          continue
        }
        const target = String(list.versions[0].version ?? '')
        const out = await pm.updateBundle(name, target)
        const change = out?.result ?? {}
        job.results.push({
          name,
          ok: change.application !== 'failed',
          from: String(out?.from ?? list.installed ?? ''),
          to: String(out?.to ?? target),
          application: String(change.application ?? ''),
          error: change.error ? String(change.error.code ?? '') : '',
        })
      } catch (err) {
        job.results.push({ name, ok: false, error: String(err?.message ?? err) })
      }
    }
  } catch (err) {
    job.error = String(err?.message ?? err)
  } finally {
    job.running = false
    job.current = ''
    job.finishedAt = Date.now()
  }
}

function runScript(script, mode) {
  return new Promise((resolve) => {
    const started = Date.now()
    const args = []
    let command = script.path
    if (script.runtime === 'node') {
      args.push(script.path)
      if (mode === 'check' && script.checkable) args.push('--check')
      command = process.execPath
    } else if (script.runtime === 'powershell') {
      args.push('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script.path)
      if (mode === 'check') args.push('-DryRun')
      command = 'powershell.exe'
    } else if (script.runtime === 'cmd') {
      args.push('/c', script.path)
      command = 'cmd.exe'
    }

    let child
    try {
      child = spawn(command, args, {
        cwd: script.path.slice(0, script.path.lastIndexOf(sep)) || DSH_DIR,
        windowsHide: true,
      })
    } catch (err) {
      resolve({ ok: false, code: -1, stdout: '', stderr: String(err?.message ?? err), ms: 0 })
      return
    }

    let outChunks = []
    let errChunks = []
    let outSize = 0
    let errSize = 0
    // Windows 原生程序按控制台代码页输出，中文默认是 GBK
    const decode = (chunks) => {
      const buf = Buffer.concat(chunks)
      if (script.runtime === 'powershell' || script.runtime === 'cmd') {
        try { return new TextDecoder('gbk').decode(buf) } catch { /* 退回 utf8 */ }
      }
      return buf.toString('utf8')
    }
    let done = false
    const finish = (payload) => {
      if (done) return
      done = true
      clearTimeout(timer)
      const extra = payload?.stderrText ? `${payload.stderrText}\n` : ''
      const { stderrText, ...rest } = payload ?? {}
      resolve({
        ...rest,
        stdout: decode(outChunks).slice(0, OUTPUT_LIMIT),
        stderr: (extra + decode(errChunks)).slice(0, OUTPUT_LIMIT),
        ms: Date.now() - started,
      })
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      finish({ ok: false, code: -2, stderrText: `（超时 ${OPTS.runTimeoutMs / 1000}s，已终止）` })
    }, OPTS.runTimeoutMs)

    child.stdout.on('data', (c) => { if (outSize < OUTPUT_LIMIT) { outChunks.push(c); outSize += c.length } })
    child.stderr.on('data', (c) => { if (errSize < OUTPUT_LIMIT) { errChunks.push(c); errSize += c.length } })
    child.on('error', (err) => finish({ ok: false, code: -1, stderrText: String(err?.message ?? err) }))
    child.on('close', (code) => finish({ ok: code === 0, code: code ?? -3 }))
  })
}

async function readBody(request) {
  const limit = 64 * 1024
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function apply(ctx, config = {}) {
  applyConfig(config)

  // 两个可选服务：装上才有，没装时对应分区留空，不影响其它部分
  let toolsSvc = null
  let pluginManager = null
  ctx.inject(['tools'], (scoped) => { toolsSvc = scoped.tools })
  ctx.inject(['pluginManager'], (scoped) => { pluginManager = scoped.pluginManager })

  ctx.effect(() => {
    const disposers = []

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/state`,
      resource: async () => {
        try {
          const scripts = await scanScripts()
          return json({
            scripts,
            tools: listTools(toolsSvc),
            plugins: await listPlugins(pluginManager),
            generatedAt: Date.now(),
          })
        } catch (err) {
          return json({ error: String(err?.message ?? err), stack: String(err?.stack ?? '') }, 500)
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/run`,
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') return writeJson(res, { error: '只接受 POST' }, 405)
          if (req.headers['x-modmenu-request'] !== '1') return writeJson(res, { error: '缺少请求头' }, 403)

          let payload
          try {
            payload = JSON.parse((await readBody(req)) || '{}')
          } catch {
            return writeJson(res, { error: '请求体不是 JSON' }, 400)
          }
          const id = String(payload?.id ?? '')
          const mode = payload?.mode === 'check' ? 'check' : 'run'

          const script = pickScript(await scanScripts(), id)
          if (!script) return writeJson(res, { error: '没有这个脚本' }, 404)

          const result = await runScript(script, mode)
          return writeJson(res, { ...result, script: { id: script.id, name: script.name, mode } })
        } catch (err) {
          return writeJson(res, { error: String(err?.message ?? err), stack: String(err?.stack ?? '') }, 500)
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/updates`,
      resource: async () => {
        try {
          const pm = pluginManager
          if (!pm?.listBundles) return json({ error: 'pluginManager 不可用' }, 500)
          const names = updatableNames(await pm.listBundles())
          const results = await checkUpdates(pm, names)
          return json({ results, checkedAt: Date.now(), candidates: names.length })
        } catch (err) {
          return json({ error: String(err?.message ?? err) }, 500)
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/update`,
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') return writeJson(res, { error: '只接受 POST' }, 405)
          if (req.headers['x-modmenu-request'] !== '1') return writeJson(res, { error: '缺少请求头' }, 403)
          const pm = pluginManager
          if (!pm?.updateBundle || !pm?.listBundles) return writeJson(res, { error: 'pluginManager 不可用' }, 500)

          let payload
          try {
            payload = JSON.parse((await readBody(req)) || '{}')
          } catch {
            return writeJson(res, { error: '请求体不是 JSON' }, 400)
          }
          const name = String(payload?.name ?? '')
          const version = String(payload?.version ?? '')
          if (!name || !version) return writeJson(res, { error: '缺少 name 或 version' }, 400)

          const hit = (await pm.listBundles()).find(
            (b) => b?.name === name && b?.update && b?.installed && b?.availability === 'profile',
          )
          if (!hit) return writeJson(res, { error: '这个包不在可更新列表里' }, 403)

          const out = await pm.updateBundle(name, version)
          const change = out?.result ?? {}
          return writeJson(res, {
            ok: change.application !== 'failed',
            from: String(out?.from ?? ''),
            to: String(out?.to ?? ''),
            step: String(out?.step ?? ''),
            application: String(change.application ?? ''),
            changed: Boolean(change.changed),
            error: change.error ? String(change.error.code ?? '') : '',
            diagnostic: change.error?.diagnostic ? String(change.error.diagnostic).slice(0, 400) : '',
            restartReason: String(change.restartReason ?? ''),
          })
        } catch (err) {
          return writeJson(res, { ok: false, error: String(err?.message ?? err) }, 500)
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/update-all`,
      handler: async (req, res) => {
        try {
          if (req.method !== 'POST') return writeJson(res, { error: '只接受 POST' }, 405)
          if (req.headers['x-modmenu-request'] !== '1') return writeJson(res, { error: '缺少请求头' }, 403)
          const pm = pluginManager
          if (!pm?.updateBundle) return writeJson(res, { error: 'pluginManager 不可用' }, 500)
          if (updateAllJob?.running) return writeJson(res, { error: '已经有一个全部更新在跑', job: updateAllJob }, 409)

          const job = {
            id: `upd-${Date.now()}`,
            running: true,
            startedAt: Date.now(),
            finishedAt: 0,
            total: 0,
            current: '',
            results: [],
            error: '',
          }
          updateAllJob = job
          // 不 await：更新会触发组合重载，长请求容易被掐断。客户端轮询状态。
          void runUpdateAll(pm, job)
          return writeJson(res, { jobId: job.id, running: true })
        } catch (err) {
          return writeJson(res, { error: String(err?.message ?? err) }, 500)
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/update-all/status`,
      resource: async () => json({ job: updateAllJob }),
    }))

    return () => {
      for (const dispose of disposers) {
        try { dispose() } catch { /* ignore */ }
      }
    }
  })
}

// 仅供测试：这些是纯函数，不打网络、不碰 DSH 服务
export const _internal = {
  expandHome,
  kindOf,
  applyConfig,
  OPTS,
  scanScripts,
  runScript,
  pickScript,
  updatableNames,
  classifyVersionList,
  firstComment,
  runtimeOf,
}