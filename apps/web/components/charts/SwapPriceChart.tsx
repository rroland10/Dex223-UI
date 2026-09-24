"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTrade } from "@/app/[locale]/swap/hooks/useTrade";
import Svg from "@/components/atoms/Svg";
import PriceChart from "@/components/charts/PriceChart";
import { ChartRange, PricePoint, usePoolPriceChart } from "@/hooks/usePoolPriceChart";
import { FeeAmount } from "@/sdk_bi/constants";
import { Currency } from "@/sdk_bi/entities/currency";
import { useComputePoolAddressDex } from "@/sdk_bi/utils/computePoolAddress";

const RANGES: ChartRange[] = [7, 30, 90];
const DEFAULT_WIDTH = 440;
const CHART_HEIGHT = 220;

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toFixed(4);
  return value.toPrecision(4);
}

export default function SwapPriceChart({
  tokenA,
  tokenB,
  height = CHART_HEIGHT,
}: {
  tokenA?: Currency;
  tokenB?: Currency;
  height?: number;
}) {
  const t = useTranslations("Swap");
  const [days, setDays] = useState<ChartRange>(30);
  const [hovered, setHovered] = useState<PricePoint | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const chartRef = useRef<HTMLDivElement>(null);

  // Follow the routed pool's fee once a quote exists; otherwise fall back to medium
  // so the chart still loads before the user types an amount.
  const { trade } = useTrade();
  const feeTier = (trade?.route.pools?.[0]?.fee as FeeAmount | undefined) ?? FeeAmount.MEDIUM;

  const { poolAddress, poolAddressLoading } = useComputePoolAddressDex({
    tokenA,
    tokenB,
    tier: feeTier,
  });

  // The subgraph stores token0Price, and token0 is whichever address sorts lower.
  // When the user is looking at the pair the other way round the series needs
  // inverting, otherwise the chart silently shows the reciprocal of what they expect.
  const inverted = useMemo(() => {
    if (!tokenA?.wrapped?.address0 || !tokenB?.wrapped?.address0) return false;
    return tokenA.wrapped.address0.toLowerCase() > tokenB.wrapped.address0.toLowerCase();
  }, [tokenA, tokenB]);

  const hasPair = Boolean(tokenA && tokenB);

  const { series, latestPrice, change, isLoading, isEmpty } = usePoolPriceChart({
    poolAddress: hasPair ? (poolAddress ?? undefined) : undefined,
    days,
    inverted,
  });

  useEffect(() => {
    const el = chartRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const apply = (next: number) => {
      const floored = Math.floor(next);
      if (floored > 0) setWidth(floored);
    };

    apply(el.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) apply(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const loading = hasPair && (isLoading || Boolean(poolAddressLoading));
  const shown = hovered?.close ?? latestPrice;

  const emptyLabel = !hasPair
    ? t("price_chart_select_tokens")
    : isEmpty
      ? t("price_chart_no_data")
      : t("price_chart_data_not_available");

  return (
    <div className="flex flex-col gap-3 rounded-5 bg-primary-bg p-4 md:p-5">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-14 text-secondary-text truncate">
            <Svg iconName="chart" size={16} className="shrink-0 text-secondary-text" />
            <span>
              {hasPair
                ? `${tokenA!.symbol} / ${tokenB!.symbol}`
                : t("price_chart_title")}
            </span>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-20 md:text-24 font-medium">
              {!hasPair || shown === null ? "—" : formatPrice(shown)}
            </span>
            {hasPair && change !== null && !hovered && (
              <span className={change >= 0 ? "text-green text-14" : "text-red-light text-14"}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              disabled={!hasPair}
              aria-pressed={days === range}
              className={
                "px-2.5 py-1 rounded-2 text-12 duration-200 disabled:opacity-40 disabled:pointer-events-none " +
                (days === range
                  ? "bg-green-bg text-primary-text"
                  : "text-secondary-text hocus:text-primary-text")
              }
            >
              {range}D
            </button>
          ))}
        </div>
      </div>

      <div ref={chartRef} className="w-full min-w-0">
        <PriceChart
          series={hasPair ? series : []}
          width={width}
          height={height}
          isLoading={loading}
          emptyLabel={emptyLabel}
          onHover={setHovered}
        />
      </div>
    </div>
  );
}
