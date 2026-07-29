# 零衍（hskp-front-console）多语言说明

> 特殊项目多语言文档。本文件描述零衍门户前端的多语言机制，重点关注登录前门户与标准 h0 的差异。操作本项目时**以本文件为准**。

## 项目定位

- 零衍门户前端，技术栈 umi + React 16 + Choerodon UI (c7n) + mobx
- **登录前门户与登录后门户都在 `packages/hskp-front-console-portal` 包下**（后门户也用此包，不另起包）；前门户入口唯一：`packages/hskp-front-console-portal/src/pages/BeforeHome`，后门户入口为同包 `src/components/PortalPage`。i18n 扫描/检查时扫此包即可覆盖两套场景
- **前端基于 h0**（使用 hzero-front 的 `utils/intl`），后端基于 h0 平台
- 底层使用 `react-intl-universal`，上层封装出 `intl.get(key).d(default)` API
- 多语言文案存储在 h0 平台多语言（hpfm 服务），promptKey 前缀 `hskp.*`

## 两套场景

| 场景 | 标识 | intl 来源 | formatterCollections | 接口 |
|------|------|-----------|----------------------|------|
| 登录后门户 | 无特殊标识 | hzero-front `utils/intl` | 原生 `utils/intl/formatterCollections` | `${HZERO_PLATFORM}/v1/${orgId}/prompt/${lang}`（带鉴权） |
| 登录前门户 | `process.env.BEFORE_LOGIN_APP` | hzero-front `utils/intl`（同一个 intl 单例） | **自定义** `@/common/formatterCollections` | `${BEFORE_API_HOST}/v1/prompt/${lang}`（公开无 orgId） |

## 登录后门户（标准 h0）

与标准 h0 前端完全一致，直接使用原生 `formatterCollections`：

```tsx
import formatterCollections from 'utils/intl/formatterCollections';
import intl from 'utils/intl';

export default formatterCollections({
  code: ['hskp.platform'],
})(function Page() {
  return <div>{intl.get('hskp.platform.title').d('标题')}</div>;
});
```

- 语言取自 dva store `user.currentUser.language`（`useGetLang` hook）
- 接口带鉴权 + orgId，由 `queryPromptLocale` 调用
- 详见 `doc/intl.md`

## 登录前门户（自定义 formatterCollections）

### 为什么不能用原生

登录前门户无法使用原生 `formatterCollections`（`utils/intl/formatterCollections`），因为：

1. 原生调 `queryPromptLocale`，请求 `${HZERO_PLATFORM}/v1/${orgId}/prompt/${lang}`（带鉴权 + orgId），登录前门户无 token
2. 原生用 `useGetLang` 从 dva store 取语言（`useSelector`），登录前门户没有 dva store（用 mobx），`useSelector` 拿不到值

### 自定义实现

文件：`packages/hskp-front-console-portal/src/common/formatterCollections.tsx`

基于原生实现改了 3 处，其余（IntlCache/IntlPromiseCache 缓存去重、intlEvents 事件、intl.load() 调用、loading 状态控制）完全复用原逻辑，与原生共享 window 级单例，不会重复加载：

| 改动 | 原生 | 自定义 |
|------|------|--------|
| 请求接口 | `queryPromptLocale`（`${HZERO_PLATFORM}/v1/${orgId}/prompt/${lang}`，带鉴权） | `fetch`（`${BEFORE_API_HOST}/v1/prompt/${lang}?promptKey=...`，公开无 orgId） |
| 语言获取 | `useGetLang`（dva store `user.currentUser.language`） | `sessionStorage.getItem('language')` -> `_hzero_language` -> `zh_CN`（**只读不写**） |
| dva 依赖 | `useDispatch` / `useSelector`（tenantId 从 store 取） | 移除，tenantId 固定 0 |

### 语言确定优先级

登录前门户的语言**不由前端设置**，而是由后端在门户数据中返回（`portalData.loginData.currentLang`）。

自定义 `formatterCollections` 的取语言优先级（**只读不写**）：

1. `sessionStorage.getItem('language')` -- 由 `BeforeHome` 页面写入的缓存
2. `sessionStorage.getItem('_hzero_language')` -- hzero 标准 key
3. 默认 `'zh_CN'`

语言持久化由 `BeforeHome` 页面负责（拿到 `portalData` 后写一次 `sessionStorage.setItem('language', portalData.loginData.currentLang || 'zh_CN')`，在渲染 `BeforeLoginComp` 之前），HOC 只读取，避免多实例重复写入。

`BeforeHome` 同时将 `currentLang` 作为 prop 传给 `BeforeLoginComp`，用于 `EditPortal` 的 `lang` 属性（非 HOC 消费）。

语言切换流程：用户点击语言切换按钮 -> 调 `changeLang` API（`PUT /iam/hzero/v1/users/default-language`，登录后）或 URL 参数切换（登录前）-> `location.reload()` 刷新 -> 后端返回新语言的门户数据 -> `BeforeHome` 写入新语言到 sessionStorage -> HOC 从 sessionStorage 读取新语言 -> 重新加载多语言

### `BEFORE_API_HOST` 来源

由 `packages/hskp-front-console-portal/src/pages/BeforeHome/index.tsx` 在模块加载时设置：

```js
if (window.location.host.includes('localhost')) {
  window.BEFORE_API_HOST = process.env.BEFORE_API_HOST;
} else {
  window.BEFORE_API_HOST = window.location.origin;
}
```

### 用法

```tsx
import formatterCollections from '@/common/formatterCollections';

export default formatterCollections({
  code: ['hskp.common', 'hskp.portal'],
})(BeforeHome);
```

`BeforeHome` 页面负责写入语言到 sessionStorage 并透传 `currentLang` prop（用于 `EditPortal` 的 `lang` 属性）：

```tsx
// pages/BeforeHome/index.tsx
const currentLang = portalData.loginData.currentLang || 'zh_CN';
sessionStorage.setItem('language', currentLang);

<BeforeLoginComp layerList={layerList} data={portalData} currentLang={currentLang} />
```

## 与标准 h0 前端的差异

| 项 | 标准 h0 前端（`doc/intl.md`） | 零衍登录前门户 |
|----|------------------------------|---------------|
| intl 来源 | hzero-front `utils/intl` | 同左（同一个 react-intl-universal 单例） |
| formatterCollections | 原生 `utils/intl/formatterCollections` | 自定义 `@/common/formatterCollections` |
| 加载接口 | `${HZERO_PLATFORM}/v1/${orgId}/prompt/${lang}`（带鉴权 + orgId） | `${BEFORE_API_HOST}/v1/prompt/${lang}`（公开无 orgId） |
| 语言获取 | dva store `user.currentUser.language` | `sessionStorage` |
| 状态管理 | dva | mobx（`@common-components/store/renderStore`） |
| 缓存 | `window.intlCache` / `window._intlPromiseCache` | 同左（共享单例） |

## 新增 / 修改多语言条目

使用 hzero-front-i18n skill 时：
- promptKey 前缀为 `hskp.*`（如 `hskp.common`、`hskp.platform`、`hskp.product` 等）
- promptCode 遵循 camelCase、1-5 段规则（见 `doc/intl.md`）
- 新增/修改后：登录后门户需刷新页面触发重新加载（受 `intlCache` 缓存影响）；登录前门户同理
- 同步修改代码中的 `intl.get('...').d('...')` 调用
- 项目环境配置见 `.env.json`，host 为各环境网关地址

## 相关文件索引

- `packages/hskp-front-console-portal/src/common/formatterCollections.tsx`：登录前门户自定义 formatterCollections
- `packages/hskp-front-console-portal/src/pages/BeforeHome/index.tsx`：设置 `window.BEFORE_API_HOST`
- `packages/hskp-front-console-portal/src/components/BeforeLoginComp/index.tsx`：登录前门户入口组件（使用自定义 formatterCollections 包裹）
- `packages/hskp-front-console-portal/src/components/PortalPage/index.tsx`：登录后门户入口（使用原生 formatterCollections）
- `node_modules/hzero-front/lib/utils/intl/formatterCollections.js`：原生 formatterCollections（参考实现）
- `node_modules/hzero-front/lib/services/api/index.js`：`queryPromptLocale` 原生接口定义
