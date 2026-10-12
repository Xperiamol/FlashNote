// 本机机密（AI Key、同步密码、Token 等）的加密存储。
//
// - macOS：用应用数据目录里的随机密钥文件（仅当前用户可读）做 AES-256-GCM，前缀 enc:v2:。
//   未签名的应用每次更新签名都会变，系统钥匙串会因此在每次安装后要求输入密码，所以不再使用钥匙串。
// - Windows / Linux：继续用系统安全存储（DPAPI / libsecret），前缀 enc:v1:。
// macOS 上旧的 enc:v1: 密文只在迁移时解密一次（会最后弹一次钥匙串），之后改存 enc:v2:。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let safeStorage = null;
try {
  safeStorage = require('electron').safeStorage || null;
} catch (error) {
  safeStorage = null;
}

const LEGACY_PREFIX = 'enc:v1:';
const LOCAL_PREFIX = 'enc:v2:';
const ENCRYPTED_RE = /^enc:v\d+:/;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// 测试可注入平台与密钥路径
let config = { platform: process.platform, keyPath: null };
let cachedKey = null;

function configure(next = {}) {
  config = { ...config, ...next };
  cachedKey = null;
}

const usesLocalKey = () => config.platform === 'darwin';

function keyPath() {
  if (config.keyPath) return config.keyPath;
  const { getUserDataPath } = require('./userDataPath');
  return path.join(getUserDataPath(), 'secret.key');
}

/** 读取本机密钥；不存在才生成（独占创建，避免并发生成两把不同的密钥）。损坏时报错而不是重新生成，否则所有密文都无法再解开 */
function loadKey() {
  if (cachedKey) return cachedKey;
  const file = keyPath();
  try {
    const key = fs.readFileSync(file);
    if (key.length !== KEY_BYTES) throw new Error(`本机密钥文件已损坏：${file}`);
    cachedKey = key;
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const key = crypto.randomBytes(KEY_BYTES);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, key, { mode: 0o600, flag: 'wx' });
    cachedKey = key;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return loadKey();
  }
  return cachedKey;
}

function canEncrypt() {
  if (usesLocalKey()) {
    try {
      loadKey();
      return true;
    } catch (error) {
      console.warn('[secureValue] 本机密钥不可用:', error.message);
      return false;
    }
  }
  return !!safeStorage?.isEncryptionAvailable?.();
}

function isEncryptedValue(value) {
  return typeof value === 'string' && ENCRYPTED_RE.test(value);
}

function encryptLocal(text) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${LOCAL_PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

function decryptLocal(value) {
  const data = Buffer.from(value.slice(LOCAL_PREFIX.length), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), data.subarray(0, IV_BYTES));
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** 旧的系统安全存储密文（enc:v1: 去掉前缀后的 base64，或同步密码里不带前缀的 base64） */
function decryptLegacy(base64) {
  if (!safeStorage?.isEncryptionAvailable?.()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(base64, 'base64'));
  } catch (error) {
    // safeStorage 密文与生成它的系统钥匙串绑定。旧版本曾错误地通过设置同步
    // 传播跨设备密文；遇到此类值必须安全清空，不能让整个设置加载失败。
    console.warn('[secureValue] 无法解密本机密文，已忽略该值:', error.message);
    return '';
  }
}

function encryptValue(value) {
  if (!value || !canEncrypt()) return value || '';
  if (usesLocalKey()) return encryptLocal(value);
  return `${LEGACY_PREFIX}${safeStorage.encryptString(String(value)).toString('base64')}`;
}

function decryptValue(value) {
  if (!value || !isEncryptedValue(value)) return value || '';
  if (value.startsWith(LOCAL_PREFIX)) {
    try {
      return decryptLocal(value);
    } catch (error) {
      console.warn('[secureValue] 无法解密本机密文，已忽略该值:', error.message);
      return '';
    }
  }
  if (value.startsWith(LEGACY_PREFIX)) return decryptLegacy(value.slice(LEGACY_PREFIX.length));
  return '';
}

/** macOS 上仍是旧钥匙串格式、需要迁移的值 */
function needsMigration(value) {
  return usesLocalKey() && typeof value === 'string' && value.startsWith(LEGACY_PREFIX);
}

module.exports = {
  canEncrypt,
  encryptValue,
  decryptValue,
  decryptLegacy,
  isEncryptedValue,
  needsMigration,
  usesLocalKey,
  configure,
};
