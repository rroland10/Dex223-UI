"use client";

import { area, bisector, curveMonotoneX, extent, line, scaleLinear, scaleTime } from "d3";
import { useMemo, useState } from "react";

import { PricePoint } from "@/hooks/usePoolPriceChart";

const dateBisector = bisector<PricePoint, number>((d) => d.date).center;

interface Props {
  series: PricePoint[];
  width: number;
  height: number;
  /** Rendered when the series is empty, so the caller controls the wording. */
  emptyLabel: string;
  isLoading?: boolean;
  onHover?: (point: PricePoint | null) => void;
}

const MARGIN = { top: 8, right: 8, bottom: 20, left: 8 };

// packages/tailwind-config/tailwind-presets.js
const CHART_GREEN = "#7DA491";
const CHART_RED = "#D24B4B";
const CHART_GUIDE = "#575A5D";

export default function PriceChart({
  series,
  width,
  height,
  emptyLabel,
  isLoading = false,
  onHover,
}: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const { xScale, yScale, linePath, areaPath } = useMemo(() => {
    if (series.length === 0 || innerWidth <= 0 || innerHeight <= 0) {
      return { xScale: null, yScale: null, linePath: null, areaPath: null };
    }

    const x = scaleTime()
      .domain(extent(series, (d) => new Date(d.date * 1000)) as [Date, Date])
      .range([0, innerWidth]);

    const [lo, hi] = extent(series, (d) => d.close) as [number, number];
    // A flat series gives lo === hi, which collapses the scale and draws nothing.
    // Pad it so the line sits in the middle instead of vanishing.
    const pad = hi === lo ? Math.abs(hi) * 0.05 || 1 : (hi - lo) * 0.1;

    const y = scaleLinear()
      .domain([lo - pad, hi + pad])
      .range([innerHeight, 0]);

    const l = line<PricePoint>()
      .x((d) => x(new Date(d.date * 1000)))
      .y((d) => y(d.close))
      .curve(curveMonotoneX);

    const a = area<PricePoint>()
      .x((d) => x(new Date(d.date * 1000)))
      .y0(innerHeight)
      .y1((d) => y(d.close))
      .curve(curveMonotoneX);

    return { xScale: x, yScale: y, linePath: l(series), areaPath: a(series) };
  }, [series, innerWidth, innerHeight]);

  if (isLoading) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center rounded-3 bg-tertiary-bg animate-pulse"
      />
    );
  }

  if (series.length === 0 || !linePath) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center rounded-3 bg-tertiary-bg text-secondary-text text-14"
      >
        {emptyLabel}
      </div>
    );
  }

  const rising = series[series.length - 1].close >= series[0].close;
  // Taken from the Tailwind preset rather than a CSS variable: this project defines its
  // palette as Tailwind theme tokens and has no --green/--red custom properties, so
  // stroke="var(--green)" resolves to nothing and the line renders invisible.
  const stroke = rising ? CHART_GREEN : CHART_RED;
  const gradientId = `price-chart-fill-${rising ? "up" : "down"}`;

  const pickIndex = (clientX: number, target: Element) => {
    if (!xScale || series.length === 0) return;
    const bounds = target.getBoundingClientRect();
    const offset = clientX - bounds.left;
    // Nearest point by date, not by array index. Days can be missing after zero
    // prices are dropped, so a linear index would land on the wrong candle.
    const date = xScale.invert(Math.min(innerWidth, Math.max(0, offset)));
    const index = Math.min(
      series.length - 1,
      Math.max(0, dateBisector(series, date.getTime() / 1000)),
    );
    setHoverIndex(index);
    onHover?.(series[index]);
  };

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    pickIndex(event.clientX, event.currentTarget);
  };

  const handleTouchMove = (event: React.TouchEvent<SVGRectElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    pickIndex(touch.clientX, event.currentTarget);
  };

  const handleLeave = () => {
    setHoverIndex(null);
    onHover?.(null);
  };

  return (
    <svg width={width} height={height} role="img" aria-label="Price history">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        <path d={areaPath ?? undefined} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={2} />

        {hoverIndex !== null && xScale && yScale && (
          <g>
            <line
              x1={xScale(new Date(series[hoverIndex].date * 1000))}
              x2={xScale(new Date(series[hoverIndex].date * 1000))}
              y1={0}
              y2={innerHeight}
              stroke={CHART_GUIDE}
              strokeDasharray="3 3"
            />
            <circle
              cx={xScale(new Date(series[hoverIndex].date * 1000))}
              cy={yScale(series[hoverIndex].close)}
              r={4}
              fill={stroke}
            />
          </g>
        )}

        <rect
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          onTouchStart={handleTouchMove}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleLeave}
          style={{ touchAction: "none" }}
        />
      </g>
    </svg>
  );
}
