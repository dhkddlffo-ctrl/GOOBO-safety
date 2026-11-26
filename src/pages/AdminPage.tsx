import React, { useState, useEffect } from 'react';
import {
  getSuggestions,
  getWorkStops,
  updateSuggestion,
  updateWorkStop,
  deleteSuggestion,
  deleteWorkStop,
  clearAllSuggestions,
  clearAllWorkStops,
  formatDate,
  getSites,
  addSite,
  updateSite,
  deleteSite,
  generateSiteId,
  getCompletedSites,
  moveSiteToCompleted,
  restoreSiteFromCompleted,
  deleteCompletedSite,
  getAccidentCases,
  updateAccidentCase,
  deleteAccidentCase,
  saveAccidentCase,
} from '../utils/storage';
import { createSampleAccidentCase, SAMPLE_ACCIDENT_ID } from '../data/sampleAccidentCase';
import { Suggestion, WorkStopRequest, Site, AccidentCase } from '../types';
import {
  collectIssues,
  summarizeAllSites,
  SOON_DAYS,
  TRAINING_RULE,
  TRAINING_ROLES,
  type StaffIssue,
  type SiteComplianceSummary,
} from '../utils/staffCompliance';
import {
  downloadBackup,
  parseBackup,
  applyBackup,
  buildBackupFileName,
  summarizeBackup,
  formatBytes,
  formatBackupDate,
  BACKUP_DATA_KEYS,
  type BackupPayload,
  type BackupSummary,
  type RestoreMode,
} from '../utils/backupStorage';
import './AdminPage.css';
import AccidentReport from '../components/AccidentReport';
import { formatDateKo, formatTenure } from '../utils/accidentReport';

type AdminTab =
  'workstops' | 'suggestions' | 'accidents' | 'staff' | 'sites' | 'completed' | 'backup';

interface AdminPageProps {
  /** 현장 상세로 바로 이동할 수 있도록 siteId/tab 까지 받습니다. */
  onNavigate: (page: string, siteId?: number, tab?: string) => void;
  isLoggedIn: boolean;
}

interface CompletionModalData {
  type: 'suggestion' | 'workstop';
  id: string;
  response: string;
  images: string[];
}

const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, isLoggedIn }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('workstops');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [workStops, setWorkStops] = useState<WorkStopRequest[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [completedSites, setCompletedSites] = useState<Site[]>([]);
  const [accidentCases, setAccidentCases] = useState<AccidentCase[]>([]);
  /* 사고보고서 출력 대상 */
  const [reportCase, setReportCase] = useState<AccidentCase | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteFormData, setSiteFormData] = useState({
    name: '',
    location: '',
    status: 'active' as 'active' | 'inactive' | 'completed',
  });
  const [completionData, setCompletionData] = useState<CompletionModalData>({
    type: 'suggestion',
    id: '',
    response: '',
    images: [],
  });
  const [uploading, setUploading] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  /* 안전인력 직무교육·선임 점검 */
  const [staffIssues, setStaffIssues] = useState<StaffIssue[]>([]);
  const [siteSummaries, setSiteSummaries] = useState<SiteComplianceSummary[]>([]);
  /* 전체 데이터 백업 / 복원 */
  const [backupIncludeFiles, setBackupIncludeFiles] = useState(true);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [backupError, setBackupError] = useState('');
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    payload: BackupPayload;
    summary: BackupSummary;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setSuggestions(getSuggestions());
    setWorkStops(getWorkStops());
    setSites(getSites());
    setCompletedSites(getCompletedSites());
    setAccidentCases(getAccidentCases());
    setStaffIssues(collectIssues());
    setSiteSummaries(summarizeAllSites());
  };

  /* ---------------- 전체 데이터 백업 / 복원 ---------------- */
  const clearBackupNotice = () => {
    setBackupMessage('');
    setBackupError('');
  };

  const handleBackupDownload = async () => {
    if (backupBusy) return;
    clearBackupNotice();
    setBackupBusy(true);
    try {
      const payload = await downloadBackup(backupIncludeFiles);
      const s = summarizeBackup(payload);
      setBackupMessage(
        `${buildBackupFileName()} 파일을 저장했습니다. ` +
          `(데이터 ${s.counts.length}종` +
          (payload.includeFiles ? `, 첨부파일 ${s.fileCount}개 ${formatBytes(s.fileBytes)}` : '') +
          ')',
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '백업 파일을 만들지 못했습니다.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleBackupFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 선택해도 동작하도록 값을 비웁니다.
    e.target.value = '';
    if (!file) return;

    clearBackupNotice();
    try {
      const text = await file.text();
      const { payload, summary } = parseBackup(text);
      setPendingRestore({ fileName: file.name, payload, summary });
    } catch (err) {
      setPendingRestore(null);
      setBackupError(err instanceof Error ? err.message : '백업 파일을 확인하지 못했습니다.');
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore || backupBusy) return;
    clearBackupNotice();
    setBackupBusy(true);
    try {
      const result = await applyBackup(pendingRestore.payload, restoreMode);
      setPendingRestore(null);
      loadData();
      setBackupMessage(
        `복원을 완료했습니다. 데이터 ${result.appliedKeys}종` +
          (result.restoredFiles > 0 ? `, 첨부파일 ${result.restoredFiles}개` : '') +
          (result.skipped > 0 ? ` (중복 ${result.skipped}건 제외)` : '') +
          '. 화면을 새로고침하면 전체에 반영됩니다.',
      );
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '복원에 실패했습니다.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (completionData.images.length + files.length > 5) {
      alert('최대 5개의 이미지만 첨부할 수 있습니다.');
      return;
    }

    setUploading(true);

    const newImages: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > 5 * 1024 * 1024) {
        alert(`${file.name}은(는) 5MB를 초과합니다.`);
        continue;
      }

      if (!file.type.startsWith('image/')) {
        alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        newImages.push(base64);
      } catch (error) {
        console.error('이미지 변환 실패:', error);
        alert(`${file.name} 업로드에 실패했습니다.`);
      }
    }

    setCompletionData(prev => ({
      ...prev,
      images: [...prev.images, ...newImages],
    }));
    setUploading(false);

    e.target.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setCompletionData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const openCompletionModal = (type: 'suggestion' | 'workstop', id: string) => {
    setCompletionData({
      type,
      id,
      response: '',
      images: [],
    });
    setShowCompletionModal(true);
  };

  const closeCompletionModal = () => {
    setShowCompletionModal(false);
    setCompletionData({
      type: 'suggestion',
      id: '',
      response: '',
      images: [],
    });
  };

  const handleCompletion = () => {
    if (!completionData.response.trim()) {
      alert('조치 내용을 입력해주세요.');
      return;
    }

    const now = new Date().toISOString();

    if (completionData.type === 'suggestion') {
      updateSuggestion(completionData.id, {
        status: '완료',
        response: completionData.response,
        respondedAt: now,
        responseImages: completionData.images.length > 0 ? completionData.images : undefined,
      });
    } else {
      updateWorkStop(completionData.id, {
        status: '작업재개',
        resumedAt: now,
        remarks: completionData.response,
        resumeImages: completionData.images.length > 0 ? completionData.images : undefined,
      });
    }

    loadData();
    closeCompletionModal();
    alert('처리가 완료되었습니다.');
  };

  const handleDelete = (
    type: 'suggestion' | 'workstop' | 'accident',
    id: string,
    title: string,
  ) => {
    const confirmMessage = `정말로 삭제하시겠습니까?\n\n"${title}"\n\n이 작업은 취소할 수 없습니다.`;

    if (window.confirm(confirmMessage)) {
      if (type === 'suggestion') {
        deleteSuggestion(id);
      } else if (type === 'workstop') {
        deleteWorkStop(id);
      } else {
        deleteAccidentCase(id);
      }
      loadData();
      alert('삭제되었습니다.');
    }
  };

  const handleAccidentStatusChange = (id: string, status: AccidentCase['status']) => {
    updateAccidentCase(id, {
      status,
      completedAt: status === '완료' ? new Date().toISOString() : undefined,
    });
    loadData();
  };

  /** 테스트용 샘플 사고사례 1건을 현재 브라우저(LocalStorage)에 추가합니다. */
  const handleAddSampleAccident = () => {
    if (accidentCases.some(c => c.id === SAMPLE_ACCIDENT_ID)) {
      alert('테스트 사고사례가 이미 등록되어 있습니다.');
      return;
    }
    if (
      !window.confirm(
        '테스트용 사고사례 1건을 등록하시겠습니까?\n\n' +
          '· 현장: 송도 역세권 2블럭 신축공사\n' +
          '· 사고 유형: 추락 (중상)\n' +
          '· 목격자 진술서 2매 · 재해 상황도 포함\n\n' +
          '사고원인 및 대책 보고서 / 목격자 진술서 / 재해(사고) 상황도 3종 서류를\n' +
          '바로 출력해 확인할 수 있습니다.',
      )
    ) {
      return;
    }
    saveAccidentCase(createSampleAccidentCase());
    loadData();
    alert('테스트 사고사례가 등록되었습니다.\n사고사례 탭에서 🖨️ 사고보고서를 눌러 확인해 주세요.');
  };

  const handleClearAll = (type: 'suggestion' | 'workstop' | 'all') => {
    let confirmMessage = '';

    if (type === 'all') {
      confirmMessage =
        '⚠️ 모든 데이터를 삭제하시겠습니까?\n\n• 모든 건의사항\n• 모든 작업중지 요청\n\n이 작업은 취소할 수 없습니다!';
    } else if (type === 'suggestion') {
      confirmMessage = '⚠️ 모든 건의사항을 삭제하시겠습니까?\n\n이 작업은 취소할 수 없습니다!';
    } else {
      confirmMessage = '⚠️ 모든 작업중지 요청을 삭제하시겠습니까?\n\n이 작업은 취소할 수 없습니다!';
    }

    if (window.confirm(confirmMessage)) {
      const doubleConfirm = window.confirm('정말로 삭제하시겠습니까? 마지막 확인입니다.');

      if (doubleConfirm) {
        if (type === 'all') {
          clearAllSuggestions();
          clearAllWorkStops();
        } else if (type === 'suggestion') {
          clearAllSuggestions();
        } else {
          clearAllWorkStops();
        }
        loadData();
        alert('삭제가 완료되었습니다.');
      }
    }
  };

  const openSiteModal = (site?: Site) => {
    if (site) {
      setEditingSite(site);
      setSiteFormData({
        name: site.name,
        location: site.location,
        status: site.status,
      });
    } else {
      setEditingSite(null);
      setSiteFormData({
        name: '',
        location: '',
        status: 'active',
      });
    }
    setShowSiteModal(true);
  };

  const closeSiteModal = () => {
    setShowSiteModal(false);
    setEditingSite(null);
    setSiteFormData({
      name: '',
      location: '',
      status: 'active',
    });
  };

  const handleSiteSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!siteFormData.name.trim() || !siteFormData.location.trim()) {
      alert('현장명과 위치를 입력해주세요.');
      return;
    }

    if (editingSite) {
      // 수정
      updateSite(editingSite.id, siteFormData);
      alert('현장이 수정되었습니다.');
    } else {
      // 추가
      const newSite: Site = {
        id: generateSiteId(),
        ...siteFormData,
      };
      addSite(newSite);
      alert('새 현장이 추가되었습니다.');
    }

    loadData();
    closeSiteModal();
  };

  const handleDeleteSite = (id: number, name: string) => {
    const confirmMessage = `정말로 "${name}" 현장을 삭제하시겠습니까?\n\n이 작업은 취소할 수 없습니다.`;

    if (window.confirm(confirmMessage)) {
      deleteSite(id);
      loadData();
      alert('현장이 삭제되었습니다.');
    }
  };

  const handleCompleteSite = (id: number, name: string) => {
    const confirmMessage = `"${name}" 현장을 준공 처리하시겠습니까?\n\n준공된 현장은 보관함으로 이동됩니다.\n이후 필요시 다시 복원할 수 있습니다.`;

    if (window.confirm(confirmMessage)) {
      moveSiteToCompleted(id);
      loadData();
      setSelectedSiteIds([]);
      alert('현장이 준공 처리되어 보관함으로 이동되었습니다.');
    }
  };

  const handleBatchCompleteSites = () => {
    if (selectedSiteIds.length === 0) {
      alert('준공 처리할 현장을 선택해주세요.');
      return;
    }

    const selectedSites = sites.filter(s => selectedSiteIds.includes(s.id));
    const siteNames = selectedSites.map(s => s.name).join('\n- ');

    const confirmMessage = `다음 ${selectedSiteIds.length}개 현장을 준공 처리하시겠습니까?\n\n- ${siteNames}\n\n준공된 현장은 '준공 현장' 탭에서 확인할 수 있습니다.`;

    if (window.confirm(confirmMessage)) {
      selectedSiteIds.forEach(id => moveSiteToCompleted(id));
      loadData();
      setSelectedSiteIds([]);
      alert(`${selectedSiteIds.length}개 현장이 준공 처리되었습니다.`);
    }
  };

  const toggleSiteSelection = (id: number) => {
    setSelectedSiteIds(prev =>
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedSiteIds.length === sites.length) {
      setSelectedSiteIds([]);
    } else {
      setSelectedSiteIds(sites.map(s => s.id));
    }
  };

  const handleRestoreSite = (id: number, name: string) => {
    const confirmMessage = `"${name}" 현장을 다시 운영 현장으로 복원하시겠습니까?`;

    if (window.confirm(confirmMessage)) {
      restoreSiteFromCompleted(id);
      loadData();
      alert('현장이 복원되었습니다.');
    }
  };

  const handleDeleteCompletedSite = (id: number, name: string) => {
    const confirmMessage = `정말로 "${name}" 준공 현장을 영구 삭제하시겠습니까?\n\n이 작업은 취소할 수 없습니다.`;

    if (window.confirm(confirmMessage)) {
      deleteCompletedSite(id);
      loadData();
      alert('준공 현장이 삭제되었습니다.');
    }
  };

  const handleSuggestionStatusChange = (id: string, status: Suggestion['status']) => {
    if (status === '완료') {
      openCompletionModal('suggestion', id);
      return;
    }
    updateSuggestion(id, { status });
    loadData();
  };

  const handleWorkStopStatusChange = (id: string, status: WorkStopRequest['status']) => {
    if (status === '작업재개') {
      openCompletionModal('workstop', id);
      return;
    }

    const updates: Partial<WorkStopRequest> = { status };
    if (status === '승인') {
      updates.approvedAt = new Date().toISOString();
      updates.approvedBy = '안전관리팀';
    }
    updateWorkStop(id, updates);
    loadData();
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case '접수':
      case '요청':
        return 'badge-warning';
      case '검토중':
      case '승인':
        return 'badge-info';
      case '완료':
      case '작업재개':
        return 'badge-success';
      case '반려':
        return 'badge-danger';
      default:
        return 'badge-info';
    }
  };

  const stats = {
    totalSuggestions: suggestions.length,
    pendingSuggestions: suggestions.filter(s => s.status === '접수' || s.status === '검토중')
      .length,
    totalWorkStops: workStops.length,
    activeWorkStops: workStops.filter(w => w.status === '요청' || w.status === '승인').length,
    totalSites: sites.length,
    activeSites: sites.filter(s => s.status === 'active').length,
    completedSites: completedSites.length,
    totalAccidents: accidentCases.length,
    pendingAccidents: accidentCases.filter(a => a.status === '접수' || a.status === '조사중')
      .length,
    staffIssues: staffIssues.length,
    staffExpired: staffIssues.filter(i => i.compliance.level === 'expired').length,
    staffSoon: staffIssues.filter(i => i.compliance.level === 'soon').length,
    staffDocs: staffIssues.filter(i => i.appointmentMissing || i.newTrainingMissing).length,
  };

  // 로그인하지 않은 경우
  if (!isLoggedIn) {
    return (
      <div className="admin-page">
        <div className="container">
          <div className="page-header">
            <button className="back-button" onClick={() => onNavigate('home')}>
              ← 뒤로가기
            </button>
            <h1>관리자 대시보드</h1>
            <p>현장 안전 관리 현황</p>
          </div>

          <div className="access-denied">
            <div className="access-denied-icon">🔒</div>
            <h2>접근 권한이 필요합니다</h2>
            <p>관리자 대시보드에 접근하려면 로그인이 필요합니다.</p>
            <button className="btn btn-primary" onClick={() => onNavigate('home')}>
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="container">
        <div className="page-header">
          <button className="back-button" onClick={() => onNavigate('home')}>
            ← 뒤로가기
          </button>
          <h1>관리자 대시보드</h1>
          <p>현장 안전 관리 현황</p>
        </div>

        {/* Statistics */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">🛑</div>
            <div className="stat-content">
              <h3>작업중지</h3>
              <div className="stat-value">{stats.totalWorkStops}</div>
              <div className="stat-label">
                진행중: <strong>{stats.activeWorkStops}</strong>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💡</div>
            <div className="stat-content">
              <h3>건의사항</h3>
              <div className="stat-value">{stats.totalSuggestions}</div>
              <div className="stat-label">
                대기중: <strong>{stats.pendingSuggestions}</strong>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚠️</div>
            <div className="stat-content">
              <h3>사고사례</h3>
              <div className="stat-value">{stats.totalAccidents}</div>
              <div className="stat-label">
                대기중: <strong>{stats.pendingAccidents}</strong>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🏗️</div>
            <div className="stat-content">
              <h3>현장</h3>
              <div className="stat-value">{stats.totalSites}</div>
              <div className="stat-label">
                운영중: <strong>{stats.activeSites}</strong>
              </div>
            </div>
          </div>

          <div
            className={`stat-card ${stats.staffIssues > 0 ? 'stat-card-alert' : ''}`}
            onClick={() => setActiveTab('staff')}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') setActiveTab('staff');
            }}
          >
            <div className="stat-icon">⏰</div>
            <div className="stat-content">
              <h3>안전인력 점검</h3>
              <div className="stat-value">{stats.staffIssues}</div>
              <div className="stat-label">
                만료 <strong>{stats.staffExpired}</strong> · 임박 <strong>{stats.staffSoon}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'workstops' ? 'active' : ''}`}
            onClick={() => setActiveTab('workstops')}
          >
            작업중지권 ({workStops.length})
          </button>
          <button
            className={`tab ${activeTab === 'suggestions' ? 'active' : ''}`}
            onClick={() => setActiveTab('suggestions')}
          >
            건의사항 ({suggestions.length})
          </button>
          <button
            className={`tab ${activeTab === 'accidents' ? 'active' : ''}`}
            onClick={() => setActiveTab('accidents')}
          >
            사고사례 ({accidentCases.length})
          </button>
          <button
            className={`tab ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}
          >
            안전인력 점검 ({staffIssues.length})
          </button>
          <button
            className={`tab ${activeTab === 'sites' ? 'active' : ''}`}
            onClick={() => setActiveTab('sites')}
          >
            현장 관리 ({sites.length})
          </button>
          <button
            className={`tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            준공 현장 ({completedSites.length})
          </button>
          <button
            className={`tab ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('backup');
              clearBackupNotice();
            }}
          >
            💾 백업/복원
          </button>
        </div>

        {/* Management Actions */}
        <div className="management-actions">
          {activeTab === 'sites' && (
            <button className="btn-manage btn-add-site" onClick={() => openSiteModal()}>
              ➕ 새 현장 추가
            </button>
          )}
          {activeTab === 'completed' && (
            <button
              className="btn-manage btn-info"
              onClick={() =>
                alert(
                  '준공된 현장은 보관 상태입니다.\n필요시 개별적으로 복원하거나 삭제할 수 있습니다.',
                )
              }
            >
              ℹ️ 준공 현장 안내
            </button>
          )}
          {activeTab === 'accidents' && (
            <button className="btn-manage btn-add-sample" onClick={handleAddSampleAccident}>
              🧪 테스트 사고사례 추가
            </button>
          )}
          {(activeTab === 'workstops' || activeTab === 'suggestions') && (
            <>
              <button
                className="btn-manage btn-clear-current"
                onClick={() =>
                  handleClearAll(activeTab === 'workstops' ? 'workstop' : 'suggestion')
                }
              >
                🗑️ {activeTab === 'workstops' ? '작업중지 전체 삭제' : '건의사항 전체 삭제'}
              </button>
              <button className="btn-manage btn-clear-all" onClick={() => handleClearAll('all')}>
                ⚠️ 모든 데이터 삭제
              </button>
            </>
          )}
        </div>

        {/* Work Stops Tab */}
        {activeTab === 'workstops' && (
          <div className="content-section">
            {workStops.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>작업중지 요청이 없습니다.</p>
              </div>
            ) : (
              <div className="items-list">
                {workStops.map(workStop => (
                  <div key={workStop.id} className="item-card danger-item">
                    <div className="item-header">
                      <div>
                        <h3>{workStop.siteName}</h3>
                        <p className="item-meta">
                          {workStop.workerName} · {formatDate(workStop.createdAt)}
                        </p>
                      </div>
                      <span className={`badge ${getStatusBadgeClass(workStop.status)}`}>
                        {workStop.status}
                      </span>
                    </div>

                    <div className="item-body">
                      <div className="item-info">
                        <span className="info-label">위험 유형:</span>
                        <span className="info-value danger">{workStop.dangerType}</span>
                      </div>
                      <div className="item-info">
                        <span className="info-label">발생 위치:</span>
                        <span className="info-value">{workStop.location}</span>
                      </div>
                      <div className="item-info">
                        <span className="info-label">연락처:</span>
                        <span className="info-value">{workStop.phone}</span>
                      </div>
                      <div className="item-description">
                        <strong>상황 설명:</strong>
                        <p>{workStop.description}</p>
                      </div>
                      {workStop.images && workStop.images.length > 0 && (
                        <div className="item-images">
                          <strong>첨부 사진:</strong>
                          <div className="admin-image-grid">
                            {workStop.images.map((img, idx) => (
                              <a
                                key={idx}
                                href={img}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-image-item"
                              >
                                <img src={img} alt={`위험 상황 ${idx + 1}`} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {workStop.status === '작업재개' && workStop.remarks && (
                        <div className="completion-info">
                          <strong>조치 내용:</strong>
                          <p>{workStop.remarks}</p>
                          <div className="completion-meta">
                            처리 완료: {formatDate(workStop.resumedAt!)}
                          </div>
                          {workStop.resumeImages && workStop.resumeImages.length > 0 && (
                            <div className="item-images">
                              <strong>조치 사진:</strong>
                              <div className="admin-image-grid">
                                {workStop.resumeImages.map((img, idx) => (
                                  <a
                                    key={idx}
                                    href={img}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="admin-image-item"
                                  >
                                    <img src={img} alt={`조치 사진 ${idx + 1}`} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="item-actions">
                      {workStop.status === '요청' && (
                        <>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleWorkStopStatusChange(workStop.id, '승인')}
                          >
                            작업중지 승인
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleWorkStopStatusChange(workStop.id, '반려')}
                          >
                            반려
                          </button>
                        </>
                      )}
                      {workStop.status === '승인' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleWorkStopStatusChange(workStop.id, '작업재개')}
                        >
                          작업 재개 승인
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-delete"
                        onClick={() => handleDelete('workstop', workStop.id, workStop.siteName)}
                        title="삭제"
                      >
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <div className="content-section">
            {suggestions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>건의사항이 없습니다.</p>
              </div>
            ) : (
              <div className="items-list">
                {suggestions.map(suggestion => (
                  <div key={suggestion.id} className="item-card">
                    <div className="item-header">
                      <div>
                        <h3>{suggestion.title}</h3>
                        <p className="item-meta">
                          {suggestion.siteName} · {suggestion.workerName} ·{' '}
                          {formatDate(suggestion.createdAt)}
                        </p>
                      </div>
                      <span className={`badge ${getStatusBadgeClass(suggestion.status)}`}>
                        {suggestion.status}
                      </span>
                    </div>

                    <div className="item-body">
                      <div className="item-info">
                        <span className="info-label">분류:</span>
                        <span className="info-value">{suggestion.category}</span>
                      </div>
                      <div className="item-info">
                        <span className="info-label">연락처:</span>
                        <span className="info-value">{suggestion.phone}</span>
                      </div>
                      <div className="item-description">
                        <strong>내용:</strong>
                        <p>{suggestion.content}</p>
                      </div>
                      {suggestion.images && suggestion.images.length > 0 && (
                        <div className="item-images">
                          <strong>첨부 사진:</strong>
                          <div className="admin-image-grid">
                            {suggestion.images.map((img, idx) => (
                              <a
                                key={idx}
                                href={img}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-image-item"
                              >
                                <img src={img} alt={`첨부 사진 ${idx + 1}`} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {suggestion.status === '완료' && suggestion.response && (
                        <div className="completion-info">
                          <strong>처리 내용:</strong>
                          <p>{suggestion.response}</p>
                          <div className="completion-meta">
                            처리 완료: {formatDate(suggestion.respondedAt!)}
                          </div>
                          {suggestion.responseImages && suggestion.responseImages.length > 0 && (
                            <div className="item-images">
                              <strong>처리 사진:</strong>
                              <div className="admin-image-grid">
                                {suggestion.responseImages.map((img, idx) => (
                                  <a
                                    key={idx}
                                    href={img}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="admin-image-item"
                                  >
                                    <img src={img} alt={`처리 사진 ${idx + 1}`} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="item-actions">
                      {suggestion.status === '접수' && (
                        <>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleSuggestionStatusChange(suggestion.id, '검토중')}
                          >
                            검토 시작
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleSuggestionStatusChange(suggestion.id, '반려')}
                          >
                            반려
                          </button>
                        </>
                      )}
                      {suggestion.status === '검토중' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleSuggestionStatusChange(suggestion.id, '완료')}
                        >
                          완료 처리
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-delete"
                        onClick={() => handleDelete('suggestion', suggestion.id, suggestion.title)}
                        title="삭제"
                      >
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sites Tab */}
        {activeTab === 'sites' && (
          <div className="content-section">
            {sites.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🏗️</div>
                <p>등록된 현장이 없습니다.</p>
                <button className="btn btn-primary" onClick={() => openSiteModal()}>
                  새 현장 추가하기
                </button>
              </div>
            ) : (
              <>
                <div className="batch-actions">
                  <div className="batch-select">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.length === sites.length && sites.length > 0}
                        onChange={toggleSelectAll}
                      />
                      전체 선택 ({selectedSiteIds.length}/{sites.length})
                    </label>
                  </div>
                  {selectedSiteIds.length > 0 && (
                    <button className="btn btn-success" onClick={handleBatchCompleteSites}>
                      ✅ 선택한 현장 준공 처리 ({selectedSiteIds.length})
                    </button>
                  )}
                </div>
                <div className="sites-management-list">
                  {sites.map(site => (
                    <div
                      key={site.id}
                      className={`site-management-card ${selectedSiteIds.includes(site.id) ? 'selected' : ''}`}
                    >
                      <div className="site-management-header">
                        <label className="site-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedSiteIds.includes(site.id)}
                            onChange={() => toggleSiteSelection(site.id)}
                          />
                        </label>
                        <div>
                          <h3>{site.name}</h3>
                          <p className="site-meta">📍 {site.location}</p>
                        </div>
                        <span
                          className={`badge ${site.status === 'active' ? 'badge-success' : 'badge-secondary'}`}
                        >
                          {site.status === 'active' ? '운영중' : '중단'}
                        </span>
                      </div>

                      <div className="site-management-actions">
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => openSiteModal(site)}
                        >
                          ✏️ 수정
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            const newStatus = site.status === 'active' ? 'inactive' : 'active';
                            updateSite(site.id, { status: newStatus });
                            loadData();
                          }}
                        >
                          {site.status === 'active' ? '⏸️ 중단' : '▶️ 재개'}
                        </button>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleCompleteSite(site.id, site.name)}
                          title="준공 처리"
                        >
                          ✅ 준공
                        </button>
                        <button
                          className="btn btn-sm btn-delete"
                          onClick={() => handleDeleteSite(site.id, site.name)}
                          title="삭제"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Accident Cases Tab */}
        {activeTab === 'accidents' && (
          <div className="content-section">
            {accidentCases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⚠️</div>
                <p>사고사례가 없습니다.</p>
              </div>
            ) : (
              <div className="items-list">
                {accidentCases.map(accident => (
                  <div key={accident.id} className="item-card">
                    <div className="item-header">
                      <div className="item-title-section">
                        <h3>
                          {accident.siteName} - {accident.accidentType}
                        </h3>
                        <span className={`badge ${getStatusBadgeClass(accident.status)}`}>
                          {accident.status}
                        </span>
                      </div>
                      <div className="item-meta">
                        <span>🗓️ 사고일시: {formatDate(accident.accidentDate)}</span>
                        <span>📍 {accident.location}</span>
                        <span className={`severity-badge severity-${accident.severity}`}>
                          심각도: {accident.severity}
                        </span>
                      </div>
                    </div>

                    <div className="item-content">
                      <div className="accident-info-grid">
                        <div className="info-item">
                          <strong>피해자:</strong>
                          <p>
                            {accident.victimName}
                            {accident.victimAge ? ` (${accident.victimAge}세)` : ''}
                          </p>
                        </div>
                        <div className="info-item">
                          <strong>입사일:</strong>
                          <p>
                            {accident.victimHireDate
                              ? formatDateKo(accident.victimHireDate)
                              : '미입력'}
                            {accident.victimHireDate && (
                              <span className="accident-tenure">
                                근속 {formatTenure(accident.victimHireDate, accident.accidentDate)}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="info-item">
                          <strong>보고자:</strong>
                          <p>
                            {accident.reporterName} ({accident.reporterPhone})
                          </p>
                        </div>
                        <div className="info-item">
                          <strong>재해조사표:</strong>
                          <p>{accident.disasterReportSubmitted || '미제출'}</p>
                        </div>
                        <div className="info-item">
                          <strong>처리결과:</strong>
                          <p>{accident.treatmentResult || '미처리'}</p>
                        </div>
                        <div className="info-item">
                          <strong>직종/결혼:</strong>
                          <p>
                            {accident.victimJobType || '-'} / {accident.victimMaritalStatus || '-'}
                          </p>
                        </div>
                        <div className="info-item">
                          <strong>가족관계:</strong>
                          <p>{accident.victimFamily || '-'}</p>
                        </div>
                        <div className="info-item">
                          <strong>피해자 연락처:</strong>
                          <p>{accident.victimPhone || '미입력'}</p>
                        </div>
                        <div className="info-item">
                          <strong>재해 발생:</strong>
                          <p>
                            {accident.disasterDate ? formatDateKo(accident.disasterDate) : '-'}
                            {' · '}
                            {accident.disasterPlace || accident.location}
                          </p>
                        </div>
                        <div className="info-item">
                          <strong>목격자 진술:</strong>
                          <p>
                            {accident.witnesses?.length
                              ? `${accident.witnesses.length}건`
                              : '미등록'}
                          </p>
                        </div>
                      </div>

                      {/* 재해 상황도 */}
                      {accident.situationDiagram && (
                        <div className="info-item">
                          <strong>재해 상황도:</strong>
                          <a
                            href={accident.situationDiagram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="accident-diagram-thumb"
                            title="클릭하면 원본 크기로 확인"
                          >
                            <img src={accident.situationDiagram} alt="재해 상황도" />
                          </a>
                          {accident.situationNote && (
                            <p className="accident-diagram-note">{accident.situationNote}</p>
                          )}
                        </div>
                      )}

                      {/* 목격자 진술서 요약 */}
                      {accident.witnesses && accident.witnesses.length > 0 && (
                        <div className="info-item">
                          <strong>목격자 진술서:</strong>
                          <ul className="accident-witness-list">
                            {accident.witnesses.map((w, wi) => (
                              <li key={w.id}>
                                <span className="accident-witness-no">{wi + 1}</span>
                                <strong>{w.name}</strong>
                                {w.relation && (
                                  <span className="accident-witness-meta"> ({w.relation})</span>
                                )}
                                <p className="accident-witness-text">{w.statement}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="info-item">
                        <strong>사고 경위:</strong>
                        <p>{accident.description}</p>
                      </div>
                      <div className="info-item">
                        <strong>사고 원인:</strong>
                        <p>{accident.cause}</p>
                      </div>
                      <div className="info-item">
                        <strong>재발 방지 대책:</strong>
                        <p>{accident.preventiveMeasures}</p>
                      </div>

                      {accident.images && accident.images.length > 0 && (
                        <div className="item-images">
                          <strong>사고 현장 사진:</strong>
                          <div className="admin-image-grid">
                            {accident.images.map((img, idx) => (
                              <a
                                key={idx}
                                href={img}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-image-item"
                              >
                                <img src={img} alt={`사고 현장 ${idx + 1}`} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {accident.status === '완료' && accident.investigationResult && (
                        <div className="completion-info">
                          <strong>조사 결과:</strong>
                          <p>{accident.investigationResult}</p>
                          <div className="completion-meta">
                            조사 완료: {formatDate(accident.completedAt!)}
                          </div>
                          {accident.investigationImages &&
                            accident.investigationImages.length > 0 && (
                              <div className="item-images">
                                <strong>조사 결과 사진:</strong>
                                <div className="admin-image-grid">
                                  {accident.investigationImages.map((img, idx) => (
                                    <a
                                      key={idx}
                                      href={img}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="admin-image-item"
                                    >
                                      <img src={img} alt={`조사 결과 ${idx + 1}`} />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      )}

                      <p className="item-date">제출일: {formatDate(accident.createdAt)}</p>
                    </div>

                    <div className="item-actions">
                      <button
                        className="btn btn-sm btn-report"
                        onClick={() => setReportCase(accident)}
                        title="A4 사고보고서 출력"
                      >
                        🖨️ 사고보고서
                      </button>
                      {accident.status === '접수' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleAccidentStatusChange(accident.id, '조사중')}
                        >
                          조사 시작
                        </button>
                      )}
                      {accident.status === '조사중' && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleAccidentStatusChange(accident.id, '완료')}
                        >
                          조사 완료
                        </button>
                      )}
                      <button
                        className="btn btn-sm btn-delete"
                        onClick={() =>
                          handleDelete(
                            'accident',
                            accident.id,
                            `${accident.siteName} - ${accident.accidentType}`,
                          )
                        }
                        title="삭제"
                      >
                        🗑️ 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Staff Compliance Tab */}
        {activeTab === 'staff' && (
          <div className="content-section">
            <div className="staff-check-note">
              <p>
                <strong>점검 기준</strong> — 직무교육 <strong>이수일</strong>을 기준으로 유효기간
                만료일을 계산합니다. 만료 {SOON_DAYS}일 전부터 ‘만료임박’으로 표시됩니다.
              </p>
              <ul className="staff-rule-list">
                {TRAINING_ROLES.map(role => {
                  const rule = TRAINING_RULE[role];
                  if (!rule) return null;
                  return (
                    <li key={role}>
                      <strong>{role}</strong> — 이수일로부터 {rule.years}년
                      {rule.hours ? ` (${rule.hours})` : ''}
                    </li>
                  );
                })}
                <li className="staff-rule-excluded">
                  관리감독자 · 안전담당자 — 직무교육 대상 아님 (신규교육 8시간만 확인)
                </li>
              </ul>
            </div>

            {/* 현장별 요약 */}
            {siteSummaries.length > 0 && (
              <div className="staff-site-summary">
                <h3>현장별 현황</h3>
                <div className="staff-site-grid">
                  {siteSummaries.map(sum => (
                    <button
                      key={sum.siteId}
                      className={`staff-site-card ${sum.issues > 0 ? 'has-issue' : ''}`}
                      onClick={() => onNavigate('site-detail', sum.siteId, 'info')}
                      title={`${sum.siteName} 상세로 이동`}
                    >
                      <span className="staff-site-name">{sum.siteName}</span>
                      <span className="staff-site-count">등록 {sum.total}명</span>
                      <span className="staff-site-badges">
                        {sum.expired > 0 && (
                          <span className="sd-dd sd-dd-expired">만료 {sum.expired}</span>
                        )}
                        {sum.soon > 0 && <span className="sd-dd sd-dd-soon">임박 {sum.soon}</span>}
                        {sum.missing > 0 && (
                          <span className="sd-dd sd-dd-missing">미입력 {sum.missing}</span>
                        )}
                        {sum.issues === 0 && <span className="sd-dd sd-dd-ok">정상</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 조치 필요 목록 */}
            {staffIssues.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✅</div>
                <p>조치가 필요한 안전인력이 없습니다.</p>
                <p className="empty-hint">
                  현장 상세 &gt; 관리자(안전인력)에서 선임일과 직무교육 이수일을 등록하면 여기에서
                  자동으로 점검됩니다.
                </p>
              </div>
            ) : (
              <div className="items-list">
                {staffIssues.map(issue => (
                  <div
                    key={`${issue.siteId}-${issue.staff.id}`}
                    className={`item-card staff-issue-card is-${issue.compliance.level}`}
                  >
                    <div className="item-header">
                      <div>
                        <h3>
                          {issue.staff.name || '성명 미입력'}
                          <span className="staff-role-tag">{issue.staff.role}</span>
                        </h3>
                        <p className="item-meta">
                          {issue.siteName}
                          {issue.staff.phone ? ` · ☎ ${issue.staff.phone}` : ''}
                        </p>
                      </div>
                      {/* 직무교육 대상자에게만 D-day 배지 표시 */}
                      {issue.compliance.level !== 'none' && (
                        <span className={`sd-dd sd-dd-${issue.compliance.level}`}>
                          {issue.compliance.label === '해임'
                            ? '해임'
                            : `교육 ${issue.compliance.label}`}
                        </span>
                      )}
                    </div>

                    <div className="item-body">
                      <p className="staff-issue-message">{issue.compliance.message}</p>

                      <div className="staff-issue-dates">
                        <span>
                          선임일 <strong>{issue.staff.appointedAt || '-'}</strong>
                        </span>
                        <span>
                          직무교육 <strong>{issue.staff.trainingDate || '-'}</strong>
                        </span>
                        <span>
                          다음 교육 <strong>{issue.compliance.dueDate || '-'}</strong>
                        </span>
                      </div>

                      {issue.appointmentMissing && (
                        <p className="staff-issue-extra">
                          ⚠️ 선임일(지정일)이 입력되지 않았습니다.
                        </p>
                      )}
                      {issue.newTrainingMissing && (
                        <p className="staff-issue-extra">
                          ⚠️ {issue.staff.role} 신규교육(8시간)을 이수하지 않았습니다.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Backup / Restore Tab */}
        {activeTab === 'backup' && (
          <div className="content-section">
            <div className="backup-warning">
              <span className="backup-warning-icon">⚠️</span>
              <div>
                <strong>이 시스템은 서버 없이 브라우저에만 자료를 저장합니다.</strong>
                <p>
                  브라우저 캐시 정리 · 시크릿 모드 종료 · PC 교체 시 모든 현장 자료가 사라집니다.
                  중요한 작업 전에는 반드시 백업 파일을 내려받아 보관하세요.
                </p>
              </div>
            </div>

            {backupMessage && <div className="backup-notice is-ok">✅ {backupMessage}</div>}
            {backupError && <div className="backup-notice is-error">⚠️ {backupError}</div>}

            <div className="backup-grid">
              {/* 내보내기 */}
              <section className="backup-card">
                <header className="backup-card-head">
                  <span className="backup-card-icon">⬇️</span>
                  <div>
                    <h3>백업 파일 내려받기</h3>
                    <p>전체 데이터를 JSON 파일 하나로 저장합니다.</p>
                  </div>
                </header>

                <ul className="backup-key-list">
                  {BACKUP_DATA_KEYS.map(({ label }) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>

                <label className="backup-check">
                  <input
                    type="checkbox"
                    checked={backupIncludeFiles}
                    onChange={e => setBackupIncludeFiles(e.target.checked)}
                  />
                  <span>
                    첨부파일 본문 포함 <em>(현장문서·약도 이미지, 용량이 커질 수 있음)</em>
                  </span>
                </label>

                <button
                  className="btn btn-primary backup-btn"
                  onClick={handleBackupDownload}
                  disabled={backupBusy}
                >
                  {backupBusy ? '만드는 중…' : '⬇️ 백업 파일 저장'}
                </button>
                <p className="backup-hint">파일명: {buildBackupFileName()}</p>
              </section>

              {/* 가져오기 */}
              <section className="backup-card">
                <header className="backup-card-head">
                  <span className="backup-card-icon">⬆️</span>
                  <div>
                    <h3>백업 파일로 복원</h3>
                    <p>이전에 내려받은 JSON 파일을 불러옵니다.</p>
                  </div>
                </header>

                <div className="backup-mode">
                  <label className={`backup-radio ${restoreMode === 'merge' ? 'is-on' : ''}`}>
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                    />
                    <span>
                      <strong>병합</strong>
                      <em>기존 자료를 유지하고 백업에만 있는 항목을 추가</em>
                    </span>
                  </label>
                  <label className={`backup-radio ${restoreMode === 'replace' ? 'is-on' : ''}`}>
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                    />
                    <span>
                      <strong>덮어쓰기</strong>
                      <em>백업 시점 상태로 완전히 되돌림 (현재 자료 삭제)</em>
                    </span>
                  </label>
                </div>

                <label className="backup-file-pick">
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={handleBackupFilePick}
                  />
                  <span>📂 백업 파일 선택</span>
                </label>

                <p className="backup-hint">파일을 선택하면 복원 전에 내용을 먼저 확인합니다.</p>
              </section>
            </div>

            {/* 복원 확인 */}
            {pendingRestore && (
              <div className="backup-confirm">
                <h3>복원할 내용을 확인하세요</h3>
                <dl className="backup-confirm-meta">
                  <div>
                    <dt>파일</dt>
                    <dd>{pendingRestore.fileName}</dd>
                  </div>
                  <div>
                    <dt>백업 시점</dt>
                    <dd>{formatBackupDate(pendingRestore.summary.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>첨부파일</dt>
                    <dd>
                      {pendingRestore.summary.includeFiles
                        ? `${pendingRestore.summary.fileCount}개 (${formatBytes(pendingRestore.summary.fileBytes)})`
                        : '포함되지 않음'}
                    </dd>
                  </div>
                  <div>
                    <dt>복원 방식</dt>
                    <dd>
                      {restoreMode === 'replace'
                        ? '덮어쓰기 (현재 자료 삭제)'
                        : '병합 (기존 자료 유지)'}
                    </dd>
                  </div>
                </dl>

                <div className="backup-confirm-counts">
                  {pendingRestore.summary.counts.length === 0 ? (
                    <p className="backup-hint">백업 파일에 저장된 항목이 없습니다.</p>
                  ) : (
                    pendingRestore.summary.counts.map(c => (
                      <span key={c.label} className="backup-count-chip">
                        {c.label} <strong>{c.count}</strong>
                      </span>
                    ))
                  )}
                </div>

                {restoreMode === 'replace' && (
                  <p className="backup-confirm-danger">
                    ⚠️ 덮어쓰기를 선택했습니다. 현재 저장된 자료가 백업 시점으로 대체되며 되돌릴 수
                    없습니다.
                  </p>
                )}

                <div className="backup-confirm-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setPendingRestore(null)}
                    disabled={backupBusy}
                  >
                    취소
                  </button>
                  <button
                    className={`btn btn-sm ${restoreMode === 'replace' ? 'btn-delete' : 'btn-primary'}`}
                    onClick={confirmRestore}
                    disabled={backupBusy}
                  >
                    {backupBusy
                      ? '복원 중…'
                      : restoreMode === 'replace'
                        ? '덮어쓰기 실행'
                        : '병합 복원 실행'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed Sites Tab */}
        {activeTab === 'completed' && (
          <div className="content-section">
            {completedSites.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📦</div>
                <p>준공된 현장이 없습니다.</p>
              </div>
            ) : (
              <div className="sites-management-list">
                {completedSites.map(site => (
                  <div key={site.id} className="site-management-card completed-site-card">
                    <div className="site-management-header">
                      <div>
                        <h3>{site.name}</h3>
                        <p className="site-meta">📍 {site.location}</p>
                        {site.completedAt && (
                          <p className="completed-date">
                            ✅ 준공일: {formatDate(site.completedAt)}
                          </p>
                        )}
                      </div>
                      <span className="badge badge-completed">준공</span>
                    </div>

                    <div className="site-management-actions">
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleRestoreSite(site.id, site.name)}
                        title="복원"
                      >
                        🔄 복원
                      </button>
                      <button
                        className="btn btn-sm btn-delete"
                        onClick={() => handleDeleteCompletedSite(site.id, site.name)}
                        title="영구 삭제"
                      >
                        🗑️ 영구 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Completion Modal */}
        {showCompletionModal && (
          <div className="modal-overlay" onClick={closeCompletionModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {completionData.type === 'suggestion' ? '건의사항 완료 처리' : '작업 재개 승인'}
                </h2>
                <button className="modal-close" onClick={closeCompletionModal}>
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="response">
                    {completionData.type === 'suggestion' ? '처리 내용 *' : '조치 내용 *'}
                  </label>
                  <textarea
                    id="response"
                    value={completionData.response}
                    onChange={e =>
                      setCompletionData(prev => ({ ...prev, response: e.target.value }))
                    }
                    placeholder={
                      completionData.type === 'suggestion'
                        ? '건의사항에 대한 처리 내용을 입력하세요'
                        : '위험 요소 제거 및 조치 내용을 입력하세요'
                    }
                    rows={6}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="completionImages">
                    {completionData.type === 'suggestion' ? '처리 사진' : '조치 사진'} (선택, 최대
                    5개)
                  </label>
                  <div className="image-upload-container">
                    <label htmlFor="completionImageInput" className="image-upload-button">
                      <span className="upload-icon">📷</span>
                      <span>사진 추가하기</span>
                      <span className="upload-hint">JPG, PNG (최대 5MB)</span>
                    </label>
                    <input
                      type="file"
                      id="completionImageInput"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      style={{ display: 'none' }}
                      disabled={uploading || completionData.images.length >= 5}
                    />
                    {uploading && <div className="uploading-text">업로드 중...</div>}
                  </div>

                  {completionData.images.length > 0 && (
                    <div className="image-preview-grid">
                      {completionData.images.map((img, index) => (
                        <div key={index} className="image-preview-item">
                          <img src={img} alt={`미리보기 ${index + 1}`} />
                          <button
                            type="button"
                            className="image-remove-button"
                            onClick={() => removeImage(index)}
                            title="삭제"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="completion-date-info">
                  <span>처리 날짜: {new Date().toLocaleString('ko-KR')}</span>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={closeCompletionModal}>
                  취소
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCompletion}
                  disabled={uploading || !completionData.response.trim()}
                >
                  완료 처리
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Site Modal */}
        {showSiteModal && (
          <div className="modal-overlay" onClick={closeSiteModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingSite ? '현장 수정' : '새 현장 추가'}</h2>
                <button className="modal-close" onClick={closeSiteModal}>
                  ✕
                </button>
              </div>

              <form className="modal-body" onSubmit={handleSiteSubmit}>
                <div className="form-group">
                  <label htmlFor="siteName">현장명 *</label>
                  <input
                    type="text"
                    id="siteName"
                    value={siteFormData.name}
                    onChange={e => setSiteFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="예: 용인시 에코타운 조성 민자사업 현장"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="siteLocation">위치 *</label>
                  <input
                    type="text"
                    id="siteLocation"
                    value={siteFormData.location}
                    onChange={e => setSiteFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="예: 용인시"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="siteStatus">상태 *</label>
                  <select
                    id="siteStatus"
                    value={siteFormData.status}
                    onChange={e =>
                      setSiteFormData(prev => ({
                        ...prev,
                        status: e.target.value as 'active' | 'inactive',
                      }))
                    }
                  >
                    <option value="active">운영중</option>
                    <option value="inactive">중단</option>
                  </select>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeSiteModal}>
                    취소
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingSite ? '수정하기' : '추가하기'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 사고보고서 출력 (A4) */}
        {reportCase && <AccidentReport accident={reportCase} onClose={() => setReportCase(null)} />}
      </div>
    </div>
  );
};

export default AdminPage;
