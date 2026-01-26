import React, { useState, useEffect } from 'react';
import { getSuggestions, getWorkStops, updateSuggestion, updateWorkStop, deleteSuggestion, deleteWorkStop, clearAllSuggestions, clearAllWorkStops, formatDate, getSites, saveSites, addSite, updateSite, deleteSite, generateSiteId, getCompletedSites, moveSiteToCompleted, restoreSiteFromCompleted, deleteCompletedSite } from '../utils/storage';
import { Suggestion, WorkStopRequest, Site } from '../types';
import './AdminPage.css';

interface AdminPageProps {
  onNavigate: (page: string) => void;
  isLoggedIn: boolean;
}

interface CompletionModalData {
  type: 'suggestion' | 'workstop';
  id: string;
  response: string;
  images: string[];
}

const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, isLoggedIn }) => {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'workstops' | 'sites' | 'completed'>('workstops');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [workStops, setWorkStops] = useState<WorkStopRequest[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [completedSites, setCompletedSites] = useState<Site[]>([]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteFormData, setSiteFormData] = useState({
    name: '',
    location: '',
    status: 'active' as 'active' | 'inactive' | 'completed'
  });
  const [completionData, setCompletionData] = useState<CompletionModalData>({
    type: 'suggestion',
    id: '',
    response: '',
    images: []
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setSuggestions(getSuggestions());
    setWorkStops(getWorkStops());
    setSites(getSites());
    setCompletedSites(getCompletedSites());
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
      images: [...prev.images, ...newImages]
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
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const openCompletionModal = (type: 'suggestion' | 'workstop', id: string) => {
    setCompletionData({
      type,
      id,
      response: '',
      images: []
    });
    setShowCompletionModal(true);
  };

  const closeCompletionModal = () => {
    setShowCompletionModal(false);
    setCompletionData({
      type: 'suggestion',
      id: '',
      response: '',
      images: []
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
        responseImages: completionData.images.length > 0 ? completionData.images : undefined
      });
    } else {
      updateWorkStop(completionData.id, {
        status: '작업재개',
        resumedAt: now,
        remarks: completionData.response,
        resumeImages: completionData.images.length > 0 ? completionData.images : undefined
      });
    }

    loadData();
    closeCompletionModal();
    alert('처리가 완료되었습니다.');
  };

  const handleDelete = (type: 'suggestion' | 'workstop', id: string, title: string) => {
    const confirmMessage = `정말로 삭제하시겠습니까?\n\n"${title}"\n\n이 작업은 취소할 수 없습니다.`;
    
    if (window.confirm(confirmMessage)) {
      if (type === 'suggestion') {
        deleteSuggestion(id);
      } else {
        deleteWorkStop(id);
      }
      loadData();
      alert('삭제되었습니다.');
    }
  };

  const handleClearAll = (type: 'suggestion' | 'workstop' | 'all') => {
    let confirmMessage = '';
    
    if (type === 'all') {
      confirmMessage = '⚠️ 모든 데이터를 삭제하시겠습니까?\n\n• 모든 건의사항\n• 모든 작업중지 요청\n\n이 작업은 취소할 수 없습니다!';
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
        status: site.status
      });
    } else {
      setEditingSite(null);
      setSiteFormData({
        name: '',
        location: '',
        status: 'active'
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
      status: 'active'
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
        ...siteFormData
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
      alert('현장이 준공 처리되어 보관함으로 이동되었습니다.');
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
    pendingSuggestions: suggestions.filter(s => s.status === '접수' || s.status === '검토중').length,
    totalWorkStops: workStops.length,
    activeWorkStops: workStops.filter(w => w.status === '요청' || w.status === '승인').length,
    totalSites: sites.length,
    activeSites: sites.filter(s => s.status === 'active').length,
    completedSites: completedSites.length,
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
            <div className="stat-icon">🏗️</div>
            <div className="stat-content">
              <h3>현장</h3>
              <div className="stat-value">{stats.totalSites}</div>
              <div className="stat-label">
                운영중: <strong>{stats.activeSites}</strong>
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
        </div>

        {/* Management Actions */}
        <div className="management-actions">
          {activeTab === 'sites' && (
            <button 
              className="btn-manage btn-add-site"
              onClick={() => openSiteModal()}
            >
              ➕ 새 현장 추가
            </button>
          )}
          {activeTab === 'completed' && (
            <button 
              className="btn-manage btn-info"
              onClick={() => alert('준공된 현장은 보관 상태입니다.\n필요시 개별적으로 복원하거나 삭제할 수 있습니다.')}
            >
              ℹ️ 준공 현장 안내
            </button>
          )}
          {activeTab !== 'sites' && activeTab !== 'completed' && (
            <>
              <button 
                className="btn-manage btn-clear-current"
                onClick={() => handleClearAll(activeTab === 'workstops' ? 'workstop' : 'suggestion')}
              >
                🗑️ {activeTab === 'workstops' ? '작업중지 전체 삭제' : '건의사항 전체 삭제'}
              </button>
              <button 
                className="btn-manage btn-clear-all"
                onClick={() => handleClearAll('all')}
              >
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
                {workStops.map((workStop) => (
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
                {suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="item-card">
                    <div className="item-header">
                      <div>
                        <h3>{suggestion.title}</h3>
                        <p className="item-meta">
                          {suggestion.siteName} · {suggestion.workerName} · {formatDate(suggestion.createdAt)}
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
              <div className="sites-management-list">
                {sites.map((site) => (
                  <div key={site.id} className="site-management-card">
                    <div className="site-management-header">
                      <div>
                        <h3>{site.name}</h3>
                        <p className="site-meta">
                          📍 {site.location}
                        </p>
                      </div>
                      <span className={`badge ${site.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
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
                {completedSites.map((site) => (
                  <div key={site.id} className="site-management-card completed-site-card">
                    <div className="site-management-header">
                      <div>
                        <h3>{site.name}</h3>
                        <p className="site-meta">
                          📍 {site.location}
                        </p>
                        {site.completedAt && (
                          <p className="completed-date">
                            ✅ 준공일: {formatDate(site.completedAt)}
                          </p>
                        )}
                      </div>
                      <span className="badge badge-completed">
                        준공
                      </span>
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
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>
                  {completionData.type === 'suggestion' ? '건의사항 완료 처리' : '작업 재개 승인'}
                </h2>
                <button className="modal-close" onClick={closeCompletionModal}>✕</button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="response">
                    {completionData.type === 'suggestion' ? '처리 내용 *' : '조치 내용 *'}
                  </label>
                  <textarea
                    id="response"
                    value={completionData.response}
                    onChange={(e) => setCompletionData(prev => ({ ...prev, response: e.target.value }))}
                    placeholder={completionData.type === 'suggestion' 
                      ? '건의사항에 대한 처리 내용을 입력하세요' 
                      : '위험 요소 제거 및 조치 내용을 입력하세요'}
                    rows={6}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="completionImages">
                    {completionData.type === 'suggestion' ? '처리 사진' : '조치 사진'} (선택, 최대 5개)
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
                <button 
                  className="btn btn-secondary" 
                  onClick={closeCompletionModal}
                >
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
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingSite ? '현장 수정' : '새 현장 추가'}</h2>
                <button className="modal-close" onClick={closeSiteModal}>✕</button>
              </div>

              <form className="modal-body" onSubmit={handleSiteSubmit}>
                <div className="form-group">
                  <label htmlFor="siteName">현장명 *</label>
                  <input
                    type="text"
                    id="siteName"
                    value={siteFormData.name}
                    onChange={(e) => setSiteFormData(prev => ({ ...prev, name: e.target.value }))}
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
                    onChange={(e) => setSiteFormData(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="예: 용인시"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="siteStatus">상태 *</label>
                  <select
                    id="siteStatus"
                    value={siteFormData.status}
                    onChange={(e) => setSiteFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
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
      </div>
    </div>
  );
};

export default AdminPage;
