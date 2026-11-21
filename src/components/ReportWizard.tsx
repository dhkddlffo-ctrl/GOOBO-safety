import React, { useCallback, useRef, useState } from 'react';
import {
  AttendeeList,
  AttendeeListEntry,
  MeetingAttendee,
  MeetingMinutes,
  PhotoSheet,
  PhotoSheetItem,
  ReportBundle,
  SafetySchedule,
  WorkSchedule,
  WorkScheduleRow,
} from '../types';
import {
  createEmptyMeetingAttendee,
  createEmptyWorkScheduleRow,
  ensureBundle,
  saveBundle,
} from '../utils/reportBundleStorage';
import { isAuthenticated } from '../utils/auth';
import RiskAssessment, { RiskAssessmentApi } from './RiskAssessment';
import HighGradeControl from './HighGradeControl';
import MeetingMinutesForm from './MeetingMinutesForm';
import AttendeeListForm from './AttendeeListForm';
import PhotoSheetForm from './PhotoSheetForm';
import WorkScheduleForm from './WorkScheduleForm';
import SafetyScheduleForm from './SafetyScheduleForm';
import DailyDisasterForm from './DailyDisasterForm';
import CommentBox from './CommentBox';
import './ReportForms.css';
import './ReportWizard.css';

interface ReportWizardProps {
  siteId: number;
  siteName: string;
  /** 작성 대상 등록부 id */
  assessmentId: string;
  /** 게시판으로 돌아가기 */
  onClose: () => void;
}

interface StepMeta {
  short: string;
  label: string;
  hint: string;
}

/** 보기 방식 — 단계별로 하나씩 / 여덟 서식을 위에서 아래로 */
type ViewMode = 'step' | 'flow';

/**
 * 수시 위험성평가 작성 마법사
 *
 * 회사 양식 여덟 가지를 한곳에서 작성·확인합니다.
 *   ① 수시 위험성평가 등록부 (SCM-002-1.01)
 *   ② 위험성평가 상등급 관리  (5페이지)
 *   ③ 안전 회의록             (6페이지)
 *   ④ 참석자 명단             (7페이지)
 *   ⑤ 사진대지                (3·4페이지)
 *   ⑥ 공사 공정표             (A4 가로)
 *   ⑦ 안전보건 일정           (9페이지)
 *   ⑧ 부속 서식 첨부          (10~13페이지 — 일일 재해 有·無 확인현황)
 *   ⑨ 댓글
 *
 * ⚠️ **보기 방식 두 가지**
 *    · 단계별 보기 — 한 번에 한 서식만 크게 보고 [← 이전] [다음 →] 로 넘깁니다.
 *                    새로 작성할 때 기본값입니다.
 *    · 이어 보기   — 여덟 서식을 위에서 아래로 죽 이어서 봅니다.
 *                    이미 등록된 글을 확인할 때 기본값입니다.
 *    두 방식 모두 **모든 서식이 DOM 에 살아 있어** 오가도 입력한 내용이 사라지지 않고,
 *    인쇄할 때는 CSS 로 여덟 서식을 모두 펼쳐 순서대로 출력합니다.
 *
 * ⚠️ **수정 잠금** — 게시글로 등록되면 서식은 곧바로 잠깁니다.
 *    내용을 고치려면 오른쪽 아래 **[✏️ 수정]** 을 눌러 잠금을 풀어야 합니다.
 *    (실수로 등록된 글을 건드리는 것을 막기 위함입니다)
 */
const STEPS: StepMeta[] = [
  {
    short: '등록부',
    label: '수시 위험성평가 등록부',
    hint: '강도·빈도를 고르면 평가합계와 등급이 자동 계산됩니다. 지난 작성글을 불러올 수도 있습니다.',
  },
  {
    short: '상등급',
    label: '위험성평가 상등급 관리',
    hint: '등록부에서 평가등급 ‘상’ 항목을 불러와 실천·완료를 확인합니다.',
  },
  {
    short: '회의록',
    label: '안전 회의록',
    hint: '회의 내용과 참석자·결재란을 작성합니다. 내용이 길면 장이 늘어납니다.',
  },
  {
    short: '참석자',
    label: '참석자 명단',
    hint: '업체명·직종·성명·서명을 40칸까지 적을 수 있습니다.',
  },
  {
    short: '사진대지',
    label: '사진대지',
    hint: '회의 사진(3페이지)과 모니터링 점검 사진(4페이지)을 올립니다.',
  },
  {
    short: '공정표',
    label: '공사 공정표',
    hint: '공종별 작업 기간을 넣으면 일자 칸에 막대가 그려집니다.',
  },
  {
    short: '일정',
    label: '안전보건 일정',
    hint: '월 달력에 수시위험성평가·교육 일정을 적습니다.',
  },
  {
    short: '부속서식',
    label: '부속 서식 첨부 — 일일 재해 有·無 확인현황',
    hint: '양식 10~13페이지는 엑셀·한글로 작성해 파일 그대로 올려 보관합니다.',
  },
];

const ReportWizard: React.FC<ReportWizardProps> = ({ siteId, siteName, assessmentId, onClose }) => {
  const canManage = isAuthenticated();

  const [bundle, setBundle] = useState<ReportBundle>(() =>
    ensureBundle(assessmentId, siteId, siteName),
  );
  const [savedAt, setSavedAt] = useState('');
  const [notice, setNotice] = useState('');
  /* 저장 후 단계 배지(✅)를 다시 계산하기 위한 갱신 카운터 */
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  const registered = Boolean(bundle.registeredAt);

  /**
   * 수정 잠금 해제 여부
   *
   *  - 새로 작성하는 글(미등록): 처음부터 열려 있습니다.
   *  - 이미 게시글에 등록된 글 : 잠긴 상태로 열리고, [✏️ 수정]을 눌러야 풀립니다.
   */
  const [unlocked, setUnlocked] = useState(() => !bundle.registeredAt);
  /** 지금 서식을 고칠 수 있는지 */
  const editable = unlocked;

  /* ---------------- 보기 방식 / 단계 ---------------- */
  /**
   * 보기 방식
   *  - 새로 작성하는 글은 **단계별 보기**로 시작합니다. (한 번에 한 서식만 크게)
   *  - 이미 등록된 글은 **이어 보기**로 시작합니다. (전체를 훑어보는 편이 낫습니다)
   */
  const [viewMode, setViewMode] = useState<ViewMode>(() => (bundle.registeredAt ? 'flow' : 'step'));
  const [step, setStep] = useState(0);

  const flow = viewMode === 'flow';
  const active = STEPS[step];

  /** 단계 이동 — 범위를 벗어나면 무시하고, 화면 맨 위로 올립니다. */
  const goStep = (next: number) => {
    if (next < 0 || next >= STEPS.length) return;
    setStep(next);
    setViewMode('step');
    setNotice('');
    requestAnimationFrame(() => {
      document.querySelector('.rw')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const toggleMode = () => {
    setViewMode(flow ? 'step' : 'flow');
    setNotice('');
  };

  /**
   * 서식 칸의 클래스.
   *  - 단계별 보기: 지금 단계만 보이고 나머지는 화면에서만 감춥니다.
   *  - 이어 보기  : 여덟 개를 모두 위에서 아래로 보여줍니다.
   * 두 경우 모두 DOM 에는 그대로 남아 있어 입력값이 유지되고, 인쇄에서는 전부 펼쳐집니다.
   */
  const paneCls = (index: number) => `rw-pane${flow || index === step ? '' : ' rw-pane--off'}`;

  /* ---------------- 저장 ---------------- */
  /**
   * 등록부(위험성평가표) 서식의 손잡이.
   *
   * 등록부 내용은 `RiskAssessment` 컴포넌트가 자기 상태로 들고 있어서,
   * 여기(마법사)에서는 직접 알 수 없습니다. [임시저장]·[게시글 등록]을 누를 때
   * 이 손잡이로 "지금 화면 내용을 저장해 달라"고 요청합니다.
   */
  const riskApi = useRef<RiskAssessmentApi | null>(null);

  /* ---------------- 저장 ---------------- */
  /**
   * 임시저장.
   *
   * 등록부·부속 서식을 모두 저장하되 **게시판에는 올리지 않습니다.**
   * (등록부는 `isDraft` 표시가 남아 게시판 목록에 나타나지 않습니다)
   * 나중에 게시판의 [📂 임시저장 불러오기]에서 이어 쓸 수 있습니다.
   */
  const save = useCallback(() => {
    const savedAssessment = riskApi.current?.persist() ?? null;
    saveBundle(bundle);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setNotice(
      registered
        ? '수정한 내용을 저장했습니다.'
        : '💾 임시저장했습니다. 게시판에 올리려면 [📝 게시글 등록]을 누르세요.',
    );
    /* 등록부에서 위험요인이 하나도 없으면 알려 줍니다. (저장은 그대로 됨) */
    if (savedAssessment && !registered && !savedAssessment.rows.some(r => r.hazard.trim() !== '')) {
      setNotice(
        '💾 임시저장했습니다. 위험요인을 아직 적지 않았으니, 이어서 작성한 뒤 [📝 게시글 등록]을 눌러주세요.',
      );
    }
    bump();
  }, [bundle, registered]);

  /** 수정을 마치고 다시 잠급니다. (저장 후 읽기 전용으로) */
  const finishEdit = () => {
    riskApi.current?.persist();
    saveBundle(bundle);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setUnlocked(false);
    setNotice('수정한 내용을 저장하고 다시 잠갔습니다. 고치려면 [✏️ 수정]을 누르세요.');
    bump();
  };

  /* ---------------- 게시글 등록 ---------------- */
  /**
   * 게시글 등록.
   *
   *  - 등록부의 임시저장 표시를 지워 **게시판 목록에 올립니다.**
   *  - 부속 서식 묶음에도 등록 시각(registeredAt)을 남깁니다.
   *  - 등록 후에는 다시 잠가, 실수로 고치지 않게 합니다.
   */
  const register = () => {
    const now = new Date().toISOString();
    const isFirstRegister = !bundle.registeredAt;

    /* 1) 등록부 — 게시판에 올립니다. (위험요인이 없으면 등록을 막습니다) */
    const published = riskApi.current?.publish() ?? null;
    if (!published || !published.rows.some(r => r.hazard.trim() !== '')) {
      setNotice(
        '⚠️ 게시글 등록을 하려면 위험요인을 1개 이상 적어야 합니다. [1단계 등록부]를 확인해 주세요.',
      );
      return;
    }

    /* 2) 부속 서식 묶음 — 등록 시각을 남기고 저장합니다. */
    const next: ReportBundle = { ...bundle, registeredAt: bundle.registeredAt ?? now };
    saveBundle(next);
    setBundle(next);
    /* 등록과 동시에 잠급니다 — 등록된 글은 [✏️ 수정] 전까지 고칠 수 없습니다. */
    setUnlocked(false);
    setSavedAt(new Date().toLocaleTimeString('ko-KR'));
    setNotice(
      isFirstRegister
        ? '📝 게시판에 등록되었습니다. 고치려면 [✏️ 수정]을 누르세요.'
        : '등록 내용을 갱신했습니다. 고치려면 [✏️ 수정]을 누르세요.',
    );
    bump();
  };

  /* ---------------- 전체 출력 ---------------- */
  const printAll = () => {
    riskApi.current?.persist();
    saveBundle(bundle);
    setNotice('저장 후 인쇄합니다. 인쇄 대화상자에서 여백을 “기본”으로 두세요.');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
  };

  /* ---------------- 묶음 갱신 헬퍼 ---------------- */
  const patchMeeting = (patch: Partial<MeetingMinutes>) =>
    setBundle(b => ({ ...b, meeting: { ...b.meeting, ...patch } }));

  const patchMeetingAttendee = (id: string, patch: Partial<MeetingAttendee>) =>
    setBundle(b => ({
      ...b,
      meeting: {
        ...b.meeting,
        attendees: b.meeting.attendees.map(a => (a.id === id ? { ...a, ...patch } : a)),
      },
    }));

  /** 회의록 참석자 한 명 추가 (맨 뒤에 붙입니다) */
  const addMeetingAttendee = () =>
    setBundle(b => ({
      ...b,
      meeting: {
        ...b.meeting,
        attendees: [...b.meeting.attendees, createEmptyMeetingAttendee()],
      },
    }));

  /** 회의록 참석자 한 명 삭제 (최소 1명은 남깁니다) */
  const removeMeetingAttendee = (id: string) =>
    setBundle(b => {
      if (b.meeting.attendees.length <= 1) return b;
      return {
        ...b,
        meeting: {
          ...b.meeting,
          attendees: b.meeting.attendees.filter(a => a.id !== id),
        },
      };
    });

  const patchAttendees = (patch: Partial<AttendeeList>) =>
    setBundle(b => ({ ...b, attendees: { ...b.attendees, ...patch } }));

  const patchAttendeeEntry = (id: string, patch: Partial<AttendeeListEntry>) =>
    setBundle(b => ({
      ...b,
      attendees: {
        ...b.attendees,
        entries: b.attendees.entries.map(e => (e.id === id ? { ...e, ...patch } : e)),
      },
    }));

  const patchPhotoSheet = (index: number, patch: Partial<PhotoSheet>) =>
    setBundle(b => ({
      ...b,
      photoSheets: b.photoSheets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));

  const patchPhotoItem = (index: number, id: string, patch: Partial<PhotoSheetItem>) =>
    setBundle(b => ({
      ...b,
      photoSheets: b.photoSheets.map((s, i) =>
        i === index
          ? { ...s, items: s.items.map(it => (it.id === id ? { ...it, ...patch } : it)) }
          : s,
      ),
    }));

  const patchWorkSchedule = (patch: Partial<WorkSchedule>) =>
    setBundle(b => ({ ...b, workSchedule: { ...b.workSchedule, ...patch } }));

  const patchWorkRow = (id: string, patch: Partial<WorkScheduleRow>) =>
    setBundle(b => ({
      ...b,
      workSchedule: {
        ...b.workSchedule,
        rows: b.workSchedule.rows.map(r => (r.id === id ? { ...r, ...patch } : r)),
      },
    }));

  const addWorkRow = () =>
    setBundle(b => ({
      ...b,
      workSchedule: {
        ...b.workSchedule,
        rows: [...b.workSchedule.rows, createEmptyWorkScheduleRow()],
      },
    }));

  /* 마지막 남은 한 줄은 지우지 않습니다. (빈 서식이 되어 버립니다) */
  const removeWorkRow = (id: string) =>
    setBundle(b => {
      if (b.workSchedule.rows.length <= 1) return b;
      return {
        ...b,
        workSchedule: {
          ...b.workSchedule,
          rows: b.workSchedule.rows.filter(r => r.id !== id),
        },
      };
    });

  const patchSchedule = (patch: Partial<SafetySchedule>) =>
    setBundle(b => ({ ...b, schedule: { ...b.schedule, ...patch } }));

  const setScheduleNote = (date: string, text: string) =>
    setBundle(b => ({
      ...b,
      schedule: { ...b.schedule, notes: { ...b.schedule.notes, [date]: text } },
    }));

  return (
    <div className="rw">
      {/* ---------- 머리글 ---------- */}
      <div className="rw-chrome">
        <div className="rw-head">
          <div className="rw-head-text">
            <h3 className="rw-title">🧾 수시 위험성평가 작성</h3>
            <p className="rw-sub">
              회사 양식 {STEPS.length}종을 <b>한곳에서 순서대로</b> 작성합니다. 다 쓰고 나면
              게시판에 등록하고 한 번에 인쇄할 수 있습니다.
            </p>
          </div>
          <div className="rw-head-right">
            {registered && <span className="rw-badge rw-badge-done">✅ 등록됨</span>}
            {registered && !unlocked && (
              <span className="rw-badge rw-badge-lock">🔒 읽기 전용</span>
            )}
            {editable && registered && <span className="rw-badge rw-badge-edit">✏️ 수정 중</span>}
            <span className="rw-count">
              {flow ? `전체 ${STEPS.length}개 서식` : `${step + 1} / ${STEPS.length} 단계`}
            </span>
            <button
              type="button"
              className={`btn btn-sm rw-btn-mode${flow ? ' active' : ''}`}
              onClick={toggleMode}
              title={
                flow
                  ? '단계별로 하나씩 보는 방식으로 돌아갑니다.'
                  : `서식 ${STEPS.length}개를 위에서 아래로 이어서 봅니다.`
              }
            >
              {flow ? '📑 단계별 보기' : '📜 이어 보기'}
            </button>
            <button className="btn btn-sm rw-btn-back" onClick={onClose}>
              ← 목록
            </button>
          </div>
        </div>

        {/* ---------- 단계 표시 (이어 보기일 때는 숨김) ---------- */}
        {!flow && (
          <nav className="rw-steps" aria-label="작성 단계">
            {STEPS.map((meta, index) => (
              <button
                type="button"
                key={meta.short}
                className={`rw-step-btn${index === step ? ' active' : ''}${
                  index < step ? ' passed' : ''
                }`}
                onClick={() => goStep(index)}
                aria-current={index === step ? 'step' : undefined}
                title={meta.label}
              >
                <span className="rw-step-no">{index + 1}</span>
                <span className="rw-step-label">{meta.short}</span>
              </button>
            ))}
          </nav>
        )}

        {/* ---------- 지금 보고 있는 곳 안내 ---------- */}
        {flow ? (
          <div className="rw-current">
            <span className="rw-current-title">📜 전체 서식 이어 보기</span>
            <span className="rw-current-hint">
              {editable
                ? `여덟 개 서식을 위에서 아래로 이어서 작성합니다. 다 쓰면 [📝 게시글 등록]을 누르세요.`
                : '등록된 글을 위에서 아래로 이어서 봅니다. 고치려면 오른쪽 아래 [✏️ 수정]을 누르세요.'}
            </span>
          </div>
        ) : (
          <div className="rw-current">
            <span className="rw-current-title">
              {step + 1}. {active.label}
            </span>
            <span className="rw-current-hint">{active.hint}</span>
          </div>
        )}

        {savedAt && <p className="rw-saved">💾 저장되었습니다 ({savedAt})</p>}
        {notice && <p className="rw-notice">{notice}</p>}
      </div>

      {/* ---------- 서식 (여덟 개 모두 마운트, 화면에선 보기 방식에 따라) ---------- */}
      <div className="rw-body">
        <div className={paneCls(0)} data-step="register">
          {flow && <p className="rw-flow-label">1. 수시 위험성평가 등록부</p>}
          <RiskAssessment
            siteId={siteId}
            siteName={siteName}
            initialId={assessmentId}
            startEditInitially={!registered}
            readOnly={!editable}
            apiRef={riskApi}
            embedded
          />
        </div>

        <div className={paneCls(1)} data-step="high">
          {flow && <p className="rw-flow-label">2. 위험성평가 상등급 관리</p>}
          <HighGradeControl
            siteId={siteId}
            siteName={siteName}
            autoEdit={!registered}
            readOnly={!editable}
            embedded
          />
        </div>

        <div className={paneCls(2)} data-step="meeting">
          {flow && <p className="rw-flow-label">3. 안전 회의록</p>}
          <MeetingMinutesForm
            value={bundle.meeting}
            editing={editable}
            onChange={patchMeeting}
            onAttendeeChange={patchMeetingAttendee}
            onAttendeeAdd={addMeetingAttendee}
            onAttendeeRemove={removeMeetingAttendee}
          />
        </div>

        <div className={paneCls(3)} data-step="attendees">
          {flow && <p className="rw-flow-label">4. 참석자 명단</p>}
          <AttendeeListForm
            value={bundle.attendees}
            editing={editable}
            siteName={siteName}
            onChange={patchAttendees}
            onEntryChange={patchAttendeeEntry}
          />
        </div>

        <div className={paneCls(4)} data-step="photo">
          {flow && <p className="rw-flow-label">5. 사진대지</p>}
          <div className="rw-photo-stack">
            <p className="rw-sub-head">① 위험성평가 회의 사진대지 (3페이지)</p>
            <PhotoSheetForm
              value={bundle.photoSheets[0]}
              editing={editable}
              siteName={siteName}
              onChange={patch => patchPhotoSheet(0, patch)}
              onItemChange={(id, patch) => patchPhotoItem(0, id, patch)}
            />
            <p className="rw-sub-head">② 모니터링 안전점검 사진대지 (4페이지)</p>
            <PhotoSheetForm
              value={bundle.photoSheets[1]}
              editing={editable}
              siteName={siteName}
              onChange={patch => patchPhotoSheet(1, patch)}
              onItemChange={(id, patch) => patchPhotoItem(1, id, patch)}
            />
          </div>
        </div>

        <div className={paneCls(5)} data-step="work">
          {flow && <p className="rw-flow-label">6. 공사 공정표</p>}
          <WorkScheduleForm
            value={bundle.workSchedule}
            editing={editable}
            siteName={siteName}
            onChange={patchWorkSchedule}
            onRowChange={patchWorkRow}
            onAddRow={addWorkRow}
            onRemoveRow={removeWorkRow}
          />
        </div>

        <div className={paneCls(6)} data-step="schedule">
          {flow && <p className="rw-flow-label">7. 안전보건 일정</p>}
          <SafetyScheduleForm
            value={bundle.schedule}
            editing={editable}
            siteName={siteName}
            onChange={patchSchedule}
            onNoteChange={setScheduleNote}
          />
        </div>

        <div className={paneCls(7)} data-step="attach">
          {flow && <p className="rw-flow-label">8. 부속 서식 첨부 — 일일 재해 有·無 확인현황</p>}
          <DailyDisasterForm
            siteId={siteId}
            siteName={siteName}
            readOnly={!editable || !canManage}
          />
        </div>
      </div>

      {/* ---------- 맨 마지막: 댓글 ---------- */}
      {registered ? (
        <CommentBox targetType="assessment" targetId={assessmentId} siteId={siteId} />
      ) : (
        <p className="rw-comment-hint">💬 댓글은 [📝 게시글 등록] 후에 남길 수 있습니다.</p>
      )}

      {/* ---------- 하단 이동 / 잠금 / 등록 / 인쇄 ---------- */}
      <div className="rw-nav">
        <div className="rw-nav-left">
          {flow ? (
            <span className="rw-flow-hint">
              {registered && !unlocked
                ? '🔒 등록된 글입니다. 내용을 고치려면 [✏️ 수정]을 누르세요.'
                : '✏️ 수정 중입니다. 다 고쳤으면 [💾 저장] 또는 [🔒 수정 완료]를 누르세요.'}
            </span>
          ) : (
            <>
              <button
                className="btn btn-sm rw-btn-prev"
                onClick={() => goStep(step - 1)}
                disabled={step === 0}
              >
                ← 이전
              </button>
              <button
                className="btn btn-sm rw-btn-next"
                onClick={() => goStep(step + 1)}
                disabled={step === STEPS.length - 1}
              >
                다음 →
              </button>
              <span className="rw-flow-hint">
                {step + 1} / {STEPS.length} · {active.short}
              </span>
            </>
          )}
        </div>

        <div className="rw-nav-right">
          {/* 잠겨 있을 때만 보이는 수정 버튼 */}
          {registered && !unlocked && canManage && (
            <button
              className="btn btn-sm btn-primary rw-btn-edit"
              onClick={() => {
                setUnlocked(true);
                setNotice('');
              }}
            >
              ✏️ 수정
            </button>
          )}

          {/* 수정 중일 때만 보이는 저장 / 등록 / 잠금 */}
          {editable && (
            <>
              <button
                className="btn btn-sm rw-btn-save"
                onClick={save}
                title={
                  registered
                    ? '지금 내용을 저장합니다.'
                    : '게시판에 올리지 않고 작성 중인 내용만 저장합니다. 나중에 [📂 임시저장 불러오기]로 이어 쓸 수 있습니다.'
                }
              >
                {registered ? '💾 저장' : '💾 임시저장'}
              </button>
              <button
                className="btn btn-sm rw-btn-register"
                onClick={register}
                title={
                  registered
                    ? '수정한 내용을 게시판에 반영합니다.'
                    : '게시판에 올립니다. 등록해야 목록에서 다른 사람도 볼 수 있습니다.'
                }
              >
                {registered ? '🔄 등록 갱신' : '📝 게시글 등록'}
              </button>
              {registered && (
                <button className="btn btn-sm rw-btn-lock" onClick={finishEdit}>
                  🔒 수정 완료
                </button>
              )}
            </>
          )}

          <button className="btn btn-sm btn-primary rw-btn-print" onClick={printAll}>
            🖨️ 전체 출력
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportWizard;
