import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RiskUpload, RiskUploadPage } from '../types';
import { formatFileSize, getFile } from '../utils/documentStorage';
import {
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_PAGES,
  createEmptyRiskUpload,
  isUploadImage,
  removeRiskUploadPageFile,
  saveRiskUpload,
  saveRiskUploadPage,
} from '../utils/riskUploadStorage';
import './RiskUpload.css';

/** 편집 중인 이미지 1장 */
interface DraftPage {
  /** 화면에서 key 로 쓰는 값 */
  key: string;
  fileName: string;
  fileSize: number;
  /** 미리보기용 objectURL */
  url: string;
  /** 새로 고른 파일 (기존에 올린 장은 없음) */
  file?: File;
  /** 이미 저장된 장 (수정할 때) */
  existing?: RiskUploadPage;
}

interface RiskUploadDialogProps {
  siteId: number;
  siteName: string;
  /** 수정할 자료 (없으면 새로 올리기) */
  initial?: RiskUpload | null;
  onClose: () => void;
  onSaved: () => void;
}

const newKey = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** yyyy-mm-dd → yyyy.mm.dd */
const fmtDate = (ymd: string): string => (ymd ? ymd.replace(/-/g, '.') : '');

/**
 * 위험성평가 올리기
 *
 * 화면에서 서식을 직접 작성하기 어려울 때, 종이에 쓴 위험성평가표를
 * 사진으로 찍어 여러 장 올려 한 건으로 보관합니다.
 * 이미지 본문은 IndexedDB 에 저장되므로 용량 걱정이 적습니다.
 */
const RiskUploadDialog: React.FC<RiskUploadDialogProps> = ({
  siteId,
  siteName,
  initial,
  onClose,
  onSaved,
}) => {
  const editing = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [writtenAt, setWrittenAt] = useState(
    initial?.writtenAt ?? createEmptyRiskUpload(siteId, siteName).writtenAt,
  );
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [pages, setPages] = useState<DraftPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(initial));
  const [error, setError] = useState('');

  /** 저장 중 지워야 할 기존 파일 키 */
  const removedKeys = useRef<string[]>([]);
  /** 컴포넌트가 사라질 때 objectURL 정리용 */
  const liveUrls = useRef<string[]>([]);

  /* ---------------- 기존 자료 불러오기 ---------------- */
  useEffect(() => {
    if (!initial || initial.pages.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded: DraftPage[] = [];
      for (const page of initial.pages) {
        try {
          const blob = await getFile(page.storageKey);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          liveUrls.current.push(url);
          loaded.push({
            key: newKey(),
            fileName: page.fileName,
            fileSize: page.fileSize,
            url,
            existing: page,
          });
        } catch {
          /* 읽기 실패한 장은 건너뜁니다. */
        }
      }
      if (cancelled) {
        loaded.forEach(p => URL.revokeObjectURL(p.url));
        return;
      }
      setPages(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);

  /* 화면을 닫을 때 objectURL 정리 */
  useEffect(
    () => () => {
      liveUrls.current.forEach(url => URL.revokeObjectURL(url));
      liveUrls.current = [];
    },
    [],
  );

  const totalSize = useMemo(() => pages.reduce((sum, p) => sum + p.fileSize, 0), [pages]);

  /* ---------------- 사진 고르기 ---------------- */
  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    setError('');
    const room = MAX_UPLOAD_PAGES - pages.length;
    if (room <= 0) {
      setError(`이미지는 한 건에 ${MAX_UPLOAD_PAGES}장까지 올릴 수 있습니다.`);
      return;
    }

    const accepted: DraftPage[] = [];
    const rejected: string[] = [];

    for (const file of picked.slice(0, room)) {
      if (!isUploadImage(file.name)) {
        rejected.push(`${file.name} — 이미지 파일이 아닙니다`);
        continue;
      }
      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        rejected.push(`${file.name} — ${formatFileSize(MAX_UPLOAD_FILE_SIZE)} 초과`);
        continue;
      }
      const url = URL.createObjectURL(file);
      liveUrls.current.push(url);
      accepted.push({
        key: newKey(),
        fileName: file.name,
        fileSize: file.size,
        url,
        file,
      });
    }

    if (picked.length > room) {
      rejected.push(`이미지는 한 건에 ${MAX_UPLOAD_PAGES}장까지 올릴 수 있습니다`);
    }
    if (rejected.length > 0) setError(rejected.slice(0, 3).join(' / '));

    if (accepted.length > 0) {
      setPages(prev => [...prev, ...accepted]);
      /* 제목이 비어 있으면 오늘 날짜로 자동 채움 */
      if (!title.trim()) setTitle(createEmptyRiskUpload(siteId, siteName).title);
    }
  };

  /* ---------------- 장 삭제 / 순서 ---------------- */
  const removePage = (key: string) => {
    setPages(prev => {
      const target = prev.find(p => p.key === key);
      if (target) {
        if (target.existing) removedKeys.current.push(target.existing.storageKey);
        URL.revokeObjectURL(target.url);
        liveUrls.current = liveUrls.current.filter(u => u !== target.url);
      }
      return prev.filter(p => p.key !== key);
    });
    setError('');
  };

  const movePage = (key: string, dir: -1 | 1) => {
    setPages(prev => {
      const index = prev.findIndex(p => p.key === key);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  /* ---------------- 저장 ---------------- */
  const save = async () => {
    if (pages.length === 0) {
      setError('올릴 이미지를 먼저 골라주세요.');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const savedPages: RiskUploadPage[] = [];
      for (const draft of pages) {
        if (draft.existing) {
          savedPages.push(draft.existing);
          continue;
        }
        if (!draft.file) continue;
        savedPages.push(await saveRiskUploadPage(draft.file));
      }

      if (savedPages.length === 0) {
        setError('이미지를 저장하지 못했습니다. 다시 시도해주세요.');
        setBusy(false);
        return;
      }

      const base = initial ?? createEmptyRiskUpload(siteId, siteName);
      const next: RiskUpload = {
        ...base,
        siteId,
        siteName,
        title: title.trim() || base.title,
        writtenAt,
        author: author.trim(),
        note: note.trim(),
        pages: savedPages,
        updatedAt: new Date().toISOString(),
      };
      saveRiskUpload(next);

      /* 화면에서 뺀 기존 이미지는 저장이 끝난 뒤 정리합니다. */
      await Promise.all(removedKeys.current.map(k => removeRiskUploadPageFile(k)));
      removedKeys.current = [];

      onSaved();
      onClose();
    } catch {
      setError('이미지를 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- 닫기 ---------------- */
  const close = () => {
    if (busy) return;
    /* 새로 고른 파일은 저장하지 않았으므로 그대로 버립니다. */
    onClose();
  };

  return (
    <div className="ru-overlay" role="dialog" aria-modal="true" aria-label="위험성평가 올리기">
      <div className="ru-modal">
        {/* ---------- 머리글 ---------- */}
        <div className="ru-head">
          <div>
            <h3 className="ru-title">🖼️ 위험성평가 올리기</h3>
            <p className="ru-sub">
              종이에 작성한 위험성평가표를 <b>사진으로 찍어 여러 장</b> 올려 한 건으로 보관합니다.
              <br />
              올린 이미지는 이 브라우저에 저장되며, 언제든 크게 보고 내려받을 수 있습니다.
            </p>
          </div>
          <button type="button" className="ru-close" onClick={close} aria-label="닫기">
            ×
          </button>
        </div>

        {/* ---------- 기본 정보 ---------- */}
        <div className="ru-fields">
          <label className="ru-field ru-field-wide">
            <span>제목</span>
            <input
              className="ru-input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="예: 2026년 11월 수시 위험성평가"
            />
          </label>
          <label className="ru-field">
            <span>작성일</span>
            <input
              className="ru-input"
              type="date"
              value={writtenAt}
              onChange={e => setWrittenAt(e.target.value)}
            />
          </label>
          <label className="ru-field">
            <span>작성자</span>
            <input
              className="ru-input"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="예: 홍길순"
            />
          </label>
          <label className="ru-field ru-field-wide">
            <span>비고 (선택)</span>
            <input
              className="ru-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="예: 5BL 501동 지하주차장"
            />
          </label>
        </div>

        {/* ---------- 이미지 고르기 ---------- */}
        <div className="ru-picker">
          <label className="ru-pick-btn">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={pickFiles}
              className="ru-file-input"
            />
            📷 이미지 고르기 / 촬영
          </label>
          <span className="ru-pick-hint">
            jpg · png · webp · heic 등 · 1장 {formatFileSize(MAX_UPLOAD_FILE_SIZE)}까지 · 최대{' '}
            {MAX_UPLOAD_PAGES}장
          </span>
          <span className="ru-pick-count">
            {pages.length} / {MAX_UPLOAD_PAGES}장
            {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
          </span>
        </div>

        {error && <p className="ru-error">⚠️ {error}</p>}

        {/* ---------- 미리보기 ---------- */}
        {loading ? (
          <p className="ru-loading">올린 이미지를 불러오는 중…</p>
        ) : pages.length === 0 ? (
          <div className="ru-empty">
            <p className="ru-empty-title">아직 고른 이미지가 없습니다.</p>
            <p className="ru-empty-sub">
              위의 <b>이미지 고르기</b>를 눌러 위험성평가표 사진을 선택하세요.
              <br />
              휴대폰에서는 카메라로 바로 찍을 수 있습니다.
            </p>
          </div>
        ) : (
          <ul className="ru-grid">
            {pages.map((page, index) => (
              <li className="ru-thumb" key={page.key}>
                <img className="ru-thumb-img" src={page.url} alt={`${index + 1}장`} />
                <span className="ru-thumb-no">{index + 1}</span>
                <div className="ru-thumb-tools">
                  <button
                    type="button"
                    className="ru-thumb-btn"
                    onClick={() => movePage(page.key, -1)}
                    disabled={index === 0}
                    aria-label={`${index + 1}장 앞으로`}
                    title="앞으로"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="ru-thumb-btn"
                    onClick={() => movePage(page.key, 1)}
                    disabled={index === pages.length - 1}
                    aria-label={`${index + 1}장 뒤로`}
                    title="뒤로"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="ru-thumb-btn ru-thumb-del"
                    onClick={() => removePage(page.key)}
                    aria-label={`${index + 1}장 빼기`}
                    title="빼기"
                  >
                    ×
                  </button>
                </div>
                <span className="ru-thumb-size">{formatFileSize(page.fileSize)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ---------- 하단 버튼 ---------- */}
        <div className="ru-foot">
          <span className="ru-foot-note">
            {writtenAt && <>{fmtDate(writtenAt)} · </>}
            {siteName}
          </span>
          <div className="ru-foot-right">
            <button type="button" className="btn btn-sm" onClick={close} disabled={busy}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary ru-save"
              onClick={save}
              disabled={busy || pages.length === 0}
            >
              {busy ? '올리는 중…' : editing ? '💾 수정 저장' : '⬆️ 올리기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskUploadDialog;
