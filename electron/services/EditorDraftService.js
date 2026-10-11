const NoteDAO = require('../dao/NoteDAO');

// 草稿与正式笔记独立，崩溃恢复生成副本，绝不覆盖同步或另一窗口的新版本。
class EditorDraftService {
  constructor(dbManager) {
    this.db = dbManager.getDatabase();
    this.notes = new NoteDAO(dbManager);
    this.db.exec(`CREATE TABLE IF NOT EXISTS editor_drafts (
      draft_key TEXT PRIMARY KEY, note_id TEXT NOT NULL, revision INTEGER NOT NULL,
      payload TEXT NOT NULL, saved_at INTEGER NOT NULL)`);
  }

  stage({ key, noteId, revision, updates }) {
    if (typeof key !== 'string' || !key || !noteId || !Number.isSafeInteger(revision) || !updates) throw new Error('草稿数据无效');
    const payload = { ...updates };
    if (payload.content && typeof payload.content === 'object') payload.content = JSON.stringify(payload.content);
    this.db.prepare(`INSERT INTO editor_drafts VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(draft_key) DO UPDATE SET note_id=excluded.note_id, revision=excluded.revision,
      payload=excluded.payload, saved_at=excluded.saved_at WHERE excluded.revision > editor_drafts.revision`)
      .run(key, String(noteId), revision, JSON.stringify(payload), Date.now());
    return { success: true };
  }

  clear({ key, revision }) {
    this.db.prepare('DELETE FROM editor_drafts WHERE draft_key = ? AND revision <= ?').run(key, revision);
    return { success: true };
  }

  recover() {
    return this.db.transaction(() => {
      let recovered = 0;
      for (const draft of this.db.prepare('SELECT * FROM editor_drafts ORDER BY saved_at').all()) {
        let updates;
        try {
          updates = JSON.parse(draft.payload);
          if (!updates || typeof updates !== 'object' || Array.isArray(updates)) throw new Error('无效草稿');
        } catch (error) {
          console.error('保留无法解析的草稿供恢复，不阻止应用启动:', draft.draft_key, error.message);
          continue;
        }
        const current = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(draft.note_id);
        const unchanged = current && Object.entries(updates).every(([key, value]) => (current[key] ?? '') === value);
        if (!unchanged) {
          this.notes.create({
            title: `${updates.title || current?.title || '未命名笔记'}（恢复草稿）`,
            content: updates.content ?? current?.content ?? '',
            note_type: updates.note_type || current?.note_type || 'markdown',
            tags: updates.tags ?? current?.tags ?? '',
          });
          recovered++;
        }
        this.clear({ key: draft.draft_key, revision: draft.revision });
      }
      return recovered;
    })();
  }
}
module.exports = EditorDraftService;
