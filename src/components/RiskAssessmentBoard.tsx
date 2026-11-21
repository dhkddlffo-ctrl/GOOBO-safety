import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiskAssessment, RiskUpload } from '../types';
import {
  getRiskAssessments,
  createEmptyRiskAssessment,
  saveRiskAssessment,
  deleteRiskAssessment,
  summarizeAssessment,
} from '../utils/riskAssessmentStorage';
import { deleteRiskUpload, getRiskUploads, getUploadTotalSize } from '../utils/riskUploadStorage';
import { formatFileSize, getFile } from '../utils/documentStorage';
import RiskUploadDialog from './RiskUploadDialog';
import RiskUploadViewer from './RiskUploadViewer';
import { isAuthenticated } from '../utils/auth';
import './RiskAssessmentBoard.css';
import './RiskUpload.css';

interface RiskAssessmentBoardProps {
  siteId: number;
  siteName: string;
  /** 글을 열 때 (기존 서식 화면으로 이동) */
  onOpen: (id: string, edit: boolean) => void;
}

/**
 * 올린 자료 카드의 첫 장 미리보기
 *
 * 이미지 본문은 IndexedDB 에 있어서 그냥 <img src> 로는 열 수 없습니다.
 * 카드가 화면에 나타날 때 한 번 읽어 objectURL 로 바꿔 보여줍니다.
 */
const UploadThumb: React.FC<{ storageKey: string; total: number }> = ({ storageKey, total }) => {
  const [url, setUrl] = useState('');
  const objectUrl = useRef('');

  useEffect(() => {
    let alive = true;
    if (!storageKey) return undefined;
    getFile(storageKey).then(blob => {
      if (!alive || !blob) return;
      const next = URL.createObjectURL(blob);
      objectUrl.current = next;
      setUrl(next);
    });
    return () => {
      alive = false;
      if (objectUrl.current) {
        URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = '';
      }
    };
  }, [storageKey]);

  return (
    <span className="rb-up-thumb">
      {url ? <img src={url} alt="" /> : <span className="rb-up-thumb-empty">이미지</span>}
      <span className="rb-up-thumb-no">{total}장</span>
    </span>
  );
};

/** yyyy-mm-dd → yyyy.mm.dd */
const formatDateKo = (ymd?: string): string => {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  if (!y || !m || !d) return ymd;
  return `${y}.${m}.${d}`;
};

/** 작성일로부터 오늘까지 지난 일수 (음수면 미래) */
const daysSince = (ymd?: string): number | null => {
  if (!ymd) return null;
  const written = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(written.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - written.getTime()) / 86400000);
};

/** 수시 위험성평가 작성 주기 (일) */
const CYCLE_DAYS = 14;

const RiskAssessmentBoard: React.FC<RiskAssessmentBoardProps> = ({ siteId, siteName, onOpen }) => {
  const canManage = isAuthenticated();

  const [list, setList] = useState<RiskAssessment[]>(() => getRiskAssessments(siteId));
  /* 이미지로 올린 위험성평가 (종이 서식을 사진으로 찍어 올린 자료) */
  const [uploads, setUploads] = useState<RiskUpload[]>(() => getRiskUploads(siteId));
  /* 새로 올리기 / 수정 다이얼로그 */
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editUpload, setEditUpload] = useState<RiskUpload | null>(null);
  /* 보기 화면에 띄울 자료 */
  const [viewUpload, setViewUpload] = useState<RiskUpload | null>(null);

  const reload = useCallback(() => {
    setList(getRiskAssessments(siteId));
    setUploads(getRiskUploads(siteId));
  }, [siteId]);

  /* 현장이 바뀌면 다시 읽습니다. */
  useEffect(() => {
    reload();
  }, [reload]);

  /** 최신 작성 건 기준 주기 상태 */
  const status = useMemo(() => {
    if (list.length === 0) return null;
    const latest = list.reduce((a, b) => (a.writtenAt >= b.writtenAt ? a : b));
    const days = daysSince(latest.writtenAt);
    if (days === null) return null;
    return { writtenAt: latest.writtenAt, days, late: days > CYCLE_DAYS };
  }, [list]);

  /* 새 위험성평가 작성 → 저장 후 바로 편집 화면으로 */
  const createAssessment = () => {
    const created = createEmptyRiskAssessment(siteId, siteName);
    saveRiskAssessment(created);
    reload();
    onOpen(created.id, true);
  };

  const removeAssessment = (target: RiskAssessment) => {
    if (
      !window.confirm(
        `${formatDateKo(target.writtenAt)} 작성 자료를 삭제할까요?\n삭제한 자료는 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    deleteRiskAssessment(target.id);
    reload();
  };

  /* ---------- 위험성평가 올리기 (이미지) ---------- */

  /** 새로 올리기 다이얼로그 열기 */
  const openUploadDialog = () => {
    setEditUpload(null);
    setUploadOpen(true);
  };

  /** 올린 자료 수정 */
  const openUploadEdit = (item: RiskUpload) => {
    setViewUpload(null);
    setEditUpload(item);
    setUploadOpen(true);
  };

  const closeUploadDialog = () => {
    setUploadOpen(false);
    setEditUpload(null);
  };

  /** 올린 자료 삭제 (이미지 파일도 함께 지움) */
  const removeUpload = (item: RiskUpload) => {
    if (
      !window.confirm(
        `"${item.title}" 자료를 삭제할까요?\n올린 이미지 ${item.pages.length}장이 함께 삭제되며 되돌릴 수 없습니다.`,
      )
    ) {
      return;
    }
    void deleteRiskUpload(item.id).then(() => {
      setViewUpload(prev => (prev && prev.id === item.id ? null : prev));
      reload();
    });
  };

  /** 다시 읽은 최신 자료를 보기 화면에 반영 */
  const handleUploadSaved = () => {
    reload();
  };

  return (
    <div className="rb">
      {/* ---------- 게시판 머리글 ---------- */}
      <div className="rb-head">
        <div className="rb-head-text">
          <h3 className="rb-title">📋 수시 위험성평가 등록부</h3>
          <p className="rb-sub">
            현장별로 <b>2주에 1회</b> 수시 위험성평가를 작성·등록합니다. 글을 누르면 작성한 서식이
            열립니다.
          </p>
        </div>
        <div className="rb-head-right">
          <span className="rb-count">전체 {list.length + uploads.length}건</span>
          {canManage && (
            <>
              <button className="btn btn-sm btn-primary rb-btn-write" onClick={createAssessment}>
                ✍️ 위험성평가 작성
              </button>
              <button
                className="btn btn-sm rb-btn-upload"
                onClick={openUploadDialog}
                title="종이에 작성한 위험성평가표를 사진으로 찍어 올립니다."
              >
                🖼️ 위험성평가 올리기
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---------- 주기 안내 ---------- */}
      {status && (
        <div className={`rb-status${status.late ? ' rb-status-late' : ''}`}>
          <span className="rb-status-chip">
            최근 작성 {formatDateKo(status.writtenAt)}
            {status.days >= 0 ? ` · ${status.days}일 지남` : ' · 예정일 이후'}
          </span>
          <span className="rb-status-hint">
            {status.late
              ? `⚠️ ${CYCLE_DAYS}일 주기가 지났습니다. 새 위험성평가를 작성해 주세요.`
              : `${CYCLE_DAYS}일 주기 안에 있습니다.`}
          </span>
        </div>
      )}

      {/* ---------- 비어 있음 ---------- */}
      {list.length === 0 ? (
        <div className="rb-empty">
          <p className="rb-empty-title">아직 작성한 위험성평가가 없습니다.</p>
          <p className="rb-empty-sub">
            회사 양식(SCM-002-1.01)과 동일한 서식으로 작성하고 A4 가로로 인쇄할 수 있습니다.
            <br />
            강도·빈도를 고르면 <b>평가합계와 등급이 자동으로 계산</b>됩니다.
          </p>
          {canManage ? (
            <button className="btn btn-primary" onClick={createAssessment}>
              ✍️ 위험성평가 작성
            </button>
          ) : (
            <p className="rb-empty-note">관리자 로그인 후 작성할 수 있습니다.</p>
          )}
        </div>
      ) : (
        <div className="rb-table-wrap">
          <table className="rb-table">
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '26%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>번호</th>
                <th>작성일</th>
                <th>작성자</th>
                <th>공사명</th>
                <th>위험요인</th>
                <th>상등급</th>
                <th>조치완료</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item, idx) => {
                const sum = summarizeAssessment(item);
                const elapsed = daysSince(item.writtenAt);
                const late = elapsed !== null && elapsed > CYCLE_DAYS;
                return (
                  <tr key={item.id} className="rb-row" onClick={() => onOpen(item.id, false)}>
                    <td className="rb-c-no">{list.length - idx}</td>
                    <td className="rb-c-date">
                      <span>{formatDateKo(item.writtenAt) || '-'}</span>
                      {elapsed !== null && elapsed >= 0 && (
                        <span className={`rb-dday${late ? ' rb-dday-late' : ''}`}>D+{elapsed}</span>
                      )}
                    </td>
                    <td className="rb-c-author">{item.author || '-'}</td>
                    <td className="rb-c-title">{item.constructionName || '제목 없음'}</td>
                    <td className="rb-c-num">{sum.filled}건</td>
                    <td className="rb-c-num">
                      {sum.high > 0 ? (
                        <span className="rb-badge rb-badge-high">{sum.high}</span>
                      ) : (
                        <span className="rb-zero">0</span>
                      )}
                    </td>
                    <td className="rb-c-num">
                      {sum.done > 0 ? (
                        <span className="rb-badge rb-badge-done">{sum.done}</span>
                      ) : (
                        <span className="rb-zero">0</span>
                      )}
                    </td>
                    <td className="rb-c-actions">
                      <button
                        className="btn btn-xs"
                        onClick={e => {
                          e.stopPropagation();
                          onOpen(item.id, false);
                        }}
                      >
                        열기
                      </button>
                      {canManage && (
                        <button
                          className="btn btn-xs rb-btn-del"
                          onClick={e => {
                            e.stopPropagation();
                            removeAssessment(item);
                          }}
                        >
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------- 이미지로 올린 위험성평가 ---------- */}
      {uploads.length > 0 && (
        <section className="rb-up">
          <div className="rb-up-head">
            <div>
              <h4 className="rb-up-title">🖼️ 올린 위험성평가 (이미지)</h4>
              <p className="rb-up-sub">
                종이에 작성한 위험성평가표를 사진으로 올린 자료입니다. 카드를 누르면 크게 볼 수
                있습니다.
              </p>
            </div>
            <span className="rb-count">올린 자료 {uploads.length}건</span>
          </div>
          <ul className="rb-up-list">
            {uploads.map(item => (
              <li
                key={item.id}
                className="rb-up-card"
                onClick={() => setViewUpload(item)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setViewUpload(item);
                  }
                }}
              >
                {item.pages[0] ? (
                  <UploadThumb storageKey={item.pages[0].storageKey} total={item.pages.length} />
                ) : (
                  <span className="rb-up-thumb">
                    <span className="rb-up-thumb-empty">이미지</span>
                  </span>
                )}
                <span className="rb-up-info">
                  <span className="rb-up-name">{item.title || '제목 없음'}</span>
                  <span className="rb-up-meta">
                    {formatDateKo(item.writtenAt) || '-'}
                    {item.author ? ` · ${item.author}` : ''}
                  </span>
                  <span className="rb-up-meta">
                    {item.pages.length}장 · {formatFileSize(getUploadTotalSize(item))}
                  </span>
                  <span className="rb-up-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-xs" onClick={() => setViewUpload(item)}>
                      열기
                    </button>
                    {canManage && (
                      <>
                        <button className="btn btn-xs" onClick={() => openUploadEdit(item)}>
                          수정
                        </button>
                        <button
                          className="btn btn-xs rb-btn-del"
                          onClick={() => removeUpload(item)}
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="rb-note">
        ※ 글을 누르면 서식 화면이 열립니다. 서식 화면에서 <b>✏️ 수정</b> 후 저장하거나{' '}
        <b>🖨️ A4 인쇄</b>로 출력할 수 있습니다.
        <br />※ 화면에 입력하기 어려우면 <b>🖼️ 위험성평가 올리기</b>로 종이 서식을 사진 찍어 올릴 수
        있습니다.
      </p>

      {/* ---------- 다이얼로그 / 보기 ---------- */}
      {uploadOpen && (
        <RiskUploadDialog
          siteId={siteId}
          siteName={siteName}
          initial={editUpload}
          onClose={closeUploadDialog}
          onSaved={handleUploadSaved}
        />
      )}
      {viewUpload && (
        <RiskUploadViewer
          upload={viewUpload}
          canManage={canManage}
          onClose={() => setViewUpload(null)}
          onEdit={() => openUploadEdit(viewUpload)}
          onDelete={() => removeUpload(viewUpload)}
        />
      )}
    </div>
  );
};

export default RiskAssessmentBoard;
