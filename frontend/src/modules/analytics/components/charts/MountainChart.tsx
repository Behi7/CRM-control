import React, { useState, useEffect, useRef } from 'react';
import { fmtCount, fmtMoney } from '../../types';
import { useLanguage } from '../../../../i18n/LanguageContext';
import { TrendingUp } from 'lucide-react';

interface MountainPoint {
  period: string;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  openLeads: number;
  revenue: number;
  lostValue: number;
  openValue: number;
}

interface MountainChartProps {
  timeseries: MountainPoint[];
}

interface ScreenCoord {
  period: string;
  x: number;
  yWon: number;
  yLost: number;
  yOpen: number;
  opacity: number;
}

export default function MountainChart({ timeseries = [] }: MountainChartProps) {
  const { lang } = useLanguage();
  const [mountainZoom, setMountainZoom] = useState<string>('last12');
  const [mountainMode, setMountainMode] = useState<'count' | 'money'>('count');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const rawPts = timeseries || [];
  const availableYears = Array.from(
    new Set(rawPts.map((p) => String(p.period || '').slice(0, 4)).filter(Boolean)),
  ).sort();

  let pts: MountainPoint[] = [];
  if (mountainZoom === 'by_year') {
    const byYearMap = new Map<string, MountainPoint>();
    for (const p of rawPts) {
      const y = String(p.period || '').slice(0, 4);
      if (!y) continue;
      const prev = byYearMap.get(y) || {
        period: `${y} г.`,
        totalLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        openLeads: 0,
        revenue: 0,
        lostValue: 0,
        openValue: 0,
      };
      prev.totalLeads += Number(p.totalLeads || 0);
      prev.wonLeads += Number(p.wonLeads || 0);
      prev.lostLeads += Number(p.lostLeads || 0);
      prev.openLeads += Number(p.openLeads || 0);
      prev.revenue += Number(p.revenue || 0);
      prev.lostValue += Number(p.lostValue || 0);
      prev.openValue += Number(p.openValue || 0);
      byYearMap.set(y, prev);
    }
    pts = Array.from(byYearMap.values());
  } else if (mountainZoom === 'last6') {
    pts = rawPts.slice(-6);
  } else if (mountainZoom === 'last12') {
    pts = rawPts.slice(-12);
  } else if (mountainZoom === 'all') {
    pts = rawPts;
  } else if (availableYears.includes(mountainZoom)) {
    pts = rawPts.filter((p) => String(p.period || '').startsWith(mountainZoom));
  } else {
    pts = rawPts.slice(-12);
  }

  const n = pts.length;
  const W = 1080;
  const H = 300;
  const padL = 62;
  const padR = 32;
  const padT = 30;
  const padB = 44;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const baseY = padT + chartH;

  const getWon = (p: MountainPoint) => (mountainMode === 'count' ? Number(p.wonLeads || 0) : Number(p.revenue || 0));
  const getLost = (p: MountainPoint) => (mountainMode === 'count' ? Number(p.lostLeads || 0) : Number(p.lostValue || 0));
  const getOpen = (p: MountainPoint) => (mountainMode === 'count' ? Number(p.openLeads || 0) : Number(p.openValue || 0));

  const rawMax = Math.max(
    ...pts.map((p) => Math.max(getWon(p), getLost(p), getOpen(p))),
    1,
  );
  const targetMaxVal = Math.ceil(rawMax * 1.12);

  const targetXAt = (i: number, total: number) =>
    total <= 1 ? padL + chartW / 2 : padL + (i / (total - 1)) * chartW;

  const targetYAt = (val: number, maxV: number) =>
    padT + chartH - (Math.min(val, maxV) / (maxV || 1)) * chartH;

  // ── True Screen-Space (X, Y) Coordinate Animation Engine ──
  // Interpolates screen pixel coordinates directly, completely eliminating scale traps
  // and enabling fluid horizontal morphing across zoom changes.
  const [animCoords, setAnimCoords] = useState<ScreenCoord[]>([]);
  const [displayMaxVal, setDisplayMaxVal] = useState<number>(targetMaxVal);

  const prevCoordsRef = useRef<ScreenCoord[]>([]);
  const prevMaxValRef = useRef<number>(targetMaxVal);

  useEffect(() => {
    if (pts.length === 0) {
      setAnimCoords([]);
      prevCoordsRef.current = [];
      return;
    }

    // 1. Calculate ideal target coordinates for current points
    const currentTargets: ScreenCoord[] = pts.map((p, i) => ({
      period: p.period,
      x: targetXAt(i, n),
      yWon: targetYAt(getWon(p), targetMaxVal),
      yLost: targetYAt(getLost(p), targetMaxVal),
      yOpen: targetYAt(getOpen(p), targetMaxVal),
      opacity: 1,
    }));

    const prevCoords = prevCoordsRef.current;
    const startMax = prevMaxValRef.current || targetMaxVal;

    // 2. Pair every point with its start coordinate
    type TransitionItem = {
      period: string;
      startX: number;
      startYWon: number;
      startYLost: number;
      startYOpen: number;
      startOpacity: number;
      targetX: number;
      targetYWon: number;
      targetYLost: number;
      targetYOpen: number;
      targetOpacity: number;
    };

    const transitions: TransitionItem[] = [];

    if (prevCoords.length === 0) {
      // First mount: animate from zero baseline
      currentTargets.forEach((tgt) => {
        transitions.push({
          period: tgt.period,
          startX: tgt.x,
          startYWon: baseY,
          startYLost: baseY,
          startYOpen: baseY,
          startOpacity: 0,
          targetX: tgt.x,
          targetYWon: tgt.yWon,
          targetYLost: tgt.yLost,
          targetYOpen: tgt.yOpen,
          targetOpacity: 1,
        });
      });
    } else {
      const prevMap = new Map<string, ScreenCoord>(prevCoords.map((c) => [c.period, c]));

      // Existing points and new incoming points
      currentTargets.forEach((tgt, i) => {
        const prev = prevMap.get(tgt.period);
        if (prev) {
          transitions.push({
            period: tgt.period,
            startX: prev.x,
            startYWon: prev.yWon,
            startYLost: prev.yLost,
            startYOpen: prev.yOpen,
            startOpacity: prev.opacity,
            targetX: tgt.x,
            targetYWon: tgt.yWon,
            targetYLost: tgt.yLost,
            targetYOpen: tgt.yOpen,
            targetOpacity: 1,
          });
          prevMap.delete(tgt.period);
        } else {
          // New point entering (e.g. earlier month revealed when zooming out)
          const neighborPrev = i > 0 ? prevCoords[0] : null;
          const enterX = neighborPrev ? Math.max(padL, neighborPrev.x - 40) : tgt.x;
          transitions.push({
            period: tgt.period,
            startX: enterX,
            startYWon: baseY,
            startYLost: baseY,
            startYOpen: baseY,
            startOpacity: 0,
            targetX: tgt.x,
            targetYWon: tgt.yWon,
            targetYLost: tgt.yLost,
            targetYOpen: tgt.yOpen,
            targetOpacity: 1,
          });
        }
      });

      // Outgoing points that are removed (e.g. zooming in from 12 to 6 months)
      prevMap.forEach((oldCoord) => {
        transitions.push({
          period: oldCoord.period,
          startX: oldCoord.x,
          startYWon: oldCoord.yWon,
          startYLost: oldCoord.yLost,
          startYOpen: oldCoord.yOpen,
          startOpacity: oldCoord.opacity,
          targetX: Math.max(padL - 60, oldCoord.x - chartW / 2),
          targetYWon: baseY,
          targetYLost: baseY,
          targetYOpen: baseY,
          targetOpacity: 0,
        });
      });
    }

    let rafId: number;
    const startTime = performance.now();
    const duration = 460; // 460ms for silky-smooth fluid animation

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic: fast responsive start with silky deceleration
      const eased = 1 - Math.pow(1 - t, 3);

      const frameCoords: ScreenCoord[] = transitions.map((tr) => ({
        period: tr.period,
        x: tr.startX + (tr.targetX - tr.startX) * eased,
        yWon: tr.startYWon + (tr.targetYWon - tr.startYWon) * eased,
        yLost: tr.startYLost + (tr.targetYLost - tr.startYLost) * eased,
        yOpen: tr.startYOpen + (tr.targetYOpen - tr.startYOpen) * eased,
        opacity: tr.startOpacity + (tr.targetOpacity - tr.startOpacity) * eased,
      }));

      const curMax = startMax + (targetMaxVal - startMax) * eased;

      setAnimCoords(frameCoords);
      setDisplayMaxVal(curMax);
      prevCoordsRef.current = frameCoords;
      prevMaxValRef.current = curMax;

      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Final frame: lock exact target coordinates for stability
        setAnimCoords(currentTargets);
        setDisplayMaxVal(targetMaxVal);
        prevCoordsRef.current = currentTargets;
        prevMaxValRef.current = targetMaxVal;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [mountainMode, mountainZoom, timeseries]);

  // Current coordinate lookup map
  const coordMap = new Map<string, ScreenCoord>(animCoords.map((c) => [c.period, c]));

  // Curve builder from animated screen coordinates
  const buildSmoothPath = (selector: (c: ScreenCoord) => number) => {
    // Only include visible points, sorted horizontally by x
    const visiblePoints = pts
      .map((p) => coordMap.get(p.period))
      .filter((c): c is ScreenCoord => c !== undefined && c.opacity > 0.02)
      .map((c) => ({ x: c.x, y: selector(c) }))
      .sort((a, b) => a.x - b.x);

    if (visiblePoints.length === 0) return { strokePath: '', areaPath: '' };
    if (visiblePoints.length === 1) {
      const pt = visiblePoints[0];
      const strokePath = `M ${padL} ${pt.y.toFixed(1)} L ${W - padR} ${pt.y.toFixed(1)}`;
      const areaPath = `${strokePath} L ${W - padR} ${baseY} L ${padL} ${baseY} Z`;
      return { strokePath, areaPath };
    }

    let d = `M ${visiblePoints[0].x.toFixed(1)} ${visiblePoints[0].y.toFixed(1)}`;
    for (let i = 0; i < visiblePoints.length - 1; i++) {
      const p0 = visiblePoints[i];
      const p1 = visiblePoints[i + 1];
      const cpx1 = p0.x + (p1.x - p0.x) * 0.42;
      const cpx2 = p1.x - (p1.x - p0.x) * 0.42;
      d += ` C ${cpx1.toFixed(1)} ${p0.y.toFixed(1)}, ${cpx2.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    const strokePath = d;
    const areaPath = `${d} L ${visiblePoints[visiblePoints.length - 1].x.toFixed(1)} ${baseY} L ${visiblePoints[0].x.toFixed(1)} ${baseY} Z`;
    return { strokePath, areaPath };
  };

  const lostSmooth = buildSmoothPath((c) => c.yLost);
  const openSmooth = buildSmoothPath((c) => c.yOpen);
  const wonSmooth = buildSmoothPath((c) => c.yWon);

  const activeIdx =
    hoveredPointIdx != null && hoveredPointIdx >= 0 && hoveredPointIdx < n
      ? hoveredPointIdx
      : n > 0
      ? n - 1
      : null;
  const activePt = activeIdx != null ? pts[activeIdx] : null;
  const activeCoord = activePt ? coordMap.get(activePt.period) : null;

  const labelStep = Math.max(1, Math.ceil(n / 12));
  const showValueBadges = n <= 12;

  const fmtCompact = (v: number) => {
    if (mountainMode === 'money') {
      if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} млрд`;
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} млн`;
      if (v >= 1_000) return `${Math.round(v / 1_000)} тыс`;
    }
    return fmtCount(v);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4 transition-all">
      {/* Header & Instant Zoom Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
              {lang === 'uz' ? 'Sotuvlar grafigi va dinamika' : 'График продаж и динамика сделок'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {lang === 'uz'
                ? 'Yutuqlar, rad etilishlar va tushumlar o\'zgarishi dinamikasi'
                : 'Динамика успешных сделок, отказов и выручки по периодам'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom & Year selector pills */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(rawPts.length > 0 && String(rawPts[0]?.period || '').length > 7
              ? [
                  { id: 'last6', label: lang === 'uz' ? '6 kun' : '6 дн.' },
                  { id: 'last12', label: lang === 'uz' ? '12 kun' : '12 дн.' },
                  { id: 'all', label: `${lang === 'uz' ? 'Barchasi' : 'Все'} (${rawPts.length})` },
                ]
              : [
                  { id: 'last6', label: lang === 'uz' ? '6 oy' : '6 мес.' },
                  { id: 'last12', label: lang === 'uz' ? '12 oy' : '12 мес.' },
                  { id: 'all', label: `${lang === 'uz' ? 'Barchasi' : 'Все'} (${rawPts.length})` },
                  ...(availableYears.length > 1
                    ? [{ id: 'by_year', label: lang === 'uz' ? 'Yillar bo\'yicha' : 'По годам' }]
                    : []),
                  ...availableYears.map((y) => ({ id: y, label: `${y} ${lang === 'uz' ? 'y.' : 'г.'}` })),
                ]
            ).map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => {
                  setMountainZoom(z.id);
                  setHoveredPointIdx(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                  mountainZoom === z.id
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>

          {/* Metric mode toggle */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMountainMode('count')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                mountainMode === 'count'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'uz' ? 'Bitimlar (dona)' : 'Сделки (шт.)'}
            </button>
            <button
              type="button"
              onClick={() => setMountainMode('money')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                mountainMode === 'money'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {lang === 'uz' ? 'Byudjet (so\'m)' : 'Бюджет (сум)'}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Live Readout Bar for Hovered / Selected Period */}
      {activePt && (
        <div
          key={activePt.period}
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs animate-in fade-in-50 duration-200"
        >
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold transition-all">
              {lang === 'uz' ? 'Davr:' : 'Период:'} {activePt.period}
            </span>
            <span className="text-slate-500">
              {lang === 'uz' ? 'Jami bitimlar:' : 'Всего сделок:'}{' '}
              <strong className="text-slate-900 dark:text-white font-extrabold">{fmtCount(activePt.totalLeads)}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-500">{lang === 'uz' ? 'Muvaffaqiyatli (Won):' : 'Успешно (Won):'}</span>
              <strong className="text-emerald-600 dark:text-emerald-400 text-sm font-extrabold transition-all">
                {fmtCount(activePt.wonLeads)} {lang === 'uz' ? 'ta' : 'шт.'}
              </strong>
              <span className="text-slate-400">({fmtMoney(activePt.revenue)} {lang === 'uz' ? 'so\'m' : 'сум'})</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-500">{lang === 'uz' ? 'Rad etilgan (Lost):' : 'Нереализовано (Отказ):'}</span>
              <strong className="text-rose-600 dark:text-rose-400 text-sm font-extrabold transition-all">
                {fmtCount(activePt.lostLeads)} {lang === 'uz' ? 'ta' : 'шт.'}
              </strong>
              <span className="text-slate-400">({fmtMoney(activePt.lostValue)} {lang === 'uz' ? 'so\'m' : 'сум'})</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-500">{lang === 'uz' ? 'Ishda:' : 'В работе:'}</span>
              <strong className="text-blue-600 dark:text-blue-400 font-extrabold">
                {fmtCount(activePt.openLeads)} {lang === 'uz' ? 'ta' : 'шт.'}
              </strong>
            </div>

            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
              Win Rate: {activePt.totalLeads > 0 ? Math.round((activePt.wonLeads / activePt.totalLeads) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* SVG Smooth Mountain Canvas */}
      {n > 0 ? (
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-[300px] min-w-[680px] select-none"
            onMouseLeave={() => setHoveredPointIdx(null)}
          >
            <defs>
              <linearGradient id="smoothWonGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.52" />
                <stop offset="85%" stopColor="#10b981" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="smoothLostGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.42" />
                <stop offset="85%" stopColor="#f43f5e" stopOpacity="0.06" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="smoothOpenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padT + chartH * (1 - ratio);
              const val = Math.round(displayMaxVal * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={W - padR}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-800 transition-all duration-300"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padL - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[11px] font-medium transition-all duration-200"
                  >
                    {fmtCompact(val)}
                  </text>
                </g>
              );
            })}

            {/* Smooth Mountains: Lost (Red), Open (Blue), Won (Green) */}
            <path d={lostSmooth.areaPath} fill="url(#smoothLostGrad)" />
            <path
              d={lostSmooth.strokePath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            <path d={openSmooth.areaPath} fill="url(#smoothOpenGrad)" />
            <path
              d={openSmooth.strokePath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />

            <path d={wonSmooth.areaPath} fill="url(#smoothWonGrad)" />
            <path
              d={wonSmooth.strokePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Active hover crosshair vertical line */}
            {activeCoord && (
              <line
                x1={activeCoord.x}
                y1={padT}
                x2={activeCoord.x}
                y2={baseY}
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                className="transition-all duration-150 ease-out"
              />
            )}

            {/* Points, non-overlapping labels & invisible hover columns */}
            {pts.map((p, i) => {
              const animPt = coordMap.get(p.period);
              if (!animPt) return null;

              const x = animPt.x;
              const yWon = animPt.yWon;
              const yLost = animPt.yLost;
              const yOpen = animPt.yOpen;

              const wVal = getWon(p);
              const lVal = getLost(p);
              const isHovered = activeIdx === i;
              const showXLabel = i % labelStep === 0 || i === n - 1 || isHovered;

              const shouldShowPointText = isHovered || showValueBadges;
              const tooClose = Math.abs(yWon - yLost) < 20;
              const wonLabelY = tooClose
                ? yWon <= yLost
                  ? Math.max(16, yWon - 10)
                  : Math.min(baseY - 6, yWon + 15)
                : Math.max(16, yWon - 9);
              const lostLabelY = tooClose
                ? yLost < yWon
                  ? Math.max(16, yLost - 10)
                  : Math.min(baseY - 6, yLost + 15)
                : Math.max(16, yLost - 9);

              const colWidth = n > 1 ? chartW / (n - 1) : chartW;

              return (
                <g key={p.period} style={{ opacity: animPt.opacity }}>
                  {/* Dots with elastic hover transition */}
                  <circle
                    cx={x}
                    cy={yLost}
                    r={isHovered ? 6.5 : 3.5}
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2 : 1.2}
                    className="transition-all duration-200 ease-out"
                  />
                  <circle
                    cx={x}
                    cy={yOpen}
                    r={isHovered ? 5.5 : 2.5}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    className="transition-all duration-200 ease-out"
                  />
                  <circle
                    cx={x}
                    cy={yWon}
                    r={isHovered ? 7 : 4}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    className="transition-all duration-200 ease-out"
                  />

                  {/* Pulsing ring on active hovered Won point */}
                  {isHovered && (
                    <circle
                      cx={x}
                      cy={yWon}
                      r={12}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeOpacity="0.45"
                      className="animate-ping"
                    />
                  )}

                  {/* Non-overlapping pill badges */}
                  {shouldShowPointText && lVal > 0 && (
                    <text
                      x={x}
                      y={lostLabelY}
                      textAnchor="middle"
                      className={`fill-rose-600 dark:fill-rose-400 font-bold transition-all duration-150 ${
                        isHovered ? 'text-[11px]' : 'text-[10px]'
                      }`}
                    >
                      {fmtCompact(lVal)}
                    </text>
                  )}

                  {shouldShowPointText && wVal > 0 && (
                    <text
                      x={x}
                      y={wonLabelY}
                      textAnchor="middle"
                      className={`fill-emerald-600 dark:fill-emerald-400 font-extrabold transition-all duration-150 ${
                        isHovered ? 'text-[11px]' : 'text-[10px]'
                      }`}
                    >
                      {fmtCompact(wVal)}
                    </text>
                  )}

                  {/* X-axis Period Label */}
                  {showXLabel && (
                    <text
                      x={x}
                      y={baseY + 22}
                      textAnchor="middle"
                      className={`transition-all duration-150 ${
                        isHovered
                          ? 'fill-indigo-600 dark:fill-indigo-400 font-extrabold text-[11px]'
                          : 'fill-slate-500 dark:fill-slate-400 font-semibold text-[10px]'
                      }`}
                    >
                      {p.period}
                    </text>
                  )}

                  {/* Invisible hover & click target */}
                  <rect
                    x={x - colWidth / 2}
                    y={padT}
                    width={colWidth}
                    height={chartH + padB}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPointIdx(i)}
                    onClick={() => setHoveredPointIdx(i)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="h-56 flex items-center justify-center text-xs text-slate-400">
          {lang === 'uz' ? 'Tanlangan davr uchun ma\'lumot yo\'q' : 'Нет данных за выбранный период'}
        </div>
      )}
    </div>
  );
}
