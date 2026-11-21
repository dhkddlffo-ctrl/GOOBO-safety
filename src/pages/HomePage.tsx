import React, { useState, useEffect } from 'react';
import { getSites } from '../utils/storage';
import { Site } from '../types';
import { countNewHqPosts, getPendingAckPosts, HQ_CHANGED_EVENT } from '../utils/hqStorage';
import './HomePage.css';

interface HomePageProps {
  onNavigate: (page: string, siteId?: number) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [newHqCount, setNewHqCount] = useState(0);
  const [pendingAcks, setPendingAcks] = useState(0);

  useEffect(() => {
    // 초기 로드 시 저장된 현장 목록 불러오기
    // getSites()는 자동으로 기본 10개 현장을 생성함
    const savedSites = getSites();
    const active = savedSites.filter(s => s.status === 'active');
    setSites(active);

    /* 본사 게시판 새 소식 · 필독 미확인 건수
       (현장별 확인 기록이므로 전체 현장 중 한 곳이라도 미확인인 글 수를 셉니다) */
    const sync = () => {
      setNewHqCount(countNewHqPosts());
      const pending = new Set<string>();
      active.forEach(site => getPendingAckPosts(site.id).forEach(p => pending.add(p.id)));
      setPendingAcks(pending.size);
    };
    sync();
    window.addEventListener(HQ_CHANGED_EVENT, sync);
    return () => window.removeEventListener(HQ_CHANGED_EVENT, sync);
  }, []);

  return (
    <div className="home-page">
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <h1>구보공영(주)</h1>
          <p className="hero-subtitle">현장 안전 관리 시스템</p>
          <p className="hero-description">
            근로자 여러분의 목소리를 듣습니다.
            <br />
            안전한 작업환경을 위해 함께 노력하겠습니다.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="container">
        {/* 본사 필독 알림 */}
        {(pendingAcks > 0 || newHqCount > 0) && (
          <button type="button" className="hq-banner" onClick={() => onNavigate('hq')}>
            <span className="hq-banner-icon">📢</span>
            <div className="hq-banner-text">
              <strong className="hq-banner-title">본사 게시판 알림</strong>
              <span className="hq-banner-sub">
                {pendingAcks > 0 && `확인하지 않은 필독 자료 ${pendingAcks}건`}
                {pendingAcks > 0 && newHqCount > 0 && ' · '}
                {newHqCount > 0 && `새 소식 ${newHqCount}건`}
              </span>
            </div>
            <span className="hq-banner-arrow">바로가기 →</span>
          </button>
        )}

        <div className="quick-actions">
          <button className="action-card action-danger" onClick={() => onNavigate('work-stop')}>
            <div className="action-icon">🛑</div>
            <h3>작업중지권 행사</h3>
            <p>위험 상황 발견 시 즉시 신고</p>
          </button>

          <button className="action-card action-primary" onClick={() => onNavigate('suggestion')}>
            <div className="action-icon">💡</div>
            <h3>건의사항 제출</h3>
            <p>현장 개선사항을 제안해주세요</p>
          </button>

          <button
            className="action-card action-warning"
            onClick={() => onNavigate('accident-case')}
          >
            <div className="action-icon">⚠️</div>
            <h3>사고사례 제출</h3>
            <p>안전 사고 사례를 공유해주세요</p>
          </button>

          <button className="action-card action-hq" onClick={() => onNavigate('hq')}>
            <div className="action-icon">📢</div>
            <h3>
              본사 게시판
              {newHqCount > 0 && <span className="action-hq-badge">{newHqCount}</span>}
            </h3>
            <p>공지·매뉴얼·양식 본사 배포 자료</p>
          </button>

          <button className="action-card action-info" onClick={() => onNavigate('documents')}>
            <div className="action-icon">📁</div>
            <h3>현장문서</h3>
            <p>도면·계약서·점검표 조회</p>
          </button>

          <button className="action-card action-secondary" onClick={() => onNavigate('admin')}>
            <div className="action-icon">📊</div>
            <h3>관리자 대시보드</h3>
            <p>전체 현황 조회</p>
          </button>
        </div>

        {/* Sites Section */}
        <div className="sites-section">
          <h2 className="section-title">진행 중인 현장</h2>
          <p className="section-subtitle">
            현장을 선택하면 현장정보와 문서보관함을 확인할 수 있습니다.
          </p>
          <div className="sites-grid">
            {sites.map(site => (
              <div
                key={site.id}
                className="site-card site-card-clickable"
                onClick={() => onNavigate('site-detail', site.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate('site-detail', site.id);
                  }
                }}
              >
                <div className="site-header">
                  <h3 className="site-name">{site.name}</h3>
                  <span className="badge badge-success">운영중</span>
                </div>
                <p className="site-location">📍 {site.location}</p>
                <div className="site-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={e => {
                      e.stopPropagation();
                      sessionStorage.setItem('selectedSiteId', site.id.toString());
                      onNavigate('site-detail', site.id);
                    }}
                  >
                    현장 열기
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={e => {
                      e.stopPropagation();
                      sessionStorage.setItem('selectedSiteId', site.id.toString());
                      onNavigate('suggestion', site.id);
                    }}
                  >
                    건의사항
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={e => {
                      e.stopPropagation();
                      sessionStorage.setItem('selectedSiteId', site.id.toString());
                      onNavigate('work-stop', site.id);
                    }}
                  >
                    작업중지
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info Section */}
        <div className="info-section">
          <div className="info-card">
            <h3>📞 긴급 연락처</h3>
            <div className="contact-list">
              <div className="contact-item">
                <span>안전팀:</span>
                <strong>070-8233-3214</strong>
              </div>
              <div className="contact-item">
                <span>본사:</span>
                <strong>02-3444-0411</strong>
              </div>
              <a
                href="https://open.kakao.com/o/s8fVw05h"
                target="_blank"
                rel="noopener noreferrer"
                className="kakao-chat-link"
              >
                <span className="kakao-icon">💬</span>
                <div className="kakao-text">
                  <strong>안전팀장과 1:1 소통방</strong>
                  <span className="kakao-hint">카카오톡으로 바로 상담</span>
                </div>
                <span className="arrow-icon">→</span>
              </a>
            </div>
          </div>

          <div className="info-card">
            <h3>🔒 개인정보 처리방침</h3>
            <p>
              제출하신 정보는 안전관리 목적으로만 사용되며, 관련 법령에 따라 안전하게 보호됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
