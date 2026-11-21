import React, { useEffect, useState } from 'react';
import { RiskAttachment } from '../types';
import { isAuthenticated } from '../utils/auth';
import {
  deleteRiskAttachment,
  getRiskAttachmentFile,
  getRiskAttachments,
  saveRiskAttachment,
} from '../utils/riskAssessmentStorage';
import { formatFileSize, isAllowedFile, MAX_FILE_SIZE } from '../utils/documentStorage';
import './DailyDisasterForm.css';

interface DailyDisasterFormProps {
  siteId: number;
  siteName: string;
}

/** ISO 날짜 → yyyy.mm.dd */
const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}`;
};

/**
 * 부속 서식 첨부 — 일일 재해 有·無 확인현황
 *
 * 양식 10~13페이지(인원별 일일 재해 유무 대장)는 표가 인원수만큼 늘어나
 * 화면에서 직접 작성하기 어렵습니다. 그래서 엑셀·한글로 작성한 파일을
 * 그대로 올려 보관하고, 필요할 때 내려받아 제출하도록 합니다.
 *
 * 파일 본문은 IndexedDB, 정보는 LocalStorage 에 저장합니다.
 */
const DailyDisasterForm: React.FC<DailyDisasterFormProps> = ({ siteId, siteName }) => {
  const canManage = isAuthenticated();

  const [attachments, setAttachments] = useState<RiskAttachment[]>(() =>
    getRiskAttachments(siteId),
  );
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /* 현장이 바뀌면 다시 읽습니다. */
  useEffect(() => {
    setAttachments(getRiskAttachments(siteId));
  }, [siteId]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setError('');
    if (!picked) {
      setFile(null);
      return;
    }
    if (!isAllowedFile(picked.name)) {
      setError('PDF, 한글, 엑셀, 이미지 등 문서 파일만 올릴 수 있습니다.');
      e.target.value = '';
      return;
    }
    if (picked.size > MAX_FILE_SIZE) {
      setError(`파일 용량은 ${formatFileSize(MAX_FILE_SIZE)} 까지 가능합니다.`);
      e.target.value = '';
      return;
    }
    setFile(picked);
    /* 문서명을 비워 두었으면 파일명에서 확장자를 뺀 값을 채워 줍니다. */
    if (!title.trim()) {
      setTitle(picked.name.replace(/\.[^.]+$/, ''));
    }
  };

  const upload = async () => {
    if (!file) {
      setError('올릴 파일을 선택해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveRiskAttachment(siteId, siteName, file, {
        title,
        period,
        uploadedBy: canManage ? '관리자' : '작성자',
      });
      setAttachments(getRiskAttachments(siteId));
      setFile(null);
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const download = async (att: RiskAttachment) => {
    const blob = await getRiskAttachmentFile(att);
    if (!blob) {
      alert('파일을 찾을 수 없습니다. (브라우저 저장소가 정리되었을 수 있습니다)');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const remove = async (att: RiskAttachment) => {
    if (!window.confirm(`'${att.title}' 첨부를 삭제할까요?`)) return;
    await deleteRiskAttachment(att.id);
    setAttachments(getRiskAttachments(siteId));
  };

  return (
    <section className="dda">
      <div className="dda-head">
        <div>
          <h3 className="dda-title">📎 부속 서식 첨부 — 일일 재해 有·無 확인현황</h3>
          <p className="dda-sub">
            양식 10~13페이지(인원별 일일 재해 유무 대장)는 엑셀·한글로 작성해 그대로 올려
            보관합니다.
            <br />
            올린 파일은 이 브라우저에 저장되며, 언제든 내려받아 제출할 수 있습니다.
          </p>
        </div>
        <span className="dda-count">{attachments.length}건</span>
      </div>

      {canManage ? (
        <div className="dda-upload">
          <div className="dda-fields">
            <label className="dda-field">
              <span>문서명</span>
              <input
                className="dda-in"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="예: 2026년 11월 일일 재해 유무 확인현황"
              />
            </label>
            <label className="dda-field dda-field-narrow">
              <span>해당 연월</span>
              <input
                className="dda-in"
                type="month"
                value={period}
                onChange={e => setPeriod(e.target.value)}
              />
            </label>
            <label className="dda-field dda-field-file">
              <span>파일 선택</span>
              <input type="file" onChange={pickFile} className="dda-file" />
            </label>
            <button className="dda-btn" onClick={upload} disabled={busy || !file}>
              {busy ? '올리는 중…' : '⬆️ 올리기'}
            </button>
          </div>
          {file && (
            <p className="dda-picked">
              선택됨: <b>{file.name}</b> ({formatFileSize(file.size)})
            </p>
          )}
          {error && <p className="dda-error">⚠️ {error}</p>}
        </div>
      ) : (
        <p className="dda-note">관리자 로그인 후 파일을 올릴 수 있습니다.</p>
      )}

      {attachments.length === 0 ? (
        <p className="dda-empty">아직 올린 파일이 없습니다.</p>
      ) : (
        <ul className="dda-list">
          {attachments.map(att => (
            <li className="dda-item" key={att.id}>
              <span className="dda-icon">📄</span>
              <div className="dda-info">
                <span className="dda-name">{att.title}</span>
                <span className="dda-meta">
                  {att.period || '-'} · {att.fileName} · {formatFileSize(att.fileSize)} ·{' '}
                  {fmtDate(att.createdAt)}
                </span>
              </div>
              <div className="dda-actions">
                <button className="dda-act" onClick={() => download(att)}>
                  ⬇️ 내려받기
                </button>
                {canManage && (
                  <button className="dda-act dda-act-del" onClick={() => remove(att)}>
                    삭제
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default DailyDisasterForm;
