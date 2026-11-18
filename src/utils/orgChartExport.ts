import { SiteOrgChart, OrgTier } from '../types';

/**
 * 조직도를 이미지(PNG)로 내보내기.
 *
 * 외부 라이브러리 없이 동작하도록, 조직도 구조를 직접 SVG 로 그린 뒤
 * canvas 에 한 번 그려서 PNG 로 저장합니다.
 * (rect/text 만 사용하므로 canvas 가 오염(taint)되지 않습니다.)
 */

const NAVY = '#1e4d8c';
const LABEL_BG = '#bfdbfe';
const BORDER = '#94a3b8';
const LINE = '#9ca3af';
const TEXT = '#111827';

const FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',-apple-system,sans-serif";

const esc = (s: string): string =>
  (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 글자 폭을 고려해 상자 폭에 맞게 자릅니다 (한글 기준) */
const fit = (text: string, boxW: number, fontSize: number): string => {
  const perChar = fontSize * 0.98;
  const max = Math.max(1, Math.floor((boxW - 12) / perChar));
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
};

const tierCols = (tier: OrgTier): number =>
  Math.max(tier.cols ?? 0, ...tier.units.map(u => (u.col ?? 0) + 1), tier.units.length, 1);

const unitCol = (unit: OrgTier['units'][number], cols: number): number =>
  Math.min(Math.max(unit.col ?? 0, 0), cols - 1);

const formatKoreanDate = (iso?: string): string => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

export interface SvgResult {
  svg: string;
  width: number;
  height: number;
}

export interface ExportOptions {
  /** 그림 제목 (기본: 안전조직도) */
  title?: string;
  /** 가로 여백 포함 전체 폭 */
  width?: number;
}

/**
 * 조직도 SVG 문자열을 만듭니다.
 * 좌표계는 논리 픽셀 단위이며, PNG 변환 시 배율을 곱합니다.
 */
export const buildOrgChartSvg = (chart: SiteOrgChart, opts: ExportOptions = {}): SvgResult => {
  const W = opts.width ?? 1600;
  const PAD = 48;
  const usable = W - PAD * 2;

  const titleSize = 26;
  const unitTitleSize = 15;
  const memberSize = 14;
  const titleH = 30;
  const memberH = 22;
  const tierGap = 48;

  const headH = 132; // 제목·메타·구분선

  /* ---- 먼저 각 단의 높이를 계산해 전체 높이를 구합니다 ---- */
  const tierHeights = chart.tiers.map(tier =>
    Math.max(
      ...tier.units.map(u => titleH + memberH * Math.max(u.members.length, 1)),
      titleH + memberH
    )
  );
  const gapCount = Math.max(chart.tiers.length - 1, 0);
  const H =
    headH +
    tierHeights.reduce((a, b) => a + b, 0) +
    gapCount * tierGap +
    PAD;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.round(H)}" viewBox="0 0 ${W} ${Math.round(H)}" font-family="${esc(FONT)}">`
  );
  out.push(`<rect width="${W}" height="${Math.round(H)}" fill="#ffffff"/>`);

  /* ---------------- 머리글 ---------------- */
  out.push(
    `<text x="${PAD}" y="46" font-size="13" fill="#4b5563">${esc(
      `공사명: ${chart.constructionName || chart.siteName}`
    )}</text>`
  );
  out.push(
    `<text x="${W / 2}" y="52" font-size="${titleSize}" font-weight="800" fill="${TEXT}" text-anchor="middle" letter-spacing="2">${esc(
      opts.title ?? '안전조직도'
    )}</text>`
  );
  out.push(
    `<text x="${W - PAD}" y="46" font-size="14" font-weight="700" fill="${NAVY}" text-anchor="end">구보공영(주)</text>`
  );
  out.push(
    `<text x="${PAD}" y="78" font-size="13" fill="#4b5563">${esc(
      `현장명  ${chart.siteName}`
    )}</text>`
  );
  out.push(
    `<text x="${PAD + 420}" y="78" font-size="13" fill="#4b5563">${esc(
      `최종 수정일  ${formatKoreanDate(chart.updatedAt)}${chart.author ? `  (작성자: ${chart.author})` : ''}`
    )}</text>`
  );
  out.push(
    `<line x1="${PAD}" y1="100" x2="${W - PAD}" y2="100" stroke="${NAVY}" stroke-width="2"/>`
  );

  /* ---------------- 단(段)별 상자 ---------------- */
  let y = headH;

  chart.tiers.forEach((tier, tierIndex) => {
    const cols = tierCols(tier);
    const cellW = usable / cols;
    const centers: number[] = [];

    tier.units.forEach(unit => {
      const col = unitCol(unit, cols);
      const cx = PAD + cellW * (col + 0.5);
      centers.push(cx);
    });

    const busLeft = Math.min(W / 2, ...centers);
    const busRight = Math.max(W / 2, ...centers);

    /* 위 단과 잇는 세로선 + 가로 연결선 */
    if (tierIndex > 0) {
      const busY = y + tierGap / 2;
      out.push(
        `<line x1="${W / 2}" y1="${y - (tierGap - 0)}" x2="${W / 2}" y2="${busY}" stroke="${LINE}" stroke-width="1.5"/>`
      );
      out.push(
        `<line x1="${busLeft}" y1="${busY}" x2="${busRight}" y2="${busY}" stroke="${LINE}" stroke-width="1.5"/>`
      );
      centers.forEach(cx => {
        out.push(
          `<line x1="${cx}" y1="${busY}" x2="${cx}" y2="${y}" stroke="${LINE}" stroke-width="1.5"/>`
        );
      });
    }

    tier.units.forEach(unit => {
      const col = unitCol(unit, cols);
      const cx = PAD + cellW * (col + 0.5);
      const boxW = Math.min(cellW - 26, 250);
      const x = cx - boxW / 2;
      const members = unit.members.length > 0 ? unit.members : [{ position: '성명', name: '미등록' }];
      const boxH = titleH + memberH * members.length;

      /* 제목 바 */
      out.push(
        `<rect x="${x}" y="${y}" width="${boxW}" height="${titleH}" fill="${NAVY}" stroke="${NAVY}" stroke-width="1"/>`
      );
      out.push(
        `<text x="${cx}" y="${y + titleH / 2 + 5}" font-size="${unitTitleSize}" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(
          fit(unit.title || '부서명', boxW, unitTitleSize)
        )}</text>`
      );

      /* 구성원 행 */
      members.forEach((m, i) => {
        const ry = y + titleH + memberH * i;
        const labelW = Math.min(56, boxW * 0.34);
        out.push(
          `<rect x="${x}" y="${ry}" width="${labelW}" height="${memberH}" fill="${LABEL_BG}" stroke="${BORDER}" stroke-width="0.8"/>`
        );
        out.push(
          `<rect x="${x + labelW}" y="${ry}" width="${boxW - labelW}" height="${memberH}" fill="#ffffff" stroke="${BORDER}" stroke-width="0.8"/>`
        );
        out.push(
          `<text x="${x + labelW / 2}" y="${ry + memberH / 2 + 4}" font-size="12" font-weight="700" fill="${NAVY}" text-anchor="middle">${esc(
            fit(m.position || '직급', labelW, 12)
          )}</text>`
        );
        out.push(
          `<text x="${x + labelW + (boxW - labelW) / 2}" y="${ry + memberH / 2 + 4}" font-size="${memberSize}" font-weight="600" fill="${TEXT}" text-anchor="middle">${esc(
            fit(m.name || '성명 미입력', boxW - labelW, memberSize)
          )}</text>`
        );
      });

      // 사용하지 않는 변수 방지용 참조
      void boxH;
    });

    y += tierHeights[tierIndex] + tierGap;
  });

  /* ---------------- 비고 ---------------- */
  if (chart.note.trim()) {
    const ny = H - PAD / 2;
    out.push(`<text x="${PAD}" y="${ny}" font-size="12" fill="#4b5563">${esc(`비고  ${chart.note}`)}</text>`);
  }

  out.push('</svg>');
  return { svg: out.join(''), width: W, height: Math.round(H) };
};

/**
 * SVG → PNG 변환 후 다운로드.
 * data URL 대신 Blob URL 을 사용해 파일명이 그대로 유지되도록 합니다.
 */
export const downloadOrgChartPng = async (
  chart: SiteOrgChart,
  filename: string,
  opts: ExportOptions & { scale?: number } = {}
): Promise<void> => {
  const { svg, width, height } = buildOrgChartSvg(chart, opts);
  const scale = opts.scale ?? 2;

  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  let pngUrl = '';

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('이미지 변환에 실패했습니다.'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 를 생성할 수 없습니다.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('PNG 변환에 실패했습니다.'))),
        'image/png'
      );
    });

    pngUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(svgUrl);
    // 클릭 직후 즉시 해제하면 다운로드가 취소되는 브라우저가 있어 잠시 뒤 해제합니다.
    if (pngUrl) setTimeout(() => URL.revokeObjectURL(pngUrl), 10_000);
  }
};

/** 파일명에 쓸 수 없는 문자 제거 */
export const safeFileName = (base: string, suffix: string): string => {
  const clean = (base ?? '').replace(/[\\/:*?"<>|]/g, '_').trim() || '조직도';
  return `${clean}_${suffix}.png`;
};

