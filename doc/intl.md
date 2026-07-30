# h0 多语言规范

## Intl 函数使用

### 引用

```javascript
import intl from 'utils/intl';
```

### 基本使用

```javascript
intl.get('hskp.common.create').d('Create')
intl.get('hskp.product.assignUser.view.userGroup').d('用户组')
```

- `.d()` 函数中可以使用中文或英文，**语言由 defaultLanguage 决定**（zh_CN->中文，en_US->英文）；`.d()` 是多语言未加载时的 fallback 默认显示值
- `get()` 函数中存放多语言的 code
- `.d()` 存放默认值，即当前多语言 code 在平台多语言中不存在时使用的默认显示值

### 插入变量

```javascript
intl.get('hskp.common.helloToUser', { user }).d(`hello ${user}`);
```

- 多语言支持插入变量，变量对象作为 `get()` 的第二个参数
- `.d()` 中使用 JS 模板字符串作为默认值，确保 fallback 也能显示变量值
- promptConfigs 需要按如下规则编写：
  ```json
  {
    "zh_CN": "你好 {user}",
    "en_US": "hello {user}"
  }
  ```
- promptConfigs 中的占位符名称 `{user}` 要和 `.get()` 第二个参数的 key 一致

## 多语言 code 解析

### 组成规则

code 组成规则为 `{promptKey}.{promptCode}`

### promptKey

模板代码，组成规则为 `{项目}.{项目分包名称简写}`，**必须为两段格式 `{xxx}.{xxx}`**（如 `hsop.common`、`hskp.platform`），不得为一段或超过两段。

项目分包名称一般是简写的短字符，例如：
- `hskp.common` - 通用模块
- `hskp.platform` - 平台管理
- `hskp.enterprise` - 企业模块
- `hskp.product` - 产品模块
- `hskp.api` - API 管理

### promptCode

代码，由多段英文字符串拼接而成 `{code1}.{code2}.{code3}....`

- 一般不限制长度，但是太长了在代码里影响阅读
- 建议 1-5 段
- 使用 camelCase

示例：
- `create` - 1 段
- `roleType` - 2 段
- `dataManage.button.create` - 3 段
- `dataManage.modal.import.title` - 4 段

## promptConfigs 结构

```json
{
  "zh_CN": "中文翻译",
  "en_US": "English translation",
  "ja_JP": "日本語翻訳",
  "zh_TW": "繁體中文翻譯",
  "th_TH": "การแปลภาษาไทย",
  "ru_RU": "Перевод на русский",
  "pt_BR": "Tradução para português",
  "mn_MN": "Монгол орчуулга"
}
```

- `zh_CN` 和 `en_US` 是必填项，其他语言可选
- 新增时至少提供 `zh_CN`，`en_US` 可由 AI 翻译生成

## 注意事项

- 使用 intl 函数必须 `import intl from 'utils/intl'`
- 路由的最外层页面必须使用 `formatterCollections` 会去加载多语言并显示占位 loading
- **只有 `hzero.common` 是自动加载的**，项目自定义的 common promptKey（如 `hskp.common`）需要在 `formatterCollections` 中显式声明
- 使用 `formatterCollections` 时必须引入 Loading 组件：`import Loading from 'components/skeleton-loading/loading'`
- 多语言 code 不要太长，影响代码阅读
- 新增多语言时必须先检查是否已存在
- **`intl.get` 不能在组件/函数外直接调用**：模块顶层（如顶层 `const` 常量、列定义）的 `intl.get` 会在多语言加载前执行，只能拿到默认值。改为函数或 getter，组件使用时再调用
