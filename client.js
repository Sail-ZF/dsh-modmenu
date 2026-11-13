/**
 * 模组菜单（dsh-modmenu）Client 半边。
 *
 * 形态照《我的世界》的 Mod Menu：左边一列（搜索 + 列表），右边一块详情。
 * 三个分类：插件 / 工具 / 脚本。脚本能直接跑，输出就地显示。
 *
 * 不引入任何宿主 Client 包，只 require('react')——React 由宿主的模块表提供。
 */
window.__ModuleLoader__.load({
  id: 'dsh-modmenu',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback } = React

    const CSS = `
.ocean-root {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 1.5;
}
.ocean-head { padding: 16px 20px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.ocean-headrow { display: flex; align-items: baseline; gap: 10px; }
.ocean-title { font-size: 16px; font-weight: 600; letter-spacing: 0.5px; }
.ocean-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ocean-grow { flex: 1; }
.ocean-btn {
  border: 1px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 3px 10px;
  font-size: 12px; cursor: pointer;
}
.ocean-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.ocean-btn[data-kind="primary"] {
  border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary);
}
.ocean-btn:disabled { opacity: 0.45; cursor: default; }
.ocean-tabs { display: flex; gap: 2px; margin: 12px 0 8px; }
.ocean-tab {
  padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
  color: var(--dsw-alias-label-secondary); user-select: none;
}
.ocean-tab[data-on="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.ocean-tab .n { opacity: 0.6; margin-left: 4px; font-size: 11px; }
.ocean-bulk { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0 0 8px; }
.ocean-note { font-size: 12px; color: var(--dsw-alias-state-warn-primary); margin: 0 0 8px; }
.ocean-tab .upd { color: var(--dsw-alias-state-success-primary); margin-left: 5px; font-size: 11px; font-weight: 600; }
.ocean-search {
  width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 6px 10px;
  border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-size: 12px; outline: none;
}
.ocean-search:focus { border-color: var(--dsw-alias-border-l2); }
.ocean-body { display: flex; flex: 1; min-height: 0; }
.ocean-list { width: 300px; flex: none; overflow: auto; border-right: 1px solid var(--dsw-alias-border-l1); padding: 6px 0; }
.ocean-row {
  display: flex; gap: 10px; align-items: flex-start; padding: 7px 14px;
  cursor: pointer; border-left: 2px solid transparent;
}
.ocean-row:hover { background: var(--dsw-alias-bg-layer-1); }
.ocean-row[data-on="true"] {
  background: var(--dsw-alias-bg-layer-2);
  border-left-color: var(--dsw-alias-brand-primary);
}
.ocean-dot { width: 8px; height: 8px; border-radius: 2px; margin-top: 6px; flex: none; }
.ocean-rowmain { min-width: 0; flex: 1; }
.ocean-rowname {
  font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ocean-rowmeta { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ocean-detail { flex: 1; min-width: 0; overflow: auto; padding: 18px 22px 28px; }
.ocean-dtitle { font-size: 15px; font-weight: 600; word-break: break-all; }
.ocean-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 14px; }
.ocean-badge {
  font-size: 11px; padding: 1px 8px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
}
.ocean-kv { display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; margin-bottom: 14px; }
.ocean-kv .k { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ocean-kv .v { font-size: 12px; word-break: break-all; }
.ocean-desc { color: var(--dsw-alias-label-secondary); font-size: 12.5px; margin-bottom: 16px; white-space: pre-wrap; }
.ocean-actions { display: flex; gap: 8px; margin-bottom: 16px; }
.ocean-out {
  background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px; padding: 10px 12px; font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11.5px; white-space: pre-wrap; word-break: break-all; max-height: 320px; overflow: auto;
}
.ocean-out[data-ok="false"] { border-color: var(--dsw-alias-state-error-primary); }
.ocean-empty { color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 24px; text-align: center; }
.ocean-err { color: var(--dsw-alias-state-error-primary); font-size: 12px; padding: 8px 0; }
.ocean-icon { display: block; }
`

    const KIND_COLOR = {
      plugin: 'var(--dsw-alias-brand-primary)',
      tool: 'var(--dsw-alias-state-success-primary)',
      script: 'var(--dsw-alias-state-warn-primary)',
    }
    const KIND_LABEL = { plugin: '插件', tool: '工具', script: '脚本' }
    // 页面生命周期内只自动查一次，别每次切面板都打 registry
    let autoChecked = false
    const TABS = [
      { id: 'all', label: '全部' },
      { id: 'plugin', label: '插件' },
      { id: 'tool', label: '工具' },
      { id: 'script', label: '脚本' },
    ]

    /** 把底层失败原因说成人话。 */
    function whyText(r) {
      if (!r) return '查不到版本列表'
      if (r.problem === 'network') return '连不上 registry（网络）'
      if (r.problem === 'not-found') return 'registry 里没有这个包'
      const reason = String(r.reason || '')
      if (/null|timeout|ECONN|UND_ERR|reset/i.test(reason)) return 'registry 没响应（网络抖动），稍后再试'
      return reason ? reason.slice(0, 60) : '查不到版本列表'
    }

    function fmtSize(n) {
      if (!Number.isFinite(n)) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    }

    function fmtTime(ms) {
      if (!ms) return ''
      const d = new Date(ms)
      const pad = (x) => String(x).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    /** 把三种来源拍成同一种行数据。 */
    function buildItems(data) {
      const items = []
      const plugins = Array.isArray(data?.plugins) ? data.plugins : []
      for (const p of plugins) {
        if (!p?.name) continue
        items.push({
          id: 'plugin:' + p.name,
          kind: 'plugin',
          name: p.name,
          sub: p.version ? `v${p.version}` : '',
          raw: p,
        })
      }
      const tools = Array.isArray(data?.tools) ? data.tools : []
      for (const t of tools) {
        if (!t?.name) continue
        items.push({
          id: 'tool:' + t.name,
          kind: 'tool',
          name: t.name,
          sub: (t.description || '').slice(0, 40),
          raw: t,
        })
      }
      const scripts = Array.isArray(data?.scripts) ? data.scripts : []
      for (const s of scripts) {
        if (!s?.id) continue
        items.push({
          id: s.id,
          kind: 'script',
          name: s.name,
          sub: s.summary || s.runtime,
          raw: s,
        })
      }
      return items
    }

    function OceanIcon(props) {
      const size = (props && props.size) || 16
      return h('svg', {
        className: 'ocean-icon', width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      },
        h('path', { d: 'M2 8.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5' }),
        h('path', { d: 'M2 13c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5' }),
        h('path', { d: 'M2 17.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5' })
      )
    }

    function OceanPanel() {
      const [data, setData] = useState(null)
      const [err, setErr] = useState('')
      const [tab, setTab] = useState('all')
      const [q, setQ] = useState('')
      const [selected, setSelected] = useState('')
      const [busy, setBusy] = useState(false)
      const [job, setJob] = useState(null)
      const [updates, setUpdates] = useState({})
      const [checking, setChecking] = useState(false)
      const [updJob, setUpdJob] = useState(null)
      const [bulk, setBulk] = useState(null)
      const [updNote, setUpdNote] = useState('')

      const load = useCallback(async () => {
        setErr('')
        try {
          const res = await fetch('/modmenu/state', { headers: { 'x-modmenu-request': '1' } })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          setData(await res.json())
        } catch (e) {
          setErr(String(e && e.message ? e.message : e))
        }
      }, [])

      useEffect(() => { load() }, [load])

      const items = useMemo(() => buildItems(data), [data])
      const counts = useMemo(() => {
        const c = { all: items.length, plugin: 0, tool: 0, script: 0 }
        for (const it of items) c[it.kind] = (c[it.kind] || 0) + 1
        return c
      }, [items])

      const shown = useMemo(() => {
        const needle = q.trim().toLowerCase()
        return items.filter((it) => {
          if (tab !== 'all' && it.kind !== tab) return false
          if (!needle) return true
          return (it.name + ' ' + it.sub + ' ' + JSON.stringify(it.raw || {})).toLowerCase().includes(needle)
        })
      }, [items, tab, q])

      const active = useMemo(() => {
        if (!shown.length) return null
        const hit = shown.find((it) => it.id === selected)
        return hit || shown[0]
      }, [shown, selected])

      const run = useCallback(async (item, mode) => {
        if (!item || item.kind !== 'script') return
        setBusy(true)
        setJob({ running: true, name: item.name, mode })
        try {
          const res = await fetch('/modmenu/run', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-modmenu-request': '1' },
            body: JSON.stringify({ id: item.raw.id, mode }),
          })
          const out = await res.json()
          setJob({ running: false, name: item.name, mode, ...out })
        } catch (e) {
          setJob({ running: false, name: item.name, mode, ok: false, stdout: '', stderr: String(e && e.message ? e.message : e), ms: 0 })
        } finally {
          setBusy(false)
        }
      }, [])

      const checkAll = useCallback(async () => {
        setChecking(true)
        setUpdJob(null)
        try {
          const res = await fetch('/modmenu/updates', { headers: { 'x-modmenu-request': '1' } })
          const data = await res.json()
          const map = {}
          for (const r of data.results || []) if (r && r.latest) map[r.name] = r
          setUpdates(map)
          // 「查不到」和「都是最新」要说清，否则断网时看起来一切正常
          const all = data.results || []
          const failed = all.filter((r) => !r.latest && !r.upToDate)
          if (all.length === 0) setUpdNote('')
          else if (failed.length === all.length) setUpdNote('更新检查失败：' + whyText(failed[0]))
          else if (failed.length) setUpdNote(`${failed.length} 个包查不到版本（${whyText(failed[0])}）`)
          else setUpdNote('')
        } catch (e) {
          setErr(String(e && e.message ? e.message : e))
        } finally {
          setChecking(false)
        }
      }, [])

      const doUpdate = useCallback(async (name, version) => {
        setUpdJob({ name, running: true })
        try {
          const res = await fetch('/modmenu/update', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-modmenu-request': '1' },
            body: JSON.stringify({ name, version }),
          })
          const out = await res.json()
          setUpdJob({ name, running: false, ...out })
          if (out && out.ok) {
            setUpdates((prev) => {
              const next = { ...prev }
              delete next[name]
              return next
            })
            load()
          }
        } catch (e) {
          setUpdJob({ name, running: false, ok: false, error: String(e && e.message ? e.message : e) })
        }
      }, [load])

      const startAll = useCallback(async () => {
        try {
          const res = await fetch('/modmenu/update-all', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-modmenu-request': '1' },
            body: '{}',
          })
          const data = await res.json()
          if (!res.ok) {
            setBulk({ running: false, error: data.error || 'HTTP ' + res.status, results: [] })
            return
          }
          const tick = async () => {
            try {
              const r = await fetch('/modmenu/update-all/status', { headers: { 'x-modmenu-request': '1' } })
              const d = await r.json()
              setBulk(d.job || null)
              if (d.job && d.job.running) {
                setTimeout(tick, 2000)
              } else {
                setUpdates({})
                load()
              }
            } catch {
              setBulk({ running: false, error: '状态查询中断', results: [] })
            }
          }
          tick()
        } catch (e) {
          setBulk({ running: false, error: String(e && e.message ? e.message : e), results: [] })
        }
      }, [load])

      useEffect(() => {
        if (autoChecked) return
        autoChecked = true
        checkAll()
      }, [checkAll])

      let bulkLine = null
      if (bulk) {
        if (bulk.running) {
          bulkLine = `全部更新中（${(bulk.results || []).length}/${bulk.total || '?'}）：${bulk.current || '准备中'}`
        } else if (bulk.error) {
          bulkLine = '全部更新失败：' + bulk.error
        } else {
          const list = bulk.results || []
          const okN = list.filter((x) => x.ok).length
          const bad = list.filter((x) => !x.ok)
          bulkLine = `全部更新结束：成功 ${okN} 个${bad.length ? `，失败 ${bad.length} 个（${bad.map((x) => x.name).join('、')}）` : ''}`
        }
      }

      const updCount = Object.keys(updates).length

      const head = h('div', { className: 'ocean-head' },
        h('div', { className: 'ocean-headrow' },
          h('span', { className: 'ocean-title' }, '模组菜单'),
          h('span', { className: 'ocean-sub' },
            `插件 ${counts.plugin} · 工具 ${counts.tool} · 脚本 ${counts.script}`,
            updCount ? ` · 可更新 ${updCount}` : ''),
          h('span', { className: 'ocean-grow' }),
          h('button', {
            className: 'ocean-btn', 'data-kind': 'primary',
            onClick: checkAll, disabled: checking || busy,
          }, checking ? '检查中…' : '检查更新'),
          h('button', {
            className: 'ocean-btn',
            onClick: startAll,
            disabled: checking || busy || Boolean(bulk && bulk.running) || updCount === 0,
          }, bulk && bulk.running ? '更新中…' : (updCount ? `全部更新 (${updCount})` : '全部更新')),
          h('button', { className: 'ocean-btn', onClick: load, disabled: busy }, '刷新')
        ),
        h('div', { className: 'ocean-tabs' },
          TABS.map((t) => h('div', {
            key: t.id,
            className: 'ocean-tab',
            'data-on': tab === t.id ? 'true' : 'false',
            onClick: () => setTab(t.id),
          }, t.label, h('span', { className: 'n' }, String(counts[t.id] ?? 0)),
             t.id === 'plugin' && updCount ? h('span', { className: 'upd' }, '↑' + updCount) : null))
        ),
        bulkLine ? h('div', { className: 'ocean-bulk' }, bulkLine) : null,
        updNote ? h('div', { className: 'ocean-note' }, updNote) : null,
        h('input', {
          className: 'ocean-search',
          value: q,
          placeholder: '搜索名称、版本、说明……',
          onChange: (e) => setQ(e.target.value),
        })
      )
      const list = h('div', { className: 'ocean-list' },
        shown.length === 0
          ? h('div', { className: 'ocean-empty' }, q ? '没有匹配项' : '这里还是空的')
          : shown.map((it) => h('div', {
              key: it.id,
              className: 'ocean-row',
              'data-on': active && active.id === it.id ? 'true' : 'false',
              onClick: () => setSelected(it.id),
            },
            h('span', { className: 'ocean-dot', style: { background: KIND_COLOR[it.kind] } }),
            h('span', { className: 'ocean-rowmain' },
              h('div', { className: 'ocean-rowname' }, it.name),
              it.sub ? h('div', { className: 'ocean-rowmeta' }, it.sub) : null
            ),
            it.kind === 'plugin' && updates[it.name]
              ? h('span', { className: 'ocean-badge', style: { color: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-primary)', flex: 'none' } }, '↑ ' + updates[it.name].latest)
              : null
          ))
      )

      let detail = h('div', { className: 'ocean-empty' }, '选一项看详情')
      if (active) {
        const badges = [KIND_LABEL[active.kind]]
        const kv = []
        let desc = ''
        const actions = []
        if (active.kind === 'script') {
          const s = active.raw
          badges.push(s.runtime)
          kv.push(['路径', s.path])
          kv.push(['大小', fmtSize(s.size)])
          kv.push(['修改', fmtTime(s.mtime)])
          desc = s.summary || '（这个脚本没有写说明）'
          actions.push(h('button', {
            key: 'check', className: 'ocean-btn', 'data-kind': 'primary',
            disabled: busy || !s.checkable,
            onClick: () => run(active, 'check'),
          }, '检查'))
          actions.push(h('button', {
            key: 'run', className: 'ocean-btn', disabled: busy,
            onClick: () => run(active, 'run'),
          }, '运行'))
        } else if (active.kind === 'plugin') {
          const p = active.raw
          if (p.version) badges.push('v' + p.version)
          badges.push(p.enabled === false ? '已禁用' : '已启用')
          kv.push(['名称', p.name])
          if (p.availability) kv.push(['来源', p.availability === 'profile' ? '装在 profile 里' : p.availability])
          if (p.update) kv.push(['可更新', p.update === 'git' ? 'Git 仓库' : 'npm registry'])
          const upd = updates[p.name]
          if (upd) {
            badges.push('可更新 → v' + upd.latest)
            const running = updJob && updJob.running && updJob.name === p.name
            actions.push(h('button', {
              key: 'upd', className: 'ocean-btn', 'data-kind': 'primary',
              disabled: Boolean(updJob && updJob.running),
              onClick: () => doUpdate(p.name, upd.latest),
            }, running ? '更新中…' : `更新到 v${upd.latest}`))
          }
          desc = p.description || ''
        } else {
          kv.push(['名称', active.raw.name])
          desc = active.raw.description || ''
        }

        let out = null
        if (job && job.name === active.name) {
          if (job.running) {
            out = h('div', { className: 'ocean-out' }, `${job.mode === 'check' ? '检查' : '运行'}中……`)
          } else {
            const text = [job.stdout, job.stderr].filter(Boolean).join('\n').trim()
            out = h('div', {
              className: 'ocean-out',
              'data-ok': job.ok ? 'true' : 'false',
            }, [
              `$ ${job.mode === 'check' ? '--check' : 'run'}  ·  退出码 ${job.code}  ·  ${job.ms} ms`,
              text || '（没有输出）',
            ].join('\n'))
          }
        }

        let updBox = null
        if (active.kind === 'plugin' && updJob && updJob.name === active.name) {
          const text = updJob.running
            ? '正在更新……先卸载旧版本再装新的，期间这个插件会短暂停止。'
            : updJob.ok
              ? `已更新 ${updJob.from || ''} → ${updJob.to || ''}（${updJob.application || 'applied'}${updJob.restartReason ? '，需重启：' + updJob.restartReason : ''}）`
              : `更新失败：${updJob.error || '未知原因'}${updJob.diagnostic ? '\n' + updJob.diagnostic : ''}`
          updBox = h('div', {
            className: 'ocean-out',
            'data-ok': updJob.running || updJob.ok ? 'true' : 'false',
          }, text)
        }

        detail = h('div', { className: 'ocean-detail' },
          h('div', { className: 'ocean-dtitle' }, active.name),
          h('div', { className: 'ocean-badges' }, badges.map((b, i) => h('span', { key: i, className: 'ocean-badge' }, b))),
          kv.length ? h('div', { className: 'ocean-kv' }, kv.map(([k, v]) => [
            h('div', { key: k + 'k', className: 'k' }, k),
            h('div', { key: k + 'v', className: 'v' }, v),
          ])) : null,
          desc ? h('div', { className: 'ocean-desc' }, desc) : null,
          actions.length ? h('div', { className: 'ocean-actions' }, actions) : null,
          updBox,
          out
        )
      }

      return h('div', { className: 'ocean-root' },
        h('style', null, CSS),
        head,
        err ? h('div', { className: 'ocean-err', style: { padding: '8px 20px' } }, '读取失败：' + err) : null,
        h('div', { className: 'ocean-body' }, list, detail)
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const offPanel = ctx.slots.register({
          name: 'main',
          key: 'ocean',
        }, OceanPanel)
        const offRow = ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'ocean',
          order: 2,
          label: () => '模组菜单',
        }, (owner) => h(OceanIcon, { size: (owner && owner.size) || 16 }))
        ctx.effect(() => () => {
          if (typeof offRow === 'function') offRow()
          if (typeof offPanel === 'function') offPanel()
        })
      },
    }
  },
})
