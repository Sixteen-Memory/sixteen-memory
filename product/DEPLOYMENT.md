# 产品部署边界

仓库包含Cloudflare Worker与Pages配置，不包含账户登录、生产Key、客户数据或历史发布记录。
现有公开入口为`console.sixteenmemory.com`。

```text
Pages管理台 → Service Binding → Worker → SQLite Durable Object
                                  ↓
                            已启用的外部模型API
```

## 本地构建

```sh
npm ci
npm run build
npm run build:pages
```

`build`中的`wrangler deploy --dry-run`仅输出本地Worker包，不执行发布。
模型配置默认未启用；使用`prepare:local`生成本地Key，不复用生产Key。

## 生产发布

先确认目标账号、服务、数据范围、备份恢复方式和操作权限。配置中的名称不是部署授权。
推送GitHub不自动发布生产服务，也不自动更改密钥、DNS、域名或数据库。

生产Key由秘密管理服务注入，不写进`wrangler.jsonc`。当前没有自动部署工作流。
添加自动部署前需要明确环境、分支、审批和费用范围。

## 删除与恢复

在线删除与平台恢复副本是不同范围。没有完成恢复后的删除核对前，不恢复真实客户数据库，
也不声称所有平台备份已立即清除。导出当前记录不等于完整数据库备份。
