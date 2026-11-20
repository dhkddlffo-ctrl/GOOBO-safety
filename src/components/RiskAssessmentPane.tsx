import React, { useCallback, useState } from 'react';
import RiskAssessmentBoard from './RiskAssessmentBoard';
import RiskAssessment from './RiskAssessment';
import HighGradeControl from './HighGradeControl';
import './RiskAssessmentPane.css';

interface RiskAssessmentPaneProps {
  siteId: number;
  siteName: string;
}

/** 서식 화면에서 열 평가서 정보 */
interface OpenTarget {
  id: string;
  /** 게시판의 '위험성평가 작성'으로 들어왔는지 (바로 편집 모드) */
  edit: boolean;
}

/** 상단 세그먼트 (등록부 / 상등급 관리) */
type Segment = 'register' | 'high';

/**
 * 위험성평가 탭
 *
 * 1) 수시 위험성평가 등록부 — 기본은 게시판(작성한 평가 목록)이고,
 *    글을 누르면 서식 화면으로 전환됩니다. '← 목록' 을 누르면 다시 게시판으로 돌아옵니다.
 * 2) 상등급 관리 — 등록부에서 평가등급 '상' 항목을 모아 관리하는 A4 가로 서식입니다.
 */
const RiskAssessmentPane: React.FC<RiskAssessmentPaneProps> = ({ siteId, siteName }) => {
  const [segment, setSegment] = useState<Segment>('register');
  const [target, setTarget] = useState<OpenTarget | null>(null);

  const open = useCallback((id: string, edit: boolean) => {
    setTarget({ id, edit });
  }, []);

  const back = useCallback(() => {
    setTarget(null);
  }, []);

  /* 다른 세그먼트로 옮길 때는 서식 화면을 닫아 둡니다. */
  const moveTo = (next: Segment) => {
    setSegment(next);
    setTarget(null);
  };

  const renderRegister = () => {
    if (target === null) {
      return <RiskAssessmentBoard siteId={siteId} siteName={siteName} onOpen={open} />;
    }
    /*
     * key 에 id 를 넣어 다른 글을 열 때 컴포넌트가 확실히 새로 초기화되도록 합니다.
     * (초기 선택/편집 모드가 props 로만 전달되기 때문)
     */
    return (
      <RiskAssessment
        key={`${siteId}-${target.id}`}
        siteId={siteId}
        siteName={siteName}
        initialId={target.id}
        startEditInitially={target.edit}
        onBack={back}
      />
    );
  };

  return (
    <div className="ra-pane">
      {/* 서식(인쇄 대상)만 남기고 내비게이션은 인쇄에서 숨깁니다. */}
      <nav className="sd-segment" aria-label="위험성평가 구분">
        <button
          type="button"
          className={`sd-segment-btn${segment === 'register' ? ' active' : ''}`}
          onClick={() => moveTo('register')}
          aria-current={segment === 'register' ? 'page' : undefined}
        >
          📋 수시 위험성평가 등록부
        </button>
        <button
          type="button"
          className={`sd-segment-btn${segment === 'high' ? ' active' : ''}`}
          onClick={() => moveTo('high')}
          aria-current={segment === 'high' ? 'page' : undefined}
        >
          🔺 상등급 관리
        </button>
      </nav>

      {segment === 'register' ? (
        renderRegister()
      ) : (
        <HighGradeControl key={`hg-${siteId}`} siteId={siteId} siteName={siteName} />
      )}
    </div>
  );
};

export default RiskAssessmentPane;
