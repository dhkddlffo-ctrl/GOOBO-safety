import React, { useState, useEffect } from 'react';
import { getSuggestions, getWorkStops, updateSuggestion, updateWorkStop, formatDate } from '../utils/storage';
import { Suggestion, WorkStopRequest } from '../types';
import './AdminPage.css';

interface AdminPageProps {
  onNavigate: (page: string) => void;
}

const AdminPage: React.FC<AdminPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'workstops'>('workstops');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [workStops, setWorkStops] = useState<WorkStopRequest[]>([]);
  const [selectedItem, setSelectedItem] = useState<Suggestion | WorkStopRequest | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setSuggestions(getSuggestions());
    setWorkStops(getWorkStops());
  };

  const handleSuggestionStatusChange = (id: string, status: Suggestion['status']) => {
    updateSuggestion(id, { status });
    loadData();
  };

  const handleWorkStopStatusChange = (id: string, status: WorkStopRequest['status']) => {
    const updates: Partial<WorkStopRequest> = { status };
    if (status === '승인') {
      updates.approvedAt = new Date().toISOString();
      updates.approvedBy = '안전관리팀';
    } else if (status === '작업재개') {
      updates.resumedAt = new Date().toISOString();
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
      </div>
    </div>
  );
};

export default AdminPage;
