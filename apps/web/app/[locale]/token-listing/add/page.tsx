"use client";

import { isZeroAddress } from "@ethereumjs/util";
import Alert from "@repo/ui/alert";
import ExternalTextLink from "@repo/ui/external-text-link";
import Preloader from "@repo/ui/preloader";
import clsx from "clsx";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import React, { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "react-responsive";
import { Address, formatEther, formatGwei, formatUnits, isAddress } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import ChooseAutoListingDialog from "@/app/[locale]/token-listing/add/components/ChooseAutoListingDialog";
import ChoosePaymentDialog from "@/app/[locale]/token-listing/add/components/ChoosePaymentDialog";
import ConfirmListingDialog from "@/app/[locale]/token-listing/add/components/ConfirmListingDialog";
import useAutoListing from "@/app/[locale]/token-listing/add/hooks/useAutoListing";
import { useAutoListingSearchParams } from "@/app/[locale]/token-listing/add/hooks/useAutolistingSearchParams";
import { useListTokenEstimatedGas } from "@/app/[locale]/token-listing/add/hooks/useListToken";
import useTokensToList from "@/app/[locale]/token-listing/add/hooks/useTokensToList";
import { useChooseAutoListingDialogStore } from "@/app/[locale]/token-listing/add/stores/useChooseAutoListingDialogStore";
import { useChoosePaymentDialogStore } from "@/app/[locale]/token-listing/add/stores/useChoosePaymentDialogStore";
import { useConfirmListTokenDialogStore } from "@/app/[locale]/token-listing/add/stores/useConfirmListTokenDialogOpened";
import {
  useListTokensGasLimitStore,
  useListTokensGasModeStore,
  useListTokensGasPriceStore,
} from "@/app/[locale]/token-listing/add/stores/useListTokensGasSettings";
import { useListTokensStore } from "@/app/[locale]/token-listing/add/stores/useListTokensStore";
import {
  ListTokenStatus,
  useListTokenStatusStore,
} from "@/app/[locale]/token-listing/add/stores/useListTokenStatusStore";
import { usePaymentTokenStore } from "@/app/[locale]/token-listing/add/stores/usePaymentTokenStore";
import { useTokenListingRecentTransactionsStore } from "@/app/[locale]/token-listing/add/stores/useTokenListingRecentTransactionsStore";
import Container from "@/components/atoms/Container";
import SelectButton from "@/components/atoms/SelectButton";
import Svg from "@/components/atoms/Svg";
import { HelperText, InputLabel } from "@/components/atoms/TextField";
import Badge, { BadgeVariant } from "@/components/badges/Badge";
import Button, { ButtonColor, ButtonSize } from "@/components/buttons/Button";
import IconButton, { IconButtonSize, IconButtonVariant } from "@/components/buttons/IconButton";
import RecentTransactions from "@/components/common/RecentTransactions";
import NetworkFeeConfigDialog from "@/components/dialogs/NetworkFeeConfigDialog";
import PickTokenDialog from "@/components/dialogs/PickTokenDialog";
import { useConnectWalletDialogStateStore } from "@/components/dialogs/stores/useConnectWalletStore";
import { useImportToken } from "@/components/manage-tokens/ImportToken";
import { ERC20_ABI } from "@/config/abis/erc20";
import { baseFeeMultipliers, SCALING_FACTOR } from "@/config/constants/baseFeeMultipliers";
import { formatFloat } from "@/functions/formatFloat";
import getExplorerLink, { ExplorerLinkType } from "@/functions/getExplorerLink";
import truncateMiddle from "@/functions/truncateMiddle";
import useCurrentChainId from "@/hooks/useCurrentChainId";
import { useIsErc777 } from "@/hooks/useErc777";
import { useNativeCurrency } from "@/hooks/useNativeCurrency";
import { PoolState, useStorePools } from "@/hooks/usePools";
import { useTokens } from "@/hooks/useTokenLists";
import { Link, useRouter } from "@/i18n/routing";
import { FeeAmount } from "@/sdk_bi/constants";
import { Currency } from "@/sdk_bi/entities/currency";
import { Standard } from "@/sdk_bi/standard";
import { useGlobalFees } from "@/shared/hooks/useGlobalFees";
import { GasFeeModel, GasOption } from "@/stores/factories/createGasPriceStore";

function OpenConfirmListTokenButton({
  isPoolExists,
  isBothTokensAlreadyInList,
  hasUnsupportedToken,
}: {
  isPoolExists: boolean;
  isBothTokensAlreadyInList: boolean;
  hasUnsupportedToken: boolean;
}) {
  const tWallet = useTranslations("Wallet");
  const t = useTranslations("Swap");
  const tListing = useTranslations("TokenListing");
  const { isConnected } = useAccount();

  const { tokenA, tokenB } = useListTokensStore();

  const { setIsOpen: setConfirmListTokenDialogOpened } = useConfirmListTokenDialogStore();
  const { setIsOpened: setWalletConnectOpened } = useConnectWalletDialogStateStore();
  const { status } = useListTokenStatusStore();

  if (!isConnected) {
    return (
      <Button
        size={ButtonSize.EXTRA_LARGE}
        tabletSize={ButtonSize.LARGE}
        onClick={() => setWalletConnectOpened(true)}
        fullWidth
      >
        {tWallet("connect_wallet")}
      </Button>
    );
  }

  if (status === ListTokenStatus.LOADING_LIST_TOKEN) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth isLoading>
        <span className="flex items-center gap-2">
          <span>{tListing("processing")}</span>
          <Preloader size={20} color="black" />
        </span>
      </Button>
    );
  }

  if (status === ListTokenStatus.LOADING_APPROVE) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth isLoading>
        <span className="flex items-center gap-2">
          <span>{t("approving_in_progress")}</span>
          <Preloader size={20} color="black" />
        </span>
      </Button>
    );
  }

  if (status === ListTokenStatus.PENDING_LIST_TOKEN || status === ListTokenStatus.PENDING_APPROVE) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth isLoading>
        <span className="flex items-center gap-2">
          <span>{t("waiting_for_confirmation")}</span>
          <Preloader size={20} color="black" />
        </span>
      </Button>
    );
  }

  if (hasUnsupportedToken) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth disabled>
        {tListing("token_not_supported")}
      </Button>
    );
  }

  if (!tokenA || !tokenB) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth disabled>
        {t("select_tokens")}
      </Button>
    );
  }

  if (!isPoolExists) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth disabled>
        {tListing("pool_missing")}
      </Button>
    );
  }

  if (isBothTokensAlreadyInList) {
    return (
      <Button size={ButtonSize.EXTRA_LARGE} tabletSize={ButtonSize.LARGE} fullWidth disabled>
        {tListing("both_listed")}
      </Button>
    );
  }

  return (
    <Button
      size={ButtonSize.EXTRA_LARGE}
      tabletSize={ButtonSize.LARGE}
      onClick={() => setConfirmListTokenDialogOpened(true)}
      fullWidth
    >
      {tListing("list_token")}
    </Button>
  );
}

const gasOptionTitle: Record<GasOption, any> = {
  [GasOption.CHEAP]: "cheap",
  [GasOption.FAST]: "fast",
  [GasOption.CUSTOM]: "custom",
};

const poolsFees = [FeeAmount.LOW, FeeAmount.MEDIUM, FeeAmount.HIGH];

export default function ListTokenPage() {
  useAutoListingSearchParams();
  const t = useTranslations("Swap");
  const tListing = useTranslations("TokenListing");
  const tManage = useTranslations("ManageTokens");
  const tGas = useTranslations("GasSettings");

  const params = useSearchParams();
  const router = useRouter();
  const chainId = useCurrentChainId();
  const { isOpened: showRecentTransactions, setIsOpened: setShowRecentTransactions } =
    useTokenListingRecentTransactionsStore();

  useListTokenEstimatedGas();

  const [isOpenedFee, setIsOpenedFee] = useState(false);

  const { autoListing, paymentToken } = useAutoListing();

  const { tokenA, tokenB, setTokenA, setTokenB } = useListTokensStore();

  const pools = useStorePools(
    poolsFees.map((fee) => ({ currencyA: tokenA, currencyB: tokenB, tier: fee })),
  );

  const pool = useMemo(() => {
    return pools.find((pool) => pool[0] !== PoolState.NOT_EXISTS && pool[0] !== PoolState.INVALID);
  }, [pools]);

  // const pool = usePool({ currencyA: tokenA, currencyB: tokenB, tier: FeeAmount.MEDIUM });

  const isPoolExists = useMemo(() => Boolean(pool), [pool]);

  const destination = useMemo(() => {
    const dest = params.get("dest");
    if (dest && decodeURIComponent(dest).startsWith("/token-listing/contracts")) {
      return decodeURIComponent(dest);
    } else {
      return `/token-listing/contracts`;
    }
  }, [params]);

  const [tokenAAddress, setTokenAAddress] = useState("");
  const [tokenBAddress, setTokenBAddress] = useState("");

  const tokens = useTokens();
  const { handleImport } = useImportToken();

  useEffect(() => {
    if (tokenA?.wrapped.address0 && !tokenAAddress) {
      setTokenAAddress(tokenA.wrapped.address0);
    }
  }, [tokenA, tokenAAddress]);

  useEffect(() => {
    if (tokenB?.wrapped.address0 && !tokenBAddress) {
      setTokenBAddress(tokenB.wrapped.address0);
    }
  }, [tokenB, tokenBAddress]);

  const [isPickTokenOpened, setPickTokenOpened] = useState(false);
  const [currentlyPicking, setCurrentlyPicking] = useState<"tokenA" | "tokenB">("tokenA");

  const { status } = useListTokenStatusStore();
  const {
    gasPriceOption,
    gasPriceSettings,
    setGasPriceOption,
    setGasPriceSettings,
    updateDefaultState,
  } = useListTokensGasPriceStore();

  useEffect(() => {
    updateDefaultState(chainId);
  }, [chainId, updateDefaultState]);

  const { estimatedGas, customGasLimit, setEstimatedGas, setCustomGasLimit } =
    useListTokensGasLimitStore();

  const { isAdvanced, setIsAdvanced } = useListTokensGasModeStore();

  const handleChange = useCallback(
    async (
      e: ChangeEvent<HTMLInputElement>,
      setToken: (token: Currency | undefined) => void,
      setTokenAddress: (value: string) => void,
    ) => {
      const value = e.target.value;
      setTokenAddress(value);

      if (isAddress(value) && chainId) {
        const lower = value.toLowerCase();
        const tokenToFind = tokens.find(
          (t) =>
            t.wrapped.address0.toLowerCase() === lower ||
            t.wrapped.address1.toLowerCase() === lower,
        );
        if (tokenToFind) {
          setToken(tokenToFind);
          return;
        }

        const imported = await handleImport(value as Address, chainId);
        setToken(imported);
      } else {
        setToken(undefined);
      }
    },
    [chainId, handleImport, tokens],
  );

  const { setPaymentToken } = usePaymentTokenStore();

  const { setIsOpen: setConfirmListTokenDialogOpened } = useConfirmListTokenDialogStore();

  useEffect(() => {
    if (!paymentToken && autoListing?.tokensToPay[0]) {
      setPaymentToken(autoListing?.tokensToPay[0]);
    }
  }, [autoListing?.tokensToPay, paymentToken, setPaymentToken]);

  const { setIsOpen: setPaymentDialogSelectOpened } = useChoosePaymentDialogStore();
  const { setIsOpen: setAutoListingSelectOpened } = useChooseAutoListingDialogStore();

  const tokensToList = useTokensToList();
  // The auto-listing contract charges its price once for every token of the pair that is not
  // listed yet, so show the total the user will actually pay.
  const listingPayment = paymentToken
    ? paymentToken.price * BigInt(Math.max(tokensToList.length, 1))
    : undefined;

  const { baseFee, gasPrice } = useGlobalFees();

  const formattedGasPrice = useMemo(() => {
    if (gasPriceOption !== GasOption.CUSTOM) {
      const multiplier = baseFeeMultipliers[chainId][gasPriceOption];
      switch (gasPriceSettings.model) {
        case GasFeeModel.EIP1559:
          if (baseFee) {
            return (baseFee * multiplier) / SCALING_FACTOR;
          }
          break;

        case GasFeeModel.LEGACY:
          if (gasPrice) {
            return (gasPrice * multiplier) / SCALING_FACTOR;
          }
      }
    } else {
      switch (gasPriceSettings.model) {
        case GasFeeModel.EIP1559:
          return gasPriceSettings.maxFeePerGas;
        case GasFeeModel.LEGACY:
          return gasPriceSettings.gasPrice;
      }
    }
  }, [baseFee, chainId, gasPrice, gasPriceOption, gasPriceSettings]);

  // A typed ERC-777 address is never imported, so check the typed address as well as a picked token.
  const { isErc777: isTokenAErc777 } = useIsErc777(tokenA?.wrapped.address0 || tokenAAddress);
  const { isErc777: isTokenBErc777 } = useIsErc777(tokenB?.wrapped.address0 || tokenBAddress);
  const erc777Address = isTokenAErc777
    ? tokenA?.wrapped.address0 || tokenAAddress
    : isTokenBErc777
      ? tokenB?.wrapped.address0 || tokenBAddress
      : undefined;
  // The token is not imported, so read its name and symbol to say which token is unsupported.
  const { data: erc777Meta } = useReadContracts({
    contracts: (["name", "symbol"] as const).map((functionName) => ({
      abi: ERC20_ABI,
      address: erc777Address as Address,
      functionName,
      chainId,
    })),
    query: { enabled: !!erc777Address && isAddress(erc777Address) },
  });
  const erc777Name = erc777Meta?.[0]?.result as string | undefined;
  const erc777TokenSymbol = erc777Meta?.[1]?.result as string | undefined;
  const erc777Symbol = erc777Address
    ? erc777Name && erc777TokenSymbol
      ? `${erc777Name} (${erc777TokenSymbol})`
      : erc777TokenSymbol || truncateMiddle(erc777Address)
    : undefined;

  const firstFieldError = useMemo(() => {
    if (tokenAAddress && !isAddress(tokenAAddress)) {
      return tListing("invalid_address");
    }
    if (isTokenAErc777) {
      return tListing("erc777_field_error");
    }
    return;
  }, [isTokenAErc777, tListing, tokenAAddress]);

  const sameTokensSelected = useMemo(() => {
    return Boolean(tokenAAddress && tokenAAddress === tokenBAddress);
  }, [tokenAAddress, tokenBAddress]);

  const secondFieldError = useMemo(() => {
    if (tokenBAddress && !isAddress(tokenBAddress)) {
      return tListing("invalid_address");
    }

    if (sameTokensSelected) {
      return tListing("tokens_must_differ");
    }

    if (isTokenBErc777) {
      return tListing("erc777_field_error");
    }
  }, [isTokenBErc777, sameTokensSelected, tListing, tokenBAddress]);

  const isMobile = useMediaQuery({ query: "(max-width: 519px)" });
  const nativeCurrency = useNativeCurrency();

  return (
    <>
      <Container>
        <div
          className={clsx(
            "grid py-4 lg:py-[40px] grid-cols-1 mx-auto",
            showRecentTransactions
              ? "xl:grid-cols-[580px_600px] xl:max-w-[1200px] gap-4 xl:grid-areas-[left_right] grid-areas-[right,left]"
              : "xl:grid-cols-[600px] xl:max-w-[600px] grid-areas-[right]",
          )}
        >
          <div className="grid-in-[left] flex justify-center">
            <div className="w-full sm:max-w-[600px] xl:max-w-full">
              <RecentTransactions
                showRecentTransactions={showRecentTransactions}
                handleClose={() => setShowRecentTransactions(false)}
                store={useTokenListingRecentTransactionsStore}
              />
            </div>
          </div>

          <div className="flex justify-center grid-in-[right]">
            <div className="flex flex-col gap-5 w-full sm:max-w-[600px] xl:max-w-full">
              <div className="pt-2.5 card-spacing surface rounded-5">
                <div className="flex justify-between items-center mb-2.5 -mx-3">
                  <IconButton
                    onClick={() => router.push(destination)}
                    iconName="back"
                    variant={IconButtonVariant.BACK}
                    buttonSize={IconButtonSize.LARGE}
                  />
                  <h3 className="font-bold text-20">{tListing("list_tokens")}</h3>
                  <IconButton
                    buttonSize={IconButtonSize.LARGE}
                    active={showRecentTransactions}
                    iconName="recent-transactions"
                    onClick={() => setShowRecentTransactions(!showRecentTransactions)}
                  />
                </div>
                <p className="text-secondary-text text-14 mb-4">{tListing("add_intro")}</p>

                <div className="flex flex-col gap-4 pb-5">
                  <div>
                    <InputLabel label={tListing("token_address")} />
                    <div className="bg-secondary-bg relative flex items-center rounded-3 pr-[3px]">
                      <input
                        className="bg-transparent peer duration-200 focus:outline-0 h-12 pl-5 placeholder:text-tertiary-text text-16 w-full rounded-2 pr-2"
                        value={tokenAAddress}
                        onChange={(e) => {
                          handleChange(e, setTokenA, setTokenAAddress);
                        }}
                        type="text"
                        placeholder={tListing("token_address")}
                      />
                      <button
                        className="flex-shrink-0 p-2 flex items-center border border-transparent gap-1 text-primary-text bg-primary-bg rounded-2 hocus:bg-green-bg hocus:border-green duration-200 hocus:shadow hocus:shadow-green/60"
                        onClick={() => {
                          setCurrentlyPicking("tokenA");
                          setPickTokenOpened(true);
                        }}
                      >
                        {tokenA && (
                          <Image
                            className="mr-1"
                            width={24}
                            height={24}
                            src={tokenA?.logoURI || "/images/tokens/placeholder.svg"}
                            alt=""
                          />
                        )}
                        {tokenA?.symbol || (
                          <span className="text-tertiary-text">{tManage("select_token")}</span>
                        )}
                        <Svg className="text-secondary-text" iconName="small-expand-arrow" />
                      </button>
                      <div
                        className={clsx(
                          "duration-200 rounded-2 pointer-events-none absolute w-full h-full border peer-hocus:shadow top-0 left-0",
                          firstFieldError
                            ? "border-red-light peer-hocus:border-red-light peer-hocus:shadow-red/60"
                            : "border-transparent peer-hocus:border-green peer-hocus:shadow-green/60",
                        )}
                      />
                    </div>
                    <HelperText
                      error={firstFieldError}
                      helperText={tListing("token_address_helper")}
                    />
                  </div>

                  <div>
                    <InputLabel label={tListing("paired_address")} />
                    <div className="bg-secondary-bg relative flex items-center rounded-3 pr-[3px]">
                      <input
                        className="bg-transparent peer duration-200 focus:outline-0 h-12 pl-5 placeholder:text-tertiary-text text-16 w-full rounded-2 pr-2"
                        value={tokenBAddress}
                        onChange={(e) => {
                          handleChange(e, setTokenB, setTokenBAddress);
                        }}
                        type="text"
                        placeholder={tListing("token_address")}
                      />
                      <button
                        className="flex-shrink-0 p-2 flex items-center border border-transparent gap-1 text-primary-text bg-primary-bg rounded-2 hocus:bg-green-bg hocus:border-green duration-200 hocus:shadow hocus:shadow-green/60"
                        onClick={() => {
                          setCurrentlyPicking("tokenB");
                          setPickTokenOpened(true);
                        }}
                      >
                        {tokenB && (
                          <Image
                            className="mr-1"
                            width={24}
                            height={24}
                            src={tokenB?.logoURI || "/images/tokens/placeholder.svg"}
                            alt=""
                          />
                        )}
                        {tokenB?.symbol || (
                          <span className="text-tertiary-text">{tManage("select_token")}</span>
                        )}
                        <Svg className="text-secondary-text" iconName="small-expand-arrow" />
                      </button>
                      <div
                        className={clsx(
                          "duration-200 rounded-2 pointer-events-none absolute w-full h-full border peer-hocus:shadow top-0 left-0",
                          secondFieldError
                            ? "border-red-light peer-hocus:border-red-light peer-hocus:shadow-red/60"
                            : "border-transparent peer-hocus:border-green peer-hocus:shadow-green/60",
                        )}
                      />
                    </div>
                    <HelperText error={secondFieldError} helperText={tListing("paired_helper")} />
                  </div>

                  {erc777Symbol && (
                    <Alert text={tListing("erc777_alert", { symbol: erc777Symbol })} type="error" />
                  )}

                  {!erc777Symbol && !isPoolExists && !sameTokensSelected && tokenA && tokenB && (
                    <Alert
                      text={tListing.rich("no_pool", {
                        link: (chunks) => (
                          <Link
                            href={`/add?tokenA=${tokenA.wrapped.address0}&tokenB=${tokenB.wrapped.address0}`}
                            className="text-green underline hocus:text-green-hover duration-200"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                      type="warning"
                    />
                  )}

                  {!erc777Symbol && !isPoolExists && (!tokenA || !tokenB || sameTokensSelected) && (
                    <Alert text={tListing("pool_required")} type="info" />
                  )}

                  <div>
                    <InputLabel label={tListing("list_in_contract")} />
                    <SelectButton
                      fullWidth
                      size="medium"
                      className="bg-tertiary-bg justify-between pl-5"
                      onClick={() => setAutoListingSelectOpened(true)}
                    >
                      {autoListing?.name || (
                        <span className="text-tertiary-text">{tListing("select_token_list")}</span>
                      )}
                    </SelectButton>
                    <HelperText
                      helperText={
                        !autoListing ? (
                          tListing("choose_contract")
                        ) : (
                          <span className="flex items-center gap-1">
                            {tListing("contract_address_label")}{" "}
                            <ExternalTextLink
                              className="text-12"
                              arrowSize={16}
                              text={truncateMiddle(autoListing.id)}
                              href={getExplorerLink(
                                ExplorerLinkType.ADDRESS,
                                autoListing.id,
                                chainId,
                              )}
                            />
                          </span>
                        )
                      }
                    />
                  </div>

                  {!!autoListing?.tokensToPay.length && (
                    <>
                      {autoListing?.tokensToPay.length > 1 ? (
                        <div>
                          <InputLabel
                            label={tListing("payment")}
                            tooltipText={tListing("payment_tooltip")}
                          />
                          <div className="h-12 rounded-2 border w-full border-secondary-border text-primary-text flex justify-between items-center pl-5 pr-1">
                            {paymentToken
                              ? formatUnits(
                                  listingPayment!,
                                  paymentToken.token.decimals ?? 18,
                                ).slice(0, 7) === "0.00000"
                                ? truncateMiddle(
                                    formatUnits(listingPayment!, paymentToken.token.decimals ?? 18),
                                    {
                                      charsFromStart: 3,
                                      charsFromEnd: 2,
                                    },
                                  )
                                : formatFloat(
                                    formatUnits(
                                      listingPayment!,
                                      paymentToken.token.decimals != null
                                        ? paymentToken.token.decimals
                                        : 18,
                                    ),
                                  )
                              : 1}

                            <SelectButton
                              onClick={() => setPaymentDialogSelectOpened(true)}
                              className="flex items-center gap-2 bg-tertiary-bg"
                            >
                              <Image
                                src="/images/tokens/placeholder.svg"
                                width={24}
                                height={24}
                                alt=""
                              />
                              {paymentToken?.token && isZeroAddress(paymentToken.token.address)
                                ? nativeCurrency.symbol
                                : paymentToken?.token.symbol}
                              <Badge
                                variant={BadgeVariant.COLORED}
                                color="green"
                                text={
                                  paymentToken?.token && isZeroAddress(paymentToken.token.address)
                                    ? "Native"
                                    : "ERC-20"
                                }
                              />
                            </SelectButton>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <InputLabel
                            label={tListing("payment")}
                            tooltipText={tListing("payment_tooltip")}
                          />
                          {paymentToken && (
                            <div className="h-12 rounded-2 border w-full border-secondary-border text-primary-text flex justify-between items-center px-5">
                              {formatUnits(listingPayment!, paymentToken.token.decimals ?? 18)}
                              <span className="flex items-center gap-2">
                                <Image
                                  src="/images/tokens/placeholder.svg"
                                  width={24}
                                  height={24}
                                  alt=""
                                />

                                {isZeroAddress(paymentToken.token.address)
                                  ? nativeCurrency.symbol
                                  : paymentToken.token.symbol}
                                {!isZeroAddress(paymentToken.token.address) ? (
                                  <Badge
                                    variant={BadgeVariant.STANDARD}
                                    standard={Standard.ERC20}
                                  />
                                ) : (
                                  <Badge
                                    variant={BadgeVariant.COLORED}
                                    color="green"
                                    text="Native"
                                  />
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="bg-tertiary-bg px-5 py-2 mb-5 flex justify-between items-center rounded-3 flex-col xs:flex-row">
                  <div className="text-12 xs:text-14 flex items-center gap-8 justify-between xs:justify-start max-xs:w-full">
                    <p className="flex flex-col text-tertiary-text">
                      <span>{tGas("gas_price")}:</span>
                      <span> {formatFloat(formatGwei(formattedGasPrice || BigInt(0)))} GWEI</span>
                    </p>

                    <p className="flex flex-col text-tertiary-text">
                      <span>{tGas("gas_limit")}:</span>
                      <span>
                        {customGasLimit ? customGasLimit.toString() : estimatedGas?.toString()}
                      </span>
                    </p>
                    <p className="flex flex-col">
                      <span className="text-tertiary-text">{tGas("network_fee")}:</span>
                      <span>
                        {formatFloat(
                          formatEther(
                            (formattedGasPrice || BigInt(0)) *
                              (customGasLimit ? customGasLimit : estimatedGas),
                            "wei",
                          ),
                        )}{" "}
                        ETH
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-[auto_1fr] xs:flex xs:items-center gap-2 w-full xs:w-auto mt-2 xs:mt-0">
                    <span className="flex items-center justify-center px-2 text-14 rounded-20 font-500 text-secondary-text border border-secondary-border max-xs:h-8">
                      {t(gasOptionTitle[gasPriceOption])}
                    </span>
                    <Button
                      colorScheme={ButtonColor.LIGHT_GREEN}
                      size={isMobile ? ButtonSize.SMALL : ButtonSize.EXTRA_SMALL}
                      onClick={() => setIsOpenedFee(true)}
                      fullWidth={isMobile}
                      className="rounded-5"
                    >
                      {t("edit")}
                    </Button>
                  </div>
                </div>

                {[
                  ListTokenStatus.PENDING_LIST_TOKEN,
                  ListTokenStatus.PENDING_APPROVE,
                  ListTokenStatus.LOADING_LIST_TOKEN,
                  ListTokenStatus.LOADING_APPROVE,
                ].includes(status) && (
                  <div className="flex justify-between px-5 py-3 rounded-2 bg-tertiary-bg mb-5">
                    <div className="flex items-center gap-2 text-14">
                      <Preloader size={20} />

                      {status === ListTokenStatus.LOADING_LIST_TOKEN && (
                        <span>{tListing("processing_list_token")}</span>
                      )}
                      {status === ListTokenStatus.PENDING_LIST_TOKEN ||
                        (status === ListTokenStatus.PENDING_APPROVE && (
                          <span>{t("waiting_for_confirmation")}</span>
                        ))}
                      {status === ListTokenStatus.LOADING_APPROVE && (
                        <span>{t("approving_in_progress")}</span>
                      )}
                    </div>

                    <Button
                      onClick={() => {
                        setConfirmListTokenDialogOpened(true);
                      }}
                      size={ButtonSize.EXTRA_SMALL}
                    >
                      {tListing("review_details")}
                    </Button>
                  </div>
                )}

                <OpenConfirmListTokenButton
                  isPoolExists={isPoolExists}
                  isBothTokensAlreadyInList={!tokensToList.length}
                  hasUnsupportedToken={Boolean(erc777Symbol)}
                />
              </div>
            </div>
          </div>
        </div>

        <ChooseAutoListingDialog />
        <ChoosePaymentDialog />

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
          isOpen={isPickTokenOpened}
          setIsOpen={setPickTokenOpened}
          handlePick={(token) => {
            if (currentlyPicking === "tokenA") {
              setTokenA(token);
              setTokenAAddress(token.wrapped.address0);
            }
            if (currentlyPicking === "tokenB") {
              setTokenB(token);
              setTokenBAddress(token.wrapped.address0);
            }

            setPickTokenOpened(false);
          }}
        />

        <ConfirmListingDialog />
      </Container>
    </>
  );
}
