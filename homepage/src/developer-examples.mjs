export const snippets = {
  js: `import { SixteenMemory } from "@sixteen-memory/sdk";

const memory = new SixteenMemory({
  baseUrl: "https://console.sixteenmemory.com",
  apiKey: process.env.SIXTEEN_API_KEY
});

const saved = await memory.add({
  request_id: "synthetic-ticket-884",
  user_id: "customer-42",
  content: "Replacement shipped; refund still open.",
  source: {
    type: "business",
    ref: "synthetic-ticket-884",
    text: "Replacement shipped; refund still open.",
    observed_at: "2026-11-05T09:00:00Z"
  },
  expires_at: null
});

const results = await memory.search({
  user_id: "customer-42",
  query: "refund open",
  limit: 10
});

await memory.delete(saved.id, saved.version);`,
  rest: `curl https://console.sixteenmemory.com/v1/memories \\
  -H "Authorization: Bearer $SIXTEEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "request_id": "synthetic-ticket-884",
    "user_id": "customer-42",
    "content": "Replacement shipped; refund still open.",
    "source": {
      "type": "business",
      "ref": "synthetic-ticket-884",
      "text": "Replacement shipped; refund still open.",
      "observed_at": "2026-11-05T09:00:00Z"
    },
    "expires_at": null
  }'

curl https://console.sixteenmemory.com/v1/search \\
  -H "Authorization: Bearer $SIXTEEN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"user_id":"customer-42","query":"refund open","limit":10}'`
};

export const endpoints = [
  ["POST", "/v1/memories", "新增 / Create"],
  ["POST", "/v1/search", "检索 / Search"],
  ["GET", "/v1/memories", "列表 / List"],
  ["GET", "/v1/memories/:id", "读取 / Read"],
  ["PATCH", "/v1/memories/:id", "更新 / Update"],
  ["GET", "/v1/memories/:id/history", "历史 / History"],
  ["POST", "/v1/memories/:id/revoke", "停用 / Deactivate"],
  ["DELETE", "/v1/memories/:id", "删除 / Delete"],
  ["GET", "/v1/export", "导出 / Export"]
];

