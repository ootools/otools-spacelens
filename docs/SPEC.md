# 空间透镜 (otools-spacelens) 规格

## 一句话

SpaceSniffer 式磁盘空间分析插件：选择任意文件夹，原生递归扫描，矩形树图（treemap）随扫描结果实时生长；支持下钻、面包屑、打开文件夹、按分类/大小/名称筛选。

## 形态

独立 OTools 插件仓（与宿主平级）。前端 Vue 3 + TypeScript + Vite；扫描器为 Rust sidecar `spacelensd`（axum loopback HTTP + stdio 握手 + Bearer token），协议与 `otools-concat` 的 sidecar 一致。devUrl `http://127.0.0.1:6582`，preview `6583`。

## 扫描协议

握手：`spacelensd --stdio`，stdin 收一行 `{"type":"init","token":"<64 位小写 hex>","origin":"<webview origin>"}`，stdout 输出 `{"event":"ready","port":N,"protocol":1}`。所有 HTTP 请求必须带 `Authorization: Bearer <token>`、`Origin` 与 init 一致、`Host: 127.0.0.1:<port>`；SSE 因无法设头，用 `?access_token=` GET 回退。

| 端点 | 说明 |
| --- | --- |
| `GET /api/status` | 健康检查 |
| `POST /api/scan` `{path}` | 启动扫描，返回 `{scanId}`；路径必须是绝对目录 |
| `POST /api/scan/{id}/cancel` | 取消，返回 `{ok:true}` |
| `GET /api/scan/{id}/snapshot` | 轮询兜底：`{status, root, totals}` |
| `GET /api/scan/{id}/events` | SSE 事件流 |

SSE 事件（具名 + JSON data）：

- `start` `{scanId, root, startedAt}`
- `batch` `{seq, nodes:[{id, parent_id, name, path, is_dir, size, mtime}]}`，每 80ms 或 256 节点推送一次
- `progress` `{files, dirs, bytes, scanned}`
- `warning` `{path, kind:"permission"|"io", message}`
- `done` `{durationMs, totals}` / `cancelled` `{durationMs, totals}` / `error` `{message}`

扫描细节：`walkdir` 顺序遍历、`sort_by_file_name()` 稳定排序、`follow_links(false)`（符号链接仅作叶节点，不跟随、不成环）。权限/IO 错误逐条发 `warning` 后继续。目录 delta 的 `size=0`，大小由前端沿祖先链累加；不设节点上限；扫描完整遍历整棵目录树，sidecar 退出时取消所有活动扫描。

## 前端

- `domain/tree.ts`：增量接树（支持父节点晚到的乱序 delta）、祖先大小聚合、筛选（分类/最小大小/名称，支持「仅看命中」隔离）、面包屑。
- `layout/squarify.ts`：零依赖 Bruls squarified treemap，权重按矩形面积归一化，单测覆盖面积守恒与互不重叠。
- `layout/layout-tree.ts`：只布局当前 focus 的直接子节点，空间足够时再内嵌一层孙辈；同屏矩形上限 2000。
- 动画：矩形 `left/top/width/height` CSS transition 240ms，新节点 `pop-in`；扫描流式到达时自然呈现「边扫边长」。
- 配色双模式（默认「大小」）：`src/domain/sizeColors.ts` 定义 6 个大小区间（<1KB / 1KB–1MB / 1–10MB / 10–100MB / 100MB–1GB / ≥1GB），冷色→暖色区分，顶部有色阶图例；可切回「分类」模式（images / video / audio / docs / archives / code / other / folders，扩展名映射 + 分类配色）。文字颜色按 WCAG 相对亮度自动选深/浅，保证浅色块上可读。
- 打开文件夹：宿主 `shellOpenPath`（经 `getOtoolsApi()`），浏览器模式降级为复制到剪贴板 + 提示。
- 主题/i18n 自持：8 语言（zh-CN/en-US/ja-JP/ko-KR/de-DE/ru-RU/es-ES/ar-SA），`?mock=1` 可纯浏览器预览（`&blocked=1` 演示警告）。

## 版本与发布

v0.1.0 仅打包 macOS arm64 sidecar，`meta.json` 的 support 如实上报；其余平台随实机验证逐个补，正式打包器拒绝占位二进制。CI 工作流 `release-plugin.yml`：推 `v<版本>` 标签或手动 dispatch，构建/校验/Release/市场三件套（release environment、XYCLOUD_PAT、OTOOLS_PUBLISH_MARKET=true）。本仓代码 MIT；无上游 Copyleft 依赖。

## 非目标（v0.1）

不写回磁盘、不删除文件、不跟随符号链接、不做文件预览/搜索索引、不统计硬链接去重。
