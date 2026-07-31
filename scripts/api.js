const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ENV_PATH = path.join(__dirname, '..', '.env.json');

function loadEnv() {
  return JSON.parse(fs.readFileSync(ENV_PATH, 'utf-8'));
}

function saveEnv(env) {
  fs.writeFileSync(ENV_PATH, JSON.stringify(env, null, 2), 'utf-8');
}

function getConfig(projectName, environmentName) {
  const env = loadEnv();
  // 不设固定 currentProject/currentEnvironment：多项目共存时，项目/环境由 AI 每次操作时
  // 按当前文件路径用 getProjectByFilePath 确认，或询问用户后记录到 fileProjectMap。
  if (!projectName || !environmentName) {
    throw new Error('未指定项目/环境。请根据当前操作的文件用 api.getProjectByFilePath(filePath) 确认关联项目（fileProjectMap 按路径最长匹配），若无关联则询问用户后记录到 fileProjectMap，再传入 project/environment。');
  }
  const project = env.projects[projectName];
  if (!project) {
    throw new Error(`项目 "${projectName}" 不存在`);
  }
  const config = project.environments[environmentName];
  if (!config) {
    throw new Error(`环境 "${environmentName}" 不存在于项目 "${projectName}" 中`);
  }
  return { ...config, _project: projectName, _environment: environmentName };
}

function getProjectByFilePath(filePath) {
  const env = loadEnv();
  if (!env.fileProjectMap) return null;
  // 优先匹配最长路径
  let bestMatch = null;
  let bestLen = 0;
  for (const [dirPath, info] of Object.entries(env.fileProjectMap)) {
    if (filePath.startsWith(dirPath) && dirPath.length > bestLen) {
      bestMatch = info;
      bestLen = dirPath.length;
    }
  }
  return bestMatch;
}

async function request(method, urlPath, body = null, projectName = null, environmentName = null) {
  const config = getConfig(projectName, environmentName);
  const url = `${config.host}${urlPath}`;
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  };
  if (config.token) {
    headers['authorization'] = config.token;
  }

  const reqConfig = { method, url, headers };
  if (body && method !== 'GET') {
    reqConfig.data = body;
  }

  let response;
  try {
    response = await axios(reqConfig);
  } catch (e) {
    if (e.response) {
      if (e.response.status === 401) {
        throw new Error('TOKEN_EXPIRED: Token 已过期，请提供新的 token');
      }
      const data = e.response.data;
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      // 提取平台错误码，便于上层按码处理（见 doc/api.md 错误码表）
      if (data && typeof data === 'object') {
        const code = data.code || data.message || null;
        if (code === 'error.permission.accessTokenExpire') {
          throw new Error('TOKEN_EXPIRED: Token 已过期，请提供新的 token');
        }
        if (code && typeof code === 'string' && code.startsWith('error.')) {
          throw new Error(`API_ERROR[${code}]: ${text}`);
        }
      }
      throw new Error(`API 请求失败 (${e.response.status}): ${text}`);
    }
    throw e;
  }
  // 响应体 failed: true 也表示错误（HTTP 200 但业务失败）
  if (response.data && typeof response.data === 'object' && response.data.failed === true) {
    const code = response.data.code || response.data.message || null;
    if (code === 'error.permission.accessTokenExpire') {
      throw new Error('TOKEN_EXPIRED: Token 已过期，请提供新的 token');
    }
    if (code && typeof code === 'string' && code.startsWith('error.')) {
      throw new Error(`API_ERROR[${code}]: ${JSON.stringify(response.data)}`);
    }
    throw new Error(`API 请求失败 (failed: true): ${JSON.stringify(response.data)}`);
  }
  if (response.status === 204) {
    return { success: true };
  }
  return response.data;
}

async function getPromptList(params = {}) {
  const projectName = params.project || null;
  const environmentName = params.environment || null;
  const config = getConfig(projectName, environmentName);
  const tenantId = params.tenantId || config.tenantId || 0;
  const page = params.page || 0;
  const size = params.size !== undefined ? params.size : 10;
  const promptKey = params.promptKey || '';
  const promptCode = params.promptCode || '';
  const description = params.description || '';
  const keyword = params.keyword || '';

  let query = `?page=${page}&size=${size}&tenantId=${tenantId}`;
  if (promptKey) query += `&promptKey=${encodeURIComponent(promptKey)}`;
  if (promptCode) query += `&promptCode=${encodeURIComponent(promptCode)}`;
  if (description) query += `&description=${encodeURIComponent(description)}`;
  if (keyword) query += `&keyword=${encodeURIComponent(keyword)}`;

  return request('GET', `/hpfm/v1/prompts/page-list${query}`, null, projectName, environmentName);
}

// 精确查询单条多语言记录（用于 update/delete 前取 promptId/objectVersionNumber/_token）。
// /page-list 是模糊查询（promptKey=1 会命中 1/10/11/1xxx），直接取 content[0] 可能改错记录。
// 这里 size=0 拉全量后客户端按 promptKey+promptCode 精确过滤，保证命中唯一记录。
async function getPromptExact(params = {}) {
  const { promptKey, promptCode, tenantId, project, environment } = params;
  if (!promptKey || !promptCode) {
    throw new Error('getPromptExact 必须同时传 promptKey 和 promptCode（精确匹配）');
  }
  const res = await getPromptList({ promptKey, promptCode, size: 0, tenantId, project, environment });
  const content = (res && res.content) || [];
  const exact = content.filter((r) => r.promptKey === promptKey && r.promptCode === promptCode);
  if (exact.length === 0) {
    throw new Error(`未找到精确匹配的多语言条目: promptKey="${promptKey}" promptCode="${promptCode}"。page-list 为模糊查询，可能返回相似记录但无完全匹配。请确认 key/code 拼写或租户是否正确。`);
  }
  if (exact.length > 1) {
    throw new Error(`找到 ${exact.length} 条精确匹配记录（预期 1 条）: promptKey="${promptKey}" promptCode="${promptCode}"。可能存在脏数据，请到平台人工核查。`);
  }
  return exact[0];
}

async function getPromptDetail(params = {}) {
  const projectName = params.project || null;
  const environmentName = params.environment || null;
  const config = getConfig(projectName, environmentName);
  const tenantId = params.tenantId || config.tenantId || 0;
  const lang = params.lang || 'zh_CN';
  const promptKey = params.promptKey || '';
  const promptCode = params.promptCode || '';
  const query = `?lang=${lang}&promptCode=${encodeURIComponent(promptCode)}&promptKey=${encodeURIComponent(promptKey)}&tenantId=${tenantId}`;
  return request('GET', `/hpfm/v1/prompts/detail${query}`, null, projectName, environmentName);
}

async function getPromptByLang(params = {}) {
  const projectName = params.project || null;
  const environmentName = params.environment || null;
  const config = getConfig(projectName, environmentName);
  const tenantId = params.tenantId !== undefined ? params.tenantId : (config.tenantId || 0);
  const lang = params.lang || 'zh_CN';
  const promptKey = Array.isArray(params.promptKey) ? params.promptKey.join(',') : (params.promptKey || '');
  const query = `?promptKey=${encodeURIComponent(promptKey)}`;
  return request('GET', `/hpfm/v1/${tenantId}/prompt/${lang}${query}`, null, projectName, environmentName);
}

async function updatePrompt(data, projectName = null, environmentName = null) {
  const required = ['promptId', 'objectVersionNumber', '_token', 'promptKey', 'promptCode', 'lang', 'langDescription', 'tenantId', 'promptConfigs'];
  const missing = required.filter((k) => data[k] === undefined || data[k] === null);
  if (missing.length) {
    throw new Error(`updatePrompt 缺失必填字段: ${missing.join(', ')}。请用 getPromptExact({ promptKey, promptCode }) 取完整行记录（含 promptId/objectVersionNumber/_token/promptKey/promptCode/lang/langDescription/tenantId），不要用 getPromptList 取 content[0]（模糊查询可能命中错误记录），详见 doc/api.md`);
  }
  return request('PUT', '/hpfm/v1/prompts/update', data, projectName, environmentName);
}

async function insertPrompt(data, projectName = null, environmentName = null) {
  return request('POST', '/hpfm/v1/prompts/insert', data, projectName, environmentName);
}

async function deletePrompt(data, projectName = null, environmentName = null) {
  return request('DELETE', '/hpfm/v1/prompts/remove', data, projectName, environmentName);
}

async function refreshCache(projectName = null, environmentName = null) {
  return request('POST', '/hpfm/v1/prompts/refresh/cache', null, projectName, environmentName);
}

async function getUserSelf(projectName = null, environmentName = null) {
  return request('GET', '/iam/hzero/v1/users/self', null, projectName, environmentName);
}

async function exportPrompts(params = {}) {
  const projectName = params.project || null;
  const environmentName = params.environment || null;
  const config = getConfig(projectName, environmentName);
  const tenantId = params.tenantId || config.tenantId || 0;
  let query = `?tenantId=${tenantId}`;
  if (params.promptKey) query += `&promptKey=${encodeURIComponent(params.promptKey)}`;
  return request('GET', `/hpfm/v1/prompts/prompt-export${query}`, null, projectName, environmentName);
}

module.exports = {
  loadEnv,
  saveEnv,
  getConfig,
  getProjectByFilePath,
  getPromptList,
  getPromptExact,
  getPromptDetail,
  getPromptByLang,
  updatePrompt,
  insertPrompt,
  deletePrompt,
  refreshCache,
  getUserSelf,
  exportPrompts
};
