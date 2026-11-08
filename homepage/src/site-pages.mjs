/** @typedef {{zh:string,en:string}} Bilingual */
/** @typedef {{title:Bilingual,body:Bilingual,state?:string}} PageItem */
/** @typedef {{id:string,title:Bilingual,body:Bilingual,items:PageItem[]}} PageSection */
/** @typedef {{path:string,nav:Bilingual,kicker:string,title:Bilingual,description:Bilingual,kind:string,sections:PageSection[],related:string[]}} SitePage */
export const siteOrigin = "https://www.sixteenmemory.com";
export const statusDate = "2026-11-08";
export const primaryNavigation = [
  { path: "/product/memory", zh: "产品", en: "Product" },
  { path: "/integrations", zh: "集成", en: "Integrations" },
  { path: "/docs", zh: "文档", en: "Docs" },
  { path: "/status", zh: "产品状态", en: "Status" }
];
export const routeHref = (path, language = "zh") => {
  if (!path.startsWith("/")) return path;
  const [pathname, hash] = path.split("#");
  const route = pathname.endsWith("/") ? pathname : pathname + "/";
  return `${route}${language === "en" ? "?lang=en" : ""}${hash ? `#${hash}` : ""}`;
};
export const normalizePath = path => path.replace(/\/+$/, "") || "/";
export const label = (zh, en) => ({ zh, en });
export const states = {
  live: label("线上可用", "Available online"),
  local: label("开发中 · 未上线", "In development · not live"),
  planned: label("规划中", "Planned")
};
// Only public capability descriptions belong here; never import operator settings.
export const capabilities = [
  { id: "memory", state: "live", title: label("显式记忆管理", "Explicit memory"), detail: label("保存、读取、更新、查看历史、停用、删除与分页导出。", "Create, read, update, inspect history, deactivate, delete and export in pages."), path: "/product/memory" },
  { id: "scope", state: "live", title: label("用户范围与权限", "User-scoped access"), detail: label("普通 Key 绑定一个用户范围，读写权限由服务端检查。", "Regular keys belong to one user scope, with read and write permissions checked by the service."), path: "/security" },
  { id: "lexical", state: "live", title: label("词法检索", "Lexical retrieval"), detail: label("按中文与英文词语查找当前有效记忆，随结果返回来源。", "Find active memories by Chinese and English terms, with sources included."), path: "/product/retrieval" },
  { id: "console", state: "live", title: label("控制台与开发接入", "Console and API access"), detail: label("管理台、REST、OpenAPI 3.1 与 TypeScript / JavaScript SDK 下载包。", "A management console, REST, OpenAPI 3.1 and a downloadable TypeScript / JavaScript SDK."), path: "/integrations" },
  { id: "extraction", state: "local", title: label("抽取与事实更新", "Extraction and fact updates"), detail: label("开发版本支持从对话提取候选事实；有歧义时交由人工检查。", "The development version extracts candidate facts from conversations and sends ambiguous changes for review."), path: "/product/memory" },
  { id: "semantic", state: "local", title: label("千问语义与混合检索", "Qwen semantic and hybrid search"), detail: label("向量接入代码已准备，尚未完成真实模型效果检查，也未向线上开放。", "The embedding integration is prepared. Real-model quality has not been checked and the feature is not live."), path: "/product/retrieval" },
  { id: "filters", state: "local", title: label("分类、元数据与时间筛选", "Categories, metadata and time filters"), detail: label("开发 API 支持组合筛选与有效时间窗口；不是历史快照查询。", "The development API supports compound filters and validity windows, not historical snapshots."), path: "/product/retrieval" },
  { id: "profile", state: "planned", title: label("用户画像与只读 MCP", "Profiles and read-only MCP"), detail: label("希望让常用背景和偏好更容易被 Agent 使用，目前没有开放接口。", "Planned ways to supply recurring background and preferences to agents. No public endpoints yet."), path: "/integrations" },
  { id: "sdk", state: "planned", title: label("更多 SDK 与通知能力", "More SDKs and notifications"), detail: label("Python 发布包、npm 注册表发布、Webhook 和反馈接口尚未提供。", "A Python package, npm registry release, webhooks and feedback endpoints are not available yet."), path: "/integrations" },
  { id: "teams", state: "planned", title: label("团队与企业管理", "Teams and enterprise controls"), detail: label("组织成员、SSO、自助注册和计费仍待实现。", "Organization membership, SSO, self-service signup and billing remain planned."), path: "/usage" }
];
/** @param {string} id @param {Bilingual} title @param {Bilingual} body @param {PageItem[]} items @returns {PageSection} */
const section = (id, title, body, items = []) => ({ id, title, body, items });
/** @param {Bilingual} title @param {Bilingual} body @param {string} [state] @returns {PageItem} */
const item = (title, body, state) => ({ title, body, state });
/** @param {string} path @param {Bilingual} nav @param {string} kicker @param {Bilingual} title @param {Bilingual} description @param {string} kind @param {PageSection[]} sections @param {string[]} related @returns {SitePage} */
const page = (path, nav, kicker, title, description, kind, sections, related) => ({ path, nav, kicker, title, description, kind, sections, related });
export const sitePages = [
  page("/product/memory", label("记忆管理", "Memory"), "PRODUCT / MEMORY",
    label("每条记忆，\n都能找到来处。", "Every memory.\nA source you can inspect."),
    label("为已有 Agent 保存重要上下文。从第一次写入到更新、停用与删除，让信息的来处和变化始终清楚。", "Save important context for an existing agent. From the first write to updates and deletion, keep its source and changes visible."),
    "memory", [
      section("lifecycle", label("保存之后，也要容易管理。", "Useful beyond the first write."),
        label("线上版本从显式写入开始：由你的应用决定保存什么，SixteenMemory 负责存储、检索和版本管理。", "The live version starts with explicit writes. Your application decides what to save; SixteenMemory handles storage, retrieval and versioning."), [
          item(label("保存上下文", "Save context"), label("提交正文、来源、用户范围和请求 ID。相同请求再次提交不会新增一条记录。", "Submit content, source, user scope and request ID. Sending the same request again does not create another record."), "live"),
          item(label("更新当前事实", "Keep facts current"), label("更新时带上当前版本号，避免覆盖并发修改。之前的内容与来源保留在历史中。", "Provide the current version to prevent overwriting concurrent changes. Earlier content and sources remain in history."), "live"),
          item(label("停用或删除", "Deactivate or delete"), label("停用后不再进入检索；删除会清除在线正文、历史和索引。备份保留另有边界。", "Deactivated records leave search. Deletion removes online content, history and indexes; backup retention is a separate concern."), "live")
        ]),
      section("responsibility", label("你的 Agent，仍然负责业务动作。", "Your agent still owns the action."),
        label("记忆记录不是业务凭证，也不是退款、审批或发货的执行结果。应用提交的来源会被保留，但来源本身是否可信，需要由业务系统判断。", "A memory is not proof that a refund, approval or shipment happened. The submitted source is retained, but its trustworthiness belongs to your business system.")),
      section("extraction", label("下一步：从对话中整理候选事实。", "Next: candidate facts from conversations."),
        label("开发版本正在连接抽取、事实字段归一和审核流程。明确的新事实可以提出更新；不确定的内容会留给人工检查。这些能力尚未上线。", "The development version connects extraction, consistent fact fields and review. Clear changes can propose an update; uncertain content stays for human inspection. These capabilities are not live."), [
          item(label("证据原文", "Source excerpts"), label("候选事实必须对应用户消息中的原文，助手的表述不能直接作为事实依据。", "Candidate facts must point to original user text. An assistant statement is not sufficient evidence."), "local"),
          item(label("保守处理歧义", "Keep ambiguity visible"), label("临时位置不等于常住城市，其他人的信息不等于用户本人；不能明确对应时保留审核原因。", "A temporary location is not a home city; another person's details are not the user's. Ambiguity receives a review reason."), "local")
        ])
    ], ["/docs", "/product/retrieval", "/security"]),
  page("/product/retrieval", label("检索", "Retrieval"), "PRODUCT / RETRIEVAL",
    label("把相关记忆，\n带回当前任务。", "Relevant memory.\nBack in the task."),
    label("先按用户范围找对信息，再由你的 Agent 决定如何使用。来源与当前内容一起返回，不代替业务判断。", "Find the right information within the user's scope, then let your agent decide how to use it. Sources travel with the content."),
    "retrieval", [
      section("live-search", label("从可用的检索开始。", "Start with the search available now."),
        label("线上 v0.1.0 使用中文与英文词法检索。已停用或到期清理的记忆不会进入结果；搜索不跨越普通 Key 的用户范围。", "Online v0.1.0 uses Chinese and English lexical retrieval. Deactivated or expired-and-removed records are excluded, and searches stay within regular keys' user scopes."), [
          item(label("范围明确", "A clear scope"), label("请求传入 user_id，服务端再用 Key 权限检查，不能靠修改请求读取别人的记忆。", "Pass user_id in the request. The service checks it against key permissions rather than trusting the request alone."), "live"),
          item(label("来源随结果返回", "Sources in the response"), label("每条结果保留 ID、内容和来源，应用可以据此展示引用或继续查询历史。", "Each result retains its ID, content and source so your application can show references or inspect history."), "live")
        ]),
      section("next-search", label("语义与筛选，分步接入。", "Add semantics and filters in steps."),
        label("以下为开发版本能力，不是当前线上服务承诺。它们仍需完成真实调用检查和发布。", "The following features exist in development, not as a promise about the current online service. They still need real-call checks and release."), [
          item(label("千问 Embedding", "Qwen embeddings"), label("语义与混合检索接入已准备；检索质量、实际延迟和费用尚未对外公布。", "Semantic and hybrid integration is prepared. Retrieval quality, measured latency and costs are not published."), "local"),
          item(label("组合筛选", "Compound filters"), label("分类、平面元数据和时间字段可使用 AND、OR、NOT 组合；权限范围不会因此扩大。", "Combine categories, flat metadata and time fields with AND, OR and NOT without widening permissions."), "local"),
          item(label("有效时间", "Validity windows"), label("只检查当前保存版本是否在有效窗口内，不从过去的版本恢复答案。", "Check whether the current saved version falls within its validity window, without reconstructing past versions."), "local")
        ])
    ], ["/docs", "/product/memory", "/status"]),
  page("/integrations", label("集成", "Integrations"), "BUILD / INTEGRATIONS",
    label("接入已有应用，\n不重做你的 Agent。", "Add memory.\nKeep your agent."),
    label("从 REST 或 JavaScript 客户端开始，把记忆放到已有工作流中。控制台负责查看与管理，业务逻辑仍留在你的应用。", "Begin with REST or the JavaScript client. Use the console for inspection and management while keeping business logic in your application."),
    "integrations", [
      section("available-tools", label("现在可以使用的入口。", "The ways in today."),
        label("OpenAPI 和类型化 SDK 对应线上 v0.1 API。SDK 通过官网下载包安装，尚未发布到 npm 注册表。实验接口不在稳定包中。", "OpenAPI and the typed SDK target the online v0.1 API. Install the package from this website; it is not in the npm registry. Experimental endpoints are excluded from the stable package.")),
      section("planned-tools", label("更多入口，不做空的承诺。", "More ways in, clearly labeled."), label("这些方向已列入计划，但现在没有可连接的服务或安装包。", "These are planned directions, not services or packages you can connect to today."), [
        item(label("只读 MCP", "Read-only MCP"), label("计划提供带权限范围的记忆召回工具。目前没有 MCP Server 地址。", "A scoped recall tool is planned. There is no MCP Server URL yet."), "planned"),
        item(label("Python SDK", "Python SDK"), label("Python 发布包尚未提供；现在可使用 OpenAPI 描述生成客户端，或直接调用 REST。", "A Python release is not available yet. Use the OpenAPI document to generate a client or call REST directly."), "planned"),
        item(label("通知与反馈", "Notifications and feedback"), label("Webhook、反馈和统一后台任务仍待实现，不需要为不存在的接口预留集成。", "Webhooks, feedback and unified background jobs are not implemented yet."), "planned")
      ])
    ], ["/docs", "/usage", "/status"]),
  page("/docs", label("文档", "Docs"), "BUILD / DOCUMENTATION",
    label("第一次接入，\n从一条记忆开始。", "Your first integration.\nOne memory at a time."),
    label("取得测试 Key，保存合成数据，检索，再查看来源和历史。这里的示例对应线上 v0.1.0 核心 API。", "Get a test key, save synthetic data, retrieve it, then inspect its source and history. These examples target the live v0.1.0 core API."),
    "docs", [
      section("getting-started", label("三个接入步骤。", "Three steps to start."), label("Key 仅放在应用服务端或本机环境变量中，不嵌入网页、代码仓库或公开截图。", "Keep keys in your server or local environment, never in a webpage, repository or public screenshot."), [
        item(label("01 / 获取测试 Key", "01 / Get a test key"), label("由管理员提供绑定用户范围的凭证。当前没有自助注册入口，可通过公开邮箱讨论接入。", "An administrator supplies a user-scoped credential. There is no self-service signup yet; contact the public mailbox for access.")),
        item(label("02 / 写入与检索", "02 / Write and search"), label("使用下面的 JavaScript 或 REST 示例，仅替换用户范围和环境变量。先使用合成数据。", "Use the JavaScript or REST example below with your user scope and environment variable. Start with synthetic data.")),
        item(label("03 / 查看与管理", "03 / Inspect and manage"), label("在控制台检查来源、当前版本和历史。需要删除时提供当前版本号。", "Inspect sources, the current version and history in the console. Provide the current version when deleting."))
      ]),
      section("request-fields", label("一次写入，需要哪些字段？", "What goes into a write?"), label("保持请求 ID 稳定可避免相同请求重复保存。相同 ID 改了内容会返回冲突，不应无限重试。", "A stable request ID prevents the same request from being saved twice. Reusing it with changed content returns a conflict, not a reason to retry indefinitely.")),
      section("errors", label("先理解错误，再决定下一步。", "Understand the error before retrying."), label("客户端保留 HTTP 状态和 error.code。不要把权限失败、版本冲突或缺少模型配置当成网络重试问题。", "The client preserves the HTTP status and error.code. Permission failures, version conflicts and missing model configuration are not network retry problems."))
    ], ["/integrations", "/security", "/status"]),
  page("/security", label("安全", "Security"), "TRUST / SECURITY",
    label("记住重要信息，\n也清楚访问边界。", "Remember what matters.\nKnow who can access it."),
    label("从用户范围、Key 权限到来源和删除，说明当前实现能做什么，也说明它没有覆盖什么。", "Understand the current scope, key permissions, sources and deletion behavior—and what they do not cover."),
    "security", [
      section("access", label("访问从服务端检查。", "Access is checked by the service."), label("普通 Key 绑定一个用户范围，分为只读和读写。管理员凭证用于管理工作，不能直接放入浏览器代码。", "Regular keys are bound to one user scope and allow read-only or read/write access. Administrator credentials are for management, not browser code."), [
        item(label("最小权限接入", "Use limited keys"), label("给每个应用场景选择需要的用户范围和权限。不依赖前端隐藏按钮来隔离数据。", "Choose the scope and permissions needed for each use. Hiding a frontend button does not isolate data."), "live"),
        item(label("撤销凭证", "Revoke credentials"), label("管理员可停用 Key。控制台使用服务端会话，退出会清除对应会话。", "Administrators can revoke keys. The console uses server-side sessions and logout removes the session."), "live"),
        item(label("团队身份能力", "Team identity"), label("组织成员、SSO 与 SCIM 尚未提供。当前权限模型不能替代企业身份系统。", "Organization membership, SSO and SCIM are not available. The current access model does not replace enterprise identity."), "planned")
      ]),
      section("data-path", label("数据会经过哪里？", "Where does the data go?"),
        label("官网不接收记忆正文或 API Key。你主动打开控制台或调用 API 后，数据才进入独立产品服务。开发中的模型路径会把选定文本发给配置的供应商；本地运行不等于全程离线。", "This website does not receive memory content or API keys. Data enters the separate product service when you use the console or API. Development model paths send selected text to the configured provider; local operation does not mean fully offline.")),
      section("deletion", label("停用、删除、备份，各有含义。", "Deactivation, deletion and backups differ."), label("停用只把记录移出检索；删除清除在线正文、历史、证据与索引。平台备份可能仍有保留期，本产品不宣称所有备份已即时擦除。", "Deactivation removes a record from search. Deletion clears online content, history, evidence and indexes. Platform backups may have retention periods; immediate erasure of every backup is not claimed.")),
      section("assurance", label("公开说明，不替代认证。", "Clear documentation is not certification."),
        label("目前没有公开合规认证、生产 SLA 或安全评估报告。请求记录用于排查，但不宣称是完整企业审计日志。讨论企业试点时，应单独确认地区、保留期、恢复方式和支持访问权限。", "There are no public compliance certifications, production SLAs or security assessment reports. Request records aid debugging but are not claimed as a complete enterprise audit trail. Confirm regions, retention, recovery and support access for an enterprise pilot."))
    ], ["/deployment", "/product/memory", "/usage"]),
  page("/deployment", label("部署", "Deployment"), "TRUST / DEPLOYMENT",
    label("先明确运行方式，\n再选择部署环境。", "Know how it runs.\nThen choose where."),
    label("官网、产品控制台与记忆服务分别部署。把网站上线，不会自动发布后端或开放开发中的模型能力。", "The website, console and memory service are deployed separately. Publishing the website does not release the backend or enable development model features."),
    "deployment", [
      section("options", label("当前两条运行路径。", "Two current ways to run."), label("下面描述的是已有实现，不代表企业私有化安装或生产规模承诺。", "These are implemented paths, not guarantees of enterprise private deployment or production scale."), [
        item(label("托管开发预览", "Hosted developer preview"), label("通过现有控制台与 API 使用显式记忆基础能力。需要管理员分配 Key。", "Use explicit-memory foundations through the existing console and API. An administrator must supply a key."), "live"),
        item(label("本地开发环境", "Local development"), label("本地 Worker 与 SQLite 用于开发。可选模型路径仍需外部供应商凭证与网络。", "A local Worker and SQLite support development. Optional model paths still need provider credentials and network access."), "local")
      ]),
      section("architecture", label("三部分，各自发布。", "Three parts. Separate releases."), label("静态官网介绍产品；控制台提供管理界面；记忆 API 检查权限并读写数据。模型只在配置和启用之后进入流程。", "The static website describes the product, the console provides management, and the memory API checks access and handles data. Models participate only after configuration and enablement.")),
      section("before-production", label("进入生产环境前，需要确认。", "Before a production deployment."), label("按你的业务量和数据要求检查，而不是凭页面上的功能清单做判断。", "Check against your workload and data requirements rather than relying on a feature list."), [
        item(label("数据与地区", "Data and region"), label("确认客户数据类型、存储地区、模型出网路径和保留期。", "Confirm data types, storage regions, model egress and retention.")),
        item(label("运行与恢复", "Operation and recovery"), label("确认容量、备份恢复、删除传播和与数据库版本兼容的升级方案。", "Confirm capacity, backup recovery, deletion propagation and schema-compatible upgrades.")),
        item(label("身份与费用", "Identity and cost"), label("确认成员权限、支持访问方式、供应商费用和预算控制。", "Confirm member permissions, support access, provider charges and budget controls."))
      ])
    ], ["/security", "/docs", "/usage"]),
  page("/usage", label("试用与用量", "Access and usage"), "START / ACCESS & USAGE",
    label("从一个场景开始，\n再讨论规模。", "Start with one use case.\nThen discuss scale."),
    label("当前开放的是开发预览，而不是自助购买服务。先使用合成数据确认接入方式，再讨论真实业务试点。", "The product is a developer preview, not a self-service purchase. Confirm your integration with synthetic data before discussing a real-business pilot."),
    "usage", [
      section("access", label("如何取得访问权限？", "How do I get access?"), label("通过公开邮箱说明场景、预计用户数和需要的能力。管理员提供测试 Key，不需要在这张网页提交敏感数据。", "Email the public address with your use case, expected users and required capabilities. An administrator supplies a test key; do not submit sensitive data on this website."), [
        item(label("已有测试 Key", "Already have a key"), label("打开控制台或按文档从服务端调用 API，先跑通保存、搜索、更新与删除。", "Open the console or call the API from your server. First try saving, searching, updating and deleting."), "live"),
        item(label("准备评估接入", "Evaluating an integration"), label("可以讨论客服接续等单一场景。不宣称已有公开客户效果，也不提前承诺容量和 SLA。", "Discuss one scenario, such as support continuity. We do not claim published customer results or promise capacity and SLAs in advance.")),
        item(label("自助注册与计费", "Self-service and billing"), label("尚未提供自助创建项目、信用卡购买或客户用量账单。", "Self-service project creation, card purchases and customer usage invoices are not available."), "planned")
      ]),
      section("costs", label("记忆存储与模型费用分开看。", "Separate memory operations from model cost."),
        label("显式写入和词法检索不需要模型调用。启用开发中的抽取、向量或回答功能后，会产生相应供应商调用；价格、免费额度和预算必须按实际账户确认。当前未公布商业套餐。", "Explicit writes and lexical search do not require model calls. Development extraction, embedding and answer features make provider requests when enabled. Confirm prices, free quotas and budgets for the actual account. Commercial plans are not published.")),
      section("limits", label("接口限制，不等于规模承诺。", "Interface limits are not scale guarantees."),
        label("线上 API 的请求体上限为 64 KiB，记忆正文最多 8,000 字符，检索每次返回 1–50 条。项目当前设置 10,000 条记忆上限，这不是已测得的生产容量。", "The live API accepts request bodies up to 64 KiB, memory content up to 8,000 characters and 1–50 search results. The configured project limit is 10,000 memories, not a measured production capacity."))
    ], ["/docs", "/deployment", "/status"]),
  page("/status", label("产品状态", "Product status"), "PRODUCT / AVAILABILITY",
    label("现在能用什么，\n下一步做什么。", "What works today.\nWhat comes next."),
    label("把线上功能、开发版本和计划分开。这里是功能可用性说明，不是实时服务监控或生产 SLA。", "Online features, development work and plans are listed separately. This is feature availability, not live service monitoring or a production SLA."),
    "status", [
      section("availability", label("按能力查看进度。", "Availability by capability."), label("截至 2026 年 11 月 5 日：线上产品为 v0.1.0，开发版本为 v0.2.1。新版网站不会自动改变后端版本。", "As of November 5, 2026: the online product is v0.1.0 and the development version is v0.2.1. A website release does not change the backend version.")),
      section("next", label("当前重点：接入和产品框架。", "Current focus: access and the product foundation."),
        label("优先补齐网站、文档、开发入口与管理流程。真实模型效果检查和更大范围的试点另行安排；没有用合成响应代表模型成绩。", "The priority is the website, docs, developer entry points and management workflows. Real-model quality checks and broader pilots are separate; synthetic responses are not model-quality results."))
    ], ["/product/memory", "/integrations", "/usage"])
];
export const pageForPath = path => sitePages.find(page => page.path === normalizePath(path));
