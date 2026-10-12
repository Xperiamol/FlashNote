// macOS 改用本机密钥后，把设置里旧的钥匙串密文（enc:v1:）一次性迁移到新格式。
// 只有存在旧密文时才会访问钥匙串（最后弹一次）；解不开的值清空，避免以后每次启动都再请求钥匙串。
const secureValue = require('../utils/secureValue');

function migrateLegacySettingSecrets(db) {
  if (!secureValue.usesLocalKey()) return { migrated: 0, cleared: 0 };
  const rows = db.prepare("SELECT key, value FROM settings WHERE value LIKE 'enc:v1:%'").all();
  let migrated = 0;
  let cleared = 0;
  const update = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  for (const row of rows) {
    const plain = secureValue.decryptValue(row.value);
    if (plain) {
      update.run(secureValue.encryptValue(plain), row.key);
      migrated++;
    } else {
      update.run('', row.key);
      cleared++;
    }
  }
  if (rows.length) console.log(`[SecretMigration] 已迁移 ${migrated} 项本机机密，清空无法解密的 ${cleared} 项`);
  return { migrated, cleared };
}

module.exports = { migrateLegacySettingSecrets };
