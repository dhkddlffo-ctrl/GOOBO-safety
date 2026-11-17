import React, { useState, useEffect, useMemo } from 'react';
import { Site, SiteInfo, SiteDocument } from '../types';
import { getSites, getSuggestions, getWorkStops, getAccidentCases, formatDate } from '../utils/storage';
import { getSiteInfo, saveSiteInfo, createEmptySiteInfo } from '../utils/siteInfoStorage';
import { getDocuments, formatFileSize, getTotalUsage } from '../utils/documentStorage';
import { isAuthenticated } from '../utils/auth';
import { useCategories } from '../hooks/useCategories';
import { getCategoriesWithOrphans } from '../utils/categoryStorage';
import DocumentArchive from '../components/DocumentArchive';
import './SiteDetailPage.css';

interface SiteDetailPageProps {
  onNavigate: (page: string, siteId?: number) => void;
  siteId?: number;
}

type Tab = 'info' | 'documents' | 'activity';

const SiteDetailPage: React.FC<SiteDetailPageProps> = ({ onNavigate, siteId }) => {
  const [site, setSite] = useState<Site | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [docs, setDocs] = useState<SiteDocument[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [canManage, setCanManage] = useState(false);

  const categories = useCategories();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SiteInfo | null>(null);

  const [activity, setActivity] = useState({
    suggestions: 0,
    workStops: 0,
    accidents: 0,
  });

  useEffect(() => {
    const allSites = getSites();
    const found = allSites.find(s => s.id === siteId);
    setSite(found || null);

    if (found) {
      const info = getSiteInfo(found.id, found.name);
      setSiteInfo(info);
      setDraft(info);
      setDocs(getDocuments().filter(d => d.siteId === found.id));
      setActivity({
        suggestions: getSuggestions().filter(s => s.siteId === found.id).length,
        workStops: getWorkStops().filter(w => w.siteId === found.id).length,
        accidents: getAccidentCases().filter(a => a.siteId === found.id).length,
      });
    }
    setCanManage(isAuthenticated());
  }, [siteId]);

  /** 분류 목록 변경(추가·삭제)이 즉시 반영되도록 categories 를 의존성에 포함
   *  (Rules of Hooks: 조기 return 이전에 모든 훅이 호출되어야 함) */
  const summaryCategories = useMemo(
    () => getCategoriesWithOrphans(docs.map(d => d.category)),
    [categories, docs]
  );

  if (!site) {
    return (
      <div className="site-detail-page">
        <div className="container">
          <div className="sd-not-found">
            <div className="sd-not-found-icon">🏗️</div>
            <h2>현장을 찾을 수 없습니다</h2>
            <p>요청하신 현장이 삭제되었거나 존재하지 않습니다.</p>
            <button className="btn btn-primary" onClick={() => onNavigate('home')}>
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- 현장정보 편집 ---------------- */
  const startEdit = () => {
    if (!canManage) {
      alert('현장정보 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    setDraft(siteInfo ? { ...siteInfo } : createEmptySiteInfo(site.id, site.name));
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(siteInfo);
    setEditing(false);
  };

  const saveEdit = () => {
    if (!draft) return;
    saveSiteInfo({ ...draft, siteId: site.id, siteName: site.name });
    const updated = getSiteInfo(site.id, site.name);
    setSiteInfo(updated);
    setDraft(updated);
    setEditing(false);
  };

  const setField = <K extends keyof SiteInfo>(key: K, value: SiteInfo[K]) => {
    setDraft(d => (d ? { ...d, [key]: value } : d));
  };

  const docCountByCategory = (key: string) => docs.filter(d => d.category === key).length;

  /* ---------------- 렌더 ---------------- */
  return (
    <div className="site-detail-page">
      <div className="container">
        {/* 헤더 */}
        <div className="sd-header">
          <button className="sd-back" onClick={() => onNavigate('home')}>
            ← 현장 목록
          </button>

          <div className="sd-title-block">
            <div className="sd-title-row">
              <h1>{site.name}</h1>
              <span className="sd-status-badge">운영중</span>
            </div>
            <p className="sd-location">📍 {site.location}</p>
          </div>

          <div className="sd-header-stats">
            <div className="sd-hstat">
              <span className="sd-hstat-value">{docs.length}</span>
              <span className="sd-hstat-label">보관 문서</span>
            </div>
            <div className="sd-hstat">
              <span className="sd-hstat-value">{siteInfo?.progressRate ?? 0}%</span>
              <span className="sd-hstat-label">공정률</span>
            </div>
            <div className="sd-hstat">
              <span className="sd-hstat-value">{siteInfo?.workerCount ?? 0}</span>
              <span className="sd-hstat-label">현재 인원</span>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="sd-tabs">
          <button
            className={`sd-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            🏗️ 현장정보
          </button>
          <button
            className={`sd-tab ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            📁 문서보관함 <span className="sd-tab-count">{docs.length}</span>
          </button>
          <button
            className={`sd-tab ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            📋 안전활동
          </button>
        </div>

        {/* ============ 현장정보 탭 ============ */}
        {activeTab === 'info' && (
          <div className="sd-panel">
            <div className="sd-panel-head">
              <h2>현장 기본정보</h2>
              {!editing ? (
                <button className="btn btn-primary btn-sm" onClick={startEdit}>
                  ✏️ 정보 수정
                </button>
              ) : (
                <div className="sd-edit-actions">
                  <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                    취소
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                    저장
                  </button>
                </div>
              )}
            </div>

            {!editing ? (
              <>
                <div className="sd-info-grid">
                  <InfoRow label="현장명" value={site.name} />
                  <InfoRow label="소재지" value={siteInfo?.address || site.location} />
                  <InfoRow label="공사 종류" value={siteInfo?.constructionType} />
                  <InfoRow label="규모" value={siteInfo?.scale} />
                  <InfoRow label="도급 기간" value={siteInfo?.contractPeriod} />
                  <InfoRow label="도급 금액" value={siteInfo?.contractAmount} />
                  <InfoRow label="발주처" value={siteInfo?.clientName} />
                  <InfoRow label="시공사" value={siteInfo?.contractorName || '구보공영(주)'} />
                  <InfoRow label="현장소장" value={siteInfo?.siteManager} />
                  <InfoRow label="안전관리자" value={siteInfo?.safetyManager} />
                  <InfoRow label="안전관리자 연락처" value={siteInfo?.safetyManagerPhone} />
                  <InfoRow label="현장 사무실" value={siteInfo?.officePhone} />
                  <InfoRow label="현재 인원" value={siteInfo?.workerCount ? `${siteInfo.workerCount}명` : ''} />
                  <InfoRow label="공정률" value={`${siteInfo?.progressRate ?? 0}%`} />
                </div>

                <div className="sd-progress-wrap">
                  <div className="sd-progress-head">
                    <span>공정률</span>
                    <strong>{siteInfo?.progressRate ?? 0}%</strong>
                  </div>
                  <div className="sd-progress-bar">
                    <div
                      className="sd-progress-fill"
                      style={{ width: `${Math.min(Math.max(siteInfo?.progressRate ?? 0, 0), 100)}%` }}
                    />
                  </div>
                </div>

                {siteInfo?.notes && (
                  <div className="sd-notes">
                    <strong>비고</strong>
                    <p>{siteInfo.notes}</p>
                  </div>
                )}

                {siteInfo?.updatedAt && (
                  <p className="sd-updated">최종 수정: {formatDate(siteInfo.updatedAt)}</p>
                )}
              </>
            ) : (
              draft && (
                <div className="sd-edit-form">
                  <div className="sd-form-row">
                    <FormField label="소재지">
                      <input
                        type="text"
                        value={draft.address}
                        onChange={e => setField('address', e.target.value)}
                        placeholder="예: 경기도 용인시 처인구 OO로 123"
                      />
                    </FormField>
                    <FormField label="공사 종류">
                      <input
                        type="text"
                        value={draft.constructionType}
                        onChange={e => setField('constructionType', e.target.value)}
                        placeholder="예: 공동주택 신축공사"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="규모">
                      <input
                        type="text"
                        value={draft.scale}
                        onChange={e => setField('scale', e.target.value)}
                        placeholder="예: 지하 3층~지상 25층, 3개동"
                      />
                    </FormField>
                    <FormField label="도급 기간">
                      <input
                        type="text"
                        value={draft.contractPeriod}
                        onChange={e => setField('contractPeriod', e.target.value)}
                        placeholder="예: 2024-03 ~ 2027-02"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="도급 금액">
                      <input
                        type="text"
                        value={draft.contractAmount}
                        onChange={e => setField('contractAmount', e.target.value)}
                        placeholder="예: 1,250억원"
                      />
                    </FormField>
                    <FormField label="공정률 (%)">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.progressRate}
                        onChange={e => setField('progressRate', Number(e.target.value))}
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="발주처">
                      <input
                        type="text"
                        value={draft.clientName}
                        onChange={e => setField('clientName', e.target.value)}
                        placeholder="예: OO도시공사"
                      />
                    </FormField>
                    <FormField label="시공사">
                      <input
                        type="text"
                        value={draft.contractorName}
                        onChange={e => setField('contractorName', e.target.value)}
                        placeholder="예: 구보공영(주)"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="현장소장">
                      <input
                        type="text"
                        value={draft.siteManager}
                        onChange={e => setField('siteManager', e.target.value)}
                        placeholder="예: 홍길동"
                      />
                    </FormField>
                    <FormField label="안전관리자">
                      <input
                        type="text"
                        value={draft.safetyManager}
                        onChange={e => setField('safetyManager', e.target.value)}
                        placeholder="예: 김안전"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="안전관리자 연락처">
                      <input
                        type="tel"
                        value={draft.safetyManagerPhone}
                        onChange={e => setField('safetyManagerPhone', e.target.value)}
                        placeholder="예: 010-1234-5678"
                      />
                    </FormField>
                    <FormField label="현장 사무실">
                      <input
                        type="tel"
                        value={draft.officePhone}
                        onChange={e => setField('officePhone', e.target.value)}
                        placeholder="예: 031-123-4567"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="현재 인원 (명)">
                      <input
                        type="number"
                        min={0}
                        value={draft.workerCount}
                        onChange={e => setField('workerCount', Number(e.target.value))}
                      />
                    </FormField>
                  </div>

                  <FormField label="비고">
                    <textarea
                      rows={3}
                      value={draft.notes}
                      onChange={e => setField('notes', e.target.value)}
                      placeholder="현장 특이사항, 참고사항"
                    />
                  </FormField>
                </div>
              )
            )}
          </div>
        )}

        {/* ============ 문서보관함 탭 ============ */}
        {activeTab === 'documents' && (
          <div className="sd-panel sd-panel-docs">
            <div className="sd-panel-head">
              <div>
                <h2>문서보관함</h2>
                <p className="sd-panel-sub">
                  전체 {docs.length}건 · {formatFileSize(getTotalUsage(docs))} 사용
                </p>
              </div>
            </div>

            <div className="sd-cat-summary">
              {summaryCategories.map(meta => (
                <div key={meta.key} className="sd-cat-chip">
                  <span className="sd-cat-chip-icon" style={{ color: meta.color }}>
                    {meta.icon}
                  </span>
                  <span className="sd-cat-chip-name">{meta.key}</span>
                  <span className="sd-cat-chip-count">{docCountByCategory(meta.key)}</span>
                </div>
              ))}
            </div>

            <DocumentArchive siteId={site.id} siteName={site.name} />
          </div>
        )}

        {/* ============ 안전활동 탭 ============ */}
        {activeTab === 'activity' && (
          <div className="sd-panel">
            <div className="sd-panel-head">
              <h2>현장 안전활동 현황</h2>
            </div>

            <div className="sd-activity-grid">
              <button className="sd-activity-card" onClick={() => onNavigate('suggestion', site.id)}>
                <span className="sd-activity-icon">💡</span>
                <span className="sd-activity-value">{activity.suggestions}</span>
                <span className="sd-activity-label">건의사항</span>
              </button>

              <button className="sd-activity-card" onClick={() => onNavigate('work-stop', site.id)}>
                <span className="sd-activity-icon">🛑</span>
                <span className="sd-activity-value">{activity.workStops}</span>
                <span className="sd-activity-label">작업중지권 요청</span>
              </button>

              <button className="sd-activity-card" onClick={() => onNavigate('accident-case', site.id)}>
                <span className="sd-activity-icon">⚠️</span>
                <span className="sd-activity-value">{activity.accidents}</span>
                <span className="sd-activity-label">사고사례</span>
              </button>
            </div>

            <div className="sd-activity-links">
              <button className="sd-link-btn" onClick={() => onNavigate('suggestion', site.id)}>
                💡 이 현장 건의사항 제출 →
              </button>
              <button className="sd-link-btn" onClick={() => onNavigate('work-stop', site.id)}>
                🛑 이 현장 작업중지권 행사 →
              </button>
              <button className="sd-link-btn" onClick={() => onNavigate('accident-case', site.id)}>
                ⚠️ 이 현장 사고사례 제출 →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------- 하위 컴포넌트 ---------------- */
const InfoRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="sd-info-item">
    <span className="sd-info-label">{label}</span>
    <span className={`sd-info-value ${!value ? 'empty' : ''}`}>{value || '미입력'}</span>
  </div>
);

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="sd-field">
    <label>{label}</label>
    {children}
  </div>
);

export default SiteDetailPage;
