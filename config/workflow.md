# Config 工作流 - 环境配置

非 slash 命令。AI 在以下情况自动触发：首次使用 / `.env.json` 的 `projects` 为空 / 用户要求配置 / token 失效需重配。

## .env.json 结构

```json
{
  "projects": {
    "项目名": {
      "defaultLanguage": "zh_CN",
      "environments": {
        "dev": {
          "host": "http://开发环境地址",
          "token": "bearer xxx",
          "tenantId": 0
        }
      }
    }
  },
  "fileProjectMap": {},
  "update": {
    "httpProxy": "http://127.0.0.1:7890",
    "httpsProxy": "http://127.0.0.1:7890"
  }
}
```

- **Token 要求**：必须有 0 租户平台层权限
- **`getPromptByLang` 为公开接口，无需 token**；其他接口都需要 token
- `update` 为可选字段（用户手动配置），用于版本更新检查的 HTTP/HTTPS 代理
- **不设固定 `currentProject`/`currentEnvironment`**：多项目共存时，项目/环境由 AI 每次操作时按当前文件路径用 `getProjectByFilePath` 确认，或询问用户后记录到 `fileProjectMap`

## 配置步骤

### Step 1: 项目名
- 询问项目名（如 `hskp-console`）
- 若用户已在操作某文件，可从 `fileProjectMap` 或路径推断建议值

### Step 2: 环境名
- 询问环境名（如 `dev` / `pre` / `prod`）

### Step 3: host / token / tenantId
- `host`：环境地址（如 `http://172.23.16.195:8080`）
- `token`：`bearer xxx` 格式，0 租户平台层权限
- `tenantId`：默认 0

### Step 4: 校验 token
- 调用 `api.getUserSelf(project, environment)` 校验 token 有效性（位置参数）
- 失败（401 / `error.permission.accessTokenExpire`）则要求用户重新提供 token，重复本步直到通过
- 通过后向用户确认

### Step 5: 选择默认语言（defaultLanguage）
- **不自动探测**。用 `question` 工具让用户选择：
  - **中文（zh_CN）**（推荐）：新增条目时 `.d()` 默认值用中文、检查/翻译主语言为中文
  - **英文（en_US）**：`.d()` 默认值用英文
  - 自定义输入：用户可输入其他语言代码（如 `ja_JP`、`th_TH`）
- `defaultLanguage` 决定新增条目 `.d()` 默认值语言、检查时的主语言等。⚠️ **后续所有 .d() 建议值严格按此 defaultLanguage 生成**（en_US->英文，zh_CN->中文），不得偏离

### Step 6: 写入 .env.json
- 将配置写入 `projects.{项目名}.environments.{环境名}`
- **不写 `currentProject`/`currentEnvironment`**（多项目共存，项目/环境由 AI 每次操作时按文件路径或询问用户决定，见下方「项目关联」）
- `.env.json` 由用户维护，AI 配置时写入属于配置流程本身（非脚本自动写），完成后不得再有 AI 额外改动

## 项目关联（fileProjectMap）

记录文件/目录与项目的关联。**多项目共存，无固定 currentProject**。当用户操作一个文件时，AI 必须：

1. 调用 `api.getProjectByFilePath(filePath)` 检查 `fileProjectMap` 中是否已有该文件的关联（按路径最长匹配）
2. 如果没有，询问用户该项目对应的项目名和环境
3. 记录到 `fileProjectMap`：`{ "文件路径": { "project": "项目名", "environment": "环境名" } }`
4. 后续操作该文件时用 `getProjectByFilePath` 取出 `{project, environment}`，显式传给 API 函数（`api.xxx(..., project, environment)` 或参数对象 `{ project, environment }`）

```json
{
  "fileProjectMap": {
    "<项目根路径>/packages/hskp-front-console-platform": {
      "project": "hskp-console",
      "environment": "dev"
    }
  }
}
```

**项目/环境由 AI 每次操作时自行确认和决定**：有文件上下文时用 `getProjectByFilePath`；无文件上下文（如用户直接说「查询 hskp.test」）时询问用户属于哪个项目/环境，并记录到 `fileProjectMap`。操作文件前必须先确认关联项目，防止项目混淆。

## Token 失效处理

任何操作前校验 token，过期（401 / `error.permission.accessTokenExpire`）时停止操作，要求用户提供新 token，更新 `.env.json` 对应环境的 `token` 字段后继续。
