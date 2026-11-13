# 模组菜单（dsh-modmenu）

DSH 的模组菜单：**插件、工具、脚本，一个面板看完**。

形态参考《我的世界》的 Mod Menu —— 左边一列（搜索 + 列表），右边一块详情，顶部一排分类。

> ⚠️ **这个插件能执行本地脚本、能更新插件包。** 安装前请读完下面的「安全边界」，确认你接受这个权限范围。

## 装

npm（如果已发布）：

```
dsh plugin add dsh-modmenu
```

直接从 GitHub 源码装：

```
dsh plugin add github:Sail-ZF/dsh-modmenu
```

本地开发用 `link:`：

```
dsh plugin add link:C:/path/to/dsh-modmenu
```

装完刷新页面，侧栏顶部会多一个波浪图标，排在 `plugins` 之后、`schedules` 之前。

## 它管什么

| 分类 | 来源 | 能做什么 |
|---|---|---|
| 插件 | `pluginManager.listBundles()` | 看版本、来源、启用状态；查更新、单个更新、全部更新 |
| 工具 | `ctx.tools.schemas()` | 看当前 agent 能调用的工具和说明 |
| 脚本 | 可配置目录（默认 `~/.dsh/patches`、`~/.dsh/tools`） | 看说明、点「检查」/「运行」，输出就地显示 |

打开面板会自动查一次更新（一个页面生命周期只查一次）。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖 `modmenu` 这一行：

```yaml
- id: modmenu
  name: 'dsh-modmenu'
  config:
    scanDirs:
      - '~/.dsh/patches'
      - '~/.dsh/tools'
      - '~/my-scripts'
    runTimeoutMs: 60000     # 跑脚本的超时，5s–10min
    checkTimeoutMs: 8000    # 查单个包版本列表的超时，2s–60s
```

- `scanDirs` 支持 `~`；目录名以 `patches` / `tools` 结尾时，脚本 id 前缀分别是 `patch:` / `tool:`，其它目录用 `script:`。
- 只扫 `.mjs` / `.js` / `.cjs` / `.ps1` / `.bat` / `.cmd`。

## 接口

```
GET  /modmenu/state                  → { scripts, tools, plugins, generatedAt }
POST /modmenu/run                    → { id, mode: 'check' | 'run' }
GET  /modmenu/updates                → { results, candidates, checkedAt }
POST /modmenu/update                 → { name, version }
POST /modmenu/update-all             → { jobId }（后台跑，立即返回）
GET  /modmenu/update-all/status      → { job }
```

## 安全边界

1. **所有写操作都要自定义请求头** `x-modmenu-request: 1`。跨站请求带不上这个头（预检会先拦），等于一道 CSRF 闸。
2. **只执行扫描到的那批文件**：请求里的 id 必须与扫描结果逐字匹配，路径不可穿越（`../../x` 会 404）。
3. **只更新白名单里的包**：必须在「已装、声明可更新、来自 profile」的集合里，否则 403。
4. **不加网络访问**：Host 侧只通过 `pluginManager` 间接访问 registry，没有自己的 HTTP 客户端。
5. Windows 原生程序（powershell / cmd）的输出按 GBK 解码，Node 脚本按 UTF-8。

## 已知限制

- **界面文字目前是中文**，没接 DSH 的 locale 服务。要英文界面需要改 `client.js` 里的字面量。
- 「全部更新」的进度只在内存里，DSH 重启即丢；重启后重新「检查更新」即可。
- 插件启停不在这里做，仍走原生插件页（同一个 `pluginManager`，那边交互更完整）。
- `listVersions` 在 registry 连接不稳时会 `refused`：插件会自动重试一次，仍失败则在顶部黄字说明原因。

## 测试

```
npm test        # 等价于 node --test test/
```

10 个用例，不打网络、不碰 DSH 服务，覆盖：

- `expandHome` / `kindOf` / `applyConfig` 的边界与夹取
- `scanScripts` 的扩展名过滤、类别判定、不存在目录不抛错
- `runScript` 的成功/失败退出码、stderr、**powershell 的 GBK 中文解码**
- `classifyVersionList` 的三种返回（有新版 / 已是最新 / 查不到）——「已是最新」曾被测成失败
- `pickScript` 拒绝路径穿越的 id

## 许可

MIT，见 [LICENSE](LICENSE)。
