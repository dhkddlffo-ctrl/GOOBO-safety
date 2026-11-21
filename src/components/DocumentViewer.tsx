import React, { useEffect, useMemo, useState } from 'react';
import { SiteDocument } from '../types';
import {
  formatFileSize,
  getExtension,
  getFile,
  getFileMeta,
  isPreviewable,
} from '../utils/documentStorage';
import './DocumentArchive.css';

interface DocumentViewerProps {
  doc: SiteDocument;
  canManage: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDelete?: () => void;
}

/** ISO → yyyy.mm.dd hh:mm */
const fmtAt = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
};

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

/** 이미지 파일인지 (전체화면 글로 보여줄 대상) */
export const isImageFile = (fileName: string): boolean =>
  IMAGE_EXTS.includes(getExtension(fileName));

/**
 * 문서보관함 — 글 보기 화면
 *
 * 게시판에서 문서 한 건을 누르면 **목록을 덮어쓰는 한 장짜리 글**로 열립니다.
 * (위험성평가 게시판의 글 보기와 같은 방식)
 *
 *  - 이미지(jpg/png/gif/webp): 전체화면 크기로 크게 보여줍니다. 누르면 원본 크기로 확대/축소.
 *  - PDF: 화면을 가득 채우는 뷰어로 보여줍니다.
 *  - 그 밖의 파일(doc·xls·hwp·zip …): 파일 정보 카드와 내려받기 버튼을 보여줍니다.
 */
const DocumentViewer: React.FC<DocumentViewerProps> = ({
  doc,
  canManage,
  onClose,
  onDownload,
  onDelete,
}) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* 이미지를 누르면 원본 크기(가로 스크롤)로 확대 */
  const [zoom, setZoom] = useState(false);

  const ext = getExtension(doc.fileName);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === 'pdf';
  const fmeta = getFileMeta(doc.fileName);

  /* 파일 본문(IndexedDB) → objectURL */
  useEffect(() => {
    let cancelled = false;
    let created = '';

    setLoading(true);
    setError('');
    setZoom(false);

    void (async () => {
      try {
        const blob = await getFile(doc.storageKey);
        if (!blob) {
          if (!cancelled) {
            setError('파일을 찾을 수 없습니다.');
            setLoading(false);
          }
          return;
        }
        created = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        setUrl(created);
      } catch {
        if (!cancelled) setError('파일을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [doc.storageKey]);

  /* ESC 로 목록 돌아가기 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const previewable = useMemo(() => isPreviewable(doc.fileName), [doc.fileName]);

  return (
    <div className="dv">
      {/* ---------- 머리글 ---------- */}
      <div className="dv-chrome">
        <div className="dv-head">
          <div className="dv-head-text">
            <h3 className="dv-title">
              {isImage && <span className="dv-tag">이미지</span>}
              {doc.title}
            </h3>
            <p className="dv-meta">
              {doc.category}
              {doc.subcategory && ` › ${doc.subcategory}`}
              {` · ${fmeta.label}`}
              {` · ${formatFileSize(doc.fileSize)}`}
              {doc.period && ` · ${doc.period}`}
              {` · ${doc.version}`}
            </p>
            <p className="dv-meta dv-meta-sub">
              📎 {doc.fileName} · ✍️ {doc.uploadedBy}
              {doc.createdAt && ` · 🗓️ ${fmtAt(doc.createdAt)}`}
            </p>
          </div>

          <div className="dv-head-right">
            {isImage && url && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setZoom(z => !z)}
                title={zoom ? '화면에 맞게 줄여 봅니다' : '원본 크기로 크게 봅니다'}
              >
                {zoom ? '🔍 화면에 맞추기' : '🔍 원본 크기'}
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={onDownload}>
              ⬇️ 내려받기
            </button>
            {canManage && onDelete && (
              <button type="button" className="btn btn-sm dv-del" onClick={onDelete}>
                🗑️ 삭제
              </button>
            )}
            <button type="button" className="btn btn-sm dv-close" onClick={onClose}>
              ← 목록
            </button>
          </div>
        </div>

        {doc.description && <p className="dv-note">📝 {doc.description}</p>}
      </div>

      {/* ---------- 본문 ---------- */}
      <div className={`dv-body${zoom ? ' dv-body--zoom' : ''}`}>
        {loading ? (
          <p className="dv-loading">불러오는 중…</p>
        ) : error ? (
          <p className="dv-loading">⚠️ {error}</p>
        ) : isImage ? (
          <figure className="dv-figure">
            <img
              src={url}
              alt={doc.title}
              className={`dv-image${zoom ? ' dv-image--zoom' : ''}`}
              onClick={() => setZoom(z => !z)}
            />
            <figcaption className="dv-caption">
              이미지를 누르면 {zoom ? '화면에 맞게' : '원본 크기로'} 바뀝니다.
            </figcaption>
          </figure>
        ) : isPdf ? (
          <iframe src={url} title={doc.title} className="dv-pdf" />
        ) : (
          <div className="dv-filecard">
            <span className="dv-filecard-icon" style={{ color: fmeta.color }}>
              {fmeta.icon}
            </span>
            <p className="dv-filecard-name">{doc.fileName}</p>
            <p className="dv-filecard-hint">
              {formatFileSize(doc.fileSize)}
              {previewable ? '' : ' · 이 형식은 화면에서 미리 볼 수 없습니다.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={onDownload}>
              ⬇️ 내려받기
            </button>
          </div>
        )}
      </div>

      <p className="dv-foot-note">
        ※ 문서보관함에 보관된 자료입니다. ESC 키 또는 [← 목록]을 누르면 게시판으로 돌아갑니다.
      </p>
    </div>
  );
};

export default DocumentViewer;
