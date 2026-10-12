// 组件联网：请求由主进程代发。只允许 https、清单 network 中声明的域名，拒绝本机与局域网地址，
// 每次重定向重新检查；不带 Cookie，限制请求与响应大小、超时和频率。
const dns = require('dns');
const net = require('net');

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const RATE_LIMIT_PER_MINUTE = 120;
// 由宿主决定或会泄露身份的请求头，组件不能设置
const BLOCKED_HEADERS = /^(cookie|cookie2|host|origin|referer|connection|content-length|transfer-encoding|keep-alive|upgrade|te|proxy-.*|sec-.*)$/i;
const EXPOSED_RESPONSE_HEADERS = ['content-type', 'content-language', 'last-modified', 'etag', 'cache-control', 'date', 'retry-after'];

class WidgetNetError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isPrivateAddress = (address) => {
  const value = String(address || '').toLowerCase();
  if (net.isIPv4(value)) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(value)) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
    if (mapped) return isPrivateAddress(mapped[1]);
    return value === '::' || value === '::1' || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('ff');
  }
  return true;
};

/** host 是否命中清单里的域名（*.example.com 同时匹配 example.com 本身） */
const hostAllowed = (host, patterns = []) => patterns.some((pattern) => (
  pattern.startsWith('*.') ? host === pattern.slice(2) || host.endsWith(pattern.slice(1)) : host === pattern
));

const defaultFetch = () => {
  try {
    const { net: electronNet } = require('electron');
    // Electron 的 net.fetch 走应用代理设置
    if (electronNet?.fetch) return electronNet.fetch.bind(electronNet);
  } catch {}
  return fetch;
};

const readLimited = async (response) => {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) throw new WidgetNetError('NET_RESPONSE_TOO_LARGE', '响应超过 5MB 上限');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_RESPONSE_BYTES) throw new WidgetNetError('NET_RESPONSE_TOO_LARGE', '响应超过 5MB 上限');
  return buffer;
};

const decodeBody = (buffer, contentType, responseType) => {
  if (responseType === 'base64') return buffer.toString('base64');
  const text = buffer.toString('utf8');
  const wantsJson = responseType === 'json' || (responseType !== 'text' && /[/+]json\b/i.test(contentType));
  if (!wantsJson) return text;
  try {
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    if (responseType === 'json') throw new WidgetNetError('NET_BAD_JSON', '响应不是合法 JSON');
    return text;
  }
};

class WidgetNet {
  /**
   * @param {object} [deps]
   * @param {Function} [deps.fetchImpl] 默认用 Electron net.fetch（遵守代理设置）
   * @param {Function} [deps.lookup] 默认 dns.promises.lookup
   * @param {() => number} [deps.now]
   */
  constructor({ fetchImpl, lookup, now } = {}) {
    this.fetchImpl = fetchImpl || null;
    this.lookup = lookup || ((host) => dns.promises.lookup(host, { all: true, verbatim: true }));
    this.now = now || Date.now;
    this.usage = new Map();
  }

  checkRate(owner) {
    const minute = Math.floor(this.now() / 60000);
    const entry = this.usage.get(owner);
    const count = entry && entry.minute === minute ? entry.count + 1 : 1;
    this.usage.set(owner, { minute, count });
    if (count > RATE_LIMIT_PER_MINUTE) throw new WidgetNetError('NET_RATE_LIMITED', '组件联网请求过于频繁，请稍后再试');
  }

  async assertPublicHost(host) {
    if (net.isIP(host)) throw new WidgetNetError('NET_HOST_NOT_ALLOWED', '不允许直接访问 IP 地址');
    let addresses;
    try {
      addresses = await this.lookup(host);
    } catch (error) {
      throw new WidgetNetError('NET_DNS_FAILED', `无法解析域名 ${host}：${error.message}`);
    }
    const list = (Array.isArray(addresses) ? addresses : [addresses]).map((item) => (typeof item === 'string' ? item : item?.address));
    if (!list.length || list.some(isPrivateAddress)) {
      throw new WidgetNetError('NET_PRIVATE_ADDRESS', `${host} 指向本机或局域网地址，已拒绝访问`);
    }
  }

  /**
   * @param {object} params { url, method, headers, body, responseType: 'auto'|'json'|'text'|'base64' }
   * @param {object} policy { owner, hosts }
   */
  async fetch(params = {}, { owner, hosts }) {
    this.checkRate(owner);
    let method = String(params.method || 'GET').toUpperCase();
    if (!METHODS.has(method)) throw new WidgetNetError('NET_INVALID', `不支持的请求方法 ${method}`);
    let target;
    try { target = new URL(String(params.url || '')); } catch { throw new WidgetNetError('NET_INVALID', `网址无效：${params.url}`); }

    const headers = {};
    for (const [key, value] of Object.entries(params.headers && typeof params.headers === 'object' ? params.headers : {})) {
      if (!BLOCKED_HEADERS.test(key) && /^[\w-]+$/.test(key)) headers[key] = String(value);
    }
    let body = params.body;
    if (body !== undefined && body !== null && typeof body !== 'string') {
      body = JSON.stringify(body);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    }
    if (typeof body === 'string' && Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new WidgetNetError('NET_REQUEST_TOO_LARGE', '请求内容超过 1MB 上限');
    if (method === 'GET' || method === 'HEAD') body = undefined;

    const fetchImpl = this.fetchImpl || defaultFetch();
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (target.protocol !== 'https:') throw new WidgetNetError('NET_INSECURE', '组件只能访问 https 网址');
      if (target.username || target.password) throw new WidgetNetError('NET_INVALID', '网址不能包含账号密码');
      if (target.port && target.port !== '443') throw new WidgetNetError('NET_HOST_NOT_ALLOWED', '组件只能访问默认 https 端口');
      const host = target.hostname.toLowerCase();
      if (!hostAllowed(host, hosts)) {
        throw new WidgetNetError('NET_HOST_NOT_ALLOWED', `组件清单的 network 中没有声明 ${host}`);
      }
      await this.assertPublicHost(host);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response;
      try {
        response = await fetchImpl(target.href, { method, headers, body, redirect: 'manual', credentials: 'omit', signal: controller.signal });
        if (REDIRECTS.has(response.status) && response.headers.get('location')) {
          target = new URL(response.headers.get('location'), target);
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
            method = 'GET';
            body = undefined;
          }
          continue;
        }
        const contentType = response.headers.get('content-type') || '';
        const buffer = method === 'HEAD' ? Buffer.alloc(0) : await readLimited(response);
        const exposed = {};
        for (const name of EXPOSED_RESPONSE_HEADERS) {
          const value = response.headers.get(name);
          if (value) exposed[name] = value;
        }
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText || '',
          url: target.href,
          headers: exposed,
          data: decodeBody(buffer, contentType, params.responseType || 'auto'),
        };
      } catch (error) {
        if (error instanceof WidgetNetError) throw error;
        if (controller.signal.aborted) throw new WidgetNetError('NET_TIMEOUT', '请求超时');
        throw new WidgetNetError('NET_FAILED', `请求失败：${error.message}`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new WidgetNetError('NET_TOO_MANY_REDIRECTS', '重定向次数过多');
  }
}

module.exports = { WidgetNet, WidgetNetError, isPrivateAddress, hostAllowed };
