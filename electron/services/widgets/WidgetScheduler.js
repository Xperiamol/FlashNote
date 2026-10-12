// 组件的定时提醒：组件用 flota.schedule 登记，主进程到点发系统通知并通知正在显示的组件。
// 只保存在本机（不随组件数据同步），避免多台电脑重复提醒。组件没打开、应用在后台时也会提醒。

const TICK_MS = 20 * 1000;
const MAX_PER_INSTANCE = 50;
// 应用关闭期间错过的提醒：12 小时内补发一次，更早的不再补发
const CATCH_UP_MS = 12 * 60 * 60 * 1000;
const REPEATS = { hourly: 60 * 60 * 1000, daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000, monthly: null };
const ID_RE = /^[\w-]{1,64}$/;

class WidgetScheduleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** 下一次提醒时间（严格晚于 now）；monthly 按日历月推进 */
const nextOccurrence = (at, repeat, now) => {
  let next = at;
  while (next <= now) {
    if (repeat === 'monthly') {
      const date = new Date(next);
      date.setMonth(date.getMonth() + 1);
      next = date.getTime();
    } else {
      next += REPEATS[repeat];
    }
  }
  return next;
};

const normalizeItem = (input = {}, now) => {
  const id = String(input.id || '');
  if (!ID_RE.test(id)) throw new WidgetScheduleError('INVALID_PARAMS', '提醒 id 只能包含字母、数字、下划线和短横线，最长 64 个字符');
  const at = typeof input.at === 'number' ? input.at : Date.parse(input.at);
  if (!Number.isFinite(at)) throw new WidgetScheduleError('INVALID_PARAMS', '提醒时间 at 无效');
  const repeat = input.repeat ? String(input.repeat) : null;
  if (repeat && !(repeat in REPEATS)) throw new WidgetScheduleError('INVALID_PARAMS', 'repeat 只能是 hourly / daily / weekly / monthly');
  if (!repeat && at <= now) throw new WidgetScheduleError('INVALID_PARAMS', '一次性提醒的时间必须晚于现在');
  const title = String(input.title || '').trim().slice(0, 100);
  if (!title) throw new WidgetScheduleError('INVALID_PARAMS', '提醒需要 title');
  return {
    id,
    at: repeat ? nextOccurrence(at, repeat, now) : at,
    repeat,
    title,
    body: String(input.body || '').trim().slice(0, 300),
    data: input.data && typeof input.data === 'object' ? JSON.parse(JSON.stringify(input.data).slice(0, 2000)) : null,
  };
};

class WidgetScheduler {
  /**
   * @param {object} deps
   * @param {{ load: () => Array<{ widgetId: string, instanceId: string, items: object[] }>, read: (widgetId: string, instanceId: string) => object[], write: (widgetId: string, instanceId: string, items: object[]) => void }} deps.store
   * @param {(fired: { widgetId: string, instanceId: string, item: object }) => void} deps.onFire
   * @param {() => number} [deps.now]
   */
  constructor({ store, onFire, now }) {
    this.store = store;
    this.onFire = onFire;
    this.now = now || Date.now;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  list(widgetId, instanceId) {
    return this.store.read(widgetId, instanceId).slice().sort((a, b) => a.at - b.at);
  }

  set(widgetId, instanceId, input) {
    const item = normalizeItem(input, this.now());
    const items = this.store.read(widgetId, instanceId).filter((existing) => existing.id !== item.id);
    if (items.length >= MAX_PER_INSTANCE) throw new WidgetScheduleError('TOO_MANY', `每个实例最多 ${MAX_PER_INSTANCE} 个提醒`);
    this.store.write(widgetId, instanceId, [...items, item]);
    return item;
  }

  remove(widgetId, instanceId, id) {
    const items = this.store.read(widgetId, instanceId);
    const next = items.filter((item) => item.id !== String(id));
    if (next.length !== items.length) this.store.write(widgetId, instanceId, next);
    return next.length !== items.length;
  }

  /** 触发所有到期的提醒；重复提醒推进到下一次，一次性提醒触发后删除 */
  tick() {
    const now = this.now();
    for (const { widgetId, instanceId, items } of this.store.load()) {
      let changed = false;
      const next = [];
      for (const item of items) {
        if (item.at > now) { next.push(item); continue; }
        changed = true;
        if (now - item.at <= CATCH_UP_MS) {
          try { this.onFire({ widgetId, instanceId, item }); } catch (error) { console.warn('[WidgetScheduler] 提醒发送失败', error.message); }
        }
        if (item.repeat) next.push({ ...item, at: nextOccurrence(item.at, item.repeat, now) });
      }
      if (changed) this.store.write(widgetId, instanceId, next);
    }
  }
}

module.exports = { WidgetScheduler, WidgetScheduleError, nextOccurrence };
