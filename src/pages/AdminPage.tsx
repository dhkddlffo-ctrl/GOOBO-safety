import React, { useState, useEffect } from 'react';
import { getSuggestions, getWorkStops, updateSuggestion, updateWorkStop, formatDate } from '../utils/storage';
import { Suggestion, WorkStopRequest } from '../types';
import './AdminPage.css';

interface AdminPageProps {
  onNavigate: (page: string) => void;
}

interface CompletionModalData {
  type: 'suggestion' | 'workstop';
  id: string;
  response: string;
  images: string[];
}

const AdminPage: React.FC<AdminPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'workstops'>('workstops');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [workStops, setWorkStops] = useState<WorkStopRequest[]>([]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
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
  };

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
      </div>
    </div>
  );
};

export default AdminPage;
