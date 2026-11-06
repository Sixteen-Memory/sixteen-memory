# Examples

**先用合成数据跑通，再连接真实业务。**

[接入指南](../../docs/QUICKSTART.md) · [SDK](../sdk/README.md)

| 示例 | 过程 | 模型调用 |
| :--- | :--- | :--- |
| [customer-continuity.mjs](customer-continuity.mjs) | 保存 → 检索 → 更新 → 历史 → 删除合成记录 | 不需要 |
| [intelligent-continuity.mjs](intelligent-continuity.mjs) | 对话导入、候选维护与智能检索 | 需要配置与授权 |

## 基础示例

先启动本地产品，在终端环境设置用户范围Key，不写入文件提交。

```sh
# 已设置 SIXTEEN_API_KEY
export SIXTEEN_BASE_URL=http://127.0.0.1:8790
export SIXTEEN_USER_ID=example-user
npm run example:basic
```

从仓库根目录运行。结束时会删除它创建的合成记录；只指向本地或明确批准的测试环境。
用户范围必须与Key一致。

## 智能示例不是默认入门步骤

先检查目标服务能力，再确认供应商、数据发送范围和费用。
普通构建、README预览或基础接入不需要运行它；未配置模型时不应绕过错误强行调用。
