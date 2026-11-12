# Changelog

## 0.2.0 — 2026-11-12

装成可管理的 **bundle**，基目录可在 GUI 里改。

- 包自带 `cordis.patch.yml` 并登记进 `dsh.profile.bundles`，于是出现在侧边栏
  Plugins → Installed plugins，可开关 / 卸载。
- `baseDir` 改为 volatile Config 字段（`Config = z.object({ baseDir: z.string().default(...).volatile() })`），
  Host 半边在 `webserver/index-inject` 里按 volatile 引用读当前值，页面拿到 `globalThis.__DSH_DATE_WORKSPACE__`。
- 新增配置页：注册 `plugins.bundle.config`（key `dsh-date-workspace`），走 `ctx.configForms.get('date-workspace')`，
  保存写进 profile 的 `cordis.patch.yml`，「恢复默认」删除 override；保存同时清掉本浏览器的对话框记忆值。
- 新增 mirror 订阅：设置页保存后对话框立即用新目录，不用刷新页面。
- `@deepseek-ai/schemastery` 成为 peer 依赖（本地 link 安装时需在包内可达）。
- `tests/host.mjs` 覆盖 `Config` 默认值、volatile 引用实时读取；`tests/smoke.mjs` 覆盖设置页注册与 mirror 同步。
- 新增 `assets/preview-settings.svg`。

## 0.1.0 — 2026-11-12

首个版本。

- 两个工作区 directory-flow 洞的影子占位者（`priority: -1`）：日期工作区对话框替代裸的选目录。
- 按日期在基目录下逐级创建 `YYYY-MM-DD` 工作区，已存在则复用；成功后登记工作区并打开新会话。
- 保留「浏览文件夹…」原生选择；取消 / Esc / 点遮罩关闭。
- 基目录三层优先级：对话框记忆值 > 插件行配置 > 内置默认；基目录行带「默认」按钮。
- 手写 client bundle（无编译步骤），仅依赖 `react` / `react-dom` 静态模块。
- `tests/smoke.mjs`：注册、路径分段、`directory-exists` 容忍、错误透传、基目录优先级、组件渲染。
