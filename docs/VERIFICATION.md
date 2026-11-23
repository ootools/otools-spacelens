# 验证记录（v0.1.0）

本机：macOS arm64，Node 22，Rust stable。所有命令均在仓库根执行（Rust 部分在 `service/`）。

## 已通过

| 命令 | 证明 |
| --- | --- |
| `no_proxy='*' npm install` | 依赖可安装（Clash 代理会拦截 npm） |
| `cd service && cargo test` | 7 项 Rust 单测：初始化校验、HTTP 鉴权/query token 回退、扫描聚合、取消、空目录 |
| `cd service && cargo build --release` | 产出 1.6MB `spacelensd`，已复制为 `bin/spacelensd-macos` 并 ad-hoc 签名 |
| `npm run test:src` | 17 项前端单测：字节格式化、分类映射、大小色阶与对比文字、乱序 delta 聚合/筛选、squarify 面积守恒/不重叠 |
| `npm test` | 25 项脚本测试：i18n 八语种 parity、verify 重复键/大小写变体、发布策略、市场 payload |
| `npm run build` | `vue-tsc --noEmit` + Vite 构建成功（约 103KB JS / 6KB CSS） |
| `npm run smoke` | 无宿主端到端：握手 → 建 fixture → 扫描 → SSE batch/done 校验字节总数 → snapshot → 4000 文件大目录取消 |
| `npm run pack` | 生成 `dist-pack/otools-spacelens-0.1.0.oplg`（7 条目），加固验证全绿（含 sidecar 存在性、support 如实上报、ZIP CRC） |
| `AUTH_MODE=pat XYCLOUD_PAT=<格式合法值> node scripts/publish-market.mjs preflight` | 市场凭证格式检查通过（未请求市场、未发布） |
| 浏览器 `?mock=1` | 合成树流式渲染，嵌套树图、筛选栏、面包屑、Tooltip、状态栏、动画均正常；大小色阶模式实测：6 档图例 + 矩形按体积着色，浅色块文字自动转深色 |

## 未做（需 CI / 真机）

- Windows / Linux 二进制与宿主实机验证（本机只有 macOS arm64）。
- 宿主内端到端：sidecar 由真实 OTools 宿主 spawn、选目录、打开文件夹。sidecar API 依赖宿主 main 的实现，旧宿主会显示能力缺失提示。
- 市场发布：本次未 push、未打 tag、未上架（共享状态操作）。

## 已知约束

- 不设节点上限；超大目录会完整扫描，内存随目录规模增长。
- 符号链接不跟随（避免成环/越界）；硬链接按路径重复计数。
- sidecar 错误输出只含固定字符串，不回显 token 或扫描路径。
