# 代码地图

[文档首页](README.md) · [系统架构](ARCHITECTURE.md)

## 先从哪里读？

| 你要做什么 | 从这里开始 |
| :--- | :--- |
| 修改首页／导航／中英文产品页 | [homepage/src](../homepage/src/) |
| 查看现有API和鉴权 | [worker/index.ts](../product/worker/index.ts) |
| 修改写入、版本或删除行为 | [project.ts](../product/worker/project.ts) + [domain.ts](../product/worker/domain.ts) |
| 修改对话抽取与审核 | [intelligence.ts](../product/worker/intelligence.ts) + [intelligence-domain.ts](../product/worker/intelligence-domain.ts) |
| 修改分类和有效时间 | [memory-attributes.ts](../product/worker/memory-attributes.ts) |
| 修改过滤行为 | [memory-filter.ts](../product/worker/memory-filter.ts) |
| 配置模型与向量接口 | [providers.ts](../product/worker/providers.ts) + [embedding-config.ts](../product/worker/embedding-config.ts) |
| 修改管理台 | [product/src](../product/src/) |
| 修改客户端API | [SDK](../product/sdk/README.md) |
| 跑通业务接续示例 | [Examples](../product/examples/README.md) |

## 服务核心

```text
product/worker/
├── index.ts                  HTTP、鉴权入口与响应
├── domain.ts                 数据类型、校验、版本与权限规则
├── project.ts                Durable Object + SQLite基础存储
├── intelligence.ts           智能写入、检索、索引重建编排
├── intelligence-domain.ts    候选事实、证据、维护动作校验
├── intelligence-store.ts     智能路径数据与提交
├── fact-slots.ts             受控事实字段
├── memory-attributes.ts      分类、元数据和时间属性
├── memory-filter.ts          过滤校验与SQL编译
├── providers.ts              生成和Embedding适配
├── embedding-config.ts       配置、模型指纹与维度
└── generation-options.ts     生成参数的兼容控制
```

这些文件共同构成一个Worker，不是独立发布包。

官网按相同原则组织：`src/`负责页面，`public/`保留素材与字体许可，`scripts/`生成
SDK下载和独立路由HTML，`tests/`检查显示与交互约束。

## 修改和检查一起定位

| 变更 | 最小起点 |
| :--- | :--- |
| 文档／README／来源路径 | `npm run check:docs` |
| 官网代码 | `npm run check:website`，再检查受影响页面 |
| Worker或SDK规则 | `npm run check:product`与受影响的本地运行时检查 |
| 数据库结构 | 迁移检查、兼容性说明；不要直接降级旧Worker |
| 真实模型或语义效果 | 单独确认数据、模型和预算后运行评估 |

固定模型响应的用例不是模型效果成绩。不要为了文档改动重复跑全量后端或付费评估。

## 保持单一源码

日常修改只发生在此仓库。旧的原型工作区保存历史参考，但不是第二份持续开发分支。
需要迁入旧文件时，检查来源、密钥、依赖和差异后做正常提交，不整目录覆盖。
