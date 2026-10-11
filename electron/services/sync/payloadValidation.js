const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateTodos(payload) {
  if (!Array.isArray(payload)) throw new Error('远端待办必须是数组');
  const ids = new Set();
  for (const todo of payload) {
    if (!isRecord(todo) || typeof todo.id !== 'string' || !todo.id.trim() || ids.has(todo.id)) {
      throw new Error('远端待办缺少有效 ID 或包含重复 ID');
    }
    ids.add(todo.id);
    for (const key of ['content', 'description', 'tags', 'completions']) {
      if (todo[key] != null && typeof todo[key] !== 'string') throw new Error(`远端待办字段格式异常：${key}`);
    }
    for (const key of ['updated_at', 'created_at']) {
      const value = todo[key];
      if (value != null && !(typeof value === 'number' && Number.isFinite(value)) &&
          !(typeof value === 'string' && Number.isFinite(Date.parse(value)))) {
        throw new Error(`远端待办时间格式异常：${key}`);
      }
    }
  }
  return payload;
}

function validateSettings(payload) {
  if (!isRecord(payload)) throw new Error('远端设置必须是对象');
  if (payload.__schema != null) {
    if (payload.__schema !== 'kv-ts' || !isRecord(payload.values) || !isRecord(payload.timestamps)) {
      throw new Error('远端设置版本或字段格式异常');
    }
    for (const key of Object.keys(payload.values)) {
      if (!Number.isFinite(payload.timestamps[key])) throw new Error(`远端设置缺少有效时间戳：${key}`);
    }
  }
  return payload;
}

module.exports = { isRecord, validateTodos, validateSettings };

function validateWidgetManifest(payload) {
  if (!isRecord(payload) || payload.version !== 2 || !isRecord(payload.widgets) || !isRecord(payload.instances)) {
    throw new Error('云端组件索引格式异常，已停止同步');
  }
  for (const kind of ['widgets', 'instances']) {
    for (const [id, entry] of Object.entries(payload[kind])) {
      if (!id || /[\\/]/.test(id) || !isRecord(entry) || typeof entry.h !== 'string' ||
          !Number.isFinite(entry.t) || (entry.d !== 0 && entry.d !== 1)) {
        throw new Error(`云端组件索引条目异常：${id}`);
      }
    }
  }
  return payload;
}

function validateWidgetData(payload) {
  if (!isRecord(payload) || payload.version !== 2 || !Array.isArray(payload.records)) {
    throw new Error('云端组件数据格式异常');
  }
  const ids = new Set();
  for (const record of payload.records) {
    if (!isRecord(record) || typeof record.id !== 'string' || !record.id || ids.has(record.id) ||
        typeof record.collection !== 'string' || !record.collection || !isRecord(record.fields) ||
        !Number.isFinite(record.updated_at)) throw new Error('云端组件数据条目异常');
    ids.add(record.id);
  }
  return payload.records;
}

module.exports.validateWidgetManifest = validateWidgetManifest;
module.exports.validateWidgetData = validateWidgetData;
