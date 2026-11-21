import React, { useEffect, useState } from 'react';
import { RiskUpload } from '../types';
import { formatFileSize, getFile } from '../utils/documentStorage';
import CommentBox from './CommentBox';
import './RiskUpload.css';
import './CommentBox.css';

interface RiskUploadViewerProps {
  upload: RiskUpload;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canManage: boolean;
}

/** yyyy-mm-dd → yyyy.mm.dd */
const fmtDate = (ymd: string): string => (ymd ? ymd.replace(/-/g, '.') : '');

/** ISO 날짜 → yyyy.mm.dd hh:mm */
const fmtAt = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd} ${hh}:${mi}`;
};

/** 이미지 URL 1장 */
interface LoadedPage {
  storageKey: string;
  fileName: string;
  url: string;
}

/**
 * 이미지로 올린 위험성평가 — 글 보기 화면
 *
 * 서식으로 작성한 글과 **같은 형태**로 열립니다.
 * 게시판을 덮어쓰는 한 장짜리 글이고, 위에서 아래로 이미지를 이어서 보여준 뒤
 * 맨 마지막에 댓글이 붙습니다. (다음카페 글처럼)
 *
 * 이미지 본문은 IndexedDB 에 있어서 그냥 <img src> 로는 열 수 없습니다.
 * 화면에 나타날 때 한 번 읽어 objectURL 로 바꿔 보여줍니다.
 */
const RiskUploadViewer: React.FC<RiskUploadViewerProps> = ({
  upload,
  onClose,
  onEdit,
  onDelete,
  canManage,
}) => {
  const [pages, setPages] = useState<LoadedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* 이미지 본문(IndexedDB) → objectURL */
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    void (async () => {
      const loaded: LoadedPage[] = [];
      for (const page of upload.pages) {
        try {
          const blob = await getFile(page.storageKey);
          if (!blob) continue;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          loaded.push({ storageKey: page.storageKey, fileName: page.fileName, url });
        } catch {
          /* 읽기 실패한 장은 건너뜁니다. */
        }
      }
      if (cancelled) {
        urls.forEach(u => URL.revokeObjectURL(u));
        return;
      }
      setPages(loaded);
      if (loaded.length === 0) setError('이미지를 불러오지 못했습니다.');
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [upload]);

  /* ESC 로 목록 돌아가기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* 이미지 1장 내려받기 */
  const download = (page: LoadedPage, index: number) => {
    const a = document.createElement('a');
    a.href = page.url;
    /* 원본 파일명이 없으면 순번으로 대신합니다. */
    a.download = page.fileName || `${upload.title || '위험성평가'}-${index + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /* 전체 이미지 순서대로 내려받기 */
  const downloadAll = () => {
    pages.forEach((page, index) => {
      window.setTimeout(() => download(page, index), index * 250);
    });
  };

  const totalSize = upload.pages.reduce((sum, p) => sum + (p.fileSize || 0), 0);

  return (
    <div className="ruv">
      {/* ---------- 머리글 (인쇄에서는 숨김) ---------- */}
      <div className="ruv-chrome">
        <div className="ruv-head">
          <div className="ruv-head-text">
            <h3 className="ruv-title">
              <span className="ruv-tag">이미지</span>
              {upload.title || '제목 없음'}
            </h3>
            <p className="ruv-meta">
              {fmtDate(upload.writtenAt) || '-'}
              {upload.author && ` · ${upload.author}`}
              {` · ${upload.pages.length}장`}
              {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
              {upload.updatedAt && ` · ${fmtAt(upload.updatedAt)} 수정`}
            </p>
          </div>

          <div className="ruv-head-right">
            {pages.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={downloadAll}>
                ⬇️ 전체 내려받기
              </button>
            )}
            {canManage && onEdit && (
              <button type="button" className="btn btn-sm" onClick={onEdit}>
                ✏️ 수정
              </button>
            )}
            {canManage && onDelete && (
              <button type="button" className="btn btn-sm ruv-del" onClick={onDelete}>
                🗑️ 삭제
              </button>
            )}
            <button type="button" className="btn btn-sm ruv-close" onClick={onClose}>
              ← 목록
            </button>
          </div>
        </div>

        {upload.note && <p className="ruv-note">📝 {upload.note}</p>}
      </div>

      {/* ---------- 본문 (이미지를 위에서 아래로) ---------- */}
      <div className="ruv-body">
        {loading ? (
          <p className="ruv-page-loading">이미지를 불러오는 중…</p>
        ) : error ? (
          <p className="ruv-page-loading">⚠️ {error}</p>
        ) : (
          pages.map((page, index) => (
            <figure className="ruv-page" key={page.storageKey}>
              <div className="ruv-page-head">
                <span className="ruv-page-no">{index + 1}장</span>
                <button type="button" className="btn btn-xs" onClick={() => download(page, index)}>
                  ⬇️ 내려받기
                </button>
              </div>
              <img src={page.url} alt={`${upload.title || '위험성평가'} ${index + 1}장`} />
            </figure>
          ))
        )}
      </div>

      <p className="ruv-foot-note">
        ※ 종이에 작성한 서식을 사진으로 올린 자료입니다. 위에서 아래로 이어서 보거나, 각 장을
        내려받아 제출할 수 있습니다.
      </p>

      {/* ---------- 맨 마지막: 댓글 ---------- */}
      <CommentBox targetType="upload" targetId={upload.id} siteId={upload.siteId} />
    </div>
  );
};

export default RiskUploadViewer;
