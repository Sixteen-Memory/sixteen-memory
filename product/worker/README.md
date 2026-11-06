# Memory service

**接口、规则、持久化与供应商边界。**

[架构](../../docs/ARCHITECTURE.md) · [代码地图](../../docs/REPOSITORY_MAP.md)

| 文件 | 职责 |
| :--- | :--- |
| [index.ts](index.ts) | HTTP路由、Origin、限流、凭证、会话与响应；包含当前回答模型调用 |
| [domain.ts](domain.ts) | 核心类型、输入校验、身份权限和版本约束 |
| [project.ts](project.ts) | SQLite Durable Object、基础生命周期、索引、Key与请求记录 |
| [intelligence.ts](intelligence.ts) | 抽取、维护、语义检索与索引重建编排 |
| [intelligence-domain.ts](intelligence-domain.ts) | 候选事实、来源证据、更新动作校验 |
| [intelligence-store.ts](intelligence-store.ts) | 导入、向量、证据、审核与提交 |
| [fact-slots.ts](fact-slots.ts) | 受控事实字段与同义映射 |
| [memory-attributes.ts](memory-attributes.ts) | 分类、元数据、事件与有效时间 |
| [memory-filter.ts](memory-filter.ts) | 过滤树校验和参数化SQL |
| [providers.ts](providers.ts) | 生成与Embedding供应商调用 |
| [embedding-config.ts](embedding-config.ts) | 维度、接口模式和索引身份 |
| [generation-options.ts](generation-options.ts) | 输出Token与思考参数兼容 |

## 维护原则

- 权限在服务端验证，查询条件不能扩大范围。
- 数据库事务内不等待模型请求；最终提交必须处理并发变化。
- 来源原文与角色边界优先，助手发言不是业务结果的证明。
- 模型失败不静默当作成功，也不自动跨供应商兜底。
- 模型、维度或配置改变后，旧向量不能与新向量混用。
- 修改结构时说明迁移边界，不直接降级不兼容的旧代码。
