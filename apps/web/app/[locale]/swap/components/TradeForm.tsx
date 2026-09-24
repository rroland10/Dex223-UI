import Alert from "@repo/ui/alert";
import Preloader from "@repo/ui/preloader";
import Tooltip from "@repo/ui/tooltip";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { formatEther, formatGwei, formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";

import ConfirmSwapDialog from "@/app/[locale]/swap/components/ConfirmSwapDialog";
import SwapDetails from "@/app/[locale]/swap/components/SwapDetails";
import SwapSettingsDialog from "@/app/[locale]/swap/components/SwapSettingsDialog";
import { useSwapEstimatedGas, useSwapStatus } from "@/app/[locale]/swap/hooks/useSwap";
import { useTrade, useTradeComputation } from "@/app/[locale]/swap/hooks/useTrade";
import { useConfirmConvertDialogStore } from "@/app/[locale]/swap/stores/useConfirmConvertDialogOpened";
import { useConfirmSwapDialogStore } from "@/app/[locale]/swap/stores/useConfirmSwapDialogOpened";
import { Field, useSwapAmountsStore } from "@/app/[locale]/swap/stores/useSwapAmountsStore";
import {
  useSwapGasLimitStore,
  useSwapGasModeStore,
  useSwapGasPriceStore,
} from "@/app/[locale]/swap/stores/useSwapGasSettingsStore";
import { useSwapChartStore } from "@/app/[locale]/swap/stores/useSwapChartStore";
import { useSwapRecentTransactionsStore } from "@/app/[locale]/swap/stores/useSwapRecentTransactions";
import { useSwapSettingsStore } from "@/app/[locale]/swap/stores/useSwapSettingsStore";
import { useSwapTokensStore } from "@/app/[locale]/swap/stores/useSwapTokensStore";
import { TradeError } from "@/app/[locale]/swap/stores/useSwapTradeStore";
import Button, { ButtonColor, ButtonSize } from "@/components/buttons/Button";
import IconButton, { IconButtonSize } from "@/components/buttons/IconButton";
import SwapButton from "@/components/buttons/SwapButton";
import TokenInput from "@/components/common/TokenInput";
import NetworkFeeConfigDialog from "@/components/dialogs/NetworkFeeConfigDialog";
import PickTokenDialog from "@/components/dialogs/PickTokenDialog";
import { useConnectWalletDialogStateStore } from "@/components/dialogs/stores/useConnectWalletStore";
import { useTransactionSettingsDialogStore } from "@/components/dialogs/stores/useTransactionSettingsDialogStore";
import { networks } from "@/config/networks";
import { formatFloat } from "@/functions/formatFloat";
import { useStoreAllowance } from "@/hooks/useAllowance";
import useCanReceiveERC223 from "@/hooks/useCanReceiveERC223";
import useCurrentChainId from "@/hooks/useCurrentChainId";
import { useNativeCurrency } from "@/hooks/useNativeCurrency";
import { usePoolBalances } from "@/hooks/usePoolBalances";
import useTokenBalances from "@/hooks/useTokenBalances";
import { useUSDPrice } from "@/hooks/useUSDPrice";
import { ROUTER_ADDRESS } from "@/sdk_bi/addresses";
import { Currency } from "@/sdk_bi/entities/currency";
import { CurrencyAmount } from "@/sdk_bi/entities/fractions/currencyAmount";
import { wrappedTokens } from "@/sdk_bi/entities/weth9";
import { Standard } from "@/sdk_bi/standard";
import { useGlobalBlockNumber } from "@/shared/hooks/useGlobalBlockNumber";
import { useGlobalFees } from "@/shared/hooks/useGlobalFees";
import { GasOption } from "@/stores/factories/createGasPriceStore";
import { GasFeeModel } from "@/stores/useRecentTransactionsStore";

const ActionButtonSize = ButtonSize.EXTRA_LARGE;
const MobileActionButtonSize = ButtonSize.LARGE;
function OpenConfirmDialogButton({
  isSufficientBalance,
  isTradeReady,
  isTradeLoading,
}: {
  isSufficientBalance: boolean;
  isTradeReady: boolean;
  isTradeLoading: boolean;
}) {
  const tWallet = useTranslations("Wallet");
  const t = useTranslations("Swap");
  const { isConnected } = useAccount();

  const { tokenA, tokenB, tokenBStandard } = useSwapTokensStore();
  const { typedValue } = useSwapAmountsStore();
  const { setIsOpen: setConfirmSwapDialogOpen } = useConfirmSwapDialogStore();
  const { setIsOpen: setConfirmConvertDialogOpen } = useConfirmConvertDialogStore();

  const { isLoadingSwap, isLoadingApprove, isPendingApprove, isPendingSwap } = useSwapStatus();
  const { setIsOpened: setWalletConnectOpened } = useConnectWalletDialogStateStore();
  const { error } = useTrade();

  if (!isConnected) {
    return (
      <Button
        onClick={() => setWalletConnectOpened(true)}
        fullWidth
        size={ActionButtonSize}
        mobileSize={MobileActionButtonSize}
      >
        {tWallet("connect_wallet")}
      </Button>
    );
  }

  if (isLoadingSwap) {
    return (
      <Button fullWidth isLoading size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        <span className="flex items-center gap-2">
          <span>{t("processing_swap")}</span>
          <Preloader size={20} color="black" />
        </span>
      </Button>
    );
  }

  if (isLoadingApprove) {
    return (
      <Button fullWidth isLoading size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        <span className="flex items-center gap-2">
          <span>{t("approving_in_progress")}</span>
          <Preloader size={20} color="black" />
        </span>
      </Button>
    );
  }

  if (isPendingApprove || isPendingSwap) {
    return (
      <Button fullWidth isLoading size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        <span className="flex items-center gap-2">
          <span>{t("waiting_for_confirmation")}</span>
          <Preloader size={20} color="black" />
        </span>
      </Button>
    );
  }

  if (!tokenA || !tokenB) {
    return (
      <Button fullWidth disabled size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        {t("select_tokens")}
      </Button>
    );
  }

  if (!+typedValue) {
    return (
      <Button fullWidth disabled size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        {t("enter_amount")}
      </Button>
    );
  }

  if (!isSufficientBalance) {
    return (
      <Button fullWidth disabled size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        {t("insufficient_balance")}
      </Button>
    );
  }

  if (tokenA.equals(tokenB)) {
    return (
      <Button
        size={ActionButtonSize}
        mobileSize={MobileActionButtonSize}
        fullWidth
        onClick={() => setConfirmConvertDialogOpen(true)}
      >
        Convert {tokenA.wrapped.symbol} to {tokenBStandard}
      </Button>
    );
  }

  if (error === TradeError.NO_LIQUIDITY) {
    return (
      <Button fullWidth disabled size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        Insufficient liquidity for this trade
      </Button>
    );
  }

  if (isTradeLoading) {
    return (
      <Button fullWidth disabled size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        {t("looking_for_the_best_trade")}
      </Button>
    );
  }

  if (!isTradeReady) {
    return (
      <Button fullWidth disabled size={ActionButtonSize} mobileSize={MobileActionButtonSize}>
        {t("swap_is_unavailable_for_this_pair")}
      </Button>
    );
  }

  return (
    <Button
      onClick={() => setConfirmSwapDialogOpen(true)}
      fullWidth
      size={ActionButtonSize}
      tabletSize={MobileActionButtonSize}
    >
      {t("swap")}
    </Button>
  );
}

const gasOptionTitle: Record<GasOption, any> = {
  [GasOption.CHEAP]: "cheap",
  [GasOption.FAST]: "fast",
  [GasOption.CUSTOM]: "custom",
};
export default function TradeForm() {
  const t = useTranslations("Swap");
  const { address } = useAccount();
  const canReceiveERC223 = useCanReceiveERC223(address);
  useTradeComputation();

  const chainId = useCurrentChainId();
  const [isOpenedFee, setIsOpenedFee] = useState(false);
  const { isOpened: showRecentTransactions, setIsOpened: setShowRecentTransactions } =
    useSwapRecentTransactionsStore();
  const { isOpened: showChart, setIsOpened: setShowChart } = useSwapChartStore();
  const { setIsOpen } = useTransactionSettingsDialogStore();
  const {
    tokenA,
    tokenB,
    setTokenA,
    setTokenB,
    tokenAStandard,
    tokenBStandard,
    setTokenAStandard,
    setTokenBStandard,
    switchTokens,
  } = useSwapTokensStore();
  const settingsStore = useSwapSettingsStore();

  const { computed } = settingsStore;
  const [currentlyPicking, setCurrentlyPicking] = useState<"tokenA" | "tokenB">("tokenA");

  const { setTypedValue, typedValue } = useSwapAmountsStore();

  const { isAllowed: isAllowedA } = useStoreAllowance({
    token: tokenA,
    contractAddress: ROUTER_ADDRESS[chainId],
    amountToCheck: parseUnits(typedValue, tokenA?.decimals ?? 18),
  });

  const { trade, loading, error } = useTrade();
  useSwapEstimatedGas({ trade });

  const { erc20BalanceToken1, erc223BalanceToken1 } = usePoolBalances({
    tokenA,
    tokenB,
    fee: trade?.route.pools?.[0]?.fee,
  });

  const dependentAmount: CurrencyAmount<Currency> | undefined = useMemo(() => {
    return trade?.outputAmount;
  }, [trade?.outputAmount]);

  const dependentAmountValue = useMemo(() => {
    if (tokenA && tokenB && tokenA.equals(tokenB)) {
      return typedValue;
    }

    return dependentAmount?.toSignificant() || "";
  }, [dependentAmount, tokenA, tokenB, typedValue]);

  const isConvertationRequired = useMemo(() => {
    if (erc20BalanceToken1 && tokenBStandard === Standard.ERC20) {
      if (dependentAmount && +dependentAmount.toSignificant() > +erc20BalanceToken1.formatted) {
        return true;
      }
    }

    if (erc223BalanceToken1 && tokenBStandard === Standard.ERC223) {
      if (dependentAmount && +dependentAmount.toSignificant() > +erc223BalanceToken1.formatted) {
        return true;
      }
    }

    return false;
  }, [dependentAmount, erc20BalanceToken1, erc223BalanceToken1, tokenBStandard]);

  const gasERC20 = useMemo(() => {
    if (!tokenA || !tokenB || !typedValue) {
      return "—";
    }

    let gasForERC20 = 149;

    if (!isAllowedA) {
      gasForERC20 += 29;
    }

    if (isConvertationRequired) {
      gasForERC20 += 56;
    }

    return `~${gasForERC20}K gas`;
  }, [isAllowedA, isConvertationRequired, tokenA, tokenB, typedValue]);

  const gasERC223 = useMemo(() => {
    if (!tokenA || !tokenB || !typedValue) {
      return "—";
    }

    let gasForERC223 = 127;

    if (isConvertationRequired) {
      gasForERC223 += 56;
    }

    return `~${gasForERC223}K gas`;
  }, [isConvertationRequired, tokenA, tokenB, typedValue]);

  const [isOpenedTokenPick, setIsOpenedTokenPick] = useState(false);

  const handlePick = useCallback(
    (token: Currency) => {
      if (currentlyPicking === "tokenA") {
        setTokenA(token);
        setTokenAStandard(Standard.ERC20);

        if (token.isNative || tokenB?.isNative) {
          if (tokenB && tokenB.equals(token)) {
            setTokenB(tokenA);
            setTokenBStandard(tokenAStandard);
          }
        } else {
          if (token.address0 === tokenB?.address0) {
            if (tokenBStandard === Standard.ERC20) {
              setTokenAStandard(Standard.ERC223);
            } else {
              setTokenAStandard(Standard.ERC20);
            }
          }
        }
      }

      if (currentlyPicking === "tokenB") {
        setTokenB(token);
        setTokenBStandard(Standard.ERC20);

        if (token.isNative || tokenA?.isNative) {
          if (tokenA && tokenA.equals(token)) {
            setTokenA(tokenB);
            setTokenAStandard(tokenBStandard);
          }
        } else {
          if (token.address0 === tokenA?.address0) {
            if (tokenAStandard === Standard.ERC20) {
              setTokenBStandard(Standard.ERC223);
            } else {
              setTokenBStandard(Standard.ERC20);
            }
          }
        }
      }

      setIsOpenedTokenPick(false);
    },
    [
      currentlyPicking,
      setTokenA,
      setTokenAStandard,
      setTokenB,
      setTokenBStandard,
      tokenA,
      tokenAStandard,
      tokenB,
      tokenBStandard,
    ],
  );

  const {
    balance: { erc20Balance: tokenA0Balance, erc223Balance: tokenA1Balance },
    refetch: refetchABalance,
  } = useTokenBalances(tokenA);
  const {
    balance: { erc20Balance: tokenB0Balance, erc223Balance: tokenB1Balance },
    refetch: refetchBBalance,
  } = useTokenBalances(tokenB);

  const { blockNumber } = useGlobalBlockNumber();

  useEffect(() => {
    refetchABalance();
    refetchBBalance();
  }, [blockNumber, refetchABalance, refetchBBalance]);

  const {
    gasPriceOption,
    gasPriceSettings,
    setGasPriceOption,
    setGasPriceSettings,
    updateDefaultState,
  } = useSwapGasPriceStore();
  const { estimatedGas, customGasLimit, setEstimatedGas, setCustomGasLimit } =
    useSwapGasLimitStore();
  const { isAdvanced, setIsAdvanced } = useSwapGasModeStore();

  const { isLoadingSwap, isPendingSwap, isLoadingApprove, isPendingApprove } = useSwapStatus();

  const { setIsOpen: setConfirmSwapDialogOpen } = useConfirmSwapDialogStore();
  const { baseFee, priorityFee, gasPrice } = useGlobalFees();

  useEffect(() => {
    updateDefaultState(chainId);
  }, [chainId, updateDefaultState]);

  const computedGasSpending = useMemo(() => {
    if (gasPriceSettings.model === GasFeeModel.LEGACY && gasPriceSettings.gasPrice) {
      return formatFloat(formatGwei(gasPriceSettings.gasPrice));
    }

    if (gasPriceSettings.model === GasFeeModel.LEGACY && gasPrice) {
      return formatFloat(formatGwei(gasPrice));
    }

    if (
      gasPriceSettings.model === GasFeeModel.EIP1559 &&
      gasPriceSettings.maxFeePerGas &&
      gasPriceSettings.maxPriorityFeePerGas &&
      baseFee &&
      gasPriceOption === GasOption.CUSTOM
    ) {
      const lowerFeePerGas =
        gasPriceSettings.maxFeePerGas > baseFee ? baseFee : gasPriceSettings.maxFeePerGas;

      return formatFloat(formatGwei(lowerFeePerGas + gasPriceSettings.maxPriorityFeePerGas));
    }

    if (
      gasPriceSettings.model === GasFeeModel.EIP1559 &&
      baseFee &&
      priorityFee &&
      gasPriceOption !== GasOption.CUSTOM
    ) {
      return formatFloat(formatGwei(baseFee + priorityFee));
    }

    return undefined;
  }, [baseFee, gasPrice, gasPriceOption, gasPriceSettings, priorityFee]);

  const computedGasSpendingETH = useMemo(() => {
    if (gasPriceSettings.model === GasFeeModel.LEGACY && gasPriceSettings.gasPrice) {
      return formatFloat(formatEther(gasPriceSettings.gasPrice * estimatedGas));
    }

    if (
      gasPriceSettings.model === GasFeeModel.EIP1559 &&
      gasPriceSettings.maxFeePerGas &&
      gasPriceSettings.maxPriorityFeePerGas &&
      baseFee &&
      gasPriceOption === GasOption.CUSTOM
    ) {
      const lowerFeePerGas =
        gasPriceSettings.maxFeePerGas > baseFee ? baseFee : gasPriceSettings.maxFeePerGas;

      return formatFloat(
        formatEther((lowerFeePerGas + gasPriceSettings.maxPriorityFeePerGas) * estimatedGas),
      );
    }

    if (
      gasPriceSettings.model === GasFeeModel.EIP1559 &&
      baseFee &&
      priorityFee &&
      gasPriceOption !== GasOption.CUSTOM
    ) {
      return formatFloat(formatEther((baseFee + priorityFee) * estimatedGas));
    }

    return undefined;
  }, [baseFee, estimatedGas, gasPriceOption, gasPriceSettings, priorityFee]);

  const _isMobile = useMediaQuery({ query: "(max-width: 767px)" });
  const nativeCurrency = useNativeCurrency();
  const { price } = useUSDPrice(wrappedTokens[chainId]?.address0);
  const { setIsOpen: setConfirmConvertDialogOpen } = useConfirmConvertDialogStore();

  return (
    <div className="card-spacing pt-2.5 surface rounded-5">
      <div className="flex justify-between items-center mb-2.5">
        <h3 className="font-bold text-20">{t("swap")}</h3>
        <div className="flex items-center relative left-3">
          <IconButton
            buttonSize={IconButtonSize.LARGE}
            active={showChart}
            iconName="chart"
            aria-label={t("price_chart_toggle")}
            aria-pressed={showChart}
            onClick={() => setShowChart(!showChart)}
          />
          <IconButton
            buttonSize={IconButtonSize.LARGE}
            active={showRecentTransactions}
            iconName="recent-transactions"
            onClick={() => setShowRecentTransactions(!showRecentTransactions)}
          />
          <IconButton
            buttonSize={IconButtonSize.LARGE}
            iconName="gas-edit"
            onClick={() => setIsOpenedFee(true)}
          />

          <span className="relative">
            <IconButton
              buttonSize={IconButtonSize.LARGE}
              iconSize={24}
              iconName="settings"
              onClick={() => setIsOpen(true)}
            />
            {computed.isModified && (
              <div className="absolute w-2 h-2 right-[13px] top-[13px] bg-primary-bg flex items-center z-10 justify-center rounded-full">
                <div className="w-1 h-1 bg-red-light rounded-full" />
              </div>
            )}
          </span>
        </div>
      </div>
      <TokenInput
        value={typedValue}
        onInputChange={(value) => setTypedValue({ typedValue: value, field: Field.CURRENCY_A })}
        handleClick={() => {
          setCurrentlyPicking("tokenA");
          setIsOpenedTokenPick(true);
        }}
        gasERC20={gasERC20}
        gasERC223={gasERC223}
        token={tokenA}
        balance0={
          tokenA0Balance && Boolean(tokenA0Balance.value)
            ? formatFloat(tokenA0Balance.formatted)
            : "0"
        }
        balance1={
          tokenA1Balance && Boolean(tokenA1Balance.value)
            ? formatFloat(tokenA1Balance.formatted)
            : "0"
        }
        setMax={
          (Boolean(tokenA0Balance?.value) && tokenAStandard === Standard.ERC20) ||
          (Boolean(tokenA1Balance?.value) && tokenAStandard === Standard.ERC223)
            ? () => {
                if (tokenA0Balance && tokenAStandard === Standard.ERC20) {
                  setTypedValue({
                    typedValue: tokenA0Balance.formatted,

                    field: Field.CURRENCY_A,
                  });
                }
                if (tokenA1Balance && tokenAStandard === Standard.ERC223) {
                  setTypedValue({
                    typedValue: tokenA1Balance.formatted,

                    field: Field.CURRENCY_A,
                  });
                }
              }
            : undefined
        }
        setHalf={
          (Boolean(tokenA0Balance?.value) && tokenAStandard === Standard.ERC20) ||
          (Boolean(tokenA1Balance?.value) && tokenAStandard === Standard.ERC223)
            ? () => {
                if (tokenA0Balance && tokenAStandard === Standard.ERC20) {
                  setTypedValue({
                    typedValue: formatUnits(
                      tokenA0Balance.value / BigInt(2),
                      tokenA0Balance.decimals,
                    ),

                    field: Field.CURRENCY_A,
                  });
                }
                if (tokenA1Balance && tokenAStandard === Standard.ERC223) {
                  setTypedValue({
                    typedValue: formatUnits(
                      tokenA1Balance.value / BigInt(2),
                      tokenA1Balance.decimals,
                    ),

                    field: Field.CURRENCY_A,
                  });
                }
              }
            : undefined
        }
        isHalf={
          (tokenAStandard === Standard.ERC20 &&
            tokenA0Balance &&
            typedValue !== "0" &&
            typedValue ===
              formatUnits(tokenA0Balance.value / BigInt(2), tokenA0Balance.decimals)) ||
          (tokenAStandard === Standard.ERC223 &&
            typedValue !== "0" &&
            tokenA1Balance &&
            typedValue === formatUnits(tokenA1Balance.value / BigInt(2), tokenA1Balance.decimals))
        }
        isMax={
          (tokenAStandard === Standard.ERC20 &&
            typedValue !== "0" &&
            tokenA0Balance &&
            typedValue === tokenA0Balance.formatted) ||
          (tokenAStandard === Standard.ERC223 &&
            typedValue !== "0" &&
            tokenA1Balance &&
            typedValue === tokenA1Balance.formatted)
        }
        label={t("you_pay")}
        standard={tokenAStandard}
        setStandard={(standard) => {
          setTokenAStandard(standard);

          if (
            standard === tokenBStandard &&
            tokenA &&
            tokenB &&
            tokenA.wrapped.equals(tokenB.wrapped)
          ) {
            setTokenBStandard(standard === Standard.ERC20 ? Standard.ERC223 : Standard.ERC20);
          }
        }}
      />
      <div className="relative h-4 md:h-5 z-10">
        <SwapButton
          onClick={() => {
            switchTokens();
            setTypedValue({
              typedValue: dependentAmountValue,
              field: Field.CURRENCY_A,
            });
          }}
        />
      </div>
      <TokenInput
        readOnly
        value={dependentAmountValue}
        onInputChange={(value) => null}
        handleClick={() => {
          setCurrentlyPicking("tokenB");
          setIsOpenedTokenPick(true);
        }}
        token={tokenB}
        balance0={
          tokenB0Balance && Boolean(tokenB0Balance.value)
            ? formatFloat(tokenB0Balance.formatted)
            : "0"
        }
        balance1={
          tokenB1Balance && Boolean(tokenB1Balance.value)
            ? formatFloat(tokenB1Balance.formatted)
            : "0"
        }
        label={t("you_receive")}
        standard={tokenBStandard}
        setStandard={(standard) => {
          setTokenBStandard(standard);

          if (
            standard === tokenAStandard &&
            tokenA &&
            tokenB &&
            tokenA.wrapped.equals(tokenB.wrapped)
          ) {
            setTokenAStandard(standard === Standard.ERC20 ? Standard.ERC223 : Standard.ERC20);
          }
        }}
      />

      {tokenB && tokenBStandard === Standard.ERC223 && !canReceiveERC223 && (
        <div className="mt-5">
          <Alert
            text="Your wallet is an EIP-7702 smart account that cannot receive ERC-223 tokens, so this swap would fail. Receive ERC-20 instead."
            type="warning"
          />
        </div>
      )}

      {error === TradeError.NO_LIQUIDITY && (
        <div className="mt-5">
          <Alert
            text="Swap unavailable. One of the tokens lacks liquidity. Please try again later or choose another pair"
            type="warning"
          />
        </div>
      )}

      {tokenA && tokenB && !tokenA.equals(tokenB) && error === TradeError.NO_POOLS && (
        <div className="mt-5">
          <Alert
            text={
              <span>
                The requested pool does not exist. You can{" "}
                <a
                  className="text-green hover:text-green-hover duration-200"
                  target="_blank"
                  href={`/add?tokenA=${tokenA.wrapped.address0}&tokenB=${tokenB.wrapped.address0}`}
                >
                  create a new pool
                </a>
              </span>
            }
            type="warning"
          />
        </div>
      )}

      {tokenA && tokenB && typedValue ? (
        <div
          className={clsx(
            "rounded-3 py-3.5 flex justify-between duration-200 px-5 bg-tertiary-bg my-5 md:items-center flex-wrap",
          )}
          role="button"
        >
          {computedGasSpending ? (
            <>
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-1">
                  <Tooltip
                    iconSize={_isMobile ? 16 : 24}
                    text={t("network_fee_tooltip", {
                      networkName: networks.find((n) => n.chainId === chainId)?.name,
                    })}
                  />
                  <div className="text-secondary-text text-12 md:text-14 flex items-center ">
                    {t("network_fee")}
                  </div>
                  <span className="mr-1 text-12 md:hidden">
                    {price && computedGasSpendingETH
                      ? `$${formatFloat(+computedGasSpendingETH * price)}`
                      : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2 max-sm:hidden">
                  <span className="text-secondary-text text-12 md:text-14 ">
                    {computedGasSpendingETH} {nativeCurrency.symbol}
                  </span>
                  <span className="block h-4 w-px bg-primary-border" />
                  <span className="text-tertiary-text mr-1 text-12 md:text-14 ">
                    {computedGasSpending} GWEI
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-between md:justify-end">
                <span className="mr-1 text-14 max-md:hidden">
                  {price && computedGasSpendingETH
                    ? `$${formatFloat(+computedGasSpendingETH * price)}`
                    : ""}
                </span>
                <span className="flex items-center justify-center px-2 text-12 md:text-14 h-5 rounded-20 font-500 text-tertiary-text border border-secondary-border">
                  {t(gasOptionTitle[gasPriceOption])}
                </span>
                <Button
                  size={ButtonSize.EXTRA_SMALL}
                  colorScheme={ButtonColor.LIGHT_GREEN}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpenedFee(true);
                  }}
                >
                  {t("edit")}
                </Button>
              </div>

              <div className="flex items-center gap-2 sm:hidden w-full mt-0.5">
                <span className="text-secondary-text text-12 md:text-14 ">
                  {computedGasSpendingETH} {nativeCurrency.symbol}
                </span>
                <span className="block h-4 w-px bg-primary-border" />
                <span className="text-tertiary-text mr-1 text-12 md:text-14 ">
                  {computedGasSpending} GWEI
                </span>
              </div>
            </>
          ) : (
            <span className="text-secondary-text text-14 flex items-center min-h-[26px]">
              Fetching best price...
            </span>
          )}
        </div>
      ) : (
        <div className="h-4 md:h-5" />
      )}

      {(isLoadingSwap || isPendingSwap || isPendingApprove || isLoadingApprove) && (
        <div className="flex justify-between px-5 py-3 rounded-2 bg-tertiary-bg mb-5">
          <div className="flex items-center gap-2 text-14">
            <Preloader size={20} />

            {isLoadingSwap && <span>{t("processing_swap")}</span>}
            {isPendingSwap && <span>{t("waiting_for_confirmation")}</span>}
            {isLoadingApprove && <span>{t("approving_in_progress")}</span>}
            {isPendingApprove && <span>{t("waiting_for_confirmation")}</span>}
          </div>

          <Button
            onClick={() => {
              if (tokenB && tokenA?.equals(tokenB)) {
                setConfirmConvertDialogOpen(true);
              } else {
                setConfirmSwapDialogOpen(true);
              }
            }}
            size={ButtonSize.EXTRA_SMALL}
          >
            {tokenB && tokenA?.equals(tokenB) ? "Review conversion" : t("review_swap")}
          </Button>
        </div>
      )}

      <OpenConfirmDialogButton
        isSufficientBalance={
          (tokenAStandard === Standard.ERC20 &&
            (tokenA0Balance && tokenA
              ? tokenA0Balance?.value >= parseUnits(typedValue, tokenA.decimals)
              : false)) ||
          (tokenAStandard === Standard.ERC223 &&
            (tokenA1Balance && tokenA
              ? tokenA1Balance?.value >= parseUnits(typedValue, tokenA.decimals)
              : false))
        }
        isTradeReady={Boolean(trade)}
        isTradeLoading={loading}
      />

      {trade && tokenA && tokenB && (
        <SwapDetails
          trade={trade}
          tokenA={tokenA}
          tokenB={tokenB}
          networkFee={computedGasSpendingETH}
          gasPrice={computedGasSpending}
          settingsStore={settingsStore}
        />
      )}

      <NetworkFeeConfigDialog
        isAdvanced={isAdvanced}
        setIsAdvanced={setIsAdvanced}
        estimatedGas={estimatedGas}
        setEstimatedGas={setEstimatedGas}
        gasPriceSettings={gasPriceSettings}
        gasPriceOption={gasPriceOption}
        customGasLimit={customGasLimit}
        setCustomGasLimit={setCustomGasLimit}
        setGasPriceOption={setGasPriceOption}
        setGasPriceSettings={setGasPriceSettings}
        isOpen={isOpenedFee}
        setIsOpen={setIsOpenedFee}
      />
      <PickTokenDialog
        handlePick={handlePick}
        isOpen={isOpenedTokenPick}
        setIsOpen={setIsOpenedTokenPick}
      />
      <SwapSettingsDialog />
      <ConfirmSwapDialog trade={trade} />
    </div>
  );
}
