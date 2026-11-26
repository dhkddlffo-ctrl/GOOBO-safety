import React, { useState, useEffect, useMemo } from 'react';
import {
  ContractAmount,
  ContractAttachment,
  Site,
  SiteInfo,
  SiteDocument,
  SiteStaff,
  StaffAttachment,
  StaffDocKind,
  StaffRole,
  STAFF_ROLES,
  STAFF_DOC_KINDS,
  staffDocLabel,
} from '../types';
import {
  getSites,
  getSuggestions,
  getWorkStops,
  getAccidentCases,
  formatDate,
} from '../utils/storage';
import {
  getSiteInfo,
  saveSiteInfo,
  createEmptySiteInfo,
  createEmptyStaff,
  generateStaffId,
  createContractAmount,
  nextContractLabel,
} from '../utils/siteInfoStorage';
import {
  CONTRACT_DOC_ACCEPT,
  createContractAttachment,
  deleteContractFile,
  downloadContractDoc,
  getContractFile,
  isContractDocImage,
  isContractDocPreviewable,
} from '../utils/contractDocsStorage';
import {
  STAFF_DOC_ACCEPT,
  createStaffAttachment,
  deleteStaffDocFile,
  downloadStaffDoc,
  formatStaffDocDate,
  formatStaffDocSize,
  getStaffDocFile,
  isStaffDocImage,
  isStaffDocPreviewable,
} from '../utils/staffDocsStorage';
import { getDocuments, formatFileSize, getTotalUsage } from '../utils/documentStorage';
import { isAuthenticated } from '../utils/auth';
import {
  evaluateStaff,
  isAppointmentMissing,
  isSupervisorTrainingMissing,
  summarizeSite,
} from '../utils/staffCompliance';
import { useCategories } from '../hooks/useCategories';
import { getCategoriesWithOrphans } from '../utils/categoryStorage';
import DocumentArchive from '../components/DocumentArchive';
import EmergencyPlan from '../components/EmergencyPlan';
import SafetyOrgChart from '../components/SafetyOrgChart';
import RiskAssessmentPane from '../components/RiskAssessmentPane';
import AccidentCasePane from '../components/AccidentCasePane';
import SiteSafetyPolicy from '../components/SiteSafetyPolicy';
import Icon from '../components/Icon';
import './SiteDetailPage.css';

interface SiteDetailPageProps {
  onNavigate: (page: string, siteId?: number, tab?: string) => void;
  siteId?: number;
  /** 해시(#/site/3/documents)로 진입할 때 열 탭 */
  initialTab?: string;
}

type Tab = 'info' | 'documents' | 'policy' | 'emergency' | 'org' | 'risk' | 'accident' | 'activity';

const isTab = (value?: string): value is Tab =>
  value === 'info' ||
  value === 'documents' ||
  value === 'policy' ||
  value === 'emergency' ||
  value === 'org' ||
  value === 'risk' ||
  value === 'accident' ||
  value === 'activity';

const SiteDetailPage: React.FC<SiteDetailPageProps> = ({ onNavigate, siteId, initialTab }) => {
  const [site, setSite] = useState<Site | null>(null);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [docs, setDocs] = useState<SiteDocument[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'info');
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
  /** 첨부자료 업로드 중인 종류 (버튼 로딩 표시) */
  const [staffUploading, setStaffUploading] = useState<StaffDocKind | ''>('');
  /** 첨부자료 미리보기 (이미지·PDF) */
  const [docPreview, setDocPreview] = useState<{
    attachment: StaffAttachment;
    url: string;
    ownerName: string;
  } | null>(null);

  /* ---------------- 계약서 첨부 상태 ---------------- */
  const [contractUploading, setContractUploading] = useState(false);
  const [contractError, setContractError] = useState('');
  const [contractPreview, setContractPreview] = useState<{
    attachment: ContractAttachment;
    url: string;
  } | null>(null);
  /** 편집 시작 시점의 계약서 목록 — 취소하면 이번에 올린 파일만 지웁니다. */
  const [contractBase, setContractBase] = useState<ContractAttachment[]>([]);

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
    [categories, docs],
  );

  /** 안전인력 직무교육·선임 상태 요약 (조기 return 이전에 훅 호출) */
  const staffSummary = useMemo(
    () => summarizeSite(siteId ?? 0, site?.name ?? '', siteInfo?.staff ?? []),
    [siteId, site?.name, siteInfo?.staff],
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
    const base = siteInfo ? { ...siteInfo } : createEmptySiteInfo(site.id, site.name);
    setDraft(base);
    /* 취소 시 '이번에 올린 계약서'만 지우기 위해 시작 시점 목록을 기억합니다. */
    setContractBase(base.contractFiles ?? []);
    setContractError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    /* 저장하지 않고 취소하면, 이번에 새로 올린 계약서 파일은 IndexedDB 에서 정리합니다. */
    const kept = new Set(contractBase.map(a => a.storageKey));
    (draft?.contractFiles ?? [])
      .filter(a => !kept.has(a.storageKey))
      .forEach(a => void deleteContractFile(a.storageKey).catch(() => undefined));

    setDraft(siteInfo);
    setContractBase([]);
    setContractError('');
    setEditing(false);
  };

  const saveEdit = () => {
    if (!draft) return;
    /* 저장하지 않은 빈 계약금액 행은 버리고 저장합니다. */
    const amounts = (draft.contractAmounts ?? []).filter(a => a.label.trim() || a.amount.trim());
    saveSiteInfo({
      ...draft,
      siteId: site.id,
      siteName: site.name,
      contractAmounts: amounts.length > 0 ? amounts : [createContractAmount('최초')],
    });
    const updated = getSiteInfo(site.id, site.name);
    setSiteInfo(updated);
    setDraft(updated);
    setContractBase([]);
    setContractError('');
    setEditing(false);
  };

  const setField = <K extends keyof SiteInfo>(key: K, value: SiteInfo[K]) => {
    setDraft(d => (d ? { ...d, [key]: value } : d));
  };

  /* ---------------- 계약금액 (최초 · 변경1 · 변경2 …) ---------------- */
  const setContractAmounts = (next: ContractAmount[]) => setField('contractAmounts', next);

  const addContractAmount = () => {
    setDraft(d => {
      if (!d) return d;
      const list = d.contractAmounts ?? [];
      return {
        ...d,
        contractAmounts: [...list, createContractAmount(nextContractLabel(list))],
      };
    });
  };

  const updateContractAmount = (id: string, patch: Partial<ContractAmount>) => {
    setDraft(d =>
      d
        ? {
            ...d,
            contractAmounts: (d.contractAmounts ?? []).map(a =>
              a.id === id ? { ...a, ...patch } : a,
            ),
          }
        : d,
    );
  };

  const removeContractAmount = (id: string) => {
    setContractAmounts((draft?.contractAmounts ?? []).filter(a => a.id !== id));
  };

  /* ---------------- 계약서 첨부 ---------------- */
  const handleContractUpload = async (fileList: FileList | null): Promise<void> => {
    const file = fileList && fileList[0];
    if (!file) return;

    setContractUploading(true);
    setContractError('');
    try {
      const attachment = await createContractAttachment(file, '현장정보');
      setDraft(d => (d ? { ...d, contractFiles: [...(d.contractFiles ?? []), attachment] } : d));
    } catch (error) {
      setContractError(error instanceof Error ? error.message : '계약서를 올리지 못했습니다.');
    } finally {
      setContractUploading(false);
    }
  };

  const removeContractDoc = (attachment: ContractAttachment) => {
    if (!confirm(`"${attachment.fileName}" 계약서를 빼시겠습니까?`)) return;
    /* 빼기로 했으니 파일 본문도 바로 정리합니다. (저장 전 이탈해도 남지 않도록) */
    void deleteContractFile(attachment.storageKey).catch(() => undefined);
    setDraft(d =>
      d
        ? {
            ...d,
            contractFiles: (d.contractFiles ?? []).filter(a => a.id !== attachment.id),
          }
        : d,
    );
  };

  const openContractPreview = async (attachment: ContractAttachment) => {
    try {
      const blob = await getContractFile(attachment.storageKey);
      if (!blob) return alert('계약서 파일을 찾을 수 없습니다.');
      const url = URL.createObjectURL(blob);
      setContractPreview(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { attachment, url };
      });
    } catch {
      alert('계약서를 열지 못했습니다.');
    }
  };

  const closeContractPreview = () => {
    setContractPreview(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleContractDownload = async (attachment: ContractAttachment) => {
    try {
      await downloadContractDoc(attachment);
    } catch {
      alert('계약서를 내려받지 못했습니다.');
    }
  };

  /* ---------------- 관리자(안전인력) 관리 ---------------- */
  const staffList: SiteStaff[] = siteInfo?.staff ?? [];

  /* 관리자(안전인력)에 입력한 내용을 현장 기본정보에 그대로 보여주기 위한 파생값.
     → 담당자 정보는 '관리자' 한 곳에서만 입력합니다. */
  const staffDisplay = (role: StaffRole): string =>
    staffList
      .filter(s => s.role === role && (s.name.trim() || (s.phone ?? '').trim()))
      .map(s => {
        const name = s.name.trim();
        const phone = (s.phone ?? '').trim();
        if (name && phone) return `${name} (${phone})`;
        return name || phone;
      })
      .join(', ');

  /** 현장소장 성명 (경영방침·안전조직도 서명 기본값) */
  const siteManagerName =
    staffList.find(s => s.role === '현장소장' && s.name.trim())?.name.trim() ?? '';

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
    /* 함께 보관하던 지정서·교육이수증 파일도 정리합니다. */
    void deleteAttachments(staff.attachments ?? []);
    persistStaff(staffList.filter(s => s.id !== staff.id));
  };

  /* ---------------- 첨부자료 (지정서 · 교육이수증) ---------------- */

  /** 관리자 1명의 첨부자료 배열 (없으면 빈 배열) */
  const attachmentsOf = (staff: SiteStaff | null): StaffAttachment[] =>
    staff && Array.isArray(staff.attachments) ? staff.attachments : [];

  /** IndexedDB 에서 파일 본문 삭제 (실패해도 화면은 계속 진행) */
  const deleteAttachments = async (attachments: StaffAttachment[]): Promise<void> => {
    await Promise.all(
      attachments.map(a => deleteStaffDocFile(a.storageKey).catch(() => undefined)),
    );
  };

  /** 모달에서 첨부자료 올리기 — 저장 전까지는 staffDraft 에만 담아 둡니다. */
  const handleStaffDocUpload = async (
    kind: StaffDocKind,
    fileList: FileList | null,
  ): Promise<void> => {
    const file = fileList && fileList[0];
    if (!file) return;

    setStaffUploading(kind);
    setStaffError('');
    try {
      const attachment = await createStaffAttachment(file, kind, staffDraft?.name || '');
      setStaffDraft(s => (s ? { ...s, attachments: [...attachmentsOf(s), attachment] } : s));
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : '첨부자료를 올리지 못했습니다.');
    } finally {
      setStaffUploading('');
    }
  };

  /** 모달에서 첨부자료 빼기 (저장을 눌러야 실제 파일이 지워집니다) */
  const removeStaffDoc = (attachment: StaffAttachment) => {
    if (!confirm(`"${attachment.fileName}" 첨부자료를 빼시겠습니까?`)) return;
    setStaffDraft(s =>
      s ? { ...s, attachments: attachmentsOf(s).filter(a => a.id !== attachment.id) } : s,
    );
  };

  /** 첨부자료 미리보기 (이미지 · PDF) */
  const openDocPreview = async (attachment: StaffAttachment, ownerName: string) => {
    try {
      const blob = await getStaffDocFile(attachment.storageKey);
      if (!blob) return alert('첨부파일을 찾을 수 없습니다.');
      const url = URL.createObjectURL(blob);
      setDocPreview(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { attachment, url, ownerName };
      });
    } catch {
      alert('첨부파일을 열지 못했습니다.');
    }
  };

  const closeDocPreview = () => {
    setDocPreview(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleDocDownload = async (attachment: StaffAttachment) => {
    try {
      await downloadStaffDoc(attachment);
    } catch {
      alert('첨부파일을 내려받지 못했습니다.');
    }
  };

  const docCountByCategory = (key: string) => docs.filter(d => d.category === key).length;

  /** 탭 변경 시 해시도 함께 갱신 (#/site/3/documents 로 공유·북마크 가능) */
  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    onNavigate('site-detail', site.id, tab);
  };

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
            <p className="sd-location">
              <Icon name="pin" size={14} />
              {site.location}
            </p>
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
              <span className="sd-hstat-value">{siteInfo?.contractFiles?.length ?? 0}</span>
              <span className="sd-hstat-label">계약서</span>
            </div>
          </div>
        </div>

        {/* ---------- 현장 바로가기 (홈 카드에서 이관) ----------
            홈 현장 목록은 행 전체 클릭으로 상세 이동만 하고,
            건의사항·작업중지·사고사례 같은 행동은 이 화면에서 고르도록 모았습니다. */}
        <div className="sd-quick">
          <button
            type="button"
            className="sd-quick-btn is-blue"
            onClick={() => onNavigate('suggestion', site.id)}
          >
            <span className="sd-quick-icon">
              <Icon name="bulb" size={17} />
            </span>
            <span className="sd-quick-body">
              <strong>건의사항</strong>
              <span>현장 개선사항 제안</span>
            </span>
            <span className="sd-quick-count">{activity.suggestions}</span>
          </button>

          <button
            type="button"
            className="sd-quick-btn is-red"
            onClick={() => onNavigate('work-stop', site.id)}
          >
            <span className="sd-quick-icon">
              <Icon name="shield" size={17} />
            </span>
            <span className="sd-quick-body">
              <strong>작업중지</strong>
              <span>급박한 위험 신고</span>
            </span>
            <span className="sd-quick-count">{activity.workStops}</span>
          </button>

          <button
            type="button"
            className="sd-quick-btn is-amber"
            onClick={() => changeTab('accident')}
          >
            <span className="sd-quick-icon">
              <Icon name="alert" size={17} />
            </span>
            <span className="sd-quick-body">
              <strong>사고사례</strong>
              <span>게시판·사고보고서</span>
            </span>
            <span className="sd-quick-count">{activity.accidents}</span>
          </button>
        </div>

        {/* 탭 */}
        <div className="sd-tabs">
          <button
            className={`sd-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => changeTab('info')}
          >
            <Icon name="building" size={15} />
            현장정보
          </button>
          <button
            className={`sd-tab ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => changeTab('documents')}
          >
            <Icon name="folder" size={15} />
            문서보관함 <span className="sd-tab-count">{docs.length}</span>
          </button>
          <button
            className={`sd-tab ${activeTab === 'policy' ? 'active' : ''}`}
            onClick={() => changeTab('policy')}
          >
            <Icon name="check" size={15} />
            경영방침
          </button>
          <button
            className={`sd-tab ${activeTab === 'emergency' ? 'active' : ''}`}
            onClick={() => changeTab('emergency')}
          >
            <Icon name="phone" size={15} />
            비상연락망
          </button>
          <button
            className={`sd-tab ${activeTab === 'org' ? 'active' : ''}`}
            onClick={() => changeTab('org')}
          >
            <Icon name="users" size={15} />
            안전조직도
          </button>
          <button
            className={`sd-tab ${activeTab === 'risk' ? 'active' : ''}`}
            onClick={() => changeTab('risk')}
          >
            <Icon name="alert" size={15} />
            위험성평가
          </button>
          <button
            className={`sd-tab ${activeTab === 'accident' ? 'active' : ''}`}
            onClick={() => changeTab('accident')}
          >
            <Icon name="message" size={15} />
            사고사례 <span className="sd-tab-count">{activity.accidents}</span>
          </button>
          <button
            className={`sd-tab ${activeTab === 'activity' ? 'active' : ''}`}
            onClick={() => changeTab('activity')}
          >
            <Icon name="shield" size={15} />
            안전활동
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
                  <InfoRow label="사업자 개시번호" value={siteInfo?.businessNumber} />
                  <InfoRow label="소재지" value={siteInfo?.address} />
                  <InfoRow label="공사분류" value={siteInfo?.constructionType} />
                  <InfoRow label="규모" value={siteInfo?.scale} />
                  <InfoRow label="공사기간" value={siteInfo?.contractPeriod} />
                  <InfoRow label="착공일" value={siteInfo?.startDate} />
                  <InfoRow label="준공일" value={siteInfo?.completionDate} />
                  <InfoRow label="실제착공일" value={siteInfo?.actualStartDate} />
                  <InfoRow label="발주처" value={siteInfo?.clientName} />
                  <InfoRow label="시공사" value={siteInfo?.contractorName || '구보공영(주)'} />
                  <InfoRow label="현장주소" value={siteInfo?.siteAddress} />
                </div>

                {/* ---------- 계약금액 (최초 · 변경1 · 변경2 …) ---------- */}
                {(() => {
                  const amounts = siteInfo?.contractAmounts ?? [];
                  return (
                    <div className="sd-amounts">
                      <div className="sd-amounts-head">
                        <strong>계약금액</strong>
                        <span className="sd-amounts-sub">
                          변경계약이 있으면 항목을 나누어 관리합니다.
                        </span>
                      </div>
                      {amounts.length === 0 ? (
                        <p className="sd-amounts-empty">등록된 계약금액이 없습니다.</p>
                      ) : (
                        <ul className="sd-amounts-list">
                          {amounts.map(a => (
                            <li key={a.id} className="sd-amounts-item">
                              <span className="sd-amounts-label">{a.label || '계약금액'}</span>
                              <span className={`sd-amounts-value ${!a.amount ? 'empty' : ''}`}>
                                {a.amount || '미입력'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()}

                {/* ---------- 계약서 첨부 ---------- */}
                <div className="sd-contracts">
                  <div className="sd-amounts-head">
                    <strong>계약서</strong>
                    <span className="sd-amounts-sub">
                      계약서 사본을 올려두면 언제든 다시 확인할 수 있습니다.
                    </span>
                  </div>
                  {(siteInfo?.contractFiles ?? []).length === 0 ? (
                    <p className="sd-amounts-empty">첨부된 계약서가 없습니다.</p>
                  ) : (
                    <ul className="sd-doc-list">
                      {(siteInfo?.contractFiles ?? []).map(a => (
                        <li key={a.id} className="sd-doc-item">
                          <span className="sd-doc-icon">
                            {isContractDocImage(a.fileName)
                              ? '🖼️'
                              : a.fileName.toLowerCase().endsWith('.pdf')
                                ? '📕'
                                : '📄'}
                          </span>
                          <span className="sd-doc-info">
                            <span className="sd-doc-name" title={a.fileName}>
                              {a.fileName}
                            </span>
                            <span className="sd-doc-meta">
                              {formatStaffDocSize(a.fileSize)}
                              {a.uploadedAt && ` · ${formatStaffDocDate(a.uploadedAt)}`}
                            </span>
                          </span>
                          <span className="sd-doc-actions">
                            {isContractDocPreviewable(a.fileName) && (
                              <button
                                type="button"
                                className="sd-doc-btn"
                                onClick={() => void openContractPreview(a)}
                              >
                                보기
                              </button>
                            )}
                            <button
                              type="button"
                              className="sd-doc-btn"
                              onClick={() => void handleContractDownload(a)}
                            >
                              내려받기
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ---------- 담당자 (관리자 · 안전인력에서 자동 반영) ---------- */}
                <div className="sd-info-grid sd-contact-grid">
                  <InfoRow label="현장소장" value={staffDisplay('현장소장')} />
                  <InfoRow label="안전보건관리책임자" value={staffDisplay('안전보건관리책임자')} />
                  <InfoRow label="안전관리자" value={staffDisplay('안전관리자')} />
                  <InfoRow label="관리감독자" value={staffDisplay('관리감독자')} />
                </div>
                <p className="sd-contact-hint">
                  담당자 정보는 아래 <b>관리자 (안전인력)</b>에 입력한 내용이 그대로 표시됩니다.
                </p>

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
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => openStaffAddFor('안전관리자')}
                    >
                      ＋ 관리자 추가
                    </button>
                  </div>

                  {/* 직무교육 유효기간 요약 — 문제가 있을 때만 노출 */}
                  {staffSummary.issues > 0 && (
                    <div className="sd-dd-summary">
                      <span className="sd-dd-summary-icon">⏰</span>
                      <div className="sd-dd-summary-body">
                        <strong>직무교육 점검이 필요한 인력 {staffSummary.issues}명</strong>
                        <span className="sd-dd-summary-detail">
                          {staffSummary.expired > 0 && `만료 ${staffSummary.expired}명`}
                          {staffSummary.expired > 0 &&
                            (staffSummary.soon > 0 || staffSummary.missing > 0) &&
                            ' · '}
                          {staffSummary.soon > 0 && `만료임박 ${staffSummary.soon}명`}
                          {staffSummary.soon > 0 && staffSummary.missing > 0 && ' · '}
                          {staffSummary.missing > 0 && `미입력 ${staffSummary.missing}명`}
                        </span>
                      </div>
                    </div>
                  )}

                  {(staffSummary.appointmentMissing > 0 || staffSummary.supervisorMissing > 0) && (
                    <div className="sd-dd-summary is-warn">
                      <span className="sd-dd-summary-icon">📋</span>
                      <div className="sd-dd-summary-body">
                        <strong>서류 보완이 필요합니다</strong>
                        <span className="sd-dd-summary-detail">
                          {staffSummary.appointmentMissing > 0 &&
                            `선임일 미입력 ${staffSummary.appointmentMissing}명`}
                          {staffSummary.appointmentMissing > 0 &&
                            staffSummary.supervisorMissing > 0 &&
                            ' · '}
                          {staffSummary.supervisorMissing > 0 &&
                            `관리감독자 신규교육 미이수 ${staffSummary.supervisorMissing}명`}
                        </span>
                      </div>
                    </div>
                  )}

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
                              members.map(staff => {
                                const dc = evaluateStaff(staff);
                                const apptMissing = isAppointmentMissing(staff);
                                const supMissing = isSupervisorTrainingMissing(staff);
                                return (
                                  <div key={staff.id} className={`sd-staff-row is-${dc.level}`}>
                                    <div className="sd-staff-main">
                                      <span className="sd-staff-name">
                                        {staff.name || '성명 미입력'}
                                      </span>
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
                                      {/* 직무교육 유효기간 D-day — 직무교육 대상자에게만 표시 */}
                                      {dc.level !== 'none' && (
                                        <span
                                          className={`sd-dd sd-dd-${dc.level}`}
                                          title={dc.message}
                                        >
                                          {dc.label === '해임' ? '해임' : `교육 ${dc.label}`}
                                        </span>
                                      )}
                                      {apptMissing && (
                                        <span
                                          className="sd-dd sd-dd-missing"
                                          title="선임일(지정일)이 입력되지 않았습니다."
                                        >
                                          선임일 미입력
                                        </span>
                                      )}
                                      {supMissing && (
                                        <span
                                          className="sd-dd sd-dd-expired"
                                          title="관리감독자 신규교육(8시간) 미이수"
                                        >
                                          신규교육 미이수
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
                                      {/* 관리감독자는 직무교육 대상이 아니므로 표시하지 않습니다 */}
                                      {!isSupervisor && (
                                        <span className="sd-staff-date">
                                          직무교육 <strong>{staff.trainingDate || '-'}</strong>
                                        </span>
                                      )}
                                    </div>

                                    {staff.note && <p className="sd-staff-note">{staff.note}</p>}

                                    {/* 증빙자료 (지정서 · 교육이수증) */}
                                    {(() => {
                                      const docs = staff.attachments ?? [];
                                      if (docs.length === 0) return null;
                                      return (
                                        <div className="sd-staff-docs">
                                          <span className="sd-staff-docs-label">📎 증빙자료</span>
                                          {docs.map(a => (
                                            <span key={a.id} className="sd-staff-doc-chip">
                                              {staffDocLabel(staff.role, a.kind)}
                                              <button
                                                type="button"
                                                className="sd-staff-doc-open"
                                                onClick={() => void openDocPreview(a, staff.name)}
                                                title={`${a.fileName} 보기`}
                                              >
                                                보기
                                              </button>
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    })()}

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
                                );
                              })
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
                  <FormField label="사업자 개시번호">
                    <input
                      type="text"
                      value={draft.businessNumber}
                      onChange={e => setField('businessNumber', e.target.value)}
                      placeholder="예: 123-45-67890"
                      inputMode="numeric"
                    />
                  </FormField>

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
                    <FormField label="착공일">
                      <input
                        type="date"
                        value={draft.startDate}
                        onChange={e => setField('startDate', e.target.value)}
                      />
                    </FormField>
                    <FormField label="준공일">
                      <input
                        type="date"
                        value={draft.completionDate}
                        onChange={e => setField('completionDate', e.target.value)}
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

                  <FormField label="시공사">
                    <input
                      type="text"
                      value={draft.contractorName}
                      onChange={e => setField('contractorName', e.target.value)}
                      placeholder="예: 구보공영(주)"
                    />
                  </FormField>

                  <FormField label="현장주소">
                    <input
                      type="text"
                      value={draft.siteAddress}
                      onChange={e => setField('siteAddress', e.target.value)}
                      placeholder="예: 경기도 용인시 처인구 OO로 123 (현장 출입구 기준)"
                    />
                  </FormField>

                  {/* ---------- 계약금액 (최초 · 변경1 · 변경2 …) ---------- */}
                  <div className="sd-field">
                    <label>계약금액</label>
                    <p className="sd-field-hint">
                      변경계약이 있으면 항목을 추가해 나누어 기록합니다. (예: 최초, 변경1, 변경2)
                    </p>
                    <div className="sd-amount-editor">
                      {(draft.contractAmounts ?? []).length === 0 && (
                        <p className="sd-amount-editor-empty">등록된 계약금액이 없습니다.</p>
                      )}
                      {(draft.contractAmounts ?? []).map((a, index) => (
                        <div key={a.id} className="sd-amount-editor-row">
                          <input
                            type="text"
                            className="sd-amount-editor-label"
                            value={a.label}
                            onChange={e => updateContractAmount(a.id, { label: e.target.value })}
                            placeholder={`예: ${index === 0 ? '최초' : `변경${index}`}`}
                            aria-label="항목명"
                          />
                          <input
                            type="text"
                            className="sd-amount-editor-value"
                            value={a.amount}
                            onChange={e => updateContractAmount(a.id, { amount: e.target.value })}
                            placeholder="예: 1,250억원"
                            aria-label="금액"
                          />
                          <button
                            type="button"
                            className="sd-amount-editor-del"
                            onClick={() => removeContractAmount(a.id)}
                            title="이 항목 삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="sd-amount-editor-add"
                        onClick={addContractAmount}
                      >
                        ＋ 계약금액 항목 추가
                      </button>
                    </div>
                  </div>

                  {/* ---------- 계약서 첨부 ---------- */}
                  <div className="sd-field">
                    <label>계약서 첨부</label>
                    <p className="sd-field-hint">
                      계약서 사본(PDF · 이미지 · 한글 · 워드)을 올려둘 수 있습니다. (1건당 50MB)
                    </p>
                    <div className="sd-contract-editor">
                      {(draft.contractFiles ?? []).length === 0 ? (
                        <p className="sd-doc-empty">아직 올린 계약서가 없습니다.</p>
                      ) : (
                        <ul className="sd-doc-list">
                          {(draft.contractFiles ?? []).map(a => (
                            <li key={a.id} className="sd-doc-item">
                              <span className="sd-doc-icon">
                                {isContractDocImage(a.fileName)
                                  ? '🖼️'
                                  : a.fileName.toLowerCase().endsWith('.pdf')
                                    ? '📕'
                                    : '📄'}
                              </span>
                              <span className="sd-doc-info">
                                <span className="sd-doc-name" title={a.fileName}>
                                  {a.fileName}
                                </span>
                                <span className="sd-doc-meta">
                                  {formatStaffDocSize(a.fileSize)}
                                  {a.uploadedAt && ` · ${formatStaffDocDate(a.uploadedAt)}`}
                                </span>
                              </span>
                              <span className="sd-doc-actions">
                                {isContractDocPreviewable(a.fileName) && (
                                  <button
                                    type="button"
                                    className="sd-doc-btn"
                                    onClick={() => void openContractPreview(a)}
                                  >
                                    보기
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="sd-doc-btn danger"
                                  onClick={() => removeContractDoc(a)}
                                >
                                  빼기
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <label className={`sd-doc-add ${contractUploading ? 'is-busy' : ''}`}>
                        {contractUploading ? '올리는 중…' : '＋ 계약서 올리기'}
                        <input
                          type="file"
                          accept={CONTRACT_DOC_ACCEPT}
                          disabled={contractUploading}
                          onChange={e => {
                            void handleContractUpload(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {contractError && <p className="sd-staff-error">{contractError}</p>}
                    </div>
                  </div>

                  <div className="sd-manager-hint">
                    현장소장 · 안전보건관리책임자 · 안전관리자 · 관리감독자 정보는 아래{' '}
                    <b>관리자 (안전인력)</b>에서 입력합니다. 입력한 내용은 현장 기본정보에 자동으로
                    표시됩니다.
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

        {/* ============ 경영방침 탭 ============ */}
        {activeTab === 'policy' && (
          <div className="sd-panel sd-panel-policy">
            <div className="sd-panel-head">
              <div>
                <h2>현장소장 안전보건 경영방침</h2>
                <p className="sd-panel-sub">
                  경영방침 · 세부추진계획표 · 성과평가표를 회사 서식 그대로 작성합니다. 작성을
                  마치면 게시글로 등록되어 게시판에서 다시 열어 보고 A4 · A3로 인쇄할 수 있습니다.
                </p>
              </div>
            </div>

            <SiteSafetyPolicy siteId={site.id} siteName={site.name} siteManager={siteManagerName} />
          </div>
        )}

        {/* ============ 비상연락망 탭 ============ */}
        {activeTab === 'emergency' && (
          <div className="sd-panel sd-panel-emergency">
            <div className="sd-panel-head">
              <div>
                <h2>🚨 비상연락망 게시판</h2>
                <p className="sd-panel-sub">
                  입력한 내용을 A4로 출력해 사무실·탈의실 게시판에 부착할 수 있습니다.
                </p>
              </div>
            </div>

            <EmergencyPlan
              siteId={site.id}
              siteName={site.name}
              siteAddress={siteInfo?.siteAddress || siteInfo?.address || site.location}
            />
          </div>
        )}

        {/* ============ 안전조직도 탭 ============ */}
        {activeTab === 'org' && (
          <div className="sd-panel sd-panel-org">
            <div className="sd-panel-head">
              <div>
                <h2>🏛️ 안전 조직도 및 업무분장</h2>
                <p className="sd-panel-sub">
                  현장별 안전보건 조직 계층과 직책별 담당업무를 작성해 A4 1페이지로 출력할 수
                  있습니다.
                </p>
              </div>
            </div>

            <SafetyOrgChart siteId={site.id} siteName={site.name} siteManager={siteManagerName} />
          </div>
        )}

        {/* ============ 위험성평가 탭 ============ */}
        {activeTab === 'risk' && (
          <div className="sd-panel sd-panel-risk">
            <div className="sd-panel-head">
              <div>
                <h2>⚠️ 수시 위험성평가 등록부</h2>
                <p className="sd-panel-sub">
                  현장별로 <b>2주에 1회</b> 작성하는 수시 위험성평가를 게시판으로 관리합니다. 회사
                  양식(SCM-002-1.01) 그대로 작성하고 A4 가로로 인쇄할 수 있으며, 강도·빈도를 고르면
                  평가합계와 등급이 자동 계산됩니다.
                </p>
              </div>
            </div>

            <RiskAssessmentPane siteId={site.id} siteName={site.name} />
          </div>
        )}

        {/* ============ 사고사례 탭 ============ */}
        {activeTab === 'accident' && (
          <div className="sd-panel sd-panel-accident">
            <div className="sd-panel-head">
              <div>
                <h2>⚠️ 현장 사고사례 게시판</h2>
                <p className="sd-panel-sub">
                  이 현장에서 발생한 사고사례를 게시판으로 관리합니다. 관리자 로그인 후{' '}
                  <b>✍️ 사고사례 작성</b>으로 등록하고, 등록된 사례는 회사 서식 사고보고서(A4)로
                  바로 인쇄할 수 있습니다.
                </p>
              </div>
            </div>

            <AccidentCasePane
              siteId={site.id}
              siteName={site.name}
              onChanged={() =>
                setActivity(prev => ({
                  ...prev,
                  accidents: getAccidentCases().filter(a => a.siteId === site.id).length,
                }))
              }
            />
          </div>
        )}

        {/* ============ 안전활동 탭 ============ */}
        {activeTab === 'activity' && (
          <div className="sd-panel">
            <div className="sd-panel-head">
              <h2>현장 안전활동 현황</h2>
            </div>

            <div className="sd-activity-grid">
              <button
                className="sd-activity-card"
                onClick={() => onNavigate('suggestion', site.id)}
              >
                <span className="sd-activity-icon">💡</span>
                <span className="sd-activity-value">{activity.suggestions}</span>
                <span className="sd-activity-label">건의사항</span>
              </button>

              <button className="sd-activity-card" onClick={() => onNavigate('work-stop', site.id)}>
                <span className="sd-activity-icon">🛑</span>
                <span className="sd-activity-value">{activity.workStops}</span>
                <span className="sd-activity-label">작업중지권 요청</span>
              </button>

              <button className="sd-activity-card" onClick={() => changeTab('accident')}>
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
              <button className="sd-link-btn" onClick={() => changeTab('accident')}>
                ⚠️ 이 현장 사고사례 게시판 →
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
                <FormField
                  label={staffDraft.role === '관리감독자' ? '관리감독자 지정일' : '선임일'}
                >
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

              {/* 관리감독자는 직무교육 대상이 아니므로 입력받지 않습니다 */}
              {staffDraft.role !== '관리감독자' && (
                <FormField label="직무교육 이수일">
                  <input
                    type="date"
                    value={staffDraft.trainingDate ?? ''}
                    onChange={e => setStaffField('trainingDate', e.target.value)}
                  />
                </FormField>
              )}

              {staffDraft.role === '관리감독자' && (
                <label className="sd-staff-check">
                  <input
                    type="checkbox"
                    checked={Boolean(staffDraft.newTraining8h)}
                    onChange={e => setStaffField('newTraining8h', e.target.checked)}
                  />
                  <span>관리감독자 신규교육(8시간) 이수</span>
                  <span className={`sd-staff-badge ${staffDraft.newTraining8h ? 'on' : 'off'}`}>
                    {staffDraft.newTraining8h ? 'O' : 'X'}
                  </span>
                </label>
              )}

              {/* ---------- 증빙자료 (지정서 · 교육이수증) ---------- */}
              <div className="sd-doc-block">
                <div className="sd-doc-block-head">
                  <strong>📎 증빙자료</strong>
                  <span className="sd-doc-block-sub">
                    {staffDraft.role === '관리감독자'
                      ? '관리감독자 지정서와 신규교육이수증을 올려두면 서류 점검 때 바로 확인할 수 있습니다.'
                      : '지정서 · 교육이수증을 올려두면 서류 점검 때 바로 확인할 수 있습니다.'}{' '}
                    (1건당 20MB)
                  </span>
                </div>

                {STAFF_DOC_KINDS.map(kind => {
                  const label = staffDocLabel(staffDraft.role, kind);
                  const items = attachmentsOf(staffDraft).filter(a => a.kind === kind);
                  const busy = staffUploading === kind;
                  return (
                    <div key={kind} className="sd-doc-kind">
                      <div className="sd-doc-kind-head">
                        <span className="sd-doc-kind-name">
                          {label}
                          <span className={`sd-doc-count ${items.length > 0 ? 'on' : ''}`}>
                            {items.length}
                          </span>
                        </span>
                        <label className={`sd-doc-add ${busy ? 'is-busy' : ''}`}>
                          {busy ? '올리는 중…' : '＋ 파일 올리기'}
                          <input
                            type="file"
                            accept={STAFF_DOC_ACCEPT}
                            disabled={busy}
                            onChange={e => {
                              void handleStaffDocUpload(kind, e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>

                      {items.length === 0 ? (
                        <p className="sd-doc-empty">아직 올린 자료가 없습니다.</p>
                      ) : (
                        <ul className="sd-doc-list">
                          {items.map(a => (
                            <li key={a.id} className="sd-doc-item">
                              <span className="sd-doc-icon">
                                {isStaffDocImage(a.fileName)
                                  ? '🖼️'
                                  : a.fileName.toLowerCase().endsWith('.pdf')
                                    ? '📕'
                                    : '📄'}
                              </span>
                              <span className="sd-doc-info">
                                <span className="sd-doc-name" title={a.fileName}>
                                  {a.fileName}
                                </span>
                                <span className="sd-doc-meta">
                                  {formatStaffDocSize(a.fileSize)}
                                  {a.uploadedAt && ` · ${formatStaffDocDate(a.uploadedAt)}`}
                                </span>
                              </span>
                              <span className="sd-doc-actions">
                                {isStaffDocPreviewable(a.fileName) && (
                                  <button
                                    type="button"
                                    className="sd-doc-btn"
                                    onClick={() => void openDocPreview(a, staffDraft.name)}
                                  >
                                    보기
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="sd-doc-btn"
                                  onClick={() => void handleDocDownload(a)}
                                >
                                  내려받기
                                </button>
                                <button
                                  type="button"
                                  className="sd-doc-btn danger"
                                  onClick={() => removeStaffDoc(a)}
                                >
                                  빼기
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

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

      {/* ============ 증빙자료 미리보기 (이미지 · PDF) ============ */}
      {docPreview && (
        <div className="sd-doc-preview-backdrop" onClick={closeDocPreview}>
          <div
            className="sd-doc-preview"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="증빙자료 미리보기"
          >
            <div className="sd-doc-preview-head">
              <div className="sd-doc-preview-title">
                <span className="sd-doc-preview-kind">{docPreview.attachment.kind}</span>
                <strong>{docPreview.attachment.fileName}</strong>
                <span className="sd-doc-preview-owner">
                  {docPreview.ownerName} · {formatStaffDocSize(docPreview.attachment.fileSize)}
                </span>
              </div>
              <div className="sd-doc-preview-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleDocDownload(docPreview.attachment)}
                >
                  ⬇️ 내려받기
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={closeDocPreview}>
                  닫기
                </button>
              </div>
            </div>

            <div className="sd-doc-preview-body">
              {isStaffDocImage(docPreview.attachment.fileName) ? (
                <img
                  src={docPreview.url}
                  alt={docPreview.attachment.fileName}
                  className="sd-doc-preview-img"
                />
              ) : (
                <iframe
                  src={docPreview.url}
                  title={docPreview.attachment.fileName}
                  className="sd-doc-preview-pdf"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ 계약서 미리보기 (이미지 · PDF) ============ */}
      {contractPreview && (
        <div className="sd-doc-preview-backdrop" onClick={closeContractPreview}>
          <div
            className="sd-doc-preview"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="계약서 미리보기"
          >
            <div className="sd-doc-preview-head">
              <div className="sd-doc-preview-title">
                <span className="sd-doc-preview-kind">계약서</span>
                <strong>{contractPreview.attachment.fileName}</strong>
                <span className="sd-doc-preview-owner">
                  {formatStaffDocSize(contractPreview.attachment.fileSize)}
                </span>
              </div>
              <div className="sd-doc-preview-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleContractDownload(contractPreview.attachment)}
                >
                  ⬇️ 내려받기
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={closeContractPreview}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="sd-doc-preview-body">
              {isContractDocImage(contractPreview.attachment.fileName) ? (
                <img
                  src={contractPreview.url}
                  alt={contractPreview.attachment.fileName}
                  className="sd-doc-preview-img"
                />
              ) : (
                <iframe
                  src={contractPreview.url}
                  title={contractPreview.attachment.fileName}
                  className="sd-doc-preview-pdf"
                />
              )}
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
