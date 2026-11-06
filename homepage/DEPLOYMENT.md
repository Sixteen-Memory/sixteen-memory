# 官网部署边界

官网构建到`dist/`，目标配置为Cloudflare Pages项目`sixteenmemory-homepage`。
本仓库没有登录信息或部署Token。历史发布记录保留在原工作区，不随源码导入。

```sh
npm ci
npm run deploy:check
```

此命令运行网站检查和构建，不发布官网。只有获得当前发布授权才能运行`npm run deploy`。
发布仅上传网站静态文件，不修改产品Worker、数据、模型配置、DNS或邮件。
推送GitHub不等于批准上线，目前没有自动部署工作流。

上线后按实际托管行为检查主域、独立页面、资源、语言切换和404。
如果发布失败或结果不明，先查远程部署状态，不重复上传。
