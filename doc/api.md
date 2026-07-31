# h0 平台多语言 API 文档

`scripts/api.js` 封装的 hpfm/iam 平台多语言接口。除 `getPromptByLang` 为公开接口（无需 token）外，其余接口需 `authorization` token（0 租户平台层权限）。

## 公共说明

- host：取自 `.env.json` 项目环境配置的 `host`
- 请求头：`authorization`（token，仅需鉴权接口发送）、`content-type: application/json`、`Accept-Language: zh-CN,zh;q=0.9`、`h-menu-id: -1`（仅需鉴权接口发送）
- 租户：默认 0（0 租户平台层）
- 401：token 过期，抛 `TOKEN_EXPIRED`，需用户提供新 token
- **公开接口（`getPromptByLang`）**：`.env.json` 中 `token` 可为空，`request()` 会在 `token` 为空时跳过 `authorization` 头

---

## 接口列表

### getUserSelf - 校验 token

| 项 | 值 |
|----|---|
| 方法 | `GET` |
| 路径 | `/iam/hzero/v1/users/self` |
| 用途 | 校验 token 有效性（返回当前用户信息） |
| 参数 | `project`(位置参数1), `environment`(位置参数2) -- 必传，无 currentProject 兜底 |
| 返回 | `{ id, loginName, realName, email, ... }` |

调用示例：
```javascript
await api.getUserSelf('hskp-console', 'dev');
```

> **传参规则**：查询函数（getPromptList/getPromptExact/getPromptByLang/getPromptDetail）的 `project`/`environment` 作为**参数对象字段**传；`getUserSelf` 与增删改函数（insertPrompt/updatePrompt/deletePrompt）的 `project`/`environment` 作为**末位位置参数**传（字符串）。详见各函数条目示例。

### getPromptList - 分页查询多语言列表

| 项 | 值 |
|----|---|
| 方法 | `GET` |
| 路径 | `/hpfm/v1/prompts/page-list` |
| 用途 | 分页查询多语言条目；`size=0` 查全部 |
| 参数 | `page`(默认0), `size`(默认10，0=全部), `tenantId`, `promptKey`, `promptCode`, `description`, `keyword` |
| 返回 | `{ content: [...], totalElements, totalPages, number, size }` |

`content` 元素结构：
```json
{
  "promptId": 123,
  "promptKey": "hsop.common",
  "promptCode": "name",
  "description": "名称",
  "objectVersionNumber": 1,
  "_token": "xxx",
  "promptConfigs": { "zh_CN": "名称", "en_US": "Name", ... }
}
```

> **⚠️ 模糊查询警告**：`page-list` 接口的 `promptKey`/`promptCode` 参数为**模糊匹配**（SQL `LIKE`）。例如 `promptKey=1` 会命中 `1`、`10`、`11`、`1xxx` 等所有含 "1" 的记录。**禁止**在 update/delete 前直接用 `getPromptList(...).content[0]` 取目标记录--可能取到错误记录导致改错/删错数据。需要精确取单条记录时**必须用 `getPromptExact`**（下方）。`getPromptList` 仅用于：浏览/分页展示、按 `size=0` 拉全量后自行统计、或配合客户端精确过滤。

> **语言行为**：列表按当前用户语言（由 token 对应用户的 `language` 字段决定，本 skill 固定发送 `Accept-Language: zh-CN`）返回每个 promptKey+promptCode 的**一行**记录，`lang` 字段反映该行语言（通常为 `zh_CN`）。同一 promptCode 的其他语言行不会在列表中返回，`promptConfigs` 也可能只含当前语言。如需查看某 promptCode 的**全部语言翻译**，使用 `getPromptDetail`。

### getPromptExact - 精确查询单条多语言记录

| 项 | 值 |
|----|---|
| 方法 | `GET`（内部调用 `getPromptList` + 客户端精确过滤） |
| 路径 | 复用 `/hpfm/v1/prompts/page-list` |
| 用途 | 按 promptKey + promptCode **精确**查询单条多语言记录；**update/delete 前取 promptId/objectVersionNumber/_token 的首选方法** |
| 参数 | `promptKey`(必填), `promptCode`(必填), `tenantId`, `project`, `environment` |
| 返回 | 单条多语言记录对象（`content` 中精确匹配 `promptKey` 且 `promptCode` 的记录）；未找到抛错，找到多条抛错（预期唯一） |

> **为什么需要这个函数**：`page-list` 是模糊查询，`promptKey=1` 会命中 `1`/`10`/`11` 等。直接取 `content[0]` 可能命中错误记录。`getPromptExact` 内部用 `size=0` 拉全量后按 `promptKey === promptKey && promptCode === promptCode` 精确过滤，保证拿到唯一目标记录。

调用示例：
```javascript
const record = await api.getPromptExact({
  promptKey: 'hskp.test',
  promptCode: 'hello',
  project: 'console',
  environment: 'dev',
});
// record => { promptId, objectVersionNumber, _token, promptKey, promptCode, lang, langDescription, tenantId, ... }
// 未找到 => 抛错：未找到精确匹配的多语言条目...
```

### getPromptDetail - 查询单条详情

| 项 | 值 |
|----|---|
| 方法 | `GET` |
| 路径 | `/hpfm/v1/prompts/detail` |
| 用途 | 按 promptKey + promptCode + lang 查询单条多语言详情 |
| 参数 | 对象：`{ promptKey`(必填), `promptCode`(必填), `lang`(默认 zh_CN), `tenantId`, `project`, `environment` `}` |
| 返回 | 单条多语言对象 |

调用示例：
```javascript
const detail = await api.getPromptDetail({
  promptKey: 'hskp.test',
  promptCode: 'hello',
  lang: 'zh_CN',
  project: 'console',
  environment: 'dev',
});
```

> **promptConfigs 说明**：返回的 `promptConfigs` 是 `{ 语言代码: 翻译值 }` 对象，**仅包含数据库中实际存在行的语言**（值为空字符串 `""` 的行也算存在，表示语言行已建但翻译未填）。未在数据库建行的语言**不会**出现在 `promptConfigs` 中。因此判断某语言翻译是否缺失：看该语言 key 是否**不在** `promptConfigs` 中，而非看值是否为空。若需确认，可用一个肯定不存在的语言（如 `ja_JP`）查询 detail，对比 `promptConfigs` 出现的 key 即为实际有行的语言。

### getPromptByLang - 按语言批量查询多语言

| 项 | 值 |
|----|---|
| 方法 | `GET` |
| 路径 | `/hpfm/v1/{tenantId}/prompt/{lang}?promptKey={key1,key2,...}` |
| 用途 | 按语言查询多个 promptKey 下的所有多语言键值对（前端 `formatterCollections` 加载多语言时调用的接口） |
| 参数 | `lang`（路径，语言代码如 `zh_CN`/`en_US`），`promptKey`（查询参数，逗号分隔多个 promptKey 命名空间），`tenantId`（路径），`project`，`environment` |
| 返回 | `{ "promptKey.promptCode": "翻译值", ... }` 扁平对象 |
| **鉴权** | **无需 token**（公开接口，前端登录前加载多语言也用此接口）。`.env.json` 中 `token` 可为空，`request()` 自动跳过 `authorization` 头 |

> **语言行为**：返回指定语言下所有已存在翻译行的键值对。某 promptCode 在指定语言下无翻译行时，**不会**出现在返回结果中。因此可通过分别查询 `zh_CN` 和 `en_US`，对比两个结果的 key 集合来判断哪些 promptCode 缺少哪种语言翻译。这是检查「翻译缺失」的**首选方法**（2 次调用即可覆盖整个 promptKey，无需逐个 promptCode 调用 `getPromptDetail`）。

调用示例：
```javascript
// 查询 zh_CN 和 en_US，对比找出缺少 en_US 翻译的 key
const zhCN = await api.getPromptByLang({ promptKey: 'hskp.test', lang: 'zh_CN', project: 'console', environment: 'dev' });
// => { "hskp.test.hello": "你好", "hskp.test.hello1": "你好" }

const enUS = await api.getPromptByLang({ promptKey: 'hskp.test', lang: 'en_US', project: 'console', environment: 'dev' });
// => { "hskp.test.hello": "Hello" }

// 对比：hskp.test.hello1 在 enUS 中不存在 => 缺少 en_US 翻译
// 对比：enUS 中的值 "Hello" 可直接用于英文大小写规范检查

// 支持多个 promptKey 逗号分隔
const multi = await api.getPromptByLang({ promptKey: ['hskp.test', 'hskp.common'], lang: 'zh_CN', project: 'console', environment: 'dev' });
// 也接受数组形式，内部自动拼接为逗号分隔
```

### insertPrompt - 新增多语言

| 项 | 值 |
|----|---|
| 方法 | `POST` |
| 路径 | `/hpfm/v1/prompts/insert` |
| 用途 | 新增多语言条目到平台 |
| body | `{ promptKey, promptCode, promptConfigs: { zh_CN, en_US, ... }, description }` |
| 返回 | 新增后的多语言对象（含 promptId） |

### updatePrompt - 修改多语言

| 项 | 值 |
|----|---|
| 方法 | `PUT` |
| 路径 | `/hpfm/v1/prompts/update` |
| 用途 | 修改已有多语言条目（补充/修改某语言的翻译值） |
| body | `{ promptId, objectVersionNumber, _token, promptKey, promptCode, promptConfigs: { zh_CN, en_US, ... }, lang, langDescription, tenantId, description }` |
| 返回 | 修改后的多语言对象 |
| 注意 | `promptId`/`objectVersionNumber`/`_token` 必须从 **`getPromptExact`** 查询结果获取（**不要**用 `getPromptList().content[0]`，模糊查询可能命中错误记录） |

> **lang/langDescription/tenantId 必填**：HZERO update 接口要求携带这三个字段（来自 `getPromptExact` 行记录）。`lang` 标识当前操作的源语言行，缺失时为已有 promptCode 补充新语言会触发 `error.db.duplicateKey`。`scripts/api.js` 的 `updatePrompt` **不自动补全**，缺失任一必填字段时直接抛错，调用方须从 `getPromptExact` 行记录完整传入。

调用示例（补充 en_US 翻译）：
```javascript
const record = await api.getPromptExact({  // 精确匹配，不要用 getPromptList().content[0]
  promptKey: 'hskp.test',
  promptCode: 'hello',
  project: 'console',
  environment: 'dev',
});
await api.updatePrompt({
  ...record,
  promptId: record.promptId,             // 以下字段均来自 getPromptExact 行记录
  objectVersionNumber: record.objectVersionNumber,
  _token: record._token,
  promptKey: record.promptKey,
  promptCode: record.promptCode,
  lang: record.lang,                     // 必填，缺失会抛错
  langDescription: record.langDescription,
  tenantId: record.tenantId,
  promptConfigs: { zh_CN: '你好', en_US: 'Hello' },  // 包含所有语言，缺失语言会被补建
});
```

### deletePrompt - 删除多语言

| 项 | 值 |
|----|---|
| 方法 | `DELETE` |
| 路径 | `/hpfm/v1/prompts/remove` |
| 用途 | 删除多语言条目（逐条审批） |
| body | `{ promptId, objectVersionNumber, _token, promptKey, promptCode, lang, description, tenantId, langDescription }` |
| 返回 | 204（`{ success: true }`） |
| 注意 | 必须用户明确要求删除才执行，禁止批量删除；`promptId`/`objectVersionNumber`/`_token` 须从 **`getPromptExact`** 取（不要用 `getPromptList().content[0]`） |

### refreshCache - 刷新缓存

| 项 | 值 |
|----|---|
| 方法 | `POST` |
| 路径 | `/hpfm/v1/prompts/refresh/cache` |
| 用途 | 刷新多语言缓存 |
| body | 无（不需要带参数） |
| 返回 | 204（`{ success: true }`） |

### exportPrompts - 导出多语言

| 项 | 值 |
|----|---|
| 方法 | `GET` |
| 路径 | `/hpfm/v1/prompts/prompt-export` |
| 用途 | 从平台导出某 promptKey 下的多语言 |
| 参数 | `tenantId`, `promptKey` |
| 返回 | 多语言数据 |

---

## 错误码说明

接口可能返回平台错误码（响应体 `code` 或 `message` 字段，`error.*` 开头），`api.js` 会提取为 `API_ERROR[错误码]: 原始响应` 抛出。响应体 `failed: true` 也表示错误。以下为已确认的错误码，后续遇到新错误码时补录：

| 错误码 | 含义 | AI 处理 |
|--------|------|---------|
| `error.db.duplicateKey` | 数据已存在，重复插入 | insert 时：已有同 promptKey+promptCode 数据，停止插入，改为查询已存在条目或提示用户。update 时：通常是缺失 `lang` 字段导致 API 走 insert 路径与新语言行冲突，确认 `updatePrompt` 已自动补全 `lang`/`langDescription`/`tenantId` |
| `error.permission.accessTokenExpire` | token 过期 | 停止操作，要求用户提供新 token |
| HTTP 401 | token 过期 | 同上 |

### 处理规则

1. 收到错误码时，先判断类型，按上表处理
2. `error.db.duplicateKey`：**不要重复插入**，查询已存在条目展示给用户，提示已存在
3. `error.permission.accessTokenExpire` / HTTP 401：停止操作，要求用户提供新 token
4. 响应体 `failed: true`：视为错误，按 `code`/`message` 处理
5. 未确认的错误码：将完整错误信息展示给用户，不自动重试；确认含义后补录到本表
