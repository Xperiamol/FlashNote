export const ensureElectronAPI = () => {
  if (typeof window === 'undefined') {
    throw new Error('Electron API 未初始化：window 对象不存在');
  }

  if (!window.electronAPI) {
    throw new Error('Electron API 未在 preload 中暴露');
  }

  return window.electronAPI;
};

export async function invoke(channel, ...args) {
  const api = ensureElectronAPI();
  if (typeof api.invoke !== 'function') {
    throw new Error('electronAPI.invoke 未实现');
  }

  const result = await api.invoke(channel, ...args);

  if (result && typeof result === 'object') {
    if (result.success === false) {
      const error = result.error || `调用 ${channel} 失败`;
      throw new Error(error);
    }
    if (Object.prototype.hasOwnProperty.call(result, 'data')) {
      return result.data;
    }
  }

  return result;
}

export function getTodosAPI() {
  const api = ensureElectronAPI();
  if (!api.todos) {
    throw new Error('electronAPI.todos 未实现');
  }
  return api.todos;
}

export function getNotesAPI() {
  const api = ensureElectronAPI();
  if (!api.notes) {
    throw new Error('electronAPI.notes 未实现');
  }
  return api.notes;
}
