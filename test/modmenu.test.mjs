import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { _internal as M } from '../index.js'

test('expandHome 展开 ~ 且不动绝对路径', () => {
  assert.equal(M.expandHome('~'), homedir())
  assert.equal(M.expandHome('~/x'), join(homedir(), 'x'))
  assert.equal(M.expandHome('C:/somewhere'), 'C:/somewhere')
  assert.equal(M.expandHome(''), '')
  assert.equal(M.expandHome(undefined), '')
})

test('kindOf 按目录名判类别，认不出的算 script', () => {
  assert.equal(M.kindOf(join('a', 'patches')), 'patch')
  assert.equal(M.kindOf('/x/tools'), 'tool')
  assert.equal(M.kindOf('/x/misc'), 'script')
})

test('classifyVersionList 区分「有新版 / 已是最新 / 查不到」', () => {
  const up = M.classifyVersionList({
    status: 'listed',
    installed: '1.0.0',
    versions: [{ version: '1.1.0' }, { version: '1.0.5' }],
  })
  assert.equal(up.latest, '1.1.0')
  assert.equal(up.count, 2)
  assert.equal(up.installed, '1.0.0')
  assert.ok(!up.upToDate)

  // 关键回归：listed + 空列表 = 已是最新，不能算失败
  const same = M.classifyVersionList({ status: 'listed', installed: '1.0.0', versions: [] })
  assert.equal(same.upToDate, true)
  assert.equal(same.latest, '')
  assert.equal(same.problem, undefined)

  const refused = M.classifyVersionList({ status: 'refused', problem: 'network', reason: 'boom' })
  assert.equal(refused.upToDate, undefined)
  assert.equal(refused.latest, '')
  assert.equal(refused.problem, 'network')
  assert.equal(refused.reason, 'boom')
})

test('updatableNames 只留「已装 + 可更新 + 来自 profile」', () => {
  const names = M.updatableNames([
    { name: 'a', update: 'registry', installed: true, availability: 'profile' },
    { name: 'b', update: '', installed: true, availability: 'profile' },
    { name: 'c', update: 'registry', installed: false, availability: 'profile' },
    { name: 'd', update: 'registry', installed: true, availability: 'official' },
    { name: 'e', update: 'git', installed: true, availability: 'profile' },
  ])
  assert.deepEqual(names.sort(), ['a', 'e'])
  assert.deepEqual(M.updatableNames(null), [])
})

test('pickScript 只认扫描结果，路径穿越匹配不上', () => {
  const scripts = [{ id: 'patch:a.mjs', name: 'a.mjs' }]
  assert.equal(M.pickScript(scripts, 'patch:a.mjs')?.name, 'a.mjs')
  assert.equal(M.pickScript(scripts, 'patch:../../windows/system32/calc.exe'), null)
  assert.equal(M.pickScript(scripts, 'patch:a.mjs/../../x'), null)
  assert.equal(M.pickScript(scripts, ''), null)
  assert.equal(M.pickScript(scripts, undefined), null)
})

test('scanScripts 只收支持的扩展名，并按目录名标 kind', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'modmenu-scan-'))
  const patches = join(root, 'patches')
  const tools = join(root, 'tools')
  await fs.mkdir(patches)
  await fs.mkdir(tools)
  await fs.writeFile(join(patches, 'one.mjs'), '/** 第一条说明 */\nconsole.log(1)\n', 'utf8')
  await fs.writeFile(join(tools, 'two.ps1'), '# 第二条说明\nWrite-Output 1\n', 'utf8')
  await fs.writeFile(join(tools, 'skip.txt'), 'x', 'utf8')
  await fs.mkdir(join(tools, 'sub'))

  const prev = M.OPTS.dirs
  M.OPTS.dirs = [
    { dir: patches, kind: 'patch' },
    { dir: tools, kind: 'tool' },
  ]
  try {
    const list = await M.scanScripts()
    assert.deepEqual(list.map((s) => s.name).sort(), ['one.mjs', 'two.ps1'])
    const one = list.find((s) => s.name === 'one.mjs')
    assert.equal(one.kind, 'patch')
    assert.equal(one.runtime, 'node')
    assert.equal(one.checkable, true)
    assert.match(one.summary, /第一条说明/)
    const two = list.find((s) => s.name === 'two.ps1')
    assert.equal(two.kind, 'tool')
    assert.equal(two.runtime, 'powershell')
    assert.equal(two.checkable, false)
    assert.match(two.summary, /第二条说明/)
  } finally {
    M.OPTS.dirs = prev
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('scanScripts 遇到不存在的目录不抛错', async () => {
  const prev = M.OPTS.dirs
  M.OPTS.dirs = [{ dir: join(tmpdir(), 'modmenu-does-not-exist-xyz'), kind: 'patch' }]
  try {
    assert.deepEqual(await M.scanScripts(), [])
  } finally {
    M.OPTS.dirs = prev
  }
})

test('runScript 跑 node：成功、失败退出码、stderr 都拿得到', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'modmenu-run-'))
  const okFile = join(root, 'ok.mjs')
  const badFile = join(root, 'bad.mjs')
  await fs.writeFile(okFile, "console.log('hello-out')\n", 'utf8')
  await fs.writeFile(badFile, "console.error('boom')\nprocess.exit(3)\n", 'utf8')
  try {
    const ok = await M.runScript({ path: okFile, runtime: 'node', checkable: false }, 'run')
    assert.equal(ok.ok, true)
    assert.equal(ok.code, 0)
    assert.match(ok.stdout, /hello-out/)

    const bad = await M.runScript({ path: badFile, runtime: 'node', checkable: false }, 'run')
    assert.equal(bad.ok, false)
    assert.equal(bad.code, 3)
    assert.match(bad.stderr, /boom/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('runScript 把 powershell 的 GBK 输出解成中文', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'modmenu-ps-'))
  const f = join(root, 'cn.ps1')
  // 带 BOM 写，Windows PowerShell 5.1 才会按 UTF-8 读这个文件
  await fs.writeFile(f, Buffer.from('\uFEFF' + 'Write-Output "中文测试"\n', 'utf8'))
  try {
    const r = await M.runScript({ path: f, runtime: 'powershell', checkable: false }, 'run')
    assert.equal(r.ok, true, r.stderr)
    assert.match(r.stdout, /中文测试/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('applyConfig 夹取越界值', () => {
  M.applyConfig({ runTimeoutMs: 10, checkTimeoutMs: 999999 })
  assert.equal(M.OPTS.runTimeoutMs, 60_000) // 太小，不采用
  assert.equal(M.OPTS.checkTimeoutMs, 8_000) // 太大，不采用

  M.applyConfig({ runTimeoutMs: 30_000, checkTimeoutMs: 5_000 })
  assert.equal(M.OPTS.runTimeoutMs, 30_000)
  assert.equal(M.OPTS.checkTimeoutMs, 5_000)
})
