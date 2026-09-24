"use client";
import clsx from "clsx";
import React, { useEffect } from "react";

import ConfirmConvertDialog from "@/app/[locale]/swap/components/ConfirmConvertDialog";
import TradeForm from "@/app/[locale]/swap/components/TradeForm";
import TwoVersionsInfo from "@/app/[locale]/swap/components/TwoVersionsInfo";
import { useSwapAmountsStore } from "@/app/[locale]/swap/stores/useSwapAmountsStore";
import { useSwapChartStore } from "@/app/[locale]/swap/stores/useSwapChartStore";
import { useSwapRecentTransactionsStore } from "@/app/[locale]/swap/stores/useSwapRecentTransactions";
import { useSwapTokensStore } from "@/app/[locale]/swap/stores/useSwapTokensStore";
import Container from "@/components/atoms/Container";
import SwapPriceChart from "@/components/charts/SwapPriceChart";
import RecentTransactions from "@/components/common/RecentTransactions";
import SelectedTokensInfo from "@/components/common/SelectedTokensInfo";
import useCurrentChainId from "@/hooks/useCurrentChainId";
import { useSwapAnalytics } from "@/hooks/useSwapAnalytics";
import { useSwapSearchParams } from "@/hooks/useSwapSearchParams";

export default function SwapPage() {
  useSwapSearchParams();

  const { isOpened: showRecentTransactions, setIsOpened: setShowRecentTransactions } =
    useSwapRecentTransactionsStore();
  const { isOpened: showChart } = useSwapChartStore();

  const chainId = useCurrentChainId();

  const { tokenA, tokenB, reset: resetTokens } = useSwapTokensStore();

  // Symbols and chain only - never addresses or amounts. See lib/analytics.ts.
  useSwapAnalytics({ tokenIn: tokenA?.symbol, tokenOut: tokenB?.symbol, chainId });

  const { reset: resetAmount } = useSwapAmountsStore();

  useEffect(() => {
    resetTokens();
    resetAmount();
  }, [chainId, resetAmount, resetTokens]);

  const showSidePanel = showChart || showRecentTransactions;

  return (
    <>
      <Container>
        <div
          className={clsx(
            "grid py-4 lg:py-[40px] grid-cols-1 mx-auto",
            showSidePanel
              ? "xl:grid-cols-[minmax(440px,580px)_600px] xl:max-w-[1200px] gap-4 xl:grid-areas-[left_right] grid-areas-[right,left]"
              : "xl:grid-cols-[600px] xl:max-w-[600px] grid-areas-[right]",
          )}
        >
          <div className="grid-in-[left] flex justify-center">
            <div className="flex flex-col gap-4 w-full sm:max-w-[600px] xl:max-w-full">
              {showChart && <SwapPriceChart tokenA={tokenA} tokenB={tokenB} />}
              <RecentTransactions
                showRecentTransactions={showRecentTransactions}
                handleClose={() => setShowRecentTransactions(false)}
                store={useSwapRecentTransactionsStore}
              />
            </div>
          </div>

          <div className="flex justify-center grid-in-[right]">
            <div className="flex flex-col gap-4 md:gap-6 lg:gap-5 w-full sm:max-w-[600px] xl:max-w-full">
              <div className="flex flex-col gap-2 lg:gap-3">
                <TwoVersionsInfo />
              </div>

              <TradeForm />
              <SelectedTokensInfo tokenA={tokenA} tokenB={tokenB} />
            </div>
          </div>
        </div>

        <ConfirmConvertDialog />
      </Container>
    </>
  );
}
