// Loon and Quantumult X task script for the EmbyPulse user portal.
(function () {
  'use strict';

  // Older plugin definitions can still reference this script as a response handler.
  if (typeof $request !== 'undefined' && $request) {
    $done({});
    return;
  }

  const loginPath = '/api/requests/auth';
  const pointsPath = '/api/user/points/info';
  const cookiePattern = /^(?:session_id|session)=[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;
  const isQX = typeof $task !== 'undefined' && typeof $task.fetch === 'function';
  const argument = isQX ? qxOptions() : (typeof $argument === 'undefined' ? null : $argument);
  class CheckinError extends Error {}
  class SessionError extends CheckinError {}

  function qxOptions() {
    const source = typeof $environment === 'undefined' ? '' : $environment.sourcePath || '';
    const hash = source.indexOf('#');
    if (hash < 0) return {};

    const fragment = source.slice(hash + 1);
    // The plain list is the last parameter, so ampersands in passwords stay intact.
    const plain = /(?:^|&)sites=/.exec(fragment);
    const options = {};
    if (plain) options.plainInstances = fragment.slice(plain.index + plain[0].length);

    // Older tasks pass their list as a percent-encoded instances parameter.
    try {
      for (const field of fragment.slice(0, plain?.index ?? fragment.length).split('&')) {
        const separator = field.indexOf('=');
        if (separator < 1) continue;
        const key = field.slice(0, separator);
        if (key === 'instances') options.instances = decodeURIComponent(field.slice(separator + 1));
        if (key === 'renewAll') options.renewAll = decodeURIComponent(field.slice(separator + 1)) === 'true';
      }
    } catch (_) {
      return {};
    }
    return options;
  }

  function readLocal(key) {
    return isQX ? $prefs.valueForKey(key) : $persistentStore.read(key);
  }

  function writeLocal(value, key) {
    if (!isQX) return $persistentStore.write(value, key);
    $prefs.setValueForKey(value, key);
    return readLocal(key) === value;
  }

  async function sendRequest(method, options, timeout) {
    if (isQX) {
      const response = await $task.fetch({
        ...options,
        method: method.toUpperCase(),
        opts: { 'auto-cookie': false, redirection: false, 'skip-cert-verify': false },
      });
      return { code: response.statusCode, headers: response.headers, body: response.body };
    }

    return new Promise((resolve, reject) => {
      $httpClient[method]({ ...options, timeout, 'auto-cookie': false, 'auto-redirect': false, insecure: false }, (error, response, body) => {
        if (error) reject(error);
        else resolve({ code: response?.status, headers: response?.headers, body });
      });
    });
  }

  function normalizeOrigin(address) {
    const match = /^(https:\/\/)?([a-z0-9.-]+)(?::(\d{1,5}))?\/?(?:\?[^#\s]*)?$/i.exec(address.trim());
    if (!match) return null;
    const [, scheme, name, portText] = match;
    const host = name.toLowerCase();
    if (!scheme && !host.includes('.')) return null;
    const port = portText ? Number(portText) : 443;
    const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if (host.length > 253 || !host.split('.').every((label) => validLabel.test(label)) || port < 1 || port > 65535) {
      return null;
    }
    return `https://${host}${port === 443 ? '' : ':' + port}`;
  }

  function configuredInstances() {
    const plain = typeof argument?.plainInstances === 'string';
    const list = plain ? argument.plainInstances : (typeof argument === 'string' ? argument : argument?.instances);
    const sites = new Map();
    let invalid = 0;
    if (typeof list !== 'string') return { sites, invalid };

    // Quoted credentials can contain separators and preserve surrounding spaces.
    const separator = plain ? '~' : ',，';
    const value = String.raw`(?:"((?:[^"\r\n]|"")*)"|([^${separator};；"\r\n]*?))`;
    const boundary = String.raw`[^\S\r\n]*[${separator}][^\S\r\n]*`;
    const record = new RegExp(String.raw`([^${separator};；\r\n]+?)${boundary}${value}${boundary}${value}[^\S\r\n]*(?:[;；\r\n]|$)`, 'y');
    const nextEntry = /[^;；\r\n]*(?:[;；\r\n]|$)/y;
    for (let offset = 0; offset < list.length;) {
      record.lastIndex = offset;
      const match = record.exec(list);
      if (!match) {
        nextEntry.lastIndex = offset;
        const [entry] = nextEntry.exec(list);
        if (entry.replace(/[;；\r\n]$/, '').trim()) invalid++;
        offset = nextEntry.lastIndex;
        continue;
      }
      offset = record.lastIndex;
      const [, address, quotedUser, unquotedUser, quotedPassword, unquotedPassword] = match;
      const origin = normalizeOrigin(address);
      const username = quotedUser?.replace(/""/g, '"') ?? unquotedUser.trim();
      const password = quotedPassword?.replace(/""/g, '"') ?? unquotedPassword.trim();
      if (!origin || !username || !password) {
        invalid++;
        continue;
      }
      if (!sites.has(origin)) sites.set(origin, new Map());
      const accounts = sites.get(origin);
      const accountKey = username.toLowerCase();
      if (accounts.has(accountKey)) {
        invalid++;
        continue;
      }
      accounts.set(accountKey, { username, password });
    }
    return { sites, invalid };
  }

  function report(site, title, message) {
    const label = site ? `${site} · ${title}` : title;
    console.log(`EmbyPulse：${label} — ${message}`);
    if (isQX) $notify('EmbyPulse 签到', label, message);
    else $notification.post('EmbyPulse 签到', label, message);
  }

  function sessionCookies(headers) {
    const name = Object.keys(headers || {}).find((name) => name.toLowerCase() === 'set-cookie');
    const header = headers?.[name];
    const values = Array.isArray(header) ? header : [header];
    const found = new Map();
    for (const value of values) {
      if (typeof value !== 'string') continue;
      // Multiple Set-Cookie values can share a header. Expires can also contain a comma.
      for (const [, pair, key] of value.matchAll(/(?:^|,)\s*((session_id|session)=[^;,]*)(?=[;,]|$)/g)) {
        if (cookiePattern.test(pair.trim())) found.set(key, pair.trim());
      }
    }
    return found;
  }

  async function runInstance(origin, credentials, autoRenew, accountNumber) {
    const host = origin.slice('https://'.length);
    const site = accountNumber ? `${host}（账号 ${accountNumber}）` : host;
    const profile = origin + '/?tab=profile';
    const renewalKeyPrefix = `embypulse.renewal.${host}.`;
    const session = new Map();

    function notify(title, message) {
      report(site, title, message);
    }

    function parseJSON(body) {
      try { return JSON.parse(body); } catch (_) { return null; }
    }

    async function request(method, path, payload) {
      const options = {
        url: origin + path,
        headers: { Accept: 'application/json', Origin: origin, Referer: profile },
      };
      if (session.size) options.headers.Cookie = [...session.values()].join('; ');
      if (payload !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
      }
      const response = await sendRequest(method, options, path === loginPath ? 18000 : 12000).catch(() => {
        throw new CheckinError('网络请求失败，请检查连接后手动重试。');
      });
      const code = Number(response.code);
      const body = parseJSON(response.body);
      if (code === 401 || (code === 200 && body?.status === 'error' && body.message === '未登录')) {
        throw new SessionError(path === loginPath ? '站点拒绝登录，请检查账号和密码。' : '站点未接受登录会话，请手动重试。');
      }
      if (!Number.isInteger(code) || code <= 0) throw new CheckinError('服务器没有返回有效的 HTTP 状态。');
      if (code !== 200) throw new CheckinError(`服务器返回 HTTP ${code}，请检查门户地址和站点状态。`);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CheckinError('服务器未返回有效数据，请检查门户地址。');
      for (const [name, pair] of sessionCookies(response.headers)) session.set(name, pair);
      return body;
    }

    async function login() {
      const data = await request('post', loginPath, credentials);
      if (data.status !== 'success') {
        throw new CheckinError(data.disabled ? '站点显示账号无法登录，请到门户查看账号状态。' : '站点拒绝登录，请检查账号和密码。');
      }
      if (!session.size) throw new CheckinError('站点未返回可用的登录会话，请检查门户地址。');
    }

    async function loadPoints() {
      const info = await request('get', pointsPath);
      if (info.status !== 'success' || !info.data || typeof info.data.has_checked_in !== 'boolean') {
        throw new CheckinError('无法确认今日签到状态，请在个人中心检查。');
      }
      return info.data;
    }

    function pointsAmount(value) {
      const amount = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
      return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
    }

    function firstRenewalItem(info) {
      const items = info.config && info.config.store_items;
      const item = Array.isArray(items) ? items[0] : null;
      if (!item || !['renew', 'random_renew'].includes(item.type) || typeof item.id !== 'string' || !item.id.trim()) {
        return null;
      }
      return { id: item.id, cost: pointsAmount(item.cost) };
    }

    function prepareOrder(item, balance, storageKey, userId, day) {
      if (!item) {
        notify('跳过续期', '积分补给站的第一件商品不是可识别的续期商品。');
        return null;
      }
      const { cost } = item;
      if (balance === null || cost === null || balance < cost) {
        const detail = balance === null || cost === null ? '未能确认当前积分或商品价格。'
          : `第一件商品需要 ${cost} 积分，当前有 ${balance} 积分。`;
        notify('跳过续期', detail);
        return null;
      }

      // Keep the existing request ID across both clients for portals that deduplicate it.
      const order = { day, item_id: item.id, request_id: `loon-renew-${day}-${userId}` };
      if (!writeLocal(JSON.stringify(order), storageKey)) {
        throw new CheckinError('无法保存兑换请求编号，请检查客户端的脚本存储。');
      }
      return order;
    }

    async function renew() {
      const account = await request('get', '/api/requests/check');
      const userId = account.status === 'success' && account.user && account.user.Id;
      if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,58}$/.test(userId)) {
        throw new CheckinError('无法确认当前账号身份，请重新打开个人中心。');
      }

      const info = await loadPoints();
      if (!info.has_checked_in) {
        notify('跳过续期', '积分接口还未确认今日签到。');
        return;
      }
      const day = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const storageKey = renewalKeyPrefix + userId;
      const previous = parseJSON(readLocal(storageKey));
      const previousDay = previous?.day ?? /^loon-renew-(\d{4}-\d{2}-\d{2})-/.exec(previous?.request_id)?.[1];
      // Some EmbyPulse versions ignore request_id and can debit again on a retry.
      if (previousDay === day) {
        if (previous.request_id) {
          notify('续期结果待确认', '今天已提交过兑换，请在积分明细中核对。');
        } else {
          console.log(`EmbyPulse：${site} 今天的续期兑换已处理。`);
        }
        return;
      }
      const item = firstRenewalItem(info);
      const order = prepareOrder(item, pointsAmount(info.points), storageKey, userId, day);
      if (!order) return;

      const { item_id, request_id } = order;
      const data = await request('post', '/api/user/points/redeem', { item_id, request_id }).catch((error) => {
        if (error instanceof SessionError) throw error;
        return undefined;
      });
      const succeeded = data?.status === 'success';
      if (!succeeded && (data?.status !== 'error' || data.retryable)) {
        notify('续期结果待确认', '请在积分明细中核对，今天会暂停再次兑换。');
        return;
      }

      // Keep an unresolved order until the server gives a definitive result.
      const saved = parseJSON(readLocal(storageKey));
      if (saved && saved.request_id === request_id) {
        writeLocal(JSON.stringify({ day }), storageKey);
      }
      if (!succeeded) {
        notify('续期兑换未成功', '网站拒绝了这笔兑换，请到积分补给站查看。');
        return;
      }

      const details = [];
      const balance = pointsAmount(data.balance);
      if (balance !== null) details.push(`余额 ${balance} 积分`);
      if (typeof data.new_exp_str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.new_exp_str)) {
        details.push(`到期日 ${data.new_exp_str}`);
      }
      if (data.permission_sync === 'pending') details.push('Emby 权限同步待处理');
      notify('续期兑换成功', details.join('，') || '网站已确认兑换。');
    }

    async function checkIn() {
      const info = await loadPoints();
      if (info.has_checked_in) {
        notify('今日已签到', '这次无需重复签到。');
        return;
      }

      const data = await request('post', '/api/user/points/checkin');
      if (data.status === 'success') {
        const details = [];
        if (Number.isFinite(data.reward)) details.push(`获得 ${data.reward} 积分`);
        if (Number.isFinite(data.balance)) details.push(`余额 ${data.balance} 积分`);
        notify('签到成功', details.join('，') || '网站已确认签到。');
      } else if (data.status === 'error' && /(?:今天|今日)?(?:已经|已)签到/.test(data.message || '')) {
        notify('今日已签到', '网站已记录今天的签到。');
      } else {
        throw new CheckinError('网站未确认签到成功，请在个人中心查看。');
      }
    }

    let phase = '登录';
    try {
      await login();
      phase = '签到';
      await checkIn();
      if (autoRenew) {
        phase = '续期';
        await renew();
      }
    } catch (error) {
      // Only forward messages created by this script; never log request details or raw responses.
      notify(`${phase}未完成`, error instanceof CheckinError
        ? error.message : '运行出错，请检查脚本日志后重试。');
    }
  }

  console.log('EmbyPulse 1.2.2');
  const { sites, invalid } = configuredInstances();
  if (!sites.size) {
    report(null, '实例配置无效', isQX
      ? '请在任务的 sites 参数中填写「HTTPS 地址~用户名~密码」，多个站点用分号分隔。'
      : '请在插件的实例列表中填写「HTTPS 地址，用户名，密码；」。');
    $done();
  } else {
    if (invalid) report(null, '已跳过无效实例', `有 ${invalid} 项格式无效或在同一站点重复填写了同一账号，请检查实例列表。`);
    const autoRenew = argument?.renewAll === true;
    const tasks = [...sites].flatMap(([origin, accounts]) =>
      [...accounts.values()].map((credentials, index) =>
        runInstance(origin, credentials, autoRenew, accounts.size > 1 ? index + 1 : null)));
    Promise.allSettled(tasks).finally(() => $done());
  }
})();
