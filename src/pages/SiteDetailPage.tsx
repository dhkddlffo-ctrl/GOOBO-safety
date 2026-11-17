import React, { useState, useEffect, useMemo } from 'react';
import { Site, SiteInfo, SiteDocument, SiteStaff, STAFF_ROLES, StaffRole } from '../types';
import { getSites, getSuggestions, getWorkStops, getAccidentCases, formatDate } from '../utils/storage';
import {
  getSiteInfo,
  saveSiteInfo,
  createEmptySiteInfo,
  createEmptyStaff,
  generateStaffId,
} from '../utils/siteInfoStorage';
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

  /* ---------------- 관리자(안전인력) 관리 상태 ----------------
   *  Rules of Hooks: 조기 return(현장 없음) 이전에 선언되어야 함 */
  const [staffEditorOpen, setStaffEditorOpen] = useState(false);
  const [staffDraft, setStaffDraft] = useState<SiteStaff | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffError, setStaffError] = useState('');

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

  /* ---------------- 관리자(안전인력) 관리 ---------------- */
  const staffList: SiteStaff[] = siteInfo?.staff ?? [];

  const openStaffAddFor = (role: StaffRole) => {
    if (!canManage) {
      alert('관리자 정보 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    setStaffDraft(createEmptyStaff(role));
    setEditingStaffId(null);
    setStaffError('');
    setStaffEditorOpen(true);
  };

  const persistStaff = (nextStaff: SiteStaff[]) => {
    if (!site) return;
    const nextInfo: SiteInfo = {
      ...(siteInfo ?? createEmptySiteInfo(site.id, site.name)),
      staff: nextStaff,
    };
    saveSiteInfo(nextInfo);
    const updated = getSiteInfo(site.id, site.name);
    setSiteInfo(updated);
    setDraft(updated);
  };

  const openStaffEdit = (staff: SiteStaff) => {
    if (!canManage) {
      alert('관리자 정보 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    setStaffDraft({ ...staff });
    setEditingStaffId(staff.id);
    setStaffError('');
    setStaffEditorOpen(true);
  };

  const cancelStaffEdit = () => {
    setStaffEditorOpen(false);
    setStaffDraft(null);
    setEditingStaffId(null);
    setStaffError('');
  };

  const setStaffField = <K extends keyof SiteStaff>(key: K, value: SiteStaff[K]) => {
    setStaffDraft(s => (s ? { ...s, [key]: value } : s));
  };

  const saveStaff = () => {
    if (!staffDraft) return;
    if (!staffDraft.name.trim()) {
      setStaffError('성명을 입력해주세요.');
      return;
    }

    const entry: SiteStaff = {
      ...staffDraft,
      id: staffDraft.id || generateStaffId(),
      name: staffDraft.name.trim(),
    };

    const exists = staffList.some(s => s.id === entry.id);
    const nextStaff = exists
      ? staffList.map(s => (s.id === entry.id ? entry : s))
      : [...staffList, entry];

    persistStaff(nextStaff);
    cancelStaffEdit();
  };

  const deleteStaff = (staff: SiteStaff) => {
    if (!canManage) return alert('관리자 로그인 후 삭제할 수 있습니다.');
    if (!confirm(`"${staff.name}(${staff.role})" 정보를 삭제하시겠습니까?`)) return;
    persistStaff(staffList.filter(s => s.id !== staff.id));
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
              <span className="sd-hstat-value">{siteInfo?.staff?.length ?? 0}</span>
              <span className="sd-hstat-label">안전인력</span>
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
                  <InfoRow label="소재지" value={siteInfo?.address} />
                  <InfoRow label="공사분류" value={siteInfo?.constructionType} />
                  <InfoRow label="규모" value={siteInfo?.scale} />
                  <InfoRow label="공사기간" value={siteInfo?.contractPeriod} />
                  <InfoRow label="계약금액" value={siteInfo?.contractAmount} />
                  <InfoRow label="착공일" value={siteInfo?.startDate} />
                  <InfoRow label="실제착공일" value={siteInfo?.actualStartDate} />
                  <InfoRow label="발주처" value={siteInfo?.clientName} />
                  <InfoRow label="시행사" value={siteInfo?.developerName} />
                  <InfoRow label="시공사" value={siteInfo?.contractorName || '구보공영(주)'} />
                  <InfoRow label="현장소장" value={siteInfo?.siteManager} />
                  <InfoRow label="현장공무" value={siteInfo?.siteOfficer} />
                  <InfoRow label="현장주소" value={siteInfo?.siteAddress} />
                  <InfoRow label="현장 사무실 연락처" value={siteInfo?.officePhone} />
                  <InfoRow label="안전관리자 연락처" value={siteInfo?.safetyManagerPhone} />
                  <InfoRow label="현재 인원" value={siteInfo?.workerCount ? `${siteInfo.workerCount}명` : ''} />
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

                {/* ---------- 관리자(안전인력) ---------- */}
                <div className="sd-staff-section">
                  <div className="sd-staff-head">
                    <div>
                      <h3>👷 관리자 (안전인력)</h3>
                      <p className="sd-staff-sub">
                        현장소장 · 안전보건관리책임자 · 안전관리자 · 관리감독자
                      </p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => openStaffAddFor('안전관리자')}>
                      ＋ 관리자 추가
                    </button>
                  </div>

                  {staffList.length === 0 ? (
                    <p className="sd-staff-empty">등록된 관리자 정보가 없습니다.</p>
                  ) : (
                    <div className="sd-staff-list">
                      {STAFF_ROLES.map(role => {
                        const members = staffList.filter(s => s.role === role);
                        const isSupervisor = role === '관리감독자';
                        return (
                          <div key={role} className="sd-staff-group">
                            <div className="sd-staff-group-head">
                              <span className="sd-staff-role">{role}</span>
                              <span className="sd-staff-count">{members.length}명</span>
                              <button
                                className="sd-staff-add-inline"
                                onClick={() => openStaffAddFor(role)}
                                title={`${role} 추가`}
                              >
                                ＋
                              </button>
                            </div>

                            {members.length === 0 ? (
                              <p className="sd-staff-none">미등록</p>
                            ) : (
                              members.map(staff => (
                                <div key={staff.id} className="sd-staff-row">
                                  <div className="sd-staff-main">
                                    <span className="sd-staff-name">{staff.name || '성명 미입력'}</span>
                                    {staff.phone && (
                                      <span className="sd-staff-phone">☎ {staff.phone}</span>
                                    )}
                                    {isSupervisor && (
                                      <span
                                        className={`sd-staff-badge ${
                                          staff.newTraining8h ? 'on' : 'off'
                                        }`}
                                      >
                                        신규교육 8시간 {staff.newTraining8h ? 'O' : 'X'}
                                      </span>
                                    )}
                                  </div>

                                  <div className="sd-staff-dates">
                                    <span className="sd-staff-date">
                                      {isSupervisor ? '지정일' : '선임일'}{' '}
                                      <strong>{staff.appointedAt || '-'}</strong>
                                    </span>
                                    <span className="sd-staff-date">
                                      해임일 <strong>{staff.dismissedAt || '-'}</strong>
                                    </span>
                                    <span className="sd-staff-date">
                                      직무교육 <strong>{staff.trainingDate || '-'}</strong>
                                    </span>
                                  </div>

                                  {staff.note && <p className="sd-staff-note">{staff.note}</p>}

                                  <div className="sd-staff-actions">
                                    <button
                                      className="sd-staff-btn"
                                      onClick={() => openStaffEdit(staff)}
                                    >
                                      수정
                                    </button>
                                    <button
                                      className="sd-staff-btn danger"
                                      onClick={() => deleteStaff(staff)}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                        placeholder="예: 경기도 용인시 처인구"
                      />
                    </FormField>
                    <FormField label="공사분류">
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
                    <FormField label="공사기간">
                      <input
                        type="text"
                        value={draft.contractPeriod}
                        onChange={e => setField('contractPeriod', e.target.value)}
                        placeholder="예: 2024-03 ~ 2027-02"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="계약금액">
                      <input
                        type="text"
                        value={draft.contractAmount}
                        onChange={e => setField('contractAmount', e.target.value)}
                        placeholder="예: 1,250억원"
                      />
                    </FormField>
                    <FormField label="착공일">
                      <input
                        type="date"
                        value={draft.startDate}
                        onChange={e => setField('startDate', e.target.value)}
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="실제착공일">
                      <input
                        type="date"
                        value={draft.actualStartDate}
                        onChange={e => setField('actualStartDate', e.target.value)}
                      />
                    </FormField>
                    <FormField label="발주처">
                      <input
                        type="text"
                        value={draft.clientName}
                        onChange={e => setField('clientName', e.target.value)}
                        placeholder="예: OO도시공사"
                      />
                    </FormField>
                  </div>

                  <div className="sd-form-row">
                    <FormField label="시행사">
                      <input
                        type="text"
                        value={draft.developerName}
                        onChange={e => setField('developerName', e.target.value)}
                        placeholder="예: OO개발(주)"
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
                    <FormField label="현장공무">
                      <input
                        type="text"
                        value={draft.siteOfficer}
                        onChange={e => setField('siteOfficer', e.target.value)}
                        placeholder="예: 이공무"
                      />
                    </FormField>
                  </div>

                  <FormField label="현장주소">
                    <input
                      type="text"
                      value={draft.siteAddress}
                      onChange={e => setField('siteAddress', e.target.value)}
                      placeholder="예: 경기도 용인시 처인구 OO로 123 (현장 출입구 기준)"
                    />
                  </FormField>

                  <div className="sd-form-row">
                    <FormField label="현장 사무실 연락처">
                      <input
                        type="tel"
                        value={draft.officePhone}
                        onChange={e => setField('officePhone', e.target.value)}
                        placeholder="예: 031-123-4567"
                      />
                    </FormField>
                    <FormField label="안전관리자 연락처">
                      <input
                        type="tel"
                        value={draft.safetyManagerPhone}
                        onChange={e => setField('safetyManagerPhone', e.target.value)}
                        placeholder="예: 010-1234-5678"
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

      {/* ============ 관리자(안전인력) 추가/수정 모달 ============ */}
      {staffEditorOpen && staffDraft && (
        <div className="sd-staff-modal-backdrop" onClick={cancelStaffEdit}>
          <div className="sd-staff-modal" onClick={e => e.stopPropagation()}>
            <div className="sd-staff-modal-head">
              <h3>{editingStaffId ? '관리자 정보 수정' : '관리자 추가'}</h3>
              <button className="sd-staff-modal-close" onClick={cancelStaffEdit} aria-label="닫기">
                ✕
              </button>
            </div>

            <div className="sd-staff-form">
              <div className="sd-form-row">
                <FormField label="구분">
                  <select
                    value={staffDraft.role}
                    onChange={e => setStaffField('role', e.target.value as StaffRole)}
                  >
                    {STAFF_ROLES.map(role => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="성명">
                  <input
                    type="text"
                    value={staffDraft.name}
                    onChange={e => setStaffField('name', e.target.value)}
                    placeholder="예: 홍길동"
                  />
                </FormField>
              </div>

              <FormField label="연락처">
                <input
                  type="tel"
                  value={staffDraft.phone ?? ''}
                  onChange={e => setStaffField('phone', e.target.value)}
                  placeholder="예: 010-1234-5678"
                />
              </FormField>

              <div className="sd-form-row">
                <FormField label={staffDraft.role === '관리감독자' ? '관리감독자 지정일' : '선임일'}>
                  <input
                    type="date"
                    value={staffDraft.appointedAt ?? ''}
                    onChange={e => setStaffField('appointedAt', e.target.value)}
                  />
                </FormField>
                <FormField label="해임일">
                  <input
                    type="date"
                    value={staffDraft.dismissedAt ?? ''}
                    onChange={e => setStaffField('dismissedAt', e.target.value)}
                  />
                </FormField>
              </div>

              <FormField label="직무교육 이수일">
                <input
                  type="date"
                  value={staffDraft.trainingDate ?? ''}
                  onChange={e => setStaffField('trainingDate', e.target.value)}
                />
              </FormField>

              {staffDraft.role === '관리감독자' && (
                <label className="sd-staff-check">
                  <input
                    type="checkbox"
                    checked={Boolean(staffDraft.newTraining8h)}
                    onChange={e => setStaffField('newTraining8h', e.target.checked)}
                  />
                  <span>관리감독자 신규교육(8시간) 이수</span>
                  <span
                    className={`sd-staff-badge ${staffDraft.newTraining8h ? 'on' : 'off'}`}
                  >
                    {staffDraft.newTraining8h ? 'O' : 'X'}
                  </span>
                </label>
              )}

              <FormField label="비고">
                <textarea
                  rows={2}
                  value={staffDraft.note ?? ''}
                  onChange={e => setStaffField('note', e.target.value)}
                  placeholder="선임 경위 등 참고사항"
                />
              </FormField>

              {staffError && <p className="sd-staff-error">{staffError}</p>}
            </div>

            <div className="sd-staff-modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={cancelStaffEdit}>
                취소
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveStaff}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
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
