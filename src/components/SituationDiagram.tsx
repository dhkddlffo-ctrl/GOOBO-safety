import React, { useCallback, useEffect, useRef, useState } from 'react';
import './SituationDiagram.css';

/** 캔버스 내부 해상도 (CSS 로 반응형 축소) */
const CANVAS_W = 900;
const CANVAS_H = 520;
const GRID = 20;
const GRID_BOLD = 100;

type Tool = 'pen' | 'line' | 'arrow' | 'rect' | 'circle' | 'text' | 'eraser';

const TOOLS: { key: Tool; label: string; icon: string }[] = [
  { key: 'pen', label: '펜', icon: '✏️' },
  { key: 'line', label: '직선', icon: '╱' },
  { key: 'arrow', label: '화살표', icon: '↗' },
  { key: 'rect', label: '사각형', icon: '▭' },
  { key: 'circle', label: '원', icon: '◯' },
  { key: 'text', label: '글자', icon: 'A' },
  { key: 'eraser', label: '지우개', icon: '🧽' },
];

const COLORS = ['#111827', '#dc2626', '#2563eb', '#059669'];

const WIDTHS: { value: number; label: string }[] = [
  { value: 2, label: '얇게' },
  { value: 4, label: '보통' },
  { value: 8, label: '굵게' },
];

interface SituationDiagramProps {
  /** 현재 상황도 (PNG data URL). 없으면 빈 상태 */
  value?: string;
  /** 그리기 완료/초기화 시 호출 */
  onChange: (dataUrl: string) => void;
}

/**
 * 재해(사고) 상황도 작성기
 *
 * 모눈종이 배경 위에 펜·직선·화살표·도형·글자로 사고 현장을 스케치하고
 * PNG(data URL)로 저장합니다. 저장된 이미지는 사고보고서에 그대로 인쇄됩니다.
 */
const SituationDiagram: React.FC<SituationDiagramProps> = ({ value, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** 다시 그리기를 위한 스냅샷 (도형 미리보기용) */
  const snapshotRef = useRef<ImageData | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  /** 실행 취소 스택 ('' = 빈 도화지) */
  const historyRef = useRef<string[]>(['']);
  /** 마지막으로 캔버스에 반영된 값 (부모 → 자식 동기화 판단용) */
  const appliedRef = useRef<string | undefined>(undefined);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(WIDTHS[1].value);
  const [strokeCount, setStrokeCount] = useState(0);

  /* ---------------- 배경(모눈종이) ---------------- */
  const paintBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.strokeStyle = '#e9eef4';
    ctx.lineWidth = 1;
    for (let x = GRID; x < CANVAS_W; x += GRID) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CANVAS_H);
      ctx.stroke();
    }
    for (let y = GRID; y < CANVAS_H; y += GRID) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CANVAS_W, y + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = '#d5dee8';
    for (let x = GRID_BOLD; x < CANVAS_W; x += GRID_BOLD) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, CANVAS_H);
      ctx.stroke();
    }
    for (let y = GRID_BOLD; y < CANVAS_H; y += GRID_BOLD) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(CANVAS_W, y + 0.5);
      ctx.stroke();
    }
  }, []);

  const resetCanvas = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    paintBackground(ctx);
  }, [paintBackground]);

  /* ---------------- 초기 렌더 + 외부 값 동기화 ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (value === appliedRef.current) return;
    appliedRef.current = value;

    if (!value) {
      paintBackground(ctx);
      return;
    }

    const img = new Image();
    img.onload = () => {
      paintBackground(ctx);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    };
    img.src = value;
  }, [value, paintBackground]);

  /* ---------------- 좌표 변환 ---------------- */
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width === 0 ? 1 : CANVAS_W / rect.width;
    const sy = rect.height === 0 ? 1 : CANVAS_H / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * sx),
      y: Math.round((e.clientY - rect.top) * sy),
    };
  };

  const applyStrokeStyle = (ctx: CanvasRenderingContext2D, isEraser = false) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isEraser) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(lineWidth * 3, 12);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }
  };

  const drawArrowHead = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const size = 8 + lineWidth * 2;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 7), y2 - size * Math.sin(angle - Math.PI / 7));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 7), y2 - size * Math.sin(angle + Math.PI / 7));
    ctx.stroke();
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    historyRef.current = [...historyRef.current, url];
    appliedRef.current = url;
    setStrokeCount(historyRef.current.length - 1);
    onChange(url);
  };

  /* ---------------- 포인터 이벤트 ---------------- */
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);

    if (tool === 'text') {
      const text = window.prompt('삽입할 글자를 입력하세요. (예: 추락 지점, 안전난간 없음)');
      if (!text || !text.trim()) return;
      ctx.fillStyle = color;
      ctx.font = `${12 + lineWidth * 3}px 'Malgun Gothic', 'Noto Sans KR', sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(text.trim(), pos.x, pos.y);
      emit();
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    startRef.current = pos;
    snapshotRef.current = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);

    if (tool === 'pen' || tool === 'eraser') {
      applyStrokeStyle(ctx, tool === 'eraser');
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
      ctx.stroke();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = e.currentTarget.getContext('2d');
    const start = startRef.current;
    const snapshot = snapshotRef.current;
    if (!ctx || !start || !snapshot) return;
    const pos = getPos(e);

    if (tool === 'pen' || tool === 'eraser') {
      applyStrokeStyle(ctx, tool === 'eraser');
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    /* 도형은 매 이동마다 시작 스냅샷으로 되돌린 뒤 미리보기를 그림 */
    ctx.putImageData(snapshot, 0, 0);
    applyStrokeStyle(ctx);

    if (tool === 'line' || tool === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      if (tool === 'arrow') drawArrowHead(ctx, start.x, start.y, pos.x, pos.y);
      return;
    }

    if (tool === 'rect') {
      ctx.beginPath();
      ctx.rect(start.x, start.y, pos.x - start.x, pos.y - start.y);
      ctx.stroke();
      return;
    }

    if (tool === 'circle') {
      const rx = Math.abs(pos.x - start.x) / 2;
      const ry = Math.abs(pos.y - start.y) / 2;
      const cx = (start.x + pos.x) / 2;
      const cy = (start.y + pos.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    emit();
  };

  /* ---------------- 실행 취소 / 전체 지우기 ---------------- */
  const loadFromUrl = (url: string) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    if (!url) {
      paintBackground(ctx);
      return;
    }
    const img = new Image();
    img.onload = () => {
      paintBackground(ctx);
      ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
    };
    img.src = url;
  };

  const handleUndo = () => {
    const h = historyRef.current;
    if (h.length <= 1) return;
    const next = h.slice(0, -1);
    historyRef.current = next;
    const url = next[next.length - 1];
    appliedRef.current = url;
    loadFromUrl(url);
    setStrokeCount(next.length - 1);
    onChange(url);
  };

  const handleClear = () => {
    if (historyRef.current.length <= 1) return;
    if (!window.confirm('상황도를 모두 지우시겠습니까?')) return;
    historyRef.current = [''];
    appliedRef.current = '';
    resetCanvas();
    setStrokeCount(0);
    onChange('');
  };

  const isEmpty = strokeCount === 0;

  return (
    <div className="situation-diagram">
      <div className="sd-toolbar">
        <div className="sd-tool-group" role="group" aria-label="그리기 도구">
          {TOOLS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`sd-tool ${tool === t.key ? 'is-active' : ''}`}
              onClick={() => setTool(t.key)}
              title={t.label}
              aria-pressed={tool === t.key}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="sd-tool-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="sd-tool-group" role="group" aria-label="색상">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={`sd-color ${color === c ? 'is-active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
              aria-label={`색상 ${c}`}
              aria-pressed={color === c}
            />
          ))}
        </div>

        <div className="sd-tool-group" role="group" aria-label="선 굵기">
          {WIDTHS.map(w => (
            <button
              key={w.value}
              type="button"
              className={`sd-width ${lineWidth === w.value ? 'is-active' : ''}`}
              onClick={() => setLineWidth(w.value)}
              aria-pressed={lineWidth === w.value}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="sd-tool-group sd-tool-group-end">
          <button type="button" className="sd-action" onClick={handleUndo} disabled={isEmpty}>
            ↩ 실행 취소
          </button>
          <button type="button" className="sd-action sd-action-danger" onClick={handleClear} disabled={isEmpty}>
            전체 지우기
          </button>
        </div>
      </div>

      <div className="sd-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="sd-canvas"
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {isEmpty && (
          <div className="sd-placeholder" aria-hidden="true">
            <span className="sd-placeholder-icon">🖊️</span>
            <span>위 도구를 선택해 사고 현장을 그려주세요</span>
            <span className="sd-placeholder-sub">예: 작업대·비계·추락 지점·차량 진행방향</span>
          </div>
        )}
      </div>

      <p className="sd-caption">
        그린 상황도는 <strong>사고보고서</strong>에 자동으로 첨부됩니다. (마우스·터치 모두 지원)
      </p>
    </div>
  );
};

export default SituationDiagram;
