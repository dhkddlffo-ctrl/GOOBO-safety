import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  type EmergencyPlan as EmergencyPlanData,
  type EmergencyContact,
  type ExternalAgency,
  type DesignatedHospital,
  type EmergencyGroup,
  EMERGENCY_GROUPS,
} from '../types';
import {
  getEmergencyPlan,
  saveEmergencyPlan,
  createEmptyContact,
  createEmptyAgency,
  createEmptyHospital,
} from '../utils/emergencyStorage';
import { putFile, getFile, deleteFile } from '../utils/documentStorage';
import { isAuthenticated } from '../utils/auth';
import './EmergencyPlan.css';

interface EmergencyPlanProps {
  siteId: number;
  siteName: string;
  /** 현장 기본정보의 소재지 (미입력 시 자동 보완) */
  siteAddress?: string;
}

const MAX_MAP_SIZE = 5 * 1024 * 1024; // 5MB

/** 2026-11-17T… → 2026년 11월 17일 */
const formatKoreanDate = (iso?: string): string => {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
};

/**
 * 현장별 비상연락망 게시판
 * - 입력한 내용을 A4 게시판 형태로 출력(인쇄)할 수 있습니다.
 * - 사무실·탈의실 등 게시판에 부착하는 것을 전제로 큰 글씨/표 형태로 구성합니다.
 */
const EmergencyPlan: React.FC<EmergencyPlanProps> = ({ siteId, siteName, siteAddress }) => {
  const [plan, setPlan] = useState<EmergencyPlanData>(() =>
    getEmergencyPlan(siteId, siteName, siteAddress)
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EmergencyPlanData | null>(null);
  const [error, setError] = useState('');
  const [mapUploading, setMapUploading] = useState(false);
  const [mapUrl, setMapUrl] = useState('');
  const mapInputRef = useRef<HTMLInputElement>(null);

  const canManage = isAuthenticated();

  /* 현장 변경 시 다시 읽기 */
  useEffect(() => {
    setPlan(getEmergencyPlan(siteId, siteName, siteAddress));
    setEditing(false);
    setDraft(null);
    setError('');
  }, [siteId, siteName, siteAddress]);

  /* 약도 이미지 불러오기 */
  useEffect(() => {
    let revoked = '';
    let cancelled = false;

    const load = async () => {
      if (!plan.mapImageKey) {
        setMapUrl('');
        return;
      }
      const blob = await getFile(plan.mapImageKey);
      if (!blob || cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setMapUrl(url);
    };
    load();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [plan.mapImageKey]);

  /* 구분별 그룹핑 */
  const groupedContacts = useMemo(
    () =>
      EMERGENCY_GROUPS.map(group => ({
        group,
        rows: plan.contacts.filter(c => c.group === group),
      })),
    [plan.contacts]
  );

  /* ---------------- 편집 ---------------- */
  const startEdit = () => {
    if (!canManage) {
      alert('비상연락망 수정은 관리자 로그인 후 가능합니다.');
      return;
    }
    setDraft({ ...plan });
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setEditing(false);
    setError('');
  };

  const saveEdit = () => {
    if (!draft) return;
    if (!draft.constructionName.trim()) {
      setError('공사명을 입력해주세요.');
      return;
    }
    saveEmergencyPlan(draft);
    setPlan(getEmergencyPlan(siteId, siteName, siteAddress));
    setDraft(null);
    setEditing(false);
    setError('');
  };

  const setDraftField = <K extends keyof EmergencyPlanData>(
    key: K,
    value: EmergencyPlanData[K]
  ) => {
    setDraft(d => (d ? { ...d, [key]: value } : d));
  };

  /* ---------------- 행 편집 헬퍼 ---------------- */
  const addContact = (group: EmergencyGroup) =>
    setDraft(d => (d ? { ...d, contacts: [...d.contacts, createEmptyContact(group)] } : d));

  const patchContact = (id: string, patch: Partial<EmergencyContact>) =>
    setDraft(d =>
      d
        ? {
            ...d,
            contacts: d.contacts.map(c => (c.id === id ? { ...c, ...patch } : c)),
          }
        : d
    );

  const removeContact = (id: string) =>
    setDraft(d => (d ? { ...d, contacts: d.contacts.filter(c => c.id !== id) } : d));

  const addAgency = () =>
    setDraft(d => (d ? { ...d, agencies: [...d.agencies, createEmptyAgency()] } : d));

  const patchAgency = (id: string, patch: Partial<ExternalAgency>) =>
    setDraft(d =>
      d
        ? { ...d, agencies: d.agencies.map(a => (a.id === id ? { ...a, ...patch } : a)) }
        : d
    );

  const removeAgency = (id: string) =>
    setDraft(d => (d ? { ...d, agencies: d.agencies.filter(a => a.id !== id) } : d));

  const addHospital = () =>
    setDraft(d => (d ? { ...d, hospitals: [...d.hospitals, createEmptyHospital()] } : d));

  const patchHospital = (id: string, patch: Partial<DesignatedHospital>) =>
    setDraft(d =>
      d
        ? { ...d, hospitals: d.hospitals.map(h => (h.id === id ? { ...h, ...patch } : h)) }
        : d
    );

  const removeHospital = (id: string) =>
    setDraft(d => (d ? { ...d, hospitals: d.hospitals.filter(h => h.id !== id) } : d));

  /* ---------------- 약도 이미지 ---------------- */
  const handleMapUpload = async (file: File) => {
    if (!draft) return;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 등록할 수 있습니다. (jpg, png 등)');
      return;
    }
    if (file.size > MAX_MAP_SIZE) {
      alert('약도 이미지는 5MB 이하만 등록할 수 있습니다.');
      return;
    }

    setMapUploading(true);
    try {
      if (draft.mapImageKey) {
        await deleteFile(draft.mapImageKey);
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const key = `em-map-${siteId}-${Date.now()}.${ext}`;
      await putFile(key, file);
      setDraftField('mapImageKey', key);
    } catch (e) {
      console.error('약도 업로드 실패:', e);
      alert('약도 이미지 저장에 실패했습니다.');
    } finally {
      setMapUploading(false);
    }
  };

  const removeMap = async () => {
    if (!draft?.mapImageKey) return;
    if (!confirm('약도 이미지를 삭제하시겠습니까?')) return;
    try {
      await deleteFile(draft.mapImageKey);
    } catch (e) {
      console.warn('약도 삭제 실패:', e);
    }
    setDraftField('mapImageKey', undefined);
  };

  const handlePrint = () => {
    if (editing) {
      alert('먼저 저장한 뒤 출력해주세요.');
      return;
    }
    window.print();
  };

  /* ================= 게시판(포스터) ================= */
  const poster = (
    <div className="em-poster">
      {/* 제목 */}
      <header className="em-head">
        <div className="em-head-top">
          <span className="em-head-construction">공사명: {plan.constructionName || siteName}</span>
          <h1 className="em-head-title">비상연락망</h1>
          <span className="em-head-mark">구보공영(주)</span>
        </div>
        <div className="em-head-meta">
          <span>
            <strong>현장 주소</strong> {plan.siteAddress || '미입력'}
          </span>
          <span>
            <strong>최종 수정일</strong> {formatKoreanDate(plan.updatedAt)}
            {plan.author ? ` (작성자: ${plan.author})` : ''}
          </span>
        </div>
      </header>

      {/* 1. 대응 흐름도 */}
      <section className="em-section">
        <h2 className="em-section-title">
          <span className="em-no">1</span> 비상시 보고 및 대응 흐름도
        </h2>
        <div className="em-flow">
          <div className="em-flow-box em-flow-start">사고 · 재해 발생</div>
          <div className="em-flow-arrow">▼ 즉시 전파 (육성·무전기·전화)</div>

          <div className="em-flow-row">
            <div className="em-flow-box">
              <strong>최초 발견자 / 관리감독자</strong>
              <small>① 작업중지 및 근로자 대피 유도</small>
              <small>② 부상자 응급처치 (2차 재해 예방)</small>
            </div>
          </div>
          <div className="em-flow-arrow">▼</div>

          <div className="em-flow-row">
            <div className="em-flow-box">
              <strong>현장소장 / 안전관리자</strong>
              <small>① 119 신고 및 지정병원 긴급 이송</small>
              <small>② 현장 통제 및 보존</small>
            </div>
          </div>
          <div className="em-flow-arrow">▼</div>

          <div className="em-flow-row">
            <div className="em-flow-box em-flow-end">
              <strong>본사 보고 / 유관기관 신고</strong>
              <small>① 본사 안전보건팀 및 대표이사 보고</small>
              <small>② 중대재해 시 관할 고용노동청 즉시 신고</small>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 현장 내부 비상연락망 */}
      <section className="em-section">
        <h2 className="em-section-title">
          <span className="em-no">2</span> 현장 내부 비상연락망 (원청·본사·협력사)
        </h2>
        <table className="em-table">
          <thead>
            <tr>
              <th style={{ width: '11%' }}>구분</th>
              <th style={{ width: '23%' }}>직책 / 담당업무</th>
              <th style={{ width: '12%' }}>성명</th>
              <th style={{ width: '17%' }}>연락처 (휴대전화)</th>
              <th>비상시 주요 임무</th>
            </tr>
          </thead>
          <tbody>
            {groupedContacts.map(({ group, rows }) =>
              rows.length === 0 ? null : (
                <React.Fragment key={group}>
                  {rows.map((c, i) => (
                    <tr key={c.id}>
                      {i === 0 && (
                        <td rowSpan={rows.length} className="em-cell-group">
                          {group}
                        </td>
                      )}
                      <td className={c.role ? '' : 'em-empty'}>{c.role || '—'}</td>
                      <td className="em-cell-name">{c.name || '—'}</td>
                      <td className="em-cell-phone">{c.phone || '—'}</td>
                      <td className="em-cell-duty">{c.duty || '—'}</td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            )}
          </tbody>
        </table>
      </section>

      {/* 3. 외부 유관기관 */}
      <section className="em-section">
        <h2 className="em-section-title">
          <span className="em-no">3</span> 외부 유관기관 비상연락망
        </h2>
        <table className="em-table">
          <thead>
            <tr>
              <th style={{ width: '14%' }}>구분</th>
              <th style={{ width: '33%' }}>기관명</th>
              <th style={{ width: '18%' }}>전화번호</th>
              <th>관할 / 비고</th>
            </tr>
          </thead>
          <tbody>
            {plan.agencies.map(a => (
              <tr key={a.id}>
                <td>{a.category || '—'}</td>
                <td className={a.name ? '' : 'em-empty'}>{a.name || '—'}</td>
                <td className="em-cell-phone">{a.phone || '—'}</td>
                <td className="em-cell-note">{a.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 4. 지정병원 */}
      <section className="em-section">
        <h2 className="em-section-title">
          <span className="em-no">4</span> 지정병원 (응급의료기관) 현황
        </h2>
        <table className="em-table">
          <thead>
            <tr>
              <th style={{ width: '20%' }}>구분</th>
              <th style={{ width: '24%' }}>병원명</th>
              <th style={{ width: '16%' }}>응급실 직통번호</th>
              <th>도로명 주소 / 거리·소요시간</th>
            </tr>
          </thead>
          <tbody>
            {plan.hospitals.map(h => (
              <tr key={h.id}>
                <td>{h.category || '—'}</td>
                <td className={h.name ? '' : 'em-empty'}>{h.name || '—'}</td>
                <td className="em-cell-phone">{h.erPhone || '—'}</td>
                <td>
                  {h.address || '—'}
                  {h.distance && <span className="em-hospital-dist"> ({h.distance})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="em-map">
          <div className="em-map-label">[지정병원 약도 및 이송 경로]</div>
          {mapUrl ? (
            <img src={mapUrl} alt="지정병원 약도" className="em-map-img" />
          ) : (
            <div className="em-map-empty">
              약도 미등록 — [수정]에서 지도 캡처 이미지를 등록하면 이 자리에 출력됩니다.
            </div>
          )}
        </div>
      </section>

      {/* 5. 119 신고 요령 */}
      <section className="em-section em-section-last">
        <h2 className="em-section-title">
          <span className="em-no">5</span> 사고 발생 시 119 신고 요령
        </h2>
        <ol className="em-guide">
          <li>
            <strong>침착하게 발생 위치 전달</strong>
            <p>
              “여기는 [{plan.siteAddress || 'OO시 OO구 OO로 OO번길 OO, ' + (plan.constructionName || siteName)}
              ]입니다.”
            </p>
          </li>
          <li>
            <strong>사고 유형 및 환자 상태 설명</strong>
            <p>
              “추락(또는 화재/협착) 사고로 부상자 O명이 발생했으며, 의식 유무/출혈 상태는 OOO입니다.”
            </p>
          </li>
          <li>
            <strong>유도자 배치 안내</strong>
            <p>
              “{plan.entryPoint || '현장 정문'}에 안내 요원을 배치해 두겠습니다.” — 신고 후 즉시 출입구로 유도원을
              배치합니다.
            </p>
          </li>
        </ol>
      </section>

      <footer className="em-foot">
        구보공영(주) · 안전보건관리 · 본 게시판은 사무실·탈의실 등 근로자 접근이 용이한 장소에 부착하십시오.
      </footer>
    </div>
  );

  /* ================= 렌더 ================= */
  return (
    <div className="em-wrap">
      {/* 툴바 (인쇄 시 숨김) */}
      <div className="em-toolbar">
        <div className="em-toolbar-info">
          <strong>비상연락망 게시판</strong>
          <span className="em-toolbar-sub">
            {editing
              ? '내용을 입력한 뒤 저장하세요.'
              : 'A4 세로 기준으로 출력됩니다. 게시판에 부착하세요.'}
          </span>
        </div>
        <div className="em-toolbar-actions">
          {!editing ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={startEdit}>
                ✏️ 수정
              </button>
              <button className="btn btn-primary btn-sm" onClick={handlePrint}>
                🖨️ 인쇄 / PDF 저장
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={cancelEdit}>
                취소
              </button>
              <button className="btn btn-primary btn-sm" onClick={saveEdit}>
                저장
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="em-error">{error}</div>}

      {!editing ? poster : draft && (
        <div className="em-editor">
          {/* 기본 정보 */}
          <div className="em-edit-block">
            <h3 className="em-edit-title">기본 정보</h3>
            <div className="em-grid2">
              <label className="em-field">
                <span>공사명 *</span>
                <input
                  type="text"
                  value={draft.constructionName}
                  onChange={e => setDraftField('constructionName', e.target.value)}
                  placeholder="예: OOO 신축/설비 공사"
                />
              </label>
              <label className="em-field">
                <span>작성자</span>
                <input
                  type="text"
                  value={draft.author}
                  onChange={e => setDraftField('author', e.target.value)}
                  placeholder="예: 안전관리자 홍길동"
                />
              </label>
            </div>
            <label className="em-field">
              <span>현장 주소 (도로명 + 출입구 위치)</span>
              <input
                type="text"
                value={draft.siteAddress}
                onChange={e => setDraftField('siteAddress', e.target.value)}
                placeholder="예: 경기도 용인시 처인구 OO로 123 (정문: OO번길 방면)"
              />
            </label>
            <label className="em-field">
              <span>유도자 배치 출입구</span>
              <input
                type="text"
                value={draft.entryPoint}
                onChange={e => setDraftField('entryPoint', e.target.value)}
                placeholder="예: 현장 정문"
              />
            </label>
          </div>

          {/* 2. 내부 연락망 */}
          <div className="em-edit-block">
            <h3 className="em-edit-title">2. 현장 내부 비상연락망</h3>
            <div className="em-edit-rows">
              {draft.contacts.map(c => (
                <div key={c.id} className="em-edit-row">
                  <select
                    className="em-in-group"
                    value={c.group}
                    onChange={e => patchContact(c.id, { group: e.target.value as EmergencyGroup })}
                  >
                    {EMERGENCY_GROUPS.map(g => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <input
                    className="em-in-role"
                    type="text"
                    value={c.role}
                    onChange={e => patchContact(c.id, { role: e.target.value })}
                    placeholder="직책 / 담당업무"
                  />
                  <input
                    className="em-in-name"
                    type="text"
                    value={c.name}
                    onChange={e => patchContact(c.id, { name: e.target.value })}
                    placeholder="성명"
                  />
                  <input
                    className="em-in-phone"
                    type="tel"
                    value={c.phone}
                    onChange={e => patchContact(c.id, { phone: e.target.value })}
                    placeholder="010-0000-0000"
                  />
                  <input
                    className="em-in-duty"
                    type="text"
                    value={c.duty}
                    onChange={e => patchContact(c.id, { duty: e.target.value })}
                    placeholder="비상시 주요 임무"
                  />
                  <button
                    type="button"
                    className="em-row-del"
                    onClick={() => removeContact(c.id)}
                    title="행 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="em-add-row">
              {EMERGENCY_GROUPS.map(g => (
                <button key={g} type="button" className="em-add-btn" onClick={() => addContact(g)}>
                  ＋ {g} 추가
                </button>
              ))}
            </div>
          </div>

          {/* 3. 외부 기관 */}
          <div className="em-edit-block">
            <h3 className="em-edit-title">3. 외부 유관기관</h3>
            <div className="em-edit-rows">
              {draft.agencies.map(a => (
                <div key={a.id} className="em-edit-row">
                  <input
                    className="em-in-group"
                    type="text"
                    value={a.category}
                    onChange={e => patchAgency(a.id, { category: e.target.value })}
                    placeholder="구분"
                  />
                  <input
                    className="em-in-role"
                    type="text"
                    value={a.name}
                    onChange={e => patchAgency(a.id, { name: e.target.value })}
                    placeholder="기관명"
                  />
                  <input
                    className="em-in-phone"
                    type="tel"
                    value={a.phone}
                    onChange={e => patchAgency(a.id, { phone: e.target.value })}
                    placeholder="전화번호"
                  />
                  <input
                    className="em-in-duty"
                    type="text"
                    value={a.note}
                    onChange={e => patchAgency(a.id, { note: e.target.value })}
                    placeholder="관할 / 비고"
                  />
                  <button
                    type="button"
                    className="em-row-del"
                    onClick={() => removeAgency(a.id)}
                    title="행 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="em-add-row">
              <button type="button" className="em-add-btn" onClick={addAgency}>
                ＋ 기관 추가
              </button>
            </div>
          </div>

          {/* 4. 지정병원 */}
          <div className="em-edit-block">
            <h3 className="em-edit-title">4. 지정병원</h3>
            <div className="em-edit-rows">
              {draft.hospitals.map(h => (
                <div key={h.id} className="em-edit-row">
                  <input
                    className="em-in-group"
                    type="text"
                    value={h.category}
                    onChange={e => patchHospital(h.id, { category: e.target.value })}
                    placeholder="구분"
                  />
                  <input
                    className="em-in-role"
                    type="text"
                    value={h.name}
                    onChange={e => patchHospital(h.id, { name: e.target.value })}
                    placeholder="병원명"
                  />
                  <input
                    className="em-in-phone"
                    type="tel"
                    value={h.erPhone}
                    onChange={e => patchHospital(h.id, { erPhone: e.target.value })}
                    placeholder="응급실 직통"
                  />
                  <input
                    className="em-in-duty"
                    type="text"
                    value={h.address}
                    onChange={e => patchHospital(h.id, { address: e.target.value })}
                    placeholder="도로명 주소"
                  />
                  <input
                    className="em-in-dist"
                    type="text"
                    value={h.distance}
                    onChange={e => patchHospital(h.id, { distance: e.target.value })}
                    placeholder="거리/시간"
                  />
                  <button
                    type="button"
                    className="em-row-del"
                    onClick={() => removeHospital(h.id)}
                    title="행 삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="em-add-row">
              <button type="button" className="em-add-btn" onClick={addHospital}>
                ＋ 병원 추가
              </button>
            </div>

            {/* 약도 이미지 */}
            <div className="em-map-edit">
              <span className="em-map-edit-label">지정병원 약도 이미지</span>
              <div className="em-map-edit-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => mapInputRef.current?.click()}
                  disabled={mapUploading}
                >
                  {mapUploading ? '업로드 중…' : draft.mapImageKey ? '이미지 변경' : '이미지 등록'}
                </button>
                {draft.mapImageKey && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={removeMap}>
                    삭제
                  </button>
                )}
                <input
                  ref={mapInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleMapUpload(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="em-map-edit-hint">
                지도 캡처(jpg/png, 5MB 이하)를 등록하면 게시판 4번 항목에 출력됩니다.
              </p>
            </div>
          </div>

          <p className="em-editor-note">
            5번 항목(119 신고 요령)은 현장 주소·출입구 정보로 자동 생성됩니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default EmergencyPlan;
