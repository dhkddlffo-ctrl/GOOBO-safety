import React from 'react';
import { AttendeeList, AttendeeListEntry } from '../types';

interface AttendeeListFormProps {
  value: AttendeeList;
  editing: boolean;
  siteName: string;
  onChange: (patch: Partial<AttendeeList>) => void;
  onEntryChange: (id: string, patch: Partial<AttendeeListEntry>) => void;
}

/**
 * 위험성평가 참석자 명단 (양식 7페이지 / A4 세로)
 *
 * 양식 그대로 NO 1~40 을 2열(1~20 / 21~40)로 배치합니다.
 * 각 칸은 업체명 / 직종 / 성명 / 서명.
 */
const AttendeeListForm: React.FC<AttendeeListFormProps> = ({
  value,
  editing,
  siteName,
  onChange,
  onEntryChange,
}) => {
  const half = value.entries.length / 2;

  const renderCell = (entry: AttendeeListEntry | undefined, no: number) => {
    if (!entry) return null;
    return (
      <React.Fragment key={entry.id}>
        <td className="rf-al-no">{no}</td>
        <td>
          {editing ? (
            <input
              className="rf-in rf-c"
              value={entry.company}
              onChange={e => onEntryChange(entry.id, { company: e.target.value })}
              placeholder="업체명"
            />
          ) : (
            <span className="rf-cell-text">{entry.company}</span>
          )}
        </td>
        <td>
          {editing ? (
            <input
              className="rf-in rf-c"
              value={entry.jobType}
              onChange={e => onEntryChange(entry.id, { jobType: e.target.value })}
              placeholder="직종"
            />
          ) : (
            <span className="rf-cell-text">{entry.jobType}</span>
          )}
        </td>
        <td>
          {editing ? (
            <input
              className="rf-in rf-c"
              value={entry.name}
              onChange={e => onEntryChange(entry.id, { name: e.target.value })}
              placeholder="성명"
            />
          ) : (
            <span className="rf-cell-text">{entry.name}</span>
          )}
        </td>
        <td>
          {editing ? (
            <input
              className="rf-in rf-c"
              value={entry.signature}
              onChange={e => onEntryChange(entry.id, { signature: e.target.value })}
              placeholder="서명"
            />
          ) : (
            <span className="rf-cell-text">{entry.signature}</span>
          )}
        </td>
      </React.Fragment>
    );
  };

  return (
    <section className="rf-sheet" aria-label="위험성평가 참석자 명단">
      <h2 className="rf-title rf-title--plain" style={{ letterSpacing: '0.22em' }}>
        위험성평가 참석자 명단
      </h2>

      <div className="rf-al">
        <div className="rf-al-date">
          <input
            value={value.year}
            onChange={e => onChange({ year: e.target.value })}
            readOnly={!editing}
            aria-label="년"
            placeholder="년"
          />
          <span>년</span>
          <input
            value={value.month}
            onChange={e => onChange({ month: e.target.value })}
            readOnly={!editing}
            aria-label="월"
            placeholder="월"
          />
          <span>월</span>
          <input
            value={value.day}
            onChange={e => onChange({ day: e.target.value })}
            readOnly={!editing}
            aria-label="일"
            placeholder="일"
          />
          <span>일</span>
        </div>

        <table className="rf-table">
          <colgroup>
            {/* 왼쪽 5칸 */}
            <col style={{ width: '2.1rem' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '20%' }} />
            {/* 오른쪽 5칸 */}
            <col style={{ width: '2.1rem' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>NO</th>
              <th>업체명</th>
              <th>직종</th>
              <th>성명</th>
              <th>서명</th>
              <th>NO</th>
              <th>업체명</th>
              <th>직종</th>
              <th>성명</th>
              <th>서명</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: half }, (_, i) => (
              <tr key={`al-${i}`}>
                {renderCell(value.entries[i], i + 1)}
                {renderCell(value.entries[i + half], i + half + 1)}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="rf-al-site">{siteName}</p>
      </div>

      <p className="rf-photo-note">위험성평가 참석자 명단 · A4(210x297) · 구보공영(주)</p>
    </section>
  );
};

export default AttendeeListForm;
