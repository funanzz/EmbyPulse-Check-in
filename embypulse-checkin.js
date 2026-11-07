// Response and task script for the EmbyPulse user portal.
(function () {
  'use strict';

  const pointsPath = '/api/user/points/info';
  const logoutPath = '/api/requests/logout';
  const cookiePattern = /^(?:session_id|session)=[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;
  const isBrowser = typeof $request !== 'undefined' && !!$request;
  const isQuantumultX = typeof $prefs !== 'undefined' && typeof $notify === 'function';
  const scriptArgument = typeof $argument === 'undefined' ? null : $argument;
  const isSurgeCompatible = typeof scriptArgument === 'string' && scriptArgument.startsWith('proxy:');
  const argument = isQuantumultX
    ? quantumultInstances()
    : isSurgeCompatible ? scriptArgument.slice('proxy:'.length) : scriptArgument;
  const store = isQuantumultX ? {
    read: (key) => $prefs.valueForKey(key),
    write: (value, key) => value === undefined ? $prefs.removeValueForKey(key) : $prefs.setValueForKey(value, key),
  } : $persistentStore;
  class CheckinError extends Error {}

  function quantumultInstances() {
    const match = /#instances=([^&]*)/.exec($environment.sourcePath || '');
    try { return match ? decodeURIComponent(match[1]) : ''; } catch (_) { return ''; }
  }

  function sendRequest(method, options, callback) {
    if (!isQuantumultX) {
      $httpClient[method](options, callback);
      return;
    }
    const { url, headers, body } = options;
    $task.fetch({
      url, method: method.toUpperCase(), headers, body,
      opts: { redirection: false, 'skip-cert-verify': false, 'auto-cookie': false },
    }).then(
      (response) => callback(null, { status: response.statusCode }, response.body),
      (error) => callback(error),
    );
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
    const local = typeof argument === 'string';
    const list = local ? argument : argument?.instances;
    const renewalEnabled = local || argument?.autoRenew === true;
    const sites = new Map();
    let invalid = 0;
    for (const entry of (typeof list === 'string' ? list : '').split(/[;\r\n]+/)) {
      if (!entry.trim()) continue;
      const [address, mode, ...extra] = entry.split('|').map((part) => part.trim());
      const origin = normalizeOrigin(address);
      if (!origin || extra.length || (mode !== undefined && mode !== 'renew')) {
        invalid++;
        continue;
      }
      if (!sites.has(origin)) sites.set(origin, renewalEnabled && mode === 'renew');
    }
    return { sites, invalid };
  }

  function report(site, title, message) {
    const label = site ? `${site} · ${title}` : title;
    console.log(`EmbyPulse：${label} — ${message}`);
    if (isQuantumultX) $notify('EmbyPulse 签到', label, message);
    else $notification.post('EmbyPulse 签到', label, message);
  }

  function sessionCookies(header) {
    if (typeof header !== 'string') return null;
    const found = header.split(';').map((part) => part.trim()).filter((part) => /^(?:session_id|session)=/.test(part));
    const names = new Set(found.map((part) => part.split('=', 1)[0]));
    if (!found.length || names.size !== found.length || !found.every((part) => cookiePattern.test(part))) return null;
    return found.sort().join('; ');
  }

  function createInstance(origin, autoRenew) {
    const site = origin.slice('https://'.length);
    const profile = origin + '/?tab=profile';
    const key = `embypulse.checkin.${site}.session`;
    const renewalKeyPrefix = `embypulse.renewal.${site}.`;

    function notify(title, message) {
      report(site, title, message);
    }

    function parseJSON(body) {
      try { return JSON.parse(body); } catch (_) { return null; }
    }

    function browserSession(headers) {
      const name = Object.keys(headers || {}).find((name) => name.toLowerCase() === 'cookie');
      return sessionCookies(name && headers[name]);
    }

    function forgetSession(cookie) {
      if (store.read(key) !== cookie) return;
      // Surge and Stash accept strings. An empty value is treated as no session.
      store.write(isSurgeCompatible ? '' : undefined, key);
      if (store.read(key) === cookie) console.log(`EmbyPulse：${site} 未能清除已保存的登录会话。`);
    }

    function readBrowserResponse(path) {
      if (typeof $response === 'undefined' || Number(isQuantumultX ? $response.statusCode : $response.status) !== 200) return;
      const capture = path === pointsPath && $request.method === 'GET';
      const logout = path === logoutPath && $request.method === 'POST';
      if (!capture && !logout) return;

      const cookie = browserSession($request.headers);
      const body = parseJSON($response.body);
      if (!cookie || !body || body.status !== 'success') return;
      if (logout) {
        // Some portals refresh signed cookies before logout clears the browser session.
        const saved = store.read(key);
        if (saved) forgetSession(saved);
      } else if (body.data && typeof body.data.has_checked_in === 'boolean' && store.read(key) !== cookie) {
        if (store.write(cookie, key)) {
          notify('已保存登录会话', '可以手动运行一次签到，或等待定时执行。');
        } else {
          notify('会话保存失败', '请检查客户端的脚本日志和存储设置。');
        }
      }
    }

    async function request(method, path, cookie, payload) {
      const options = {
        url: origin + path,
        timeout: isSurgeCompatible ? 12 : 12000,
        headers: { Cookie: cookie, Accept: 'application/json', Origin: origin, Referer: profile },
        'auto-cookie': false,
        'auto-redirect': false,
        insecure: false,
      };
      if (payload !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(payload);
      }
      const { code, body } = await new Promise((resolve, reject) => {
        sendRequest(method, options, (error, response, body) => {
          if (error) reject(new CheckinError('网络请求失败，请检查连接后手动重试。'));
          else resolve({ code: Number(response && response.status), body: parseJSON(body) });
        });
      });
      if (code === 401 || (code === 200 && body?.status === 'error' && body.message === '未登录')) {
        forgetSession(cookie);
        notify('登录会话已失效', '请用 Safari 重新登录 EmbyPulse 并打开个人中心。');
        return null;
      }
      if (!Number.isInteger(code) || code <= 0) throw new CheckinError('服务器没有返回有效的 HTTP 状态。');
      if (code !== 200) throw new CheckinError(`服务器返回 HTTP ${code}，请在 Safari 检查网站是否可访问。`);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CheckinError('服务器未返回有效数据，请在 Safari 检查网站。');
      return body;
    }

    async function loadPoints(cookie) {
      const info = await request('get', pointsPath, cookie);
      if (!info) return null;
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
      return { id: item.id, type: item.type, cost: pointsAmount(item.cost) };
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

      const order = { item_id: item.id, type: item.type, cost, request_id: `loon-renew-${day}-${userId}` };
      if (!store.write(JSON.stringify(order), storageKey)) {
        throw new CheckinError('无法保存兑换请求编号，请检查客户端的存储设置。');
      }
      return order;
    }

    async function renew(cookie) {
      const account = await request('get', '/api/requests/check', cookie);
      if (!account) return;
      const userId = account.status === 'success' && account.user && account.user.Id;
      if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,58}$/.test(userId)) {
        throw new CheckinError('无法确认当前账号身份，请重新打开个人中心。');
      }

      const info = await loadPoints(cookie);
      if (!info) return;
      if (!info.has_checked_in) {
        notify('跳过续期', '积分接口还未确认今日签到。');
        return;
      }
      if (store.read(key) !== cookie) {
        throw new CheckinError('登录会话已变化，请重新运行。');
      }

      const day = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const storageKey = renewalKeyPrefix + userId;
      let order = parseJSON(store.read(storageKey));
      if (order && !order.request_id && order.day === day) {
        console.log(`EmbyPulse：${site} 今天的续期兑换已处理。`);
        return;
      }
      const item = firstRenewalItem(info);
      if (order && order.request_id) {
        if (!item || item.id !== order.item_id || item.type !== order.type || item.cost !== order.cost) {
          store.write(JSON.stringify({ day }), storageKey);
          notify('旧订单结果待核对', '首件商品或价格已变化，今天暂停兑换，请在积分明细中核对。');
          return;
        }
      } else {
        order = prepareOrder(item, pointsAmount(info.points), storageKey, userId, day);
      }
      if (!order) return;

      const { item_id, request_id } = order;
      const data = await request('post', '/api/user/points/redeem', cookie, { item_id, request_id })
        .catch(() => undefined);
      if (data === null) return;
      const succeeded = data?.status === 'success';
      if (!succeeded && (data?.status !== 'error' || data.retryable)) {
        notify('续期结果待确认', '下次运行会沿用同一笔兑换请求。');
        return;
      }

      // Keep an unresolved order until the server gives a definitive result.
      const saved = parseJSON(store.read(storageKey));
      if (saved && saved.request_id === request_id) {
        store.write(JSON.stringify({ day }), storageKey);
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
      const cookie = store.read(key);
      if (!cookie || sessionCookies(cookie) !== cookie) {
        notify('尚未获取登录会话', '请启用 MitM 和脚本，登录 EmbyPulse 后打开个人中心。');
        return;
      }

      const info = await loadPoints(cookie);
      if (!info) return;
      if (info.has_checked_in) {
        notify('今日已签到', '这次无需重复签到。');
        return cookie;
      }
      if (store.read(key) !== cookie) {
        notify('登录会话已变化', '请重新运行签到。');
        return;
      }

      const data = await request('post', '/api/user/points/checkin', cookie);
      if (!data) return;
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
      return cookie;
    }

    async function run() {
      let phase = '签到';
      try {
        const cookie = await checkIn();
        if (cookie && autoRenew) {
          phase = '续期';
          await renew(cookie);
        }
      } catch (error) {
        // Only forward messages created by this script; never log request details or raw responses.
        notify(`${phase}未完成`, error instanceof CheckinError
          ? error.message : '运行出错，请检查客户端日志后重试。');
      }
    }

    return { readBrowserResponse, run };
  }

  const { sites, invalid } = configuredInstances();
  if (isBrowser) {
    try {
      const parts = /^(https:\/\/[^/?#]+)(\/[^?#]*)(?:\?[^#]*)?$/i.exec(String($request.url || ''));
      const origin = parts && normalizeOrigin(parts[1]);
      if (sites.has(origin)) createInstance(origin, sites.get(origin)).readBrowserResponse(parts[2]);
    } catch (_) {
      console.log('EmbyPulse：读取浏览器会话失败。');
    } finally {
      $done({});
    }
  } else if (!sites.size) {
    report(null, '实例配置无效', '请填写至少一个 EmbyPulse HTTPS 实例地址。');
    $done();
  } else {
    if (invalid) report(null, '已跳过无效实例', `有 ${invalid} 项地址或续期标记无效。`);
    Promise.allSettled([...sites].map(([origin, renew]) => createInstance(origin, renew).run()))
      .finally(() => $done());
  }
})();
