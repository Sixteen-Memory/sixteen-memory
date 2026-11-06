# JavaScript SDK

**一个无运行时依赖的源码客户端。**

[本地接入](../../docs/QUICKSTART.md) · [完整示例](../examples/README.md) · [源码](index.mjs)

当前不是npm发布包。在仓库根目录的Node.js模块中引用：

```js
import { SixteenMemory, MemoryApiError } from "./product/sdk/index.mjs";

const memory = new SixteenMemory({
  baseUrl: "http://127.0.0.1:8790",
  apiKey: process.env.SIXTEEN_API_KEY,
  timeoutMs: 15_000,
});
```

也可从官网下载相同客户端源文件，再调整导入路径。
应用应从服务端调用，网页不能持有管理员或供应商Key。

## 方法分组

| 分组 | 方法 | 边界 |
| :--- | :--- | :--- |
| 核心记忆 | `add`、`get`、`list`、`search` | 搜索默认词法，使用Key允许的范围 |
| 变化与管理 | `update`、`history`、`revoke`、`delete`、`exportPage` | 更新／删除带当前版本，导出由调用方分页 |
| 回答 | `answer` | 需要目标服务配置模型，可能计费 |
| 开发中的智能路径 | `ingest`、`ingestion`、`ingestions`、`resolveIngestion`、`evidence`、`reindex` | 方法存在不等于线上开放 |

## 错误处理

服务返回失败时抛出`MemoryApiError`，保留`status`和`code`。
网络失败或超时可能是原生异常，不要把所有错误当作业务错误。

```js
try {
  await memory.search({ user_id: "example-user", query: "沟通偏好" });
} catch (error) {
  if (error instanceof MemoryApiError) {
    console.error(error.status, error.code);
  } else {
    throw error;
  }
}
```

客户端不自动重试写入。结合请求ID、版本和失败类型决定下一步。
不要在日志中打印凭证或未经脱敏的正文。
