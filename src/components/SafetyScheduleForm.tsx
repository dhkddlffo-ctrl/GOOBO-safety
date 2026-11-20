import React from 'react';
import { SafetySchedule } from '../types';
import { WEEKDAY_LABELS, buildMonthGrid } from '../utils/reportBundleStorage';

interface SafetyScheduleFormProps {
  value: SafetySchedule;
  editing: boolean;
  siteName: string;
  onChange: (patch: Partial<SafetySchedule>) => void;
  onNoteChange: (date: string, text: string) => void;
}

/**
 * ( ) 월 안전보건 일정 (양식 SCM-005-2.00 / 9페이지 / A4 가로)
 *
 * 제목줄 우측에 결재란(작성·검토×3·승인)이 있고,
 * 본문은 일~토 7칸 달력에 날짜 줄과 내용 줄이 번갈아 나옵니다.
 */
const SafetyScheduleForm: React.FC<SafetyScheduleFormProps> = ({
  value,
  editing,
  siteName,
  onChange,
  onNoteChange,
}) => {
  const yearNum = Number(value.year) || new Date().getFullYear();
  const monthNum = Number(value.month) || new Date().getMonth() + 1;
  const rows = buildMonthGrid(yearNum, monthNum);

  const setApproval = (key: keyof SafetySchedule['approval'], text: string) => {
    onChange({ approval: { ...value.approval, [key]: text } });
  };

  const apprField = (key: keyof SafetySchedule['approval'], label: string) => (
    <input
      value={value.approval[key]}
      onChange={e => setApproval(key, e.target.value)}
      readOnly={!editing}
      aria-label={label}
      placeholder=""
    />
  );

  return (
    <section className="rf-sheet rf-sheet--landscape" aria-label="안전보건 일정">
      <div className="rf-sc">
        {/* ---------- 머리글: 제목 + 결재 ---------- */}
        <div className="rf-sc-head">
          <div className="rf-sc-head-title">
            <span>(</span>
            <input
              value={value.month}
              onChange={e => onChange({ month: e.target.value })}
              readOnly={!editing}
              aria-label="월"
              placeholder="  "
            />
            <span>) 월</span>
            <span style={{ marginLeft: '0.5rem', letterSpacing: '0.34em' }}>안 보 건 일 정</span>
          </div>

          <div className="rf-sc-appr-label" style={{ borderLeft: '1px solid #111827' }}>
            작성
          </div>
          <div className="rf-sc-appr-label" style={{ borderLeft: '1px solid #111827' }}>
            검토
          </div>
          <div className="rf-sc-appr-label" style={{ borderLeft: '1px solid #111827' }}>
            검토
          </div>
          <div className="rf-sc-appr-label" style={{ borderLeft: '1px solid #111827' }}>
            검토
          </div>
          <div className="rf-sc-appr-label" style={{ borderLeft: '1px solid #111827' }}>
            승인
          </div>

          <div className="rf-sc-appr-value" style={{ borderLeft: '1px solid #111827' }}>
            {apprField('writer', '작성')}
          </div>
          <div
            className="rf-sc-appr-value rf-sc-appr-slash"
            style={{ borderLeft: '1px solid #111827' }}
          >
            {apprField('review1', '검토1')}
          </div>
          <div
            className="rf-sc-appr-value rf-sc-appr-slash"
            style={{ borderLeft: '1px solid #111827' }}
          >
            {apprField('review2', '검토2')}
          </div>
          <div
            className="rf-sc-appr-value rf-sc-appr-slash"
            style={{ borderLeft: '1px solid #111827' }}
          >
            {apprField('review3', '검토3')}
          </div>
          <div className="rf-sc-appr-value" style={{ borderLeft: '1px solid #111827' }}>
            {apprField('approver', '승인')}
          </div>
        </div>

        {/* ---------- 달력 ---------- */}
        <table className="rf-sc-grid">
          <colgroup>
            {WEEKDAY_LABELS.map((_, i) => (
              <col key={`sc-col-${i}`} style={{ width: `${100 / 7}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {WEEKDAY_LABELS.map((label, i) => (
                <th
                  key={label}
                  className={i === 0 ? 'rf-sc-sun' : i === 6 ? 'rf-sc-sat' : undefined}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((week, weekIndex) => (
              <React.Fragment key={`sc-week-${weekIndex}`}>
                {/* 날짜 줄 */}
                <tr>
                  {week.map((cell, dayIndex) => (
                    <td
                      key={`d-${weekIndex}-${dayIndex}`}
                      className={`rf-sc-day${
                        !cell.inMonth
                          ? ' rf-sc-day--empty'
                          : cell.weekday === 0
                            ? ' rf-sc-day--off'
                            : ''
                      }`}
                    >
                      {cell.day || ''}
                    </td>
                  ))}
                </tr>
                {/* 내용 줄 */}
                <tr>
                  {week.map((cell, dayIndex) => (
                    <td key={`n-${weekIndex}-${dayIndex}`} className="rf-sc-note">
                      {cell.inMonth ? (
                        editing ? (
                          <textarea
                            value={value.notes[cell.date] ?? ''}
                            onChange={e => onNoteChange(cell.date, e.target.value)}
                            aria-label={`${cell.date} 일정`}
                          />
                        ) : (
                          <span className="rf-cell-text">{value.notes[cell.date] ?? ''}</span>
                        )
                      ) : null}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>

        <div className="rf-sc-foot">
          <span>양식 SCM-005-2.00</span>
          <span className="rf-sc-foot-center">구 보 공 영 (주)</span>
          <span>A(297x210) · {siteName}</span>
        </div>
      </div>
    </section>
  );
};

export default SafetyScheduleForm;
