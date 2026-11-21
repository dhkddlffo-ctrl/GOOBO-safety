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

/** 이미지 URL 1장 */
interface LoadedPage {
  storageKey: string;
  fileName: string;
  url: string;
}

/**
 * 올린 위험성평가 보기
 *
 * 이미지로 올린 위험성평가표를 원본 크기로 쭉 이어 보여줍니다.
 * 각 장은 따로 내려받을 수 있고, 브라우저 인쇄로 종이 출력도 됩니다.
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

  /* ESC 로 닫기 */
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
    <div
      className="ruv-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="올린 위험성평가 보기"
      onClick={onClose}
    >
      <div className="ruv-modal" onClick={e => e.stopPropagation()}>
        {/* ---------- 머리글 ---------- */}
        <div className="ruv-head">
          <div>
            <h3 className="ruv-title">🖼️ {upload.title || '위험성평가'}</h3>
            <p className="ruv-meta">
              {fmtDate(upload.writtenAt) || '-'}
              {upload.author && ` · ${upload.author}`}
              {` · ${upload.pages.length}장`}
              {totalSize > 0 && ` · ${formatFileSize(totalSize)}`}
              {upload.note && ` · ${upload.note}`}
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
              닫기
            </button>
          </div>
        </div>

        {/* ---------- 이미지 ---------- */}
        <div className="ruv-body">
          {loading ? (
            <p className="ruv-page-loading">이미지를 불러오는 중…</p>
          ) : error ? (
            <p className="ruv-page-loading">⚠️ {error}</p>
          ) : (
            pages.map((page, index) => (
              <div className="ruv-page" key={page.storageKey}>
                <div className="ruv-page-head">
                  <span>
                    {index + 1} / {pages.length}장
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs"
                    onClick={() => download(page, index)}
                  >
                    ⬇️ 내려받기
                  </button>
                </div>
                <img src={page.url} alt={`${index + 1}장`} />
              </div>
            ))
          )}

          {/* ---------- 댓글 ---------- */}
          <CommentBox targetType="upload" targetId={upload.id} siteId={upload.siteId} />
        </div>
      </div>
    </div>
  );
};

export default RiskUploadViewer;
