# SixteenMemory

SixteenMemory产品与官网的私有代码库。

**仓库保持Private，不作为开源项目发布。** 本仓库没有开放源代码许可。
第三方依赖和字体沿用各自许可；未来的开源项目使用独立公开仓库。

## 目录

```text
product/
  worker/       记忆API、权限、SQLite存储与供应商接口
  src/          React管理台
  sdk/          JavaScript客户端源码
  examples/     合成数据示例
  test/         产品本地检查
  eval/         独立模型评估工具，真实调用需要单独授权
homepage/       官网与开发文档页面
docs/           架构学习和协作说明
.github/        代码负责人和Pull Request说明
```

`product/`和`homepage/`各自维护锁文件，没有为建库引入新的包管理方式。

## 本地开始

使用Node.js 24与npm，在仓库根目录执行：

```sh
npm ci --prefix product
npm ci --prefix homepage
npm run build:website
npm run build:product
```

官网开发：

```sh
npm run dev:website
```

产品本地开发：

```sh
cd product
npm run prepare:local
npm run dev
```

本地Key、运行数据和供应商凭证均不进入Git。不要把生产Key用于本地示例。
可选Mem0对比需要单独安装`product/eval/`依赖；建库不运行付费模型检查。

## 发布与访问

- 网站构建不自动发布网站。
- 产品构建中的Wrangler命令仅为`--dry-run`，不发布Worker。
- 官网的`deploy`脚本会发布网站，只能在明确获准后运行。
- 仓库不包含Cloudflare登录信息、部署Key、数据库或真实客户数据。
- GitHub推送、网站上线、生产变更与模型费用是不同操作，不互相代替授权。

## 用个人账号协作

预期远程为`SixteenMemory/sixteen-memory`，可见性必须是Private。
由个人账号`Chengyuann`开发、提交和推送，公司组织持有仓库。

```sh
git switch -c feat/short-description
# 修改代码，运行与改动相关的检查
git add <明确的文件路径>
git commit -m "feat: describe the change"
git push -u origin HEAD
```

通过Pull Request说明改动。不要共享组织登录密码，不使用公共仓库备份公司源码。
详见[协作说明](CONTRIBUTING.md)和[安全说明](SECURITY.md)。

## 来源与范围

首次内容从原工作区按文件范围导入，不携带原型、截图、聊天辅助文件或旧Git历史。
原工作区保留不动，部署和研究原始记录继续保存在那里。

本次仅学习Mem0架构，没有复制其源码或提示词。阅读
[Mem0学习记录](docs/MEM0_LEARNINGS_2026-11-06.md)了解准备借鉴的部分和保留的差异。
