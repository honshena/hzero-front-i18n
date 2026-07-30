# Check 工作流 - 代码多语言问题检查

扫描代码中的 `intl.get()` 调用与硬编码中文，对照 h0 平台数据，发现并修复多语言问题。

## 检查项

共 8 项（硬编码字符串 / 未注册的 key / 翻译缺失 / code 格式违规 / 英文大小写规范 / intl.get 作用域 / formatterCollections 使用规范 / .d() 默认值语言），默认全部执行。详细说明见下方 Phase 0 的询问选项表与各检查项规则段。

> 范围确认：用 `question` 工具展示选项，首项为「全部（推荐）」，其余为各检查项（`multiple: true`），并支持自定义输入（如「只查大小写和作用域」）。用户选「全部」或自定义全量语义时执行所有项。

## 流程（6 阶段）

### Phase 0 - 范围确认（必须询问）
**扫描前必须用 `question` 工具向用户确认检查范围**（遵循 SKILL.md「选项规范」）：

- 选项只列「全部（推荐）」一项，其 description 写明包含的所有检查项：硬编码字符串 / 未注册的 key / 翻译缺失 / code 格式违规 / 英文大小写规范 / intl.get 作用域 / formatterCollections 使用规范 / .d() 默认值语言
- 必须支持自定义输入（用户可 type answer，如「只查大小写和作用域」「硬编码+未注册」）
- 用户选「全部」执行所有项；自定义输入则按用户指定的项执行（AI 解析语义匹配下列检查项）

检查项语义对照（AI 解析用户自定义输入时匹配）：

| 检查项 | 说明 |
|--------|------|
| 硬编码字符串 | 代码中直接写中文而未用 `intl.get` |
| 未注册的 key | 代码引用的 key 平台上不存在 |
| 翻译缺失 | promptConfigs 缺少某些语言行 |
| code 格式违规 | promptCode 不符合 camelCase / 1-5 段规则 |
| 英文大小写规范 | en_US 值大小写不符标题类/描述类规则 |
| intl.get 作用域 | 在组件/函数外（模块顶层）直接调用 |
| formatterCollections 使用规范 | 未包裹 / code 声明与实际引用不匹配 |
| .d() 默认值语言 | `.d()` 默认值语言与项目 defaultLanguage 不一致 |

**不得跳过询问直接扫描。**

### Phase 1 - 本地扫描
- 扫描目标路径下 `.js`/`.jsx`/`.tsx`（跳过 `node_modules`/`dist`/`.umi`）
- 提取所有 `intl.get('key').d('默认值')` 调用 + 硬编码中文字符串
- 收集去重的 promptKey 集合
- 工具：`const { parseIntlGetCalls, parseFullIntlCode } = require('../../scripts/utils');`
  - `parseIntlGetCalls(code)` **只返回 key 字符串数组**（如 `['hskp.test.hello', ...]`），不含行号/`.d()` 默认值
  - 行号、`.d()` 默认值由 AI 自行正则补充解析（如逐行 `line.match(/intl\.get\(['"\`]([^'"\`]+)['"\`]\)\.d\(([^)]*)\)/)`）
  - `parseFullIntlCode(key)` 拆分为 `{ promptKey, promptCode }`
- 产出内存清单：`{ file, line, key, promptKey, promptCode, .d()默认值, 类型 }`（line/默认值为 AI 补充解析）

### Phase 2 - 平台批量查询（并行 + 批量拼接）
- 对去重 promptKey 集合，**逗号拼接**后一次调用 `getPromptByLang(zh_CN)` + 一次 `getPromptByLang(en_US)`（公开接口，无需 token），两次调用并行
- 构建 map：`key -> { zh_CN?, en_US?, registered }`
- **从 2N 调用降到 2 次**（接口支持逗号分隔多个 promptKey）

### Phase 3 - 分类
对照 map 给每条清单项打问题标签：未注册 / 翻译缺失 / 英文大小写 / intl.get 作用域 / formatterCollections / .d()语言 / 硬编码。

### Phase 4 - 报告（全列表，先明细后摘要）
- **只读阶段不建 task 目录**（无破坏性操作，无需审批记录；用户确认修复后才进入 Task & Approval 流程）
- **必须按下列固定格式输出**，全部用列表/表格，不得用段落叙述或省略
- **先明细后摘要**：明细按问题类型分类展示（每类一张表），最后输出摘要表
- **key 拆分为 promptKey 和 promptCode 两列**；**当前值列显示完整的 `intl.get('xxx').d('xxx')` 调用**（不能只写 `.d('xxx')`）

```
## 检查结果

### 明细（按类型分类）

#### 1. 硬编码字符串
| 序号 | 文件 | 行号 | 当前值 | 建议 promptKey | 建议 promptCode | 建议值 |
|------|------|------|--------|----------------|-----------------|--------|
| 1 | src/xxx.js | 4 | '用户管理' | hskp.platform | userManage | intl.get('hskp.platform.userManage').d('用户管理') |
| 2 | src/yyy.js | 12 | '确定' | hskp.common | ok | intl.get('hskp.common.ok').d('确定') |

#### 2. 未注册的 key
| 序号 | 文件 | 行号 | promptKey | promptCode | 当前值 | 建议 |
|------|------|------|-----------|-----------|--------|------|
| 3 | src/yyy.js | 8 | hskp.test | notexist | intl.get('hskp.test.notexist').d('Hello') | 注册 key（查不存在->改代码->insertPrompt）或改名 |

#### 3. 翻译缺失
| 序号 | 文件 | 行号 | promptKey | promptCode | 当前值 | 已有语言 | 缺失语言 | 建议 |
|------|------|------|-----------|-----------|--------|----------|----------|------|
| 4 | src/zzz.js | 12 | hskp.test | hello | intl.get('hskp.test.hello').d('你好') | zh_CN=你好 | en_US | 补充 en_US（updatePrompt） |

#### 4. 英文大小写规范
| 序号 | 文件 | 行号 | promptKey | promptCode | 当前 en_US（平台值） | 建议 en_US | 规则 |
|------|------|------|-----------|-----------|---------------------|-----------|------|
| 5 | src/aaa.js | 20 | hskp.test | createBtn | Create user | Create User | 标题类 Title Case |

#### 5. intl.get 作用域
| 序号 | 文件 | 行号 | promptKey | promptCode | 当前值 | 建议 |
|------|------|------|-----------|-----------|--------|------|
| 6 | src/bbb.js | 7 | hskp.test | hello | intl.get('hskp.test.hello').d('你好') | 改为函数/getter，组件使用时再调用 |

#### 6. formatterCollections 使用规范
| 序号 | 文件 | 行号 | 问题 | 建议 |
|------|------|------|------|------|
| 7 | src/ccc.js | 30 | 未包裹/code 缺 hskp.common | 补 import + 包裹 HOC + 补 code |

#### 7. .d() 默认值语言
| 序号 | 文件 | 行号 | promptKey | promptCode | 当前值 | 期望语言 | 项目 defaultLanguage |
|------|------|------|-----------|-----------|--------|----------|---------------------|
| 8 | src/ddd.js | 8 | hskp.test | notexist | intl.get('hskp.test.notexist').d('Hello') | 中文 | zh_CN |

#### 8. code 格式违规
| 序号 | 文件 | 行号 | promptKey |  promptCode | 建议 promptCode |
|------|------|------|-----------|-----------------|-----------------|
| 9 | src/eee.js | 15 | hskp.test | some_code_name | someCodeName（camelCase） |

### 摘要
| # | 问题类型 | 数量 |
|---|---------|------|
| 1 | 硬编码字符串 | 2 |
| 2 | 未注册的 key | 1 |
| 3 | 翻译缺失 | 1 |
| 4 | 英文大小写规范 | 1 |
| 5 | intl.get 作用域 | 1 |
| 6 | formatterCollections 使用规范 | 1 |
| 7 | .d() 默认值语言 | 1 |
| 8 | code 格式违规 | 1 |
| - | 合计 | 9 |
```

**规则**：
- 明细按问题类型分 8 个小节，每节一张表，序号全局连续递增
- **key 拆为 promptKey 和 promptCode 两列**（硬编码字符串无原 key 时，列建议的新 promptKey/promptCode；formatterCollections 无 key 时省略此两列）
- **当前值列显示完整的 `intl.get('promptKey.promptCode').d('默认值')` 调用**（涉及代码 intl.get 的问题类型；英文大小写规范显示平台 en_US 值；formatterCollections 显示问题描述）
- 无某字段标 `-`；某类型无问题时该节省略不展示
- 摘要表列所有有问题的类型 + 合计行
- 明细表的「序号」即修复阶段用户选择「仅选几条」时引用的编号

### Phase 5 - 修复审批
- 用 `question` 工具询问：全部修复 / 仅选几条（自定义输入序号，如「1,3,5」）/ 跳过
- **用户确认修复时，才创建 taskId + data.json + task.md**（进入 SKILL.md 的 Task & Approval 破坏性操作流程，每步/每条操作执行 -> 打勾 -> 写摘要）
- data.json 中每条修复项含：序号、类型、文件、行号、promptKey、promptCode、当前值（完整 intl.get 调用）、建议值、修复动作（改代码 / 调 API）

### Phase 6 - 修复执行
- 按 data.json 逐条：改代码 + 调 API（用 `getPromptExact` 取记录）
- 每条执行后在 task.md Step 5 对应子项打勾 `[✓]` + 写摘要（执行结果 + 验证），全部完成写 Step 5 汇总
- 写 result.json + task.md Step 6 打勾 + 摘要
- 修复后用 `getPromptDetail` / `getPromptByLang` 验证

## 平台查询策略

**禁止用 `getPromptList` 返回结果判断翻译是否缺失**（列表只返回当前语言一行）。必须用 `getPromptByLang` 按语言查询。

- `getPromptByLang`（首选，无需 token）：2 次调用（zh_CN + en_US）覆盖整个 promptKey，返回 `{ "promptKey.promptCode": "翻译值" }` 扁平对象。某 promptCode 在指定语言下无翻译行时不在结果中。
- `getPromptDetail`（备选）：返回单条 `promptConfigs` 含所有语言，用于修复时确认条目当前状态。
- `getPromptList`：仅用于确认某 promptCode 是否已注册、或 `size=0` 拉全量统计。⚠️ **`page-list` 是模糊查询**（`promptKey=1` 命中 `1`/`10`/`11`），**禁止**用 `getPromptList(...).content[0]` 为 update/delete 取目标记录。
- `getPromptExact`：update/delete 取记录首选，内部 `size=0` 拉全量后按 `promptKey`+`promptCode` 精确过滤，返回唯一记录（未找到/多条均抛错）。

## 各检查项规则

### 英文大小写规范
数据来源：`en_US` 值通过 `getPromptByLang({ lang: 'en_US' })` 获取。若某 key 不在 en_US 结果中，归入「翻译缺失」而非此项。

**标题类（Title Case - 每词首字母大写）：** 页面标题、弹窗/抽屉标题、表格列标题、分区标题、按钮、菜单项、标签页、面包屑。判断：promptCode 含 `title`/`header`/`column`/`button`/`tab`/`menu`/`breadcrumb`，或上下文为短词组（≤5 词、无常句结构）。示例：`Create User` ✓ / `Create user` ✗

**描述类（Sentence Case - 仅句首及专有名词大写）：** 帮助信息、提示语、占位符、说明性描述、完整句子。判断：上下文为完整句子或长描述，或 promptCode 含 `tip`/`help`/`placeholder`/`description`/`message`。示例：`Please enter your username to log in.` ✓

**例外：** 专有名词（产品名）、缩写（API/URL/ID）、品牌名保持原大写；占位符 `{user}` 不受影响。无法确定时按上下文语义判断并向用户说明理由。

### intl.get 作用域检查
`intl.get()` 不能在组件/函数外直接调用（模块顶层）。import 时常量中的 `intl.get` 会在多语言数据加载前执行，只能拿到 `.d()` 默认值或 key。

违规（模块顶层）：
```javascript
const COLUMNS = [
  { title: intl.get('hsop.common.name').d('名称') },
];
```
建议改为函数/getter，组件使用时再调用：
```javascript
const getColumns = () => [
  { title: intl.get('hsop.common.name').d('名称') },
];
```
识别模块作用域（顶层 `const`/`let`/`var`、对象/数组字面量内、非函数体）的 `intl.get` 调用，列入 data.json。

### formatterCollections 使用检查
按项目类型分两种模式（操作前先读 `doc/{project}/` 确认）：

**标准 h0 项目**（见 `doc/h0.md`）：
- 路由最外层页面**必须**用 `formatterCollections` 包裹
- `code` 数组须包含页面用到的所有自定义 promptKey（如 `hskp.common`、`hskp.platform`）
- `hzero.common` 自动加载无需声明；项目自定义 common **必须显式声明**
- `code` 声明了但未引用 -> 提示冗余；引用了但未声明 -> 提示缺失
- 必须引入 Loading：`import Loading from 'components/skeleton-loading/loading'`，传 `loadingComponent: () => <Loading />`

**开放平台等特殊项目**（见 `doc/openplatform/README.md`）：
- 布局层 `src/layouts/index.js` 已全局加载，普通页面**不需要** `formatterCollections`
- 仅当使用布局未加载的额外 promptKey 时才在页面级追加
- 检查普通页面是否误用（冗余）或用了未加载的 promptKey 却未追加

**通用问题：** 未包裹组件就导出 / `code` 为空或未传 / `code` 与实际 `intl.get` 的 promptKey 不匹配。

### .d() 默认值语言检查
- 读 `.env.json` 当前项目的 `defaultLanguage`
- 提取每个 `intl.get().d()` 默认值，判断语言（含 CJK -> 中文，否则英文）
- `zh_CN` -> `.d()` 应为中文；`en_US` -> 应为英文
- ⚠️ **生成 .d() 建议值必须严格按 defaultLanguage**：defaultLanguage=en_US 时建议值必须英文（不得给中文），defaultLanguage=zh_CN 时必须中文。这是 .d() 建议值语言唯一依据，不得凭"项目约定英文"或其他理由偏离
- 不一致列入 data.json（含文件、行号、key、当前值、当前语言、期望语言）
- 模板字符串（如 `` `共 ${total} 条` ``）按主体文字判断，变量占位符不影响
- `.d()` 无值或空字符串：提示缺失默认值

## 修复操作指引（按问题类型）

| 问题类型 | 修复方式 | 平台同步 |
|----------|----------|----------|
| 硬编码字符串 | 代码改为 `intl.get(key).d(默认值)` | 注册新 key：`insertPrompt`（先查平台确认不存在，再改代码，再 insert，再查询验证） |
| 未注册的 key | 代码中 key 改名或保留 | 新 key：`insertPrompt`；旧 key 若无其他引用可删除（需用户确认） |
| 翻译缺失 | 无需改代码 | `updatePrompt`：从 `getPromptExact` 取完整行记录，`promptConfigs` 须含**所有语言**（已有+缺失）。修改后用 `getPromptDetail` 验证。⚠️ 禁止 `getPromptList().content[0]` |
| code 格式违规 | 代码中 promptCode 改名 | 旧 key 删除（需用户确认）+ 新 key `insertPrompt` |
| 英文大小写规范 | 无需改代码 | `updatePrompt`：`promptConfigs` 中对应语言值改为规范大小写 |
| intl.get 作用域 | 顶层 const 改为函数/getter，JSX 改为调用 | 无 |
| formatterCollections 使用规范 | 代码补 import / 包裹 HOC / 补 code 声明 | 无 |
| .d() 默认值语言 | 代码中 `.d()` 默认值改为项目 defaultLanguage | 无 |

> **翻译缺失修复要点**：`updatePrompt` 的 `promptConfigs` 必须包含该 promptCode 的**全部语言**（不仅是缺失的那个），否则已存在语言可能被清空。`lang`/`langDescription`/`tenantId` 必填，须从 `getPromptExact` 行记录完整传入。详见 `doc/api.md` 的 getPromptExact / updatePrompt 条目。

注意：**只有 `hzero.common` 是自动加载的**，项目自定义 common promptKey（如 `hskp.common`）需要在 `formatterCollections` 的 `code` 数组中显式声明。

## promptCode 生成（修复时用）

```javascript
const { generatePromptCode } = require('../../scripts/utils');
const code = generatePromptCode('DataManage', 'button', 'create'); // => "dataManage.button.create"
```
规则：1-5 段，camelCase。**promptKey 必须为两段格式 `{xxx}.{xxx}`**（如 `hsop.common`），新增时校验，不符合拒绝。
