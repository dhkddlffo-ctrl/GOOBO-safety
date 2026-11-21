import React, { useMemo, useState, useEffect } from 'react';
import { getSites } from '../utils/storage';
import { Site } from '../types';
import {
  countNewHqPosts,
  formatHqDate,
  getActiveHqPosts,
  getPendingAckPosts,
  getRecentHqPosts,
  HQ_CHANGED_EVENT,
  resolveHqCategoryMeta,
  summarizeAcks,
} from '../utils/hqStorage';
import { getDocuments } from '../utils/documentStorage';
import Icon, { IconName } from '../components/Icon';
import './HomePage.css';

interface HomePageProps {
  onNavigate: (page: string, siteId?: number) => void;
}

/** 빠른 실행 항목 (행 목록) */
interface QuickAction {
  page: string;
  title: string;
  desc: string;
  icon: IconName;
  tone: 'red' | 'blue' | 'amber' | 'gold' | 'slate' | 'ink';
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    page: 'work-stop',
    title: '작업중지권 행사',
    desc: '급박한 위험 발견 시 즉시 신고',
    icon: 'shield',
    tone: 'red',
  },
  {
    page: 'suggestion',
    title: '건의사항 제출',
    desc: '현장 개선사항을 제안',
    icon: 'bulb',
    tone: 'blue',
  },
  {
    page: 'accident-case',
    title: '사고사례 제출',
    desc: '안전 사고 사례 공유',
    icon: 'alert',
    tone: 'amber',
  },
  {
    page: 'hq',
    title: '본사 게시판',
    desc: '공지 · 매뉴얼 · 양식 배포',
    icon: 'megaphone',
    tone: 'gold',
  },
  {
    page: 'documents',
    title: '현장문서',
    desc: '도면 · 계약서 · 점검표 조회',
    icon: 'folder',
    tone: 'slate',
  },
  {
    page: 'admin',
    title: '관리자 대시보드',
    desc: '전체 현황 조회 (로그인 필요)',
    icon: 'chart',
    tone: 'ink',
  },
];

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [newHqCount, setNewHqCount] = useState(0);
  const [pendingAcks, setPendingAcks] = useState(0);
  const [hqTotal, setHqTotal] = useState(0);
  const [ackRate, setAckRate] = useState(0);
  const [recentPosts, setRecentPosts] = useState<ReturnType<typeof getRecentHqPosts>>([]);
  const [docCounts, setDocCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    const savedSites = getSites();
    const active = savedSites.filter(s => s.status === 'active');
    setSites(active);

    /** 문서보관함 건수 (현장별) */
    const countDocs = () => {
      const map: Record<number, number> = {};
      getDocuments().forEach(d => {
        map[d.siteId] = (map[d.siteId] ?? 0) + 1;
      });
      setDocCounts(map);
    };
    countDocs();

    /* 본사 게시판 요약
       - 새 소식 : 마지막 열람 이후 등록된 글
       - 필독 미확인 : 현장 한 곳이라도 확인하지 않은 필독 글 (글 단위로 중복 제거)
       - 평균 확인률 : 필독 글들의 현장 확인률 평균 */
    const sync = () => {
      setNewHqCount(countNewHqPosts());
      const activePosts = getActiveHqPosts();
      setHqTotal(activePosts.length);
      setRecentPosts(getRecentHqPosts(4));

      const pending = new Set<string>();
      active.forEach(site => getPendingAckPosts(site.id).forEach(p => pending.add(p.id)));
      setPendingAcks(pending.size);

      const ackPosts = activePosts.filter(p => p.requireAck);
      if (ackPosts.length === 0) {
        setAckRate(0);
      } else {
        const sum = ackPosts.reduce((acc, p) => acc + summarizeAcks(p, active).rate, 0);
        setAckRate(Math.round(sum / ackPosts.length));
      }
    };
    sync();

    window.addEventListener(HQ_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(HQ_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}`;
  }, []);

  const hasAlarm = pendingAcks > 0 || newHqCount > 0;

  return (
    <div className="hm-page">
      <div className="container">
        {/* ---------- 현황 헤더 ---------- */}
        <div className="hm-head">
          <div className="hm-head-main">
            <span className="hm-eyebrow">구보공영(주) 안전보건</span>
            <h1 className="hm-title">현장 안전 관리 시스템</h1>
            <p className="hm-sub">
              근로자 여러분의 목소리를 듣습니다. 안전한 작업환경을 위해 함께 노력하겠습니다.
            </p>
          </div>
          <span className="hm-today">{today}</span>
        </div>

        {/* ---------- C안 KPI 띠 ---------- */}
        <div className="hm-kpi">
          <div className="hm-kpi-item">
            <span className="hm-kpi-label">진행 현장</span>
            <span className="hm-kpi-value">
              {sites.length}
              <em>개</em>
            </span>
          </div>
          <div className="hm-kpi-item">
            <span className="hm-kpi-label">본사 자료</span>
            <span className="hm-kpi-value">
              {hqTotal}
              <em>건</em>
            </span>
          </div>
          <div className="hm-kpi-item">
            <span className="hm-kpi-label">필독 미확인</span>
            <span className={`hm-kpi-value${pendingAcks > 0 ? ' is-alert' : ''}`}>
              {pendingAcks}
              <em>건</em>
            </span>
          </div>
          <div className="hm-kpi-item">
            <span className="hm-kpi-label">필독 평균 확인률</span>
            <span className={`hm-kpi-value${ackRate < 100 ? ' is-warn' : ' is-ok'}`}>
              {ackRate}
              <em>%</em>
            </span>
          </div>
        </div>

        {/* ---------- 필독 알림 바 ---------- */}
        {hasAlarm && (
          <button type="button" className="hm-alarm" onClick={() => onNavigate('hq')}>
            <span className="hm-alarm-icon">
              <Icon name="bell" size={18} />
            </span>
            <span className="hm-alarm-text">
              <strong>본사 게시판 확인이 필요합니다</strong>
              <span>
                {pendingAcks > 0 && `확인하지 않은 필독 자료 ${pendingAcks}건`}
                {pendingAcks > 0 && newHqCount > 0 && ' · '}
                {newHqCount > 0 && `새 소식 ${newHqCount}건`}
              </span>
            </span>
            <span className="hm-alarm-go">
              바로가기
              <Icon name="chevron-right" size={15} />
            </span>
          </button>
        )}

        {/* ---------- 빠른 실행 ---------- */}
        <section className="hm-section">
          <div className="hm-section-head">
            <h2 className="hm-section-title">빠른 실행</h2>
            <p className="hm-section-sub">자주 쓰는 업무를 바로 시작합니다.</p>
          </div>

          <div className="hm-actions">
            {QUICK_ACTIONS.map(action => (
              <button
                key={action.page}
                type="button"
                className={`hm-action tone-${action.tone}`}
                onClick={() => onNavigate(action.page)}
              >
                <span className="hm-action-icon">
                  <Icon name={action.icon} size={19} />
                </span>
                <span className="hm-action-body">
                  <span className="hm-action-title">
                    {action.title}
                    {action.page === 'hq' && newHqCount > 0 && (
                      <span className="hm-action-badge">{newHqCount}</span>
                    )}
                  </span>
                  <span className="hm-action-desc">{action.desc}</span>
                </span>
                <span className="hm-action-arrow">
                  <Icon name="chevron-right" size={16} />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ---------- 본사 소식 ---------- */}
        <section className="hm-section">
          <div className="hm-section-head is-row">
            <div>
              <h2 className="hm-section-title">본사 소식</h2>
              <p className="hm-section-sub">본사에서 최근 배포한 자료입니다.</p>
            </div>
            <button type="button" className="hm-text-btn" onClick={() => onNavigate('hq')}>
              전체 보기
              <Icon name="chevron-right" size={14} />
            </button>
          </div>

          <div className="hm-news">
            {recentPosts.length === 0 ? (
              <div className="hm-news-empty">
                <span className="hm-news-empty-icon">
                  <Icon name="megaphone" size={20} />
                </span>
                <span>아직 배포된 본사 자료가 없습니다.</span>
              </div>
            ) : (
              recentPosts.map(post => {
                const meta = resolveHqCategoryMeta(post.category);
                return (
                  <button
                    key={post.id}
                    type="button"
                    className="hm-news-row"
                    onClick={() => onNavigate('hq')}
                  >
                    <span className="hm-news-cat" style={{ color: meta.color }}>
                      {post.category}
                    </span>
                    <span className="hm-news-title">
                      {post.pinned && (
                        <span className="hm-news-pin">
                          <Icon name="pin" size={13} />
                        </span>
                      )}
                      {post.title}
                    </span>
                    <span className="hm-news-ver">{post.version}</span>
                    <span className="hm-news-date">{formatHqDate(post.createdAt)}</span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* ---------- 진행 중인 현장 ---------- */}
        <section className="hm-section">
          <div className="hm-section-head is-row">
            <div>
              <h2 className="hm-section-title">진행 중인 현장</h2>
              <p className="hm-section-sub">행을 선택하면 현장정보와 문서보관함으로 이동합니다.</p>
            </div>
            <span className="hm-count-chip">{sites.length}개 현장</span>
          </div>

          <div className="hm-sites">
            <div className="hm-site-head" aria-hidden="true">
              <span className="hm-col-name">현장명</span>
              <span className="hm-col-loc">소재지</span>
              <span className="hm-col-doc">보관문서</span>
              <span className="hm-col-status">상태</span>
              <span className="hm-col-go" />
            </div>

            {sites.map(site => (
              <button
                key={site.id}
                type="button"
                className="hm-site-row"
                onClick={() => {
                  sessionStorage.setItem('selectedSiteId', site.id.toString());
                  onNavigate('site-detail', site.id);
                }}
              >
                <span className="hm-col-name">
                  <span className="hm-site-icon">
                    <Icon name="building" size={16} />
                  </span>
                  <span className="hm-site-name">{site.name}</span>
                </span>
                <span className="hm-col-loc">{site.location}</span>
                <span className="hm-col-doc">
                  {docCounts[site.id] ?? 0}
                  <em>건</em>
                </span>
                <span className="hm-col-status">
                  <span className="hm-status">운영중</span>
                </span>
                <span className="hm-col-go">
                  <Icon name="chevron-right" size={16} />
                </span>
              </button>
            ))}

            {sites.length === 0 && <div className="hm-sites-empty">등록된 현장이 없습니다.</div>}
          </div>
        </section>

        {/* ---------- 하단 정보 ---------- */}
        <section className="hm-info">
          <div className="hm-info-card">
            <h3 className="hm-info-title">
              <Icon name="phone" size={16} />
              긴급 연락처
            </h3>
            <div className="hm-contact">
              <span>안전팀</span>
              <strong>070-8233-3214</strong>
            </div>
            <div className="hm-contact">
              <span>본사</span>
              <strong>02-3444-0411</strong>
            </div>
            <a
              className="hm-kakao"
              href="https://open.kakao.com/o/s8fVw05h"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="hm-kakao-icon">
                <Icon name="message" size={17} />
              </span>
              <span className="hm-kakao-body">
                <strong>안전팀장과 1:1 소통방</strong>
                <span>카카오톡으로 바로 상담</span>
              </span>
              <Icon name="chevron-right" size={15} />
            </a>
          </div>

          <div className="hm-info-card">
            <h3 className="hm-info-title">
              <Icon name="lock" size={16} />
              개인정보 처리방침
            </h3>
            <p className="hm-info-text">
              제출하신 정보는 안전관리 목적으로만 사용되며, 관련 법령에 따라 안전하게 보호됩니다.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomePage;
