import React, { useCallback, useState } from 'react';
import RiskAssessmentBoard from './RiskAssessmentBoard';
import RiskAssessment from './RiskAssessment';

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

/**
 * 위험성평가 탭
 *
 * 기본은 게시판(작성한 평가 목록)이고, 글을 누르면 서식 화면으로 전환됩니다.
 * 서식 화면에서 '← 목록' 을 누르면 다시 게시판으로 돌아옵니다.
 */
const RiskAssessmentPane: React.FC<RiskAssessmentPaneProps> = ({ siteId, siteName }) => {
  const [target, setTarget] = useState<OpenTarget | null>(null);

  const open = useCallback((id: string, edit: boolean) => {
    setTarget({ id, edit });
  }, []);

  const back = useCallback(() => {
    setTarget(null);
  }, []);

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

export default RiskAssessmentPane;
