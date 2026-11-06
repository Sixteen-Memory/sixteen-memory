# v0.2.1 第一轮API增量（本地候选，未上线）

## 事实槽位

`worker/fact-slots.ts`维护版本化注册表`self-facts/1`：

- `user.home_city`：仅常住城市；接受residence_city/current_residence_city两个审核过的别名。
- `user.preferred_language`：长期沟通语言。
- `user.commute_mode`：主要日常通勤方式。
- `user.timezone`：显式时区，不按城市推断。

`user.current_city`不归入常住城市；未注册槽位可以抽取，但必须人工审核。
旧记录别名通过候选检索展开匹配，不批量覆写原历史。多个候选、手工更正、
时间不明确、来源支持不足继续送审，返回`review_reasons`。

## 属性写入

```json
{
  "metadata": {"priority": 2, "vip": true, "ticket": "demo-42"},
  "category": "support",
  "event_time": "2026-11-01T08:00:00+08:00",
  "valid_from": "2026-11-01T00:00:00Z",
  "valid_to": "2026-12-01T00:00:00Z"
}
```

可用于显式新增/更新和ingestion的调用方属性。模型不决定metadata或有效时间。
metadata最多16个平面字段、4096字节；值只能为string≤256、有限number、boolean、null。
不接受数组、嵌套对象和特殊原型字段。分类最多64字符，采用标识符字符集。
所有时间必须含时区并为真实日历值，保存为UTC。

新增默认metadata={}，其余null；更新省略新属性保留旧值，metadata={}和category=null
明确清空。metadata是整体替换而不是深度合并。已保存历史包含每版属性，旧历史默认空值，
不伪造旧事件时间。ingestion merge只增加证据，属性不同报冲突，不静默覆盖分类或元数据。

## 检索筛选

`POST /v1/search`和`POST /v1/answer`：

```json
{
  "user_id": "customer-42",
  "query": "退款进度",
  "mode": "lexical",
  "filter": {
    "AND": [
      {"field":"category","op":"eq","value":"support"},
      {"field":"metadata.priority","op":"gte","value":2}
    ]
  },
  "at": "2026-11-05T08:00:00+08:00",
  "limit": 10
}
```

- `AND/OR`每节点1–8子项；`NOT`一个子条件；总节点≤32、深度≤4。
- 编译后筛选最多80个绑定参数，过大组合返回422而不是数据库错误。
- 叶子严格为`field/op/value`。
- 字段：metadata.平面字段、category、event_time、valid_from/to、created_at、
  updated_at、origin、fact_key、source.type/ref/observed_at。
- 不接受user_id/project_id/role作为filter字段；权限范围始终由服务端Key校验，
  不因OR/NOT变宽。
- 操作eq/ne/in/gt/gte/lt/lte/exists；范围比较仅数字/时间；in最多16值。
- 类型严格区分true、1和"1"；metadata `eq:null`匹配显式null，不匹配缺字段。
  `exists`判断字段是否存在；`ne`排除缺字段；NOT(eq)可包含缺字段。
- SQL标识符白名单、路径和值参数绑定；筛选发生在limit之前。
- lexical/semantic/hybrid和显式fallback保留相同filter/at。

GET列表/导出用URL编码后的JSON `filter`参数；SDK list/exportPage自动编码。
列表/导出不自动按有效时间隐藏，供管理查看；按有效时间检索使用search。

## 三种时间不是同一回事

- `source.observed_at`：收到来源的时间，维护更新顺序沿用此字段。
- `event_time`：调用方声明的事件发生时间，只用于筛选，不自动推断。
- `valid_from/to`：当前记录的有效窗口`[from,to)`；search默认按本次请求时间判断。
- `expires_at`：实际在线物理清理时间。与“暂不召回”不同，不支持复活。

**`at`不是历史快照/as-of查询。** 它只筛当前保存版本的有效窗口；不恢复旧版本、
删除记录或过期数据，不意味着实现了双时间线或历史时间推理。

## threshold

仅semantic/hybrid支持显式0..1数值，为**余弦门槛**，不是概率/统一score。
hybrid设置threshold时，词法命中也要通过同一余弦门槛；返回score仍是RRF。
lexical或带fallback:"lexical"的请求不接受threshold，避免静默丢失门槛。
未配置threshold保留原混合检索语义。

索引覆盖仍检查整个用户范围，不能用窄filter掩盖缺失索引；若过滤后无命中且
覆盖完整，不产生Embedding请求。仍为每用户1000条、最高2048维的小规模实现。

## 还未交付

真实模型质量、通用时间推理、统一异步队列、用户画像、OpenAPI/Python发布包、MCP、
多组织、计费、SSO和新版官网页面。本轮只交API基础与审核材料。

## 升级与回退

迁移增加memories/history字段并保留旧值，初始化可重复执行。**不能直接降级回旧Worker**：
旧版history使用无列名INSERT，与新增列不兼容。未来生产升级前必须先备份并验证恢复，
采用与新schema兼容的前向修复或整体恢复；本轮没有做生产备份/恢复演练。
