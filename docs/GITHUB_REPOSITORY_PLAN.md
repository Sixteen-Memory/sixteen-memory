# SixteenMemory GitHub代码库方案

日期：2026年11月6日

## 推荐结构

使用GitHub **Organization**，不是共享的公司个人账号：

```text
Organization: SixteenMemory
Private repository: sixteen-memory
Owner / 日常提交账号: Chengyuann
```

组织代表公司，个人账号代表实际贡献者。这样提交记录、二步验证、访问回收和后续增加成员
都更清楚。不要多人共用一个`SixteenMemory`登录密码或长期Token。

未来如果需要开源：

```text
SixteenMemory/sixteen-memory       私有主仓库
SixteenMemory/<public-project>     单独公开仓库
```

公开仓库应从主仓库挑选可发布内容，不应直接把核心私有仓库改为公开。

## 首个私有仓库范围

纳入：

- `product/`：Worker、管理台、SDK、示例、测试和评估脚本；
- `homepage/`：官网源码、素材来源说明、页面检查；
- `docs/`：产品、集成、Mem0学习记录和代码库说明；
- 顶层Plan及构建配置中与产品直接相关的内容。

排除：

- `.agent/`、截图、临时图表、`output/`和本地浏览器记录；
- `.dev.vars`、`.local/`、`.wrangler/`、生产Key与供应商凭证；
- `node_modules/`、`dist/`与TypeScript缓存；
- 真实模型响应、生产数据、本地数据库和部署会话。

## 初次建库步骤

1. 在GitHub创建`SixteenMemory`组织，并确认`Chengyuann`为Owner。
2. 在组织下创建私有仓库`sixteen-memory`，不自动添加README、LICENSE或`.gitignore`。
3. 在单独目录准备干净的首次提交，不直接推当前混合工作区。
4. 设置提交身份为个人GitHub账号对应的名称和邮箱。
5. 推送`main`后检查仓库可见性、文件列表和密钥扫描。
6. 按实际套餐确认分支保护是否可用；GitHub Free组织的私有仓库不提供全部保护功能，
   不能把`CODEOWNERS`文件当作已强制执行的审批。升级付费套餐需另行批准。
7. 后续使用个人账号分支和Pull Request协作。

## 待用户确认

- 组织使用`SixteenMemory`还是其他可用名称；
- 私有仓库名是否使用`sixteen-memory`；
- 组织联系邮箱和公司归属信息；
- 组织创建完成后，是否立即创建并推送首次提交。

本地首次提交将使用`Chengyuann`对应的GitHub noreply邮箱，不使用当前工作区中的雇主邮箱。
此设置只作用于新的本地仓库，不改全局Git配置。
