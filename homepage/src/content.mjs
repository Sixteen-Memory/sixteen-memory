export const contactEmail = "support@sixteenmemory.com";
export const consoleUrl = "https://console.sixteenmemory.com/";
export const quickstartUrl = "https://console.sixteenmemory.com/quickstart";
export const apiHealthUrl = "https://console.sixteenmemory.com/health";
export const sdkDownloadUrl = "/downloads/sixteen-memory-sdk.mjs";
export const sdkPackageUrl = "/downloads/sixteen-memory-sdk-0.1.0.tgz";
export const openapiUrl = "/downloads/openapi.json";

const zh = {
  skip: "跳至正文",
  nav: ["开发接入", "接口与工具", "使用场景", "产品状态"],
  contact: "联系拾陆",
  console: "打开控制台",
  quickstart: "查看接入文档",
  eyebrow: "拾陆记忆 / ENTERPRISE AGENT MEMORY",
  heroTitle: ["让 Agent 记得，", "让记忆延续。"],
  heroIntro: "为已有 Agent 提供可接入、可管理的长期记忆。\n保存重要信息，跟上事实变化，在下一次任务中继续使用。",
  integration: {
    kicker: "DEVELOPER FIRST",
    title: ["先完成一次调用，", "再决定如何深入。"],
    intro: "先获取限定用户范围的测试 Key，再用合成数据完成保存和检索。控制台、Quickstart 和 SDK 源码都在这里，不需要重写现有 Agent。",
    tabs: ["JavaScript", "REST API"],
    labels: ["在线控制台", "接入文档", "API 健康状态"],
    values: ["开发预览可用", "Quickstart 可用", "词法检索在线"]
  },
  resources: {
    "kicker": "DEVELOPER TOOLS",
    "title": [
      "选择适合你的",
      "记忆接入方式。"
    ],
    "intro": "通过 REST API 接入现有应用，查阅字段与错误说明，用 SDK 或控制台管理记忆。可用入口与尚未上线的能力分别列出。",
    "items": [
      {
        "id": "rest",
        "name": "REST API",
        "state": "已上线",
        "body": "保存、检索、读取、更新、历史、停用、删除和导出。使用绑定用户范围的 Key，从服务端调用。",
        "href": "#api-reference",
        "action": "查看接口参考",
        "download": false
      },
      {
        "id": "docs",
        "name": "API 文档",
        "state": "已上线",
        "body": "从创建凭证开始，按 Quickstart 完成保存与检索。请求字段、错误码、数据限制和模型调用边界都有说明。",
        "href": quickstartUrl,
        "action": "阅读 Quickstart",
        "download": false
      },
      {
        "id": "sdk",
        "name": "TypeScript / JavaScript SDK",
        "state": "下载包可用",
        "body": "带请求和响应类型的 Node.js 客户端，无运行时依赖。配套 OpenAPI 3.1；稳定包不包含尚未上线的实验接口。",
        "href": sdkPackageUrl,
        "action": "下载类型化 SDK",
        "download": true
      },
      {
        "id": "console",
        "name": "管理控制台",
        "state": "凭证访问",
        "body": "查看记忆、来源与历史，执行查询、更新、停用和删除。由管理员分配访问凭证，暂不提供自助注册。",
        "href": consoleUrl,
        "action": "进入控制台",
        "download": false
      },
      {
        "id": "requests",
        "name": "请求记录",
        "state": "管理员可用",
        "body": "在控制台的「请求记录」查看最近操作的状态、耗时、凭证标识和时间。日志不包含记忆正文。",
        "href": consoleUrl,
        "action": "登录后查看记录",
        "download": false
      },
      {
        "id": "mcp",
        "name": "MCP",
        "state": "规划中 · 未上线",
        "body": "计划为支持 MCP 的 Agent 提供受权限控制的召回工具。当前没有可连接的 MCP Server；写入、更新和删除仍走明确授权的 API。",
        "href": null,
        "action": "暂不提供连接地址",
        "download": false
      }
    ]
  },
  proof: {
    kicker: "AVAILABLE NOW",
    title: "从保存到删除，记忆有完整的管理流程。",
    intro: "当前线上版本覆盖显式记忆的完整基础流程。智能能力仍在单独验证，不混在已上线能力里。",
    items: [
      ["完整基础流程", "新增、读取、列表、更新、历史、停用、删除、到期清理和分页导出。"],
      ["服务端访问范围", "管理员凭证，以及绑定用户范围的只读或读写 Key；跨范围请求由服务端拒绝。"],
      ["真实管理界面", "查看记忆、来源、历史、检索结果、API Key 和请求记录。"],
      ["开发者接入", "无运行依赖的 JavaScript SDK、REST 接口说明和客户服务接续示例。"]
    ]
  },
  lifecycle: {
    kicker: "HOW IT WORKS",
    title: ["一套清楚的流程，", "贯穿记忆的使用周期。"],
    intro: "Agent 继续负责业务与最终响应。拾陆负责保存任务需要的信息，提供当前有效内容，并让开发和运维人员可以检查和处理。",
    steps: [
      ["01", "保存", "由应用提交正文、来源、用户范围和请求标识。同一请求重复提交不会重复创建。"],
      ["02", "查找", "根据当前用户范围查找有效记忆。线上基础版使用中文和英文词法检索。"],
      ["03", "更新", "修改时带上已有版本，避免覆盖并发变化；旧内容和来源保留在历史中。"],
      ["04", "管理", "在控制台查看来源和历史，停用不应再返回的信息，或删除在线正文与检索索引。"]
    ]
  },
  usecase: {
    kicker: "FIRST USE CASE",
    title: ["先把客户服务，", "真正接续起来。"],
    intro: "同一位客户隔几天再次联系时，Agent 需要知道已经确认的信息、做过的处理和仍待解决的事项，而不是让客户重新说明。",
    cards: [
      ["跨会话接续", "下一次会话按用户范围查找已有记录，让 Agent 从当前进度继续。"],
      ["后续反馈另行保存", "重复提交只保存一次；客户后来再次反馈同一问题时，作为新的记录保留。"],
      ["来源可查", "每条记录保存调用方提供的依据，方便开发人员定位信息从哪里进入系统。"]
    ],
    note: "当前页面展示产品结构和已验证接口行为，不代表已经取得客户成效数据。"
  },
  enterprise: {
    kicker: "CONTROL BY DESIGN",
    title: ["记忆进入生产环境，", "控制能力不能随后再补。"],
    items: [
      ["权限", "读取、写入和管理均由服务端检查 Key 的角色和用户范围。"],
      ["可见", "控制台展示来源、历史和请求记录，方便开发与运维人员排查问题。"],
      ["可部署", "已有 Cloudflare 与本地 SQLite 运行路径；客户环境的安装、备份和恢复仍需按场景验收。"]
    ]
  },
  status: {
    kicker: "PRODUCT STATUS",
    title: ["已经完成什么，", "还差什么。"],
    liveTitle: "线上基础产品",
    live: ["显式记忆完整基础流程", "限定用户范围的 Key", "管理控制台与请求记录", "JavaScript SDK 开发预览与 Quickstart"],
    nextTitle: "进入外部试点前",
    next: ["自动抽取和语义检索的真实模型验证；MCP 召回入口", "多组织身份、SSO 与成员管理", "备份恢复、容量、延迟和费用测试", "同条件 Mem0 对照与真实客户试点"],
    boundary: "当前控制台是开发预览。没有公开客户结果、合规认证或性能承诺。"
  },
  cta: {
    kicker: "START WITH THE PRODUCT",
    title: "先用合成数据，跑通一次完整流程。",
    intro: "如果你正在为已有 Agent 增加跨会话记忆，可以从 Quickstart 开始；需要讨论接入边界或部署方式，再联系我们。"
  },
  privacy: "隐私说明",
  privacyTitle: "简单、克制的数据使用。",
  privacyBody: "本网站不设置注册表单，不加载第三方分析脚本。网站托管服务商可能为安全和运行记录必要的访问日志。点击控制台和接入文档会前往拾陆记忆的独立产品子域；点击联系链接会打开你的邮件软件。",
  close: "关闭"
};

const en = {


  skip: "Skip to content",
  nav: ["Developers", "API & tools", "Use case", "Status"],
  contact: "Contact us",
  console: "Open console",
  quickstart: "Read Quickstart",
  eyebrow: "SixteenMemory / MANAGED MEMORY FOR AGENTS",
  heroTitle: ["Memory your Agent can use.", "Continuity across every task."],
  heroIntro: "A managed memory layer for existing Agents.\nKeep important context, stay with changing facts, and carry the work into the next task.",
  integration: {
    kicker: "DEVELOPER FIRST",
    title: ["Make one real call,", "then decide what comes next."],
    intro: "Start with a test key scoped to one user, then save and search synthetic data. Find the console, Quickstart and SDK source here without rebuilding your Agent.",
    tabs: ["JavaScript", "REST API"],
    labels: ["Live console", "Quickstart", "API health"],
    values: ["Developer preview", "Available", "Lexical search online"]
  },
  resources: {
    "kicker": "DEVELOPER TOOLS",
    "title": [
      "Choose how memory",
      "joins your application."
    ],
    "intro": "Use REST to connect your application, check fields and errors in the docs, and manage memories with the SDK or console. Available tools and planned capabilities are listed separately.",
    "items": [
      {
        "id": "rest",
        "name": "REST API",
        "state": "Available",
        "body": "Create, search, read, update, history, deactivate, delete and export. Call from your server with a user-scoped key.",
        "href": "#api-reference",
        "action": "View API reference",
        "download": false
      },
      {
        "id": "docs",
        "name": "API docs",
        "state": "Available",
        "body": "Create credentials and follow the Quickstart through a write and search. Includes request fields, errors, limits and model-call boundaries.",
        "href": quickstartUrl,
        "action": "Read Quickstart",
        "download": false
      },
      {
        "id": "sdk",
        "name": "TypeScript / JavaScript SDK",
        "state": "Download available",
        "body": "Typed Node.js requests and responses with no runtime dependencies. Includes OpenAPI 3.1; unreleased experimental endpoints are excluded.",
        "href": sdkPackageUrl,
        "action": "Download typed SDK",
        "download": true
      },
      {
        "id": "console",
        "name": "Console",
        "state": "Key required",
        "body": "Inspect memories, sources and history; search, update, deactivate or delete. An administrator supplies credentials. No self-service sign-up yet.",
        "href": consoleUrl,
        "action": "Open console",
        "download": false
      },
      {
        "id": "requests",
        "name": "Request records",
        "state": "Admin access",
        "body": "Open Request records in the console to inspect recent operations, status, latency, credential ID and time. Logs do not include memory content.",
        "href": consoleUrl,
        "action": "Sign in to inspect",
        "download": false
      },
      {
        "id": "mcp",
        "name": "MCP",
        "state": "Planned · not live",
        "body": "A permission-scoped recall tool for MCP clients is planned. No MCP Server is available yet. Writes, updates and deletes remain explicitly authorized API operations.",
        "href": null,
        "action": "No connection endpoint yet",
        "download": false
      }
    ]
  },
  proof: {
    kicker: "AVAILABLE NOW",
    title: "Manage a memory from its first write to deletion.",
    intro: "The current online version covers the explicit-memory lifecycle. Intelligent processing remains a separately tested development path.",
    items: [
      ["Core lifecycle", "Create, read, list, update, history, deactivate, delete, expiry cleanup and paginated export."],
      ["Server-side scope", "Admin credentials and user-bound read or write keys. Requests outside their scope are rejected by the service."],
      ["Working console", "Inspect memories, sources, history, search results, API keys and request records."],
      ["Developer path", "A dependency-free JavaScript SDK, REST reference and a customer-continuity example."]
    ]
  },
  lifecycle: {
    kicker: "HOW IT WORKS",
    title: ["One clear workflow,", "across the life of a memory."],
    intro: "Your Agent still owns business actions and final responses. SixteenMemory stores task context, returns current information, and gives developers a practical way to inspect and manage it.",
    steps: [
      ["01", "Create", "Submit content, source, user scope and request ID. Retrying the same request does not create another record."],
      ["02", "Find", "Search active memories within the key's user scope. The online foundation currently uses Chinese and English lexical search."],
      ["03", "Update", "Send the expected version to avoid overwriting concurrent changes. Previous content and sources remain in history."],
      ["04", "Manage", "Inspect source and history, deactivate records that should leave search, or delete online content and indexes."]
    ]
  },
  usecase: {
    kicker: "FIRST USE CASE",
    title: ["Start with customer support", "that can pick up the work."],
    intro: "When a customer returns days later, the Agent needs the confirmed facts, actions already taken and work still open—not another retelling from zero.",
    cards: [
      ["Across conversations", "Search by user scope so the next session can continue from the current state."],
      ["New follow-up stays new", "Retries save once. The same issue reported later remains a new record for follow-up."],
      ["Source included", "Each record retains the basis submitted by the application, helping developers trace how information entered the system."]
    ],
    note: "This page describes the product structure and verified interface behavior. It does not claim measured customer outcomes."
  },
  enterprise: {
    kicker: "CONTROL BY DESIGN",
    title: ["Production memory needs control", "from the beginning."],
    items: [
      ["Access", "The service checks the key's role and user scope for reads, writes and management operations."],
      ["Visibility", "The console exposes sources, history and request records for development and operations work."],
      ["Deployment", "Cloudflare and local SQLite paths exist today. Customer installation, backup and recovery still require scenario-specific acceptance."]
    ]
  },
  status: {
    kicker: "PRODUCT STATUS",
    title: ["What is ready,", "and what is not."],
    liveTitle: "Online foundation",
    live: ["Explicit-memory lifecycle", "User-scoped credentials", "Management console and request records", "JavaScript SDK developer preview and Quickstart"],
    nextTitle: "Before an external pilot",
    next: ["Real-model extraction, semantic search and MCP recall entry", "Multi-organization identity, SSO and membership", "Backup, recovery, capacity, latency and cost tests", "Comparable Mem0 study and a real customer pilot"],
    boundary: "The console is a developer preview. There are no public customer results, compliance certifications or performance guarantees."
  },
  cta: {
    kicker: "START WITH THE PRODUCT",
    title: "Run one complete flow with synthetic data.",
    intro: "If your existing Agent needs cross-session memory, begin with the Quickstart. Contact us when you need to discuss access boundaries or deployment."
  },
  privacy: "Privacy",
  privacyTitle: "Less data. Clear boundaries.",
  privacyBody: "This site has no registration form or third-party analytics scripts. Our hosting provider may process essential access logs. Console and Quickstart links open SixteenMemory's separate product subdomain; contact links open your email application.",
  close: "Close"
};

export const content = { zh, en };
