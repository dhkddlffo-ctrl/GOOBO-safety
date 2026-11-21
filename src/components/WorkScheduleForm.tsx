import React from 'react';
import { WorkSchedule, WorkScheduleRow } from '../types';
import {
  buildWorkDayAxis,
  countWorkDays,
  isDayInWork,
  MAX_WORK_DAYS,
} from '../utils/reportBundleStorage';

interface WorkScheduleFormProps {
  value: WorkSchedule;
  editing: boolean;
  siteName: string;
  onChange: (patch: Partial<WorkSchedule>) => void;
  onRowChange: (id: string, patch: Partial<WorkScheduleRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}

/** yyyy-mm-dd → yyyy.mm.dd (종이에 찍을 때 쓰는 표기) */
const fmtDate = (ymd: string): string => {
  if (!ymd || ymd.length < 10) return '';
  return ymd.replace(/-/g, '.');
};

/**
 * 날짜 한 칸.
 * 화면에서는 날짜 선택기(input type=date)를 쓰고,
 * 인쇄할 때는 브라우저가 11/21/2026 처럼 영어식으로 찍기 때문에
 * 2026.11.21 형태의 글자로 바꿔서 내보냅니다.
 */
const DateField: React.FC<{
  value: string;
  label: string;
  editing: boolean;
  onChange: (next: string) => void;
}> = ({ value, label, editing, onChange }) => (
  <span className="rf-ws-datefield">
    <input
      className="rf-in rf-c rf-ws-date-in"
      type="date"
      value={value}
      onChange={e => onChange(e.target.value)}
      readOnly={!editing}
      aria-label={label}
    />
    <span className="rf-ws-date-read">{fmtDate(value)}</span>
  </span>
);

/**
 * 공 사 공 정 표 (A4 가로)
 *
 * 공종별 작업 기간을 일자 칸에 가로 막대로 표시합니다.
 * 본사 모니터링 확인 항목에 들어가는 서식입니다.
 *
 * ⚠️ 한 장에 담을 수 있는 일수는 MAX_WORK_DAYS(31일)까지입니다.
 *    기간이 길면 31일까지만 그려지고 화면에 안내 문구가 나옵니다.
 */
const WorkScheduleForm: React.FC<WorkScheduleFormProps> = ({
  value,
  editing,
  siteName,
  onChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
}) => {
  const days = buildWorkDayAxis(value.periodStart, value.periodEnd);
  /* 기간이 31일을 넘으면 뒤쪽이 잘리므로 화면에 안내를 띄웁니다. */
  const totalDays = countWorkDays(value.periodStart, value.periodEnd);
  const truncated = totalDays > days.length;

  const setApproval = (key: keyof WorkSchedule['approval'], text: string) => {
    onChange({ approval: { ...value.approval, [key]: text } });
  };

  const apprField = (key: keyof WorkSchedule['approval'], label: string) => (
    <input
      className="rf-in rf-c rf-ws-appr-in"
      value={value.approval[key]}
      onChange={e => setApproval(key, e.target.value)}
      readOnly={!editing}
      aria-label={label}
      placeholder="성명"
    />
  );

  return (
    <section className="rf-sheet rf-sheet--landscape" aria-label="공사 공정표">
      {/* 화면에서만 보이는 편집 도구 */}
      <div className="rf-ws-toolbar">
        <span className="rf-ws-toolbar-hint">
          공종별 <b>시작일·종료일</b>을 넣으면 오른쪽 일자 칸에 막대가 그려집니다. (최대{' '}
          {MAX_WORK_DAYS}일)
        </span>
        {editing && (
          <button type="button" className="rf-ws-add" onClick={onAddRow}>
            + 행 추가
          </button>
        )}
      </div>

      <h2 className="rf-title rf-title--bordered">공 사 공 정 표</h2>

      <div className="rf-ws">
        {/* ---------- 머리 정보 ---------- */}
        <div className="rf-ws-meta">
          <div className="rf-ws-meta-row">
            <span className="rf-ws-lb">현 장 명</span>
            <span className="rf-ws-val">
              <input
                className="rf-in"
                value={value.constructionName}
                onChange={e => onChange({ constructionName: e.target.value })}
                readOnly={!editing}
                aria-label="현장명"
                placeholder={siteName}
              />
            </span>
            <span className="rf-ws-lb">작 성 일</span>
            <span className="rf-ws-val">
              <DateField
                value={value.writtenAt}
                label="작성일"
                editing={editing}
                onChange={next => onChange({ writtenAt: next })}
              />
            </span>
          </div>

          <div className="rf-ws-meta-row">
            <span className="rf-ws-lb">공 정 기 간</span>
            <span className="rf-ws-val rf-ws-period">
              <DateField
                value={value.periodStart}
                label="공정 기간 시작"
                editing={editing}
                onChange={next => onChange({ periodStart: next })}
              />
              <span className="rf-ws-period-tilde">~</span>
              <DateField
                value={value.periodEnd}
                label="공정 기간 종료"
                editing={editing}
                onChange={next => onChange({ periodEnd: next })}
              />
            </span>
            <span className="rf-ws-lb">결 재</span>
            <span className="rf-ws-val rf-ws-appr">
              <label className="rf-ws-appr-cell">
                <span>작성</span>
                {apprField('writer', '작성')}
              </label>
              <label className="rf-ws-appr-cell rf-ws-appr-slash">
                <span>검토</span>
                {apprField('reviewer', '검토')}
              </label>
              <label className="rf-ws-appr-cell">
                <span>승인</span>
                {apprField('approver', '승인')}
              </label>
            </span>
          </div>
        </div>

        {/* ---------- 공정표 본문 ---------- */}
        {days.length === 0 ? (
          <p className="rf-ws-empty">
            공정 기간을 먼저 입력해 주세요. (시작일이 종료일보다 늦으면 막대가 그려지지 않습니다)
          </p>
        ) : (
          <table className="rf-table rf-ws-table">
            <colgroup>
              <col style={{ width: '7mm' }} />
              <col style={{ width: '34mm' }} />
              <col style={{ width: '24mm' }} />
              <col style={{ width: '22mm' }} />
              {days.map(cell => (
                <col key={`ws-col-${cell.date}`} />
              ))}
              <col style={{ width: '16mm' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>NO</th>
                <th rowSpan={2}>공 종</th>
                <th rowSpan={2}>작업 위치</th>
                <th rowSpan={2}>담 당</th>
                {days.map(cell => (
                  <th
                    key={`ws-h-${cell.date}`}
                    className={`rf-ws-dnum${
                      cell.weekday === 0 ? ' rf-ws-sun' : cell.weekday === 6 ? ' rf-ws-sat' : ''
                    }`}
                  >
                    {cell.day}
                  </th>
                ))}
                <th rowSpan={2}>비 고</th>
              </tr>
              <tr>
                {days.map(cell => (
                  <th
                    key={`ws-w-${cell.date}`}
                    className={`rf-ws-wday${
                      cell.weekday === 0 ? ' rf-ws-sun' : cell.weekday === 6 ? ' rf-ws-sat' : ''
                    }`}
                  >
                    {['일', '월', '화', '수', '목', '금', '토'][cell.weekday]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td className="rf-ws-no">
                    {rowIndex + 1}
                    {editing && (
                      <button
                        type="button"
                        className="rf-ws-row-x"
                        onClick={() => onRemoveRow(row.id)}
                        title="이 행 삭제"
                        aria-label={`${rowIndex + 1}번 행 삭제`}
                      >
                        ×
                      </button>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="rf-in"
                        value={row.workType}
                        onChange={e => onRowChange(row.id, { workType: e.target.value })}
                        placeholder="공종"
                      />
                    ) : (
                      <span className="rf-cell-text">{row.workType}</span>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="rf-in rf-c"
                        value={row.location}
                        onChange={e => onRowChange(row.id, { location: e.target.value })}
                        placeholder="위치"
                      />
                    ) : (
                      <span className="rf-cell-text">{row.location}</span>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className="rf-in rf-c"
                        value={row.worker}
                        onChange={e => onRowChange(row.id, { worker: e.target.value })}
                        placeholder="업체/팀"
                      />
                    ) : (
                      <span className="rf-cell-text">{row.worker}</span>
                    )}
                  </td>

                  {days.map(cell => {
                    const on = isDayInWork(cell.date, row.startDate, row.endDate);
                    const weekend =
                      cell.weekday === 0 ? ' rf-ws-sun' : cell.weekday === 6 ? ' rf-ws-sat' : '';
                    return (
                      <td
                        key={`ws-c-${row.id}-${cell.date}`}
                        className={`rf-ws-day${on ? ' rf-ws-on' : ''}${weekend}`}
                      >
                        {on && <span className="rf-ws-bar" />}
                      </td>
                    );
                  })}

                  <td>
                    {editing ? (
                      <input
                        className="rf-in"
                        value={row.note}
                        onChange={e => onRowChange(row.id, { note: e.target.value })}
                        placeholder="비고"
                      />
                    ) : (
                      <span className="rf-cell-text">{row.note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ---------- 작업 기간 입력 (화면 전용) ---------- */}
        {editing && days.length > 0 && (
          <div className="rf-ws-dates">
            <span className="rf-ws-dates-head">행별 작업 기간</span>
            {value.rows.map((row, rowIndex) => (
              <div className="rf-ws-dates-row" key={`ws-d-${row.id}`}>
                <span className="rf-ws-dates-no">{rowIndex + 1}</span>
                <span className="rf-ws-dates-name">{row.workType || '공종 미입력'}</span>
                <input
                  className="rf-in rf-c"
                  type="date"
                  value={row.startDate}
                  onChange={e => onRowChange(row.id, { startDate: e.target.value })}
                  aria-label={`${rowIndex + 1}번 행 시작일`}
                />
                <span className="rf-ws-period-tilde">~</span>
                <input
                  className="rf-in rf-c"
                  type="date"
                  value={row.endDate}
                  onChange={e => onRowChange(row.id, { endDate: e.target.value })}
                  aria-label={`${rowIndex + 1}번 행 종료일`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="rf-ws-foot">
          <span>구 보 공 영 (주)</span>
          <span className="rf-ws-foot-right">
            {truncated && (
              <span className="rf-ws-note">※ {MAX_WORK_DAYS}일까지만 표시됩니다. </span>
            )}
            A4(297x210) · {siteName}
          </span>
        </div>
      </div>
    </section>
  );
};

export default WorkScheduleForm;
