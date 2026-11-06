# Sixteen Memory 产品核心

本地候选版本0.2.1，开发预览（线上仍为0.1.0，未发布本轮智能能力）。与现有官网、演示原型和 AML 比赛服务独立。

当前公开入口为 `https://console.sixteenmemory.com`。部署凭证和运行记录不包含在代码库中。

新增智能路径、测试范围和未完成实现记录见 [P0开发记录](P0.md)。
2026年11月5日第一轮增加事实槽位注册表、metadata/分类/有效时间与复合筛选，详见
[第一轮API增量](ROUND1_API.md)。这些字段当前只提供API，不声称管理台已有表单。
供应商策略：生成可使用OpenAI GPT或阿里千问；语义Embedding固定使用千问，见
[供应商策略](PROVIDER_POLICY.md)。

## v0.1.0已上线基础

- 真实 SQLite 存储：新增、读取、列表、显式更新、历史、撤销、删除、到期清理和分页导出。
- 中文/英文词法检索，只查询有效记忆；没有启用语义检索或自动事实抽取。
- 管理员凭证、绑定用户范围的读写/只读 Key、服务端范围校验、可撤销登录会话。
- 接入真实 API 的管理台：记忆列表、来源与历史、检索、Key 管理、请求记录。
- JavaScript SDK 与客户服务接续示例。
- 可选回答模型接口；未配置时返回503，不生成模拟回答。
- Worker 与 Pages Service Binding 已部署；新增登录/API基础限流。

## 本地运行

```bash
npm ci
npm run prepare:local
npm run types
npm run build
npm run dev
```

需要在终端命令结束后保留本地预览时，可使用 `npm run start:local`。进程ID和日志位于`.local/`；已有端口被占用时会停止，不终止其他服务。

管理台：`http://127.0.0.1:4191`。

构建版和 API：`http://127.0.0.1:8790`。

首次运行会生成仅本地使用的管理员 Key，保存在 `.dev.vars`，文件权限为0600。登录时读取其中 `ADMIN_KEY` 的值。不要将该文件或密钥放入 Git、网页代码或聊天。

数据保存在 `product/.wrangler/state/`，不是浏览器 localStorage。重启保留；删除该目录会删除本地数据。

API 文档：`public/quickstart.html`。管理员可创建限定用户范围的 Key，再运行：

```bash
SIXTEEN_BASE_URL=http://127.0.0.1:8790 \
SIXTEEN_USER_ID=example-user \
SIXTEEN_API_KEY=... \
node examples/customer-continuity.mjs
```

示例会写入、查询、更新和删除一条合成记录，不涉及模型调用。

## 验证

```bash
npm test
npm run build
npm run test:runtime
npm run build:pages
```

`test:runtime` 使用真实本地 Workers/SQLite 运行时，经 Pages Service Binding 调用 API。测试创建隔离临时存储并清理，不访问线上数据，不调用模型。

范围包含：登录、Key 范围、跨项目隔离、并发版本冲突、幂等、历史、撤销、在线物理删除、到期清理、重启持久化和 SDK。

## 数据行为

- `source` 是调用方提供的依据，不等于系统已经确认真实。
- 新增同一 `request_id` 时检查请求内容；30天内同内容重试不会重复创建。原记录已删除或到期则返回410。
- 更新要求 `expected_version`，不覆盖并发修改；旧正文和来源进入历史。
- 撤销保留历史但退出检索；更新已撤销记录会将其重新设为有效。
- 删除清理在线正文、来源、历史和 FTS 索引。重试表仅保留请求摘要和原记录 ID，防止重复请求重新创建。
- 到期时间为空表示不自动过期；仍受容量限制。
- 导出是当前记录的分页读取，不是数据库备份或一致性快照。导出期间发生变更时可能看到不同时间的状态。
- 请求记录只含操作、状态、耗时、凭证 ID 和时间，保留最近1,000条，不含查询和记忆正文。
- 本地/线上平台恢复副本的清理与在线删除不同，详见部署说明。

## 当前限制

这不是完整企业版，尚未完成：

- 自动事实抽取、语义检索、时间查询推理、冲突自动判断。
- 多组织自助注册、SSO、项目成员管理；当前每个部署固定一个项目。
- 全局严格配额、完整滥用防护、负载和地域网络验收；现有基础限流是按地点近似计数。
- 云端备份恢复演练、恢复后删除记录的再次清理。
- Mem0 同条件评测、真实客户试点和实际付费模型验证。

每项目10,000条当前记录、单请求64 KiB、正文与来源正文各8,000字符、搜索最多50条。历史版本也消耗存储；这些是接口上限，不是已验证的生产容量。尚无完整用量和费用上限管理。

## 文件

```text
worker/       API、身份校验、存储与历史
src/          React 管理台
sdk/          无运行依赖的 JavaScript 客户端
examples/     合成数据接续示例
pages/        子域名入口和 Service Binding
test/         SDK 与 Workers 运行测试
DEPLOYMENT.md 部署与上线前检查
```
