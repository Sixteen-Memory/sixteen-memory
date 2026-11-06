# 本地开发指南

[文档首页](README.md) · [SDK](../product/sdk/README.md) · [示例](../product/examples/README.md)

## 1. 准备

- Node.js 24、npm与Git。
- 使用自己的GitHub账号访问私有仓库。
- 供应商Key不是基础写入和词法检索的前提。

```sh
git clone https://github.com/Sixteen-Memory/sixteen-memory.git
cd sixteen-memory
npm run setup
```

`setup`依次在`product/`和`homepage/`执行`npm ci`，使用各自锁文件。
不会创建生产资源、部署服务或安装可选评估环境。

## 2. 只开发官网

```sh
npm run dev:website -- --port 4180
```

打开`http://127.0.0.1:4180`。官网独立运行，不必先启动产品API。

```sh
npm run build:website
npm --prefix homepage run preview -- --port 4180
```

构建输出在`homepage/dist/`，不进入Git，也不会自动上传。

## 3. 开发产品

```sh
npm run prepare:product
npm run build:product
npm run dev:product
```

| 入口 | 地址 |
| :--- | :--- |
| 管理台开发服务器 | `http://127.0.0.1:4191` |
| 本地API及构建版入口 | `http://127.0.0.1:8790` |
| 无需Key的健康检查 | `http://127.0.0.1:8790/health` |

`prepare:product`生成本地Key，文件为`product/.dev.vars`。登录时在本机读取`ADMIN_KEY`，
不要把值提交到代码或公开记录。应用使用管理员在控制台创建的、绑定用户范围的读写Key。

`dev:product`同时运行本地Worker和Vite，按`Ctrl+C`结束。
数据位于被Git忽略的`product/.wrangler/`；删除此目录会删除本地数据，不要当作常规清理。

## 4. 先跑不需要模型的示例

保持产品服务运行，在另一个终端设置测试Key及允许访问的用户范围，不写入示例文件。

```sh
# 已在当前终端设置 SIXTEEN_API_KEY
export SIXTEEN_BASE_URL=http://127.0.0.1:8790
export SIXTEEN_USER_ID=example-user
npm run example:basic
```

示例会写入、检索、更新、查看历史，并在结束时删除它创建的合成记录。
只指向本地或明确批准的测试环境，不使用生产管理员Key。

## 5. 选择必要检查

```sh
npm run check:docs
npm run check:website
npm run check:product
```

单独运行一个检查：`cd product && node --test test/sdk.test.mjs`。
README或页面改动不需要真实模型评估；`product/eval/`的依赖和授权独立。

## 常见问题

**端口被占用？** 确认是否为自己启动的进程，不终止其他应用。产品同时涉及代理与Worker，
不能只改其中一个端口。

**返回503？** 本地管理员Key未配置与回答模型未配置是不同情况。无需模型时使用显式写入
和`lexical`检索。

**SDK方法存在但线上不能用？** SDK含开发版本方法；目标服务版本决定是否开放。

**构建成功要不要deploy？** 不自动执行。推送、发布、数据迁移和模型费用分别需要授权。
