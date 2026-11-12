# Changelog

## 0.1.0 — 2026-11-12

首个版本。

- 两个工作区 directory-flow 洞的影子占位者（`priority: -1`）：日期工作区对话框替代裸的选目录。
- 按日期在基目录下逐级创建 `YYYY-MM-DD` 工作区，已存在则复用；成功后登记工作区并打开新会话。
- 保留「浏览文件夹…」原生选择；取消 / Esc / 点遮罩关闭。
- 基目录是插件行配置：`config.baseDir` 由 Host 半边在 `webserver/index-inject` 里注入为
  `globalThis.__DSH_DATE_WORKSPACE__`；对话框里的修改记为浏览器本地覆盖，优先级更高。
- 基目录行新增「默认」按钮：清掉本地覆盖，回落到行配置。
- 手写 client bundle（无编译步骤），仅依赖 `react` / `react-dom` 静态模块。
- `tests/smoke.mjs`：注册、路径分段、`directory-exists` 容忍、错误透传、基目录三层优先级、组件渲染。
- `tests/host.mjs`：行配置发布、空白/缺失回落、trim。
