---
name: hzero-front-i18n
description: Use when working with hzero platform i18n - checking code issues, querying/adding/modifying/deleting/translating entries, exporting/importing Excel/CSV
---

# hzero-front-i18n

h0 平台多语言管理 skill。**所有回复默认中文。**

## 命令（slash 命令，3 个）

| 命令 | 说明 | 详情 |
|------|------|------|
| `/hzero-front-i18n-check` | 检查代码多语言问题 | `commands/check/workflow.md` |
| `/hzero-front-i18n-update` | 检查 skill 版本更新 | `commands/update/workflow.md` |
| `/hzero-front-i18n-release` | 发布新版本 | `commands/release/workflow.md` |

## 能力（AI 按需加载，非 slash 命令，核心功能完整保留）

| 能力 | 触发 | 详情 |
|------|------|------|
| 查询 | 用户查询 / 检查内部 | `capabilities/query.md` |
| 新增 | 用户新增 / 检查修复硬编码、未注册 key | `capabilities/add.md` |
| 修改 | 用户修改 / 检查修复翻译缺失、大小写 | `capabilities/modify.md` |
| 删除 | 用户明确要求删除（逐条审批） | `capabilities/delete.md` |
| 翻译 | 用户翻译 / 检查修复 / 新增补英文 | `capabilities/translate.md` |
| 导出 | 用户导出 Excel/CSV | `capabilities/export.md` |
| 导入 | 用户从 Excel/CSV 导入 | `capabilities/import.md` |

## 选项规范（全局）

**所有需要用户选择的地方，必须用 `question` 工具规范化展示：**
- 首项为推荐默认（标注「推荐」）
- 选项标签简洁清晰（1-5 词）
- 每项有 description 说明
- 始终支持自定义输入（用户可 type answer）
- 多选用 `multiple: true`

## 全局红线

- ⚠️ **`page-list` 是模糊查询**（`promptKey=1` 命中 `1`/`10`/`11`）。**禁止**用 `getPromptList(...).content[0]` 为 update/delete 取目标记录，必须用 `getPromptExact`（精确过滤，未找到/多条抛错）。
- ⚠️ **禁止**用 `getPromptList` 返回结果判断翻译是否缺失（列表只返回当前语言一行）。翻译缺失检查必须用 `getPromptByLang`。
- `getPromptByLang` 为公开接口，无需 token；其他接口都需要 token（0 租户平台层权限）。

## 环境配置

首次使用 / `.env.json` 的 `projects` 为空 / 用户要求配置 / token 失效时，按 `config/workflow.md` 引导配置 `.env.json`（项目、环境、host、token、tenantId、**defaultLanguage 用户选择 zh_CN/en_US/自定义**）。**多项目共存，不设固定 `currentProject`/`currentEnvironment`**：每次操作时 AI 按当前文件路径用 `api.getProjectByFilePath(filePath)` 确认关联项目（`fileProjectMap` 按路径最长匹配），无文件上下文则询问用户后记录到 `fileProjectMap`，再显式传 `project`/`environment` 给 API 函数。操作文件前必须先确认关联项目，防止项目混淆。

## Token 校验

每次操作前校验 token 有效性（`api.getUserSelf(project, environment)`，位置参数）。过期（401 / `error.permission.accessTokenExpire`）时停止操作，要求用户提供新 token，更新 `.env.json` 后继续。

## Task & Approval（破坏性操作核心流程）

**query / export 为只读，无需此流程。add / modify / delete / import / check 修复阶段 必须严格按 6 步执行，不可跳过任何步骤。**

### Step 1: 创建 taskId 和目录

```javascript
const { generateTaskId, createTaskDir, writeDataTaskDir } = require('./scripts/utils');
const taskId = generateTaskId('operation-name');   // 格式: task-{名称}-{年}-{月}-{日}-{时}-{分}-{秒}，禁止冒号
const taskDir = createTaskDir(taskId);             // 在 logs/{taskId}/ 下创建目录
```

创建后立即在 `{taskDir}/task.md` 写入任务信息与流程清单（全 `[ ]`），在 task.md Step 1 打勾 `[✓]` + 写摘要（taskId 已创建）。**每步执行后必须打勾 `[✓]` 并写该步摘要；Step 5 每条操作同样执行 -> 打勾 -> 写摘要**：

```markdown
# 任务: {taskId}

- 操作类型: add/modify/delete/import/check-修复
- 项目/环境: {project} / {environment}
- 创建时间: {ISO}

## 执行流程（每步：执行 -> 打勾确认 -> 写摘要）

- [ ] Step 1: 创建 taskId 和目录
  - 摘要: <如 task-check-xxx-2026-07-16-... 已创建>

- [ ] Step 2: 生成 data.json
  - 摘要: <如 共 5 条待处理: 硬编码2/未注册1/翻译缺失2>

- [ ] Step 3: 展示 data.json 给用户审批
  - 摘要: <如 已逐条展示 5 条，等待用户确认>

- [ ] Step 4: 用户确认（question 工具）
  - 摘要: <如 用户确认执行全部 / 仅执行3条 / 要求修改 / 跳过>

- [ ] Step 5: 执行操作（逐条：执行 -> 打勾确认 -> 写摘要）
  - [ ] 操作1: <描述，如 修改 src/xxx.js:4 硬编码为 intl.get('hskp.platform.userManage').d('用户管理')>
    - 摘要: <执行结果 + 验证，如 已改代码 + insertPrompt 注册成功，getPromptDetail 验证通过>
  - [ ] 操作2: <描述>
    - 摘要: <执行结果 + 验证>
  - [ ] 操作3: <描述>
    - 摘要: <执行结果 + 验证>
  - Step 5 汇总: <共 N 条，成功 M，失败 K>

- [ ] Step 6: 写入 result.json
  - 摘要: <如 result.json 已写，最终成功 M 条，失败 K 条>

## 待执行数据摘要
（Step 2 后填写：操作类型、条目数、关键内容）

## 执行结果摘要
（Step 6 后填写：成功/失败、处理条数、验证结果）
```

### Step 2: 生成 data.json

```javascript
writeDataTaskDir(taskDir, 'data.json', { action: 'add', /* 完整待执行数据，非摘要 */ });
```
- check 操作：data.json 中每个问题含序号、类型、文件、行号、key(如有)、当前值、建议值
- 写完后在 task.md Step 2 打勾 + 写摘要（条目数与类型分布）

### Step 3: 展示 data.json 给用户审批
**必须完整展示，不能省略、不能摘要、不能只展示部分**，严格以列表/表格逐条展示，**每条必列 `promptKey` 与 `promptCode`**。data.json 仅展示，用户不直接修改。展示后在 task.md Step 3 打勾 + 写摘要（已展示条数）。

### Step 4: 用户确认
用 `question` 工具让用户选择（确认执行 / 跳过 / 要求 AI 修改）。要求修改时由 AI 改 data.json 后重新展示审批，用户不直接编辑 data.json。确认后在 task.md Step 4 打勾 + 写摘要（用户决定：全部/部分/跳过）。

### Step 5: 执行操作
按 data.json 每条操作在 task.md 的 Step 5 展开为子项，**逐条：实际执行（改代码 + 调 API）-> 打勾 `[✓]` -> 写该条摘要（执行结果 + 验证）**。全部完成后写 Step 5 汇总（共 N 条，成功 M，失败 K）。不得只打勾不执行、不得只展示不修复、不得省略某条的摘要。

### Step 6: 写入 result.json
```javascript
writeDataTaskDir(taskDir, 'result.json', { /* 执行结果 */ });
```
将执行结果摘要追加写入 task.md 的「执行结果摘要」章节，在 task.md Step 6 打勾 `[✓]` + 写摘要（最终成功/失败条数、验证结果）。

### 流程约束
- taskId 格式：`task-{名称}-{年}-{月}-{日}-{时}-{分}-{秒}`，**禁止冒号 `:`**（Windows 不允许）
- 新增/修改后必须调查询接口验证生效，**不需要刷新缓存**
- 新增 key 流程：先校验 promptKey 两段格式 -> 查平台确认不存在 -> 改代码 -> 审批 -> insertPrompt -> 验证。**禁止先新增平台再改代码**
- 删除必须用户明确要求 + 逐条审批，禁止批量

### Red Flags（必须立即停止）
未建 taskId 就操作 / 未生成 data.json 就执行 / 未展示 data.json 就询问确认 / data.json 被省略或摘要 / 用户未确认就增删改 / 完成后未写 result.json / taskId 用冒号 / 未查 fileProjectMap 就操作文件 / 增改后未验证生效 / 未经明确要求就删除 / 批量删除 / 先新增平台再改代码 / 展示 data.json 未列 promptKey 与 promptCode / 用 `getPromptList` 判断翻译缺失 / 用 `getPromptList().content[0]` 取记录 / 未在每步完成后于 task.md 打勾就进入下一步 / **某步或 Step 5 某条操作未写摘要** / 未在任务目录创建 task.md 或未写执行结果摘要。

## 每日更新检查

每天首次使用 skill 时自动触发一次 cache-first 检查（`checkDailyUpdate` / `node scripts/update.js --daily`），当天不再重复，失败也仅提示一次。详见 `commands/update/workflow.md`。

## API 速查

> **传参规则（务必区分，勿混用）**：
> - **查询函数**（getPromptList/getPromptExact/getPromptByLang/getPromptDetail）：`project`/`environment` 作为**参数对象的字段**传入
> - **getUserSelf / 增删改函数**（insertPrompt/updatePrompt/deletePrompt）：`project`/`environment` 作为**末位位置参数**传入（字符串）
> - 项目/环境由 AI 每次操作时用 `getProjectByFilePath(filePath)` 取得（返回 `{project, environment}`），无文件上下文则询问用户

```javascript
const api = require('./scripts/api');
const P = 'hskp-console', E = 'dev';   // 由 getProjectByFilePath 取得或询问用户

// 查询函数：project/environment 在参数对象里
api.getUserSelf(P, E);                                                 // 校验 token（位置参数）
api.getPromptList({ promptKey: 'hskp.test', size: 0, project: P, environment: E });          // 模糊列表
api.getPromptExact({ promptKey: 'hskp.test', promptCode: 'hello', project: P, environment: E }); // 精确单条
api.getPromptByLang({ promptKey: 'hskp.test', lang: 'zh_CN', project: P, environment: E });   // 按语言(公开,无需token)
api.getPromptDetail({ promptKey: 'hskp.test', promptCode: 'hello', lang: 'zh_CN', project: P, environment: E });

// 增删改：project/environment 是末位位置参数
api.insertPrompt({ promptKey: 'hskp.test', promptCode: 'x', promptConfigs: { zh_CN: '你好' } }, P, E);
api.updatePrompt({ ...record, promptConfigs: { zh_CN: '你好', en_US: 'Hello' } }, P, E);  // record 来自 getPromptExact
api.deletePrompt({ ...record }, P, E);                    // 逐条审批

api.getProjectByFilePath('D:\\path');                     // => { project, environment }
```

函数签名、参数、返回、错误码详见 `doc/api.md`。

## 特殊项目文档

部分项目前端不基于 h0 或有特殊多语言场景，多语言机制不同。专属说明在 `doc/{project}/`：`doc/openplatform/README.md`（开放平台）、`doc/hskp-console/README.md`（零衍）。**操作某项目前（根据 fileProjectMap 确定项目），若 `doc/{project}/` 存在，必须先读其说明并以其为准**，通用 `doc/intl.md` 仅作补充。

## File Reference

- `scripts/api.js` - API 调用封装（接口文档 `doc/api.md`）
- `scripts/utils.js` - 工具函数（`parseIntlGetCalls` / `generatePromptCode` / `generateTaskId` / `createTaskDir` 等）
- `scripts/excel.js` / `scripts/csv.js` - Excel/CSV 生成与解析
- `scripts/update.js` - 版本更新检查
- `scripts/test.js` - 测试运行器
- `doc/api.md` - 接口文档（路径/参数/返回/错误码）
- `doc/h0.md` / `doc/intl.md` - h0 平台与多语言规范
- `doc/openplatform/README.md` - 开放平台多语言说明
- `doc/hskp-console/README.md` - 零衍多语言说明
- `commands/*/workflow.md` - 各命令详细流程
- `config/workflow.md` - 环境配置流程
- `capabilities/*.md` - 各能力详细流程
