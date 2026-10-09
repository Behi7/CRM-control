import React, { useState } from 'react';
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
        period: `${y} ${lang === 'uz' ? 'y.' : 'г.'}`,
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
  const maxVal = Math.ceil(rawMax * 1.12);

  const xAt = (i: number) => (n <= 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW);
  const yAt = (val: number) => padT + chartH - (Math.min(val, maxVal) / maxVal) * chartH;

  const buildSmoothPath = (getter: (p: MountainPoint) => number) => {
    if (n === 0) return { strokePath: '', areaPath: '' };
    const points = pts.map((p, i) => ({ x: xAt(i), y: yAt(getter(p)) }));
    if (points.length === 1) {
      const pt = points[0];
      const strokePath = `M ${padL} ${pt.y.toFixed(1)} L ${W - padR} ${pt.y.toFixed(1)}`;
      const areaPath = `${strokePath} L ${W - padR} ${baseY} L ${padL} ${baseY} Z`;
      return { strokePath, areaPath };
    }
    let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpx1 = p0.x + (p1.x - p0.x) * 0.42;
      const cpx2 = p1.x - (p1.x - p0.x) * 0.42;
      d += ` C ${cpx1.toFixed(1)} ${p0.y.toFixed(1)}, ${cpx2.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    const strokePath = d;
    const areaPath = `${d} L ${points[points.length - 1].x.toFixed(1)} ${baseY} L ${points[0].x.toFixed(1)} ${baseY} Z`;
    return { strokePath, areaPath };
  };

  const lostSmooth = buildSmoothPath(getLost);
  const openSmooth = buildSmoothPath(getOpen);
  const wonSmooth = buildSmoothPath(getWon);

  const activeIdx =
    hoveredPointIdx != null && hoveredPointIdx >= 0 && hoveredPointIdx < n
      ? hoveredPointIdx
      : n > 0
      ? n - 1
      : null;
  const activePt = activeIdx != null ? pts[activeIdx] : null;

  const labelStep = Math.max(1, Math.ceil(n / 12));
  const showValueBadges = n <= 12;

  const fmtCompact = (v: number) => {
    if (mountainMode === 'money') {
      if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)} ${lang === 'uz' ? 'mlrd' : 'млрд'}`;
      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} ${lang === 'uz' ? 'mln' : 'млн'}`;
      if (v >= 1_000) return `${Math.round(v / 1_000)} ${lang === 'uz' ? 'ming' : 'тыс'}`;
    }
    return fmtCount(v);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
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
                    ? [{ id: 'by_year', label: lang === 'uz' ? 'Yillar bo‘yicha' : 'По годам' }]
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
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mountainMode === 'count'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'uz' ? 'Bitimlar (ta)' : 'Сделки (шт.)'}
            </button>
            <button
              type="button"
              onClick={() => setMountainMode('money')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mountainMode === 'money'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {lang === 'uz' ? 'Byudjet (so‘m)' : 'Бюджет (сум)'}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Live Readout Bar for Hovered / Selected Period */}
      {activePt && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-xs">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold">
              {lang === 'uz' ? 'Davr:' : 'Период:'} {activePt.period}
            </span>
            <span className="text-slate-500">
              {lang === 'uz' ? 'Jami bitimlar:' : 'Всего сделок:'}{' '}
              <strong className="text-slate-900 dark:text-white">{fmtCount(activePt.totalLeads)}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-500">{lang === 'uz' ? 'Muvaffaqiyatli (Won):' : 'Успешно (Won):'}</span>
              <strong className="text-emerald-600 dark:text-emerald-400 text-sm">
                {fmtCount(activePt.wonLeads)} {lang === 'uz' ? 'ta' : 'шт.'}
              </strong>
              <span className="text-slate-400">({fmtMoney(activePt.revenue)} {lang === 'uz' ? 'so‘m' : 'сум'})</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-500">{lang === 'uz' ? 'Rad etilgan (Bekor):' : 'Нереализовано (Отказ):'}</span>
              <strong className="text-rose-600 dark:text-rose-400 text-sm">
                {fmtCount(activePt.lostLeads)} {lang === 'uz' ? 'ta' : 'шт.'}
              </strong>
              <span className="text-slate-400">({fmtMoney(activePt.lostValue)} {lang === 'uz' ? 'so‘m' : 'сум'})</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-slate-500">{lang === 'uz' ? 'Ishda:' : 'В работе:'}</span>
              <strong className="text-blue-600 dark:text-blue-400 font-extrabold">
                {fmtCount(activePt.openLeads)} {lang === 'uz' ? 'ta' : 'шт.'}
              </strong>
            </div>
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
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={W - padR}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-800"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padL - 10}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-400 text-[11px] font-medium"
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
            {activeIdx != null && (
              <line
                x1={xAt(activeIdx)}
                y1={padT}
                x2={xAt(activeIdx)}
                y2={baseY}
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
            )}

            {/* Points, non-overlapping labels & invisible hover columns */}
            {pts.map((p, i) => {
              const x = xAt(i);
              const wVal = getWon(p);
              const lVal = getLost(p);
              const oVal = getOpen(p);
              const yWon = yAt(wVal);
              const yLost = yAt(lVal);
              const yOpen = yAt(oVal);
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
                <g key={p.period}>
                  {/* Dots */}
                  <circle
                    cx={x}
                    cy={yLost}
                    r={isHovered ? 6 : 3.5}
                    fill="#f43f5e"
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2 : 1.2}
                  />
                  <circle
                    cx={x}
                    cy={yOpen}
                    r={isHovered ? 5 : 2.5}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                  <circle
                    cx={x}
                    cy={yWon}
                    r={isHovered ? 6.5 : 4}
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth={isHovered ? 2.2 : 1.5}
                  />

                  {/* Non-overlapping pill badges */}
                  {shouldShowPointText && lVal > 0 && (
                    <text
                      x={x}
                      y={lostLabelY}
                      textAnchor="middle"
                      className={`fill-rose-600 dark:fill-rose-400 font-bold ${
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
                      className={`fill-emerald-600 dark:fill-emerald-400 font-extrabold ${
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
                      className={`${
                        isHovered
                          ? 'fill-indigo-600 dark:fill-indigo-400 font-extrabold text-[11px]'
                          : 'fill-slate-500 dark:fill-slate-400 font-semibold text-[10px]'
                      }`}
                    >
                      {p.period}
                    </text>
                  )}

                  {/* Invisible hover target */}
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
