import React, { useState, useMemo, useRef } from 'react';
import { HqAttachment, HqCategory, HqPost } from '../types';
import {
  HQ_ACCEPT,
  createHqAttachment,
  deleteHqFile,
  formatHqFileSize,
  getHqFileMeta,
  generateHqPostId,
  saveHqPost,
} from '../utils/hqStorage';

interface HqPostEditorProps {
  categories: HqCategory[];
  /** 수정할 글. 없으면 새 글 */
  editing: HqPost | null;
  /** 수정할 때 기준이 되는 계열 (버전 이력) */
  series: HqPost[];
  author: string;
  onClose: () => void;
  onSaved: (post: HqPost) => void;
}

const bumpVersion = (version: string): string => {
  const match = /^v?(\d+)(?:\.(\d+))?$/i.exec((version || '').trim());
  if (!match) return 'v1.1';
  const major = Number(match[1]);
  const minor = Number(match[2] ?? '0');
  return `v${major}.${minor + 1}`;
};

const HqPostEditor: React.FC<HqPostEditorProps> = ({
  categories,
  editing,
  series,
  author,
  onClose,
  onSaved,
}) => {
  const isEdit = Boolean(editing);

  const [category, setCategory] = useState(editing?.category || categories[0]?.key || '기타');
  const [subcategory, setSubcategory] = useState(editing?.subcategory || '');
  const [title, setTitle] = useState(editing?.title || '');
  const [body, setBody] = useState(editing?.body || '');
  const [version, setVersion] = useState(editing?.version || 'v1.0');
  const [revisionSummary, setRevisionSummary] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(
    editing?.effectiveDate ? editing.effectiveDate.slice(0, 10) : '',
  );
  const [legalBasis, setLegalBasis] = useState(editing?.legalBasis || '');
  const [tagText, setTagText] = useState((editing?.tags || []).join(', '));
  const [pinned, setPinned] = useState(Boolean(editing?.pinned));
  const [important, setImportant] = useState(Boolean(editing?.important));
  const [requireAck, setRequireAck] = useState(Boolean(editing?.requireAck));
  const [bumpOnSave, setBumpOnSave] = useState(false);

  const [attachments, setAttachments] = useState<HqAttachment[]>(editing?.attachments || []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* 이 계열의 최신 버전 — 수정 시 안내용 */
  const latestVersion = useMemo(
    () => series[0]?.version || editing?.version || 'v1.0',
    [series, editing],
  );

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError('');
    const added: HqAttachment[] = [];
    const failures: string[] = [];

    for (const file of Array.from(fileList)) {
      try {
        added.push(await createHqAttachment(file));
      } catch (err) {
        failures.push(`${file.name}: ${(err as Error).message}`);
      }
    }

    if (added.length > 0) setAttachments(cur => [...cur, ...added]);
    if (failures.length > 0) setError(failures.join(' / '));
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (attachment: HqAttachment) => {
    setAttachments(cur => cur.filter(a => a.id !== attachment.id));
    void deleteHqFile(attachment.storageKey).catch(() => undefined);
  };

  const moveAttachment = (index: number, direction: -1 | 1) => {
    setAttachments(cur => {
      const next = [...cur];
      const target = index + direction;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }
    if (!category) {
      setError('분류를 선택해주세요.');
      return;
    }

    const tags = tagText
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 12);

    /* 버전을 올리면 개정 이력을 남기기 위해 **새 글**로 저장합니다.
       이전 버전은 같은 계열(seriesId) 안에서 구본(status: 'archived')으로 내려갑니다. */
    const isRevision = isEdit && bumpOnSave;
    const nextVersion = isRevision ? bumpVersion(version) : version.trim() || 'v1.0';

    setSaving(true);
    const now = new Date().toISOString();
    const post: HqPost = {
      id: isRevision ? generateHqPostId() : editing?.id || generateHqPostId(),
      category,
      subcategory: subcategory.trim() || undefined,
      title: title.trim(),
      body: body.trim() || undefined,
      attachments,
      seriesId: editing?.seriesId || generateHqPostId(),
      version: nextVersion,
      revisionSummary: revisionSummary.trim() || editing?.revisionSummary,
      status: 'active',
      effectiveDate: effectiveDate || undefined,
      legalBasis: legalBasis.trim() || undefined,
      pinned,
      important,
      requireAck,
      tags,
      author: editing?.author || author,
      views: editing?.views ?? 0,
      createdAt: isEdit ? editing!.createdAt : now,
      updatedAt: now,
    };

    saveHqPost(post, isRevision);
    setSaving(false);
    onSaved(post);
  };

  return (
    <div className="hq-modal-backdrop" role="presentation">
      <div className="hq-modal" role="dialog" aria-modal="true">
        <div className="hq-modal-head">
          <h2>{isEdit ? '자료 수정' : '본사 자료 등록'}</h2>
          <button type="button" className="hq-modal-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="hq-modal-body">
          {error && <div className="hq-form-error">{error}</div>}

          <div className="hq-form-row">
            <label className="hq-field">
              <span className="hq-field-label">분류 *</span>
              <select
                className="hq-input"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c.key} value={c.key}>
                    {c.icon} {c.key}
                  </option>
                ))}
              </select>
            </label>
            <label className="hq-field">
              <span className="hq-field-label">소분류</span>
              <input
                className="hq-input"
                value={subcategory}
                onChange={e => setSubcategory(e.target.value)}
                placeholder="예: 위험성평가표"
              />
            </label>
          </div>

          <label className="hq-field">
            <span className="hq-field-label">제목 *</span>
            <input
              className="hq-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예: 2026년 위험성평가 표준양식 (개정판)"
            />
          </label>

          <label className="hq-field">
            <span className="hq-field-label">본문</span>
            <textarea
              className="hq-input hq-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={8}
              placeholder={
                '자료 설명, 작성 요령, 유의사항 등을 적어주세요.\n줄바꿈이 그대로 반영됩니다.'
              }
            />
          </label>

          <div className="hq-form-row">
            <label className="hq-field">
              <span className="hq-field-label">버전</span>
              <div className="hq-version-row">
                <input
                  className="hq-input"
                  value={version}
                  onChange={e => setVersion(e.target.value)}
                  placeholder="v1.0"
                  disabled={isEdit && bumpOnSave}
                />
                {isEdit && (
                  <button
                    type="button"
                    className={`hq-btn hq-btn-sm${bumpOnSave ? ' hq-btn-primary' : ''}`}
                    onClick={() => setBumpOnSave(v => !v)}
                    title={`${latestVersion} → ${bumpVersion(latestVersion)}`}
                  >
                    {bumpOnSave ? `→ ${bumpVersion(version)}` : '버전 올리기'}
                  </button>
                )}
              </div>
            </label>
            <label className="hq-field">
              <span className="hq-field-label">시행일</span>
              <input
                type="date"
                className="hq-input"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
              />
            </label>
          </div>

          <label className="hq-field">
            <span className="hq-field-label">개정 요약</span>
            <input
              className="hq-input"
              value={revisionSummary}
              onChange={e => setRevisionSummary(e.target.value)}
              placeholder="예: 관리감독자 점검 항목 3개 추가"
            />
          </label>

          <label className="hq-field">
            <span className="hq-field-label">법령 근거</span>
            <input
              className="hq-input"
              value={legalBasis}
              onChange={e => setLegalBasis(e.target.value)}
              placeholder="예: 산업안전보건법 제36조, 시행규칙 제37조"
            />
          </label>

          <label className="hq-field">
            <span className="hq-field-label">태그</span>
            <input
              className="hq-input"
              value={tagText}
              onChange={e => setTagText(e.target.value)}
              placeholder="쉼표로 구분 (예: 위험성평가, 양식, 2026)"
            />
          </label>

          <div className="hq-flags-field">
            <label className="hq-check hq-check-box">
              <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
              <span>📌 상단 고정</span>
            </label>
            <label className="hq-check hq-check-box">
              <input
                type="checkbox"
                checked={important}
                onChange={e => setImportant(e.target.checked)}
              />
              <span>❗ 중요 표시</span>
            </label>
            <label className="hq-check hq-check-box">
              <input
                type="checkbox"
                checked={requireAck}
                onChange={e => setRequireAck(e.target.checked)}
              />
              <span>🔔 필독 (현장 확인 필요)</span>
            </label>
          </div>

          <div className="hq-attach-field">
            <div className="hq-attach-head">
              <span className="hq-field-label">첨부자료 ({attachments.length})</span>
              <button
                type="button"
                className="hq-btn hq-btn-sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '올리는 중…' : '＋ 파일 추가'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={HQ_ACCEPT}
                className="hq-file-input"
                onChange={e => void handleFiles(e.target.files)}
              />
            </div>

            {attachments.length === 0 ? (
              <p className="hq-attach-empty">
                첨부파일을 끌어다 놓거나 “파일 추가”를 눌러주세요. (1건당 최대 50MB)
              </p>
            ) : (
              <ul className="hq-attach-edit-list">
                {attachments.map((attachment, index) => {
                  const meta = getHqFileMeta(attachment.fileName);
                  return (
                    <li key={attachment.id} className="hq-attach-edit-item">
                      <span className="hq-attach-icon" style={{ background: `${meta.color}14` }}>
                        {meta.icon}
                      </span>
                      <div className="hq-attach-info">
                        <span className="hq-attach-name">{attachment.fileName}</span>
                        <span className="hq-attach-meta">
                          {meta.label} · {formatHqFileSize(attachment.fileSize)}
                        </span>
                      </div>
                      <div className="hq-attach-edit-actions">
                        <button
                          type="button"
                          className="hq-order-btn"
                          onClick={() => moveAttachment(index, -1)}
                          disabled={index === 0}
                          aria-label="위로"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="hq-order-btn"
                          onClick={() => moveAttachment(index, 1)}
                          disabled={index === attachments.length - 1}
                          aria-label="아래로"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="hq-mini-btn hq-mini-danger"
                          onClick={() => removeAttachment(attachment)}
                        >
                          빼기
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="hq-modal-actions">
          <button type="button" className="hq-btn" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button
            type="button"
            className="hq-btn hq-btn-primary"
            onClick={handleSubmit}
            disabled={saving || uploading}
          >
            {saving ? '저장 중…' : isEdit ? '수정 저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HqPostEditor;
