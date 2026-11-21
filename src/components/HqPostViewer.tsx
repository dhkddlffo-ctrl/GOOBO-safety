import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HqAttachment, HqPost, Site } from '../types';
import {
  acknowledgePost,
  cancelAck,
  downloadHqAttachment,
  formatHqDate,
  formatHqDateTime,
  formatHqFileSize,
  getHqFile,
  getHqFileMeta,
  isHqFavorite,
  isHqImage,
  isHqPreviewable,
  pushRecentHqPost,
  readHqAttachmentBlob,
  resolveHqCategoryMeta,
  summarizeAcks,
  toggleHqFavorite,
} from '../utils/hqStorage';
import { FALLBACK_CATEGORY, getCategoryNames } from '../utils/categoryStorage';
import { generateDocId, generateStorageKey, putFile, saveDocument } from '../utils/documentStorage';

interface HqPostViewerProps {
  post: HqPost;
  series: HqPost[];
  sites: Site[];
  canManage: boolean;
  onClose: () => void;
  onEdit: (post: HqPost) => void;
  onDelete: (post: HqPost) => void;
  onOpenSeries: (post: HqPost) => void;
  onRefresh: () => void;
}

/** 본사 게시판 분류 → 현장 문서보관함 분류 기본 매핑 */
const CATEGORY_MAP: Record<string, string> = {
  공지사항: '기타',
  안전보건경영매뉴얼: '안전계획서',
  양식: '안전보건관리대장',
  '법령·고시': '기타',
  교육자료: '교육일지',
  기술자료: '도면',
  기타: '기타',
};

/** 본사 게시판 글 한 장 — 목록을 덮어쓰는 전체화면 보기 */
const HqPostViewer: React.FC<HqPostViewerProps> = ({
  post,
  series,
  sites,
  canManage,
  onClose,
  onEdit,
  onDelete,
  onOpenSeries,
  onRefresh,
}) => {
  const cat = resolveHqCategoryMeta(post.category);
  const [favorite, setFavorite] = useState(() => isHqFavorite(post.id));
  const [ackSiteId, setAckSiteId] = useState<number>(sites[0]?.id ?? 0);
  const [ackTick, setAckTick] = useState(0);

  /* 첨부 미리보기 */
  const [preview, setPreview] = useState<{
    attachment: HqAttachment;
    url: string;
    image: boolean;
  } | null>(null);

  /* 현장 문서보관함으로 받기 */
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveSiteId, setReceiveSiteId] = useState<number>(sites[0]?.id ?? 0);
  const [receivePicked, setReceivePicked] = useState<string[]>([]);
  const [receiving, setReceiving] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600);
  };

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  /* 최근 본 자료 · ESC 닫기 */
  useEffect(() => {
    pushRecentHqPost(post.id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPreview(cur => {
        if (cur) {
          URL.revokeObjectURL(cur.url);
          return null;
        }
        onClose();
        return null;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  /* 첨부 미리보기 URL 정리 */
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const summary = useMemo(
    () => summarizeAcks(post, sites),
    // ackTick 은 다시 계산을 유도하는 신호입니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [post, sites, ackTick],
  );

  const ackedHere = useMemo(
    () => summary.acks.some(a => a.siteId === ackSiteId),
    [summary, ackSiteId],
  );

  const openAttachment = async (attachment: HqAttachment) => {
    try {
      const blob = await getHqFile(attachment.storageKey);
      if (!blob) {
        flash('첨부파일을 찾을 수 없습니다.');
        return;
      }
      setPreview({
        attachment,
        url: URL.createObjectURL(blob),
        image: isHqImage(attachment.fileName),
      });
    } catch {
      flash('첨부파일을 열 수 없습니다.');
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handleFavorite = () => {
    const next = toggleHqFavorite(post.id);
    setFavorite(next);
    flash(next ? '즐겨찾기에 담았습니다.' : '즐겨찾기에서 뺐습니다.');
  };

  const handleAck = () => {
    const site = sites.find(s => s.id === ackSiteId);
    if (!site) {
      flash('먼저 현장을 선택해주세요.');
      return;
    }
    if (ackedHere) {
      cancelAck(post.id, site.id);
      flash(`${site.name} 확인을 취소했습니다.`);
    } else {
      acknowledgePost(post, site.id, site.name);
      flash(`${site.name} 확인으로 기록했습니다.`);
    }
    setAckTick(n => n + 1);
    onRefresh();
  };

  const openReceive = () => {
    setReceiveOpen(true);
    setReceivePicked(post.attachments.map(a => a.id));
    setReceiveSiteId(sites[0]?.id ?? 0);
  };

  const togglePicked = (id: string) => {
    setReceivePicked(cur => (cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]));
  };

  const handleReceive = async () => {
    const site = sites.find(s => s.id === receiveSiteId);
    if (!site) {
      flash('받을 현장을 선택해주세요.');
      return;
    }
    const targets = post.attachments.filter(a => receivePicked.includes(a.id));
    if (targets.length === 0) {
      flash('받을 첨부파일을 선택해주세요.');
      return;
    }

    /* 현장 문서보관함에 없는 분류면 '기타' 로 보냅니다. */
    const siteCategories = getCategoryNames();
    const mapped = CATEGORY_MAP[post.category] || FALLBACK_CATEGORY;
    const targetCategory = siteCategories.includes(mapped) ? mapped : FALLBACK_CATEGORY;

    setReceiving(true);
    let done = 0;
    for (const attachment of targets) {
      try {
        const blob = await readHqAttachmentBlob(attachment);
        if (!blob) continue;
        const storageKey = generateStorageKey(attachment.fileName);
        await putFile(storageKey, blob);
        saveDocument({
          id: generateDocId(),
          siteId: site.id,
          siteName: site.name,
          title: attachment.fileName.replace(/\.[^.]+$/, ''),
          category: targetCategory,
          period: post.effectiveDate ? post.effectiveDate.slice(0, 7) : undefined,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          fileType: attachment.fileType,
          version: post.version,
          uploadedBy: '본사 게시판',
          description: `${post.title} · 본사 게시판 ${post.version} 에서 받음`,
          storageKey,
          createdAt: new Date().toISOString(),
        });
        done += 1;
      } catch {
        /* 개별 실패는 건너뜁니다. */
      }
    }
    setReceiving(false);
    setReceiveOpen(false);
    flash(
      done > 0
        ? `${site.name} 문서보관함(${targetCategory})에 ${done}건을 받았습니다.`
        : '받지 못했습니다. 첨부파일을 확인해주세요.',
    );
  };

  const handlePrint = () => window.print();

  const olderVersions = series.filter(s => s.id !== post.id);

  return (
    <div className="hq-viewer">
      <div className="hq-viewer-chrome">
        <div className="hq-viewer-head">
          <div className="hq-viewer-head-main">
            <div className="hq-viewer-flags">
              <span
                className="hq-cat-badge"
                style={{ background: `${cat.color}14`, color: cat.color }}
              >
                {cat.icon} {post.category}
              </span>
              {post.subcategory && <span className="hq-sub-badge">{post.subcategory}</span>}
              {post.pinned && <span className="hq-flag hq-flag-pin">📌 고정</span>}
              {post.important && <span className="hq-flag hq-flag-important">❗ 중요</span>}
              {post.requireAck && <span className="hq-flag hq-flag-ack">🔔 필독</span>}
              {post.status === 'archived' && <span className="hq-flag hq-flag-archived">구본</span>}
            </div>
            <h1 className="hq-viewer-title">{post.title}</h1>
            <div className="hq-viewer-meta">
              <span>{post.author}</span>
              <span className="hq-dot">·</span>
              <span>{formatHqDateTime(post.createdAt)}</span>
              <span className="hq-dot">·</span>
              <span>조회 {post.views}</span>
              <span className="hq-dot">·</span>
              <span className="hq-ver-badge">{post.version}</span>
              {post.effectiveDate && (
                <>
                  <span className="hq-dot">·</span>
                  <span>시행일 {formatHqDate(post.effectiveDate)}</span>
                </>
              )}
            </div>
          </div>
          <div className="hq-viewer-head-right">
            <button
              type="button"
              className={`hq-icon-btn${favorite ? ' is-on' : ''}`}
              onClick={handleFavorite}
              title="즐겨찾기"
            >
              {favorite ? '★' : '☆'} <span>즐겨찾기</span>
            </button>
            <button type="button" className="hq-icon-btn" onClick={handlePrint} title="인쇄">
              🖨 <span>인쇄</span>
            </button>
            {canManage && (
              <button type="button" className="hq-icon-btn" onClick={() => onEdit(post)}>
                ✏️ <span>수정</span>
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="hq-icon-btn hq-icon-danger"
                onClick={() => onDelete(post)}
              >
                🗑 <span>삭제</span>
              </button>
            )}
            <button type="button" className="hq-back-btn" onClick={onClose}>
              ← 목록
            </button>
          </div>
        </div>
      </div>

      <div className="hq-viewer-body">
        {notice && <div className="hq-toast">{notice}</div>}

        {post.legalBasis && (
          <div className="hq-basis">
            <span className="hq-basis-label">⚖️ 근거</span>
            <span className="hq-basis-text">{post.legalBasis}</span>
          </div>
        )}

        {post.attachments.length > 0 && (
          <section className="hq-block">
            <h2 className="hq-block-title">
              첨부자료 <span className="hq-block-count">{post.attachments.length}</span>
            </h2>
            <ul className="hq-attach-list">
              {post.attachments.map(attachment => {
                const meta = getHqFileMeta(attachment.fileName);
                return (
                  <li key={attachment.id} className="hq-attach-item">
                    <span className="hq-attach-icon" style={{ background: `${meta.color}14` }}>
                      {meta.icon}
                    </span>
                    <div className="hq-attach-info">
                      <span className="hq-attach-name">{attachment.fileName}</span>
                      <span className="hq-attach-meta">
                        {meta.label} · {formatHqFileSize(attachment.fileSize)} ·{' '}
                        {formatHqDateTime(attachment.uploadedAt)}
                      </span>
                    </div>
                    <div className="hq-attach-actions">
                      {isHqPreviewable(attachment.fileName) && (
                        <button
                          type="button"
                          className="hq-mini-btn"
                          onClick={() => void openAttachment(attachment)}
                        >
                          보기
                        </button>
                      )}
                      <button
                        type="button"
                        className="hq-mini-btn"
                        onClick={() => void downloadHqAttachment(attachment)}
                      >
                        내려받기
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hq-receive-bar">
              {!receiveOpen ? (
                <button type="button" className="hq-receive-btn" onClick={openReceive}>
                  📥 현장 문서보관함에 받기
                </button>
              ) : (
                <div className="hq-receive-panel">
                  <div className="hq-receive-row">
                    <label className="hq-receive-label">받을 현장</label>
                    <select
                      className="hq-select"
                      value={receiveSiteId}
                      onChange={e => setReceiveSiteId(Number(e.target.value))}
                    >
                      {sites.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="hq-receive-picks">
                    {post.attachments.map(attachment => (
                      <label key={attachment.id} className="hq-check">
                        <input
                          type="checkbox"
                          checked={receivePicked.includes(attachment.id)}
                          onChange={() => togglePicked(attachment.id)}
                        />
                        <span>{attachment.fileName}</span>
                      </label>
                    ))}
                  </div>
                  <div className="hq-receive-actions">
                    <button
                      type="button"
                      className="hq-btn hq-btn-primary"
                      disabled={receiving}
                      onClick={() => void handleReceive()}
                    >
                      {receiving ? '받는 중…' : `${receivePicked.length}건 받기`}
                    </button>
                    <button
                      type="button"
                      className="hq-btn"
                      onClick={() => setReceiveOpen(false)}
                      disabled={receiving}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {post.requireAck && (
          <section className="hq-block hq-ack-block">
            <h2 className="hq-block-title">
              🔔 필독 확인 현황
              <span className="hq-ack-rate">{summary.rate}%</span>
            </h2>
            <div className="hq-ack-meter" role="img" aria-label={`확인률 ${summary.rate}%`}>
              <div className="hq-ack-meter-fill" style={{ width: `${summary.rate}%` }} />
            </div>
            <p className="hq-ack-line">
              전체 {summary.totalSites}개 현장 중 <b>{summary.ackedSites}개</b> 확인
              {summary.pendingSites.length > 0 && ` · 미확인 ${summary.pendingSites.length}개`}
            </p>
            <div className="hq-ack-controls">
              <select
                className="hq-select"
                value={ackSiteId}
                onChange={e => setAckSiteId(Number(e.target.value))}
              >
                {sites.map(s => {
                  const done = summary.acks.some(a => a.siteId === s.id);
                  return (
                    <option key={s.id} value={s.id}>
                      {done ? '✓ ' : ''}
                      {s.name}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className={`hq-btn ${ackedHere ? '' : 'hq-btn-primary'}`}
                onClick={handleAck}
              >
                {ackedHere ? '확인 취소' : '필독 확인'}
              </button>
            </div>
            {summary.acks.length > 0 && (
              <ul className="hq-ack-list">
                {summary.acks.map(ack => (
                  <li key={ack.id} className="hq-ack-item">
                    <span className="hq-ack-site">✓ {ack.siteName}</span>
                    <span className="hq-ack-time">{formatHqDateTime(ack.ackedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {summary.pendingSites.length > 0 && (
              <p className="hq-ack-pending">
                <span className="hq-ack-pending-label">미확인</span>
                {summary.pendingSites.map(s => s.name).join(', ')}
              </p>
            )}
          </section>
        )}

        {post.body && (
          <section className="hq-block">
            <div className="hq-body">{post.body}</div>
          </section>
        )}

        {post.tags && post.tags.length > 0 && (
          <div className="hq-tags">
            {post.tags.map(tag => (
              <span key={tag} className="hq-tag">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {(post.revisionSummary || olderVersions.length > 0) && (
          <section className="hq-block hq-history">
            <h2 className="hq-block-title">
              개정 이력 <span className="hq-block-count">{series.length}</span>
            </h2>
            {post.revisionSummary && (
              <p className="hq-revision-note">
                <span className="hq-revision-label">{post.version} 개정 내용</span>
                {post.revisionSummary}
              </p>
            )}
            <ul className="hq-history-list">
              {series.map(item => (
                <li
                  key={item.id}
                  className={`hq-history-item${item.id === post.id ? ' is-current' : ''}`}
                >
                  <button
                    type="button"
                    className="hq-history-btn"
                    disabled={item.id === post.id}
                    onClick={() => onOpenSeries(item)}
                  >
                    <span className="hq-history-ver">{item.version}</span>
                    <span className="hq-history-summary">{item.revisionSummary || item.title}</span>
                    <span className="hq-history-date">{formatHqDate(item.createdAt)}</span>
                    <span className="hq-history-state">
                      {item.id === post.id ? '현재' : '구본'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="hq-viewer-foot">
          최초 등록 {formatHqDateTime(post.createdAt)} · 최종 수정{' '}
          {formatHqDateTime(post.updatedAt)}
        </p>
      </div>

      {preview && (
        <div className="hq-preview-backdrop" onClick={closePreview} role="presentation">
          <div className="hq-preview" onClick={e => e.stopPropagation()} role="dialog">
            <div className="hq-preview-head">
              <span className="hq-preview-name">{preview.attachment.fileName}</span>
              <div className="hq-preview-actions">
                <button
                  type="button"
                  className="hq-mini-btn"
                  onClick={() => void downloadHqAttachment(preview.attachment)}
                >
                  내려받기
                </button>
                <button type="button" className="hq-mini-btn" onClick={closePreview}>
                  닫기
                </button>
              </div>
            </div>
            <div className="hq-preview-body">
              {preview.image ? (
                <img
                  className="hq-preview-img"
                  src={preview.url}
                  alt={preview.attachment.fileName}
                />
              ) : (
                <iframe
                  className="hq-preview-pdf"
                  src={preview.url}
                  title={preview.attachment.fileName}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HqPostViewer;
