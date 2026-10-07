"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, formatUnits, Hash, zeroAddress } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWalletClient,
} from "wagmi";

import { isStakingToken } from "@/app/[locale]/revenue/lib/stakingToken";
import { ERC20_ABI } from "@/config/abis/erc20";
import { FEE_COLLECTOR_ABI } from "@/config/abis/feeCollector";
import { REVENUE_ABI } from "@/config/abis/revenue";
import { getFeeCollectorAddress, getRevenueAddress } from "@/config/modules";
import { getTransactionWithRetries } from "@/functions/getTransactionWithRetries";
import useCurrentChainId from "@/hooks/useCurrentChainId";
import { Token } from "@/sdk_bi/entities/token";
import { Standard } from "@/sdk_bi/standard";
import {
  RecentTransactionTitleTemplate,
  stringifyObject,
  useRecentTransactionsStore,
} from "@/stores/useRecentTransactionsStore";

export enum TokenType {
  ERC20 = "ERC-20",
  ERC223 = "ERC-223",
}

export interface ClaimableReward {
  token: Token;
  amount: bigint;
  amountFormatted: string;
  amountUSD?: string;
  // claim() pays each token version only from the contract's balance of that version.
  amountERC20: bigint;
  amountERC223: bigint;
  heldERC20: bigint;
  heldERC223: bigint;
  claimAddresses: Address[];
}

type CustomGasSettings =
  | {
      maxPriorityFeePerGas: bigint | undefined;
      maxFeePerGas: bigint | undefined;
      gasPrice?: undefined;
    }
  | {
      gasPrice: bigint | undefined;
      maxPriorityFeePerGas?: undefined;
      maxFeePerGas?: undefined;
    }
  | undefined;

export interface RevenueContractConfig {
  contractAddress?: Address;
  searchAddress?: Address;
}

const STAKING_TOKEN_LOGO = "/images/logo-short.svg";

export default function useRevenueContract({
  contractAddress,
  searchAddress,
}: RevenueContractConfig = {}) {
  const { address: connectedAddress, chainId: walletChainId } = useAccount();
  const targetAddress = searchAddress || connectedAddress;
  const chainId = useCurrentChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { addRecentTransaction } = useRecentTransactionsStore();

  const revenueAddress = contractAddress ?? getRevenueAddress(chainId);

  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // Check if user is on the correct network
  const isCorrectNetwork = walletChainId === chainId;

  // Candidate reward tokens for this chain, supplied by the page from its token lists.
  const [rewardTokens, setRewardTokens] = useState<Token[]>([]);

  // RevenueV2 global configuration. The staking token pair is read from the
  // contract instead of being hardcoded, so every chain uses its own deployment.
  const {
    data: revenueConfig,
    refetch: refetchRevenueConfig,
    isLoading: isLoadingRevenueConfig,
  } = useReadContracts({
    contracts: revenueAddress
      ? [
          { abi: REVENUE_ABI, address: revenueAddress, functionName: "staking_token_erc20" },
          { abi: REVENUE_ABI, address: revenueAddress, functionName: "staking_token_erc223" },
          { abi: REVENUE_ABI, address: revenueAddress, functionName: "claim_delay" },
          { abi: REVENUE_ABI, address: revenueAddress, functionName: "reward_duration" },
          { abi: REVENUE_ABI, address: revenueAddress, functionName: "total_staked" },
        ].map((contract) => ({ ...contract, chainId }))
      : [],
    query: {
      enabled: Boolean(revenueAddress),
    },
  });

  const stakingTokenERC20 = (revenueConfig?.[0]?.result as Address | undefined) ?? zeroAddress;
  const stakingTokenERC223 = (revenueConfig?.[1]?.result as Address | undefined) ?? zeroAddress;
  const claimDelay = revenueConfig?.[2]?.result as bigint | undefined;
  // How long each batch of protocol fees is streamed to stakers.
  const rewardDuration = (revenueConfig?.[3]?.result as bigint | undefined) ?? 0n;
  const totalStaked = (revenueConfig?.[4]?.result as bigint | undefined) ?? 0n;

  const hasStakingToken = stakingTokenERC20 !== zeroAddress;

  const {
    data: userStaked,
    refetch: refetchUserStaked,
    isLoading: isLoadingUserStaked,
  } = useReadContract({
    abi: REVENUE_ABI,
    address: revenueAddress,
    functionName: "staked",
    args: targetAddress ? [targetAddress] : undefined,
    chainId: chainId,
    query: {
      enabled: Boolean(targetAddress && revenueAddress),
    },
  });

  const {
    data: userStakingTimestamp,
    refetch: refetchUserStakingTimestamp,
    isLoading: isLoadingUserStakingTimestamp,
  } = useReadContract({
    abi: REVENUE_ABI,
    address: revenueAddress,
    functionName: "staking_timestamp",
    args: targetAddress ? [targetAddress] : undefined,
    chainId: chainId,
    query: {
      enabled: Boolean(targetAddress && revenueAddress),
    },
  });

  // RevenueV2 returns each stake in the version it was staked in.
  const { data: userStakedByVersion, refetch: refetchUserStakedByVersion } = useReadContracts({
    contracts:
      revenueAddress && targetAddress && stakingTokenERC20 !== zeroAddress
        ? [stakingTokenERC20, stakingTokenERC223].map((version) => ({
            abi: REVENUE_ABI,
            address: revenueAddress,
            functionName: "staked_by_version" as const,
            args: [targetAddress, version],
            chainId,
          }))
        : [],
    query: {
      enabled: Boolean(revenueAddress && targetAddress) && stakingTokenERC20 !== zeroAddress,
    },
  });
  const userStakedErc20 = userStakedByVersion?.[0]?.result as bigint | undefined;
  const userStakedErc223 = userStakedByVersion?.[1]?.result as bigint | undefined;

  // Set by the contract on every stake; the delay is the one in force at that moment.
  const { data: userUnlockTime, refetch: refetchUserUnlockTime } = useReadContract({
    abi: REVENUE_ABI,
    address: revenueAddress,
    functionName: "unlock_time",
    args: targetAddress ? [targetAddress] : undefined,
    chainId: chainId,
    query: {
      enabled: Boolean(targetAddress && revenueAddress),
    },
  });

  // ERC-223 tokens sent directly to the contract land in `erc223deposit` until they
  // are staked. Surfaced so an unstaked deposit can be recovered.
  const { data: erc223Deposit, refetch: refetchErc223Deposit } = useReadContract({
    abi: REVENUE_ABI,
    address: revenueAddress,
    functionName: "erc223deposit",
    args:
      targetAddress && stakingTokenERC223 !== zeroAddress
        ? [targetAddress, stakingTokenERC223]
        : undefined,
    chainId: chainId,
    query: {
      enabled: Boolean(targetAddress && revenueAddress && stakingTokenERC223 !== zeroAddress),
    },
  });

  const { data: stakingTokenData, refetch: refetchStakingTokenData } = useReadContracts({
    contracts: hasStakingToken
      ? [
          {
            abi: ERC20_ABI,
            address: stakingTokenERC20,
            functionName: "totalSupply",
            chainId,
          },
          {
            abi: ERC20_ABI,
            address: stakingTokenERC223,
            functionName: "symbol",
            chainId,
          },
          {
            abi: ERC20_ABI,
            address: stakingTokenERC20,
            functionName: "balanceOf",
            args: [targetAddress ?? zeroAddress],
            chainId,
          },
          {
            abi: ERC20_ABI,
            address: stakingTokenERC223,
            functionName: "balanceOf",
            args: [targetAddress ?? zeroAddress],
            chainId,
          },
          // withdraw() pays the requested version from the contract's own balance of it.
          {
            abi: ERC20_ABI,
            address: stakingTokenERC20,
            functionName: "balanceOf",
            args: [revenueAddress ?? zeroAddress],
            chainId,
          },
          {
            abi: ERC20_ABI,
            address: stakingTokenERC223,
            functionName: "balanceOf",
            args: [revenueAddress ?? zeroAddress],
            chainId,
          },
        ]
      : [],
    query: {
      enabled: hasStakingToken,
    },
  });

  const redTotalSupply = stakingTokenData?.[0]?.result as bigint | undefined;
  const stakingTokenSymbol = (stakingTokenData?.[1]?.result as string | undefined) ?? "D223";
  const redErc20Balance = stakingTokenData?.[2]?.result as bigint | undefined;
  const redErc223Balance = stakingTokenData?.[3]?.result as bigint | undefined;
  const contractStakeErc20Balance = stakingTokenData?.[4]?.result as bigint | undefined;
  const contractStakeErc223Balance = stakingTokenData?.[5]?.result as bigint | undefined;

  // Reward balances held by the Revenue contract, ERC-20 and ERC-223 version of each token.
  const { data: tokenBalances, refetch: refetchTokenBalances } = useReadContracts({
    contracts: revenueAddress
      ? rewardTokens.flatMap((token) =>
          [token.address0, token.address1].map((address) => ({
            abi: ERC20_ABI,
            address,
            functionName: "balanceOf" as const,
            args: [revenueAddress],
            chainId: chainId,
          })),
        )
      : [],
    query: {
      enabled: Boolean(revenueAddress) && rewardTokens.length > 0,
    },
  });

  // What the contract says the user has earned in each version of each reward token. Only tokens the
  // contract lists as rewards ever accrue; everything else reads as zero, so it is never offered for claim.
  const { data: earnedAmounts, refetch: refetchEarned } = useReadContracts({
    contracts:
      revenueAddress && targetAddress
        ? rewardTokens.flatMap((token) =>
            [token.address0, token.address1].map((address) => ({
              abi: REVENUE_ABI,
              address: revenueAddress,
              functionName: "earned" as const,
              args: [targetAddress, address],
              chainId: chainId,
            })),
          )
        : [],
    query: {
      enabled: Boolean(revenueAddress && targetAddress) && rewardTokens.length > 0,
      // Earnings grow every second while a reward stream runs.
      refetchInterval: 15_000,
    },
  });

  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const canUnstake = useMemo(() => {
    // Still loading. An unlock time of 0 (never staked) or in the past means no freeze.
    if (typeof userUnlockTime !== "bigint") {
      return { canUnstake: false, timeRemaining: 0, unlockTime: 0 };
    }

    const unlockTime = Number(userUnlockTime);
    const canUnstakeNow = currentTime >= unlockTime;
    const timeRemaining = Math.max(0, unlockTime - currentTime);

    return { canUnstake: canUnstakeNow, timeRemaining, unlockTime };
  }, [userUnlockTime, currentTime]);

  const hasStaked = useMemo(() => {
    return Boolean(userStaked && typeof userStaked === "bigint" && userStaked > 0n);
  }, [userStaked]);

  const formatCountdown = useCallback((seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d : ${hours}h : ${minutes}m : ${secs}s`;
    } else if (hours > 0) {
      return `${hours}h : ${minutes}m : ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m : ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }, []);

  const unstakeCountdown = useMemo(() => {
    if (!hasStaked || typeof userUnlockTime !== "bigint") return null;
    const remaining = Math.max(0, Number(userUnlockTime) - currentTime);
    if (remaining <= 0) return null;
    return formatCountdown(remaining);
  }, [hasStaked, userUnlockTime, currentTime, formatCountdown]);

  // RevenueV2 tracks each staker's earnings on chain; earned() is exactly what claim() pays, give or
  // take the seconds between this read and the claim landing.
  const claimableRewards = useMemo<ClaimableReward[]>(() => {
    if (!tokenBalances || !earnedAmounts) {
      return [];
    }

    const estimate = (slot: number) => {
      const held = (tokenBalances[slot]?.result as bigint | undefined) ?? 0n;
      const dividends = (earnedAmounts[slot]?.result as bigint | undefined) ?? 0n;
      return { held, dividends };
    };

    return rewardTokens.map((token, index) => {
      if (
        isStakingToken(token.address0, stakingTokenERC20, stakingTokenERC223) ||
        isStakingToken(token.address1, stakingTokenERC20, stakingTokenERC223)
      ) {
        return {
          token,
          amount: 0n,
          amountFormatted: "0",
          amountERC20: 0n,
          amountERC223: 0n,
          heldERC20: 0n,
          heldERC223: 0n,
          claimAddresses: [],
        };
      }

      const erc20 = estimate(index * 2);
      const erc223 = estimate(index * 2 + 1);
      const amount = erc20.dividends + erc223.dividends;
      const claimAddresses: Address[] = [];
      if (erc20.dividends > 0n) claimAddresses.push(token.address0);
      if (erc223.dividends > 0n) claimAddresses.push(token.address1);

      return {
        token,
        amount,
        amountFormatted: formatUnits(amount, token.decimals),
        amountERC20: erc20.dividends,
        amountERC223: erc223.dividends,
        heldERC20: erc20.held,
        heldERC223: erc223.held,
        claimAddresses,
      };
    });
  }, [
    tokenBalances,
    earnedAmounts,
    rewardTokens,
    stakingTokenERC20,
    stakingTokenERC223,
  ]);

  // Share of all staked D223, which is what claim() splits rewards by.
  const stakingPercentage = useMemo(() => {
    if (typeof userStaked !== "bigint" || totalStaked === 0n) {
      return 0;
    }
    return Number((userStaked * 10000n) / totalStaked) / 100;
  }, [userStaked, totalStaked]);

  const refetchUserData = useCallback(() => {
    refetchRevenueConfig();
    refetchUserStaked();
    refetchUserStakingTimestamp();
    refetchUserUnlockTime();
    refetchUserStakedByVersion();
    refetchErc223Deposit();
    refetchStakingTokenData();
    refetchTokenBalances();
    refetchEarned();
  }, [
    refetchRevenueConfig,
    refetchUserStaked,
    refetchUserStakingTimestamp,
    refetchUserUnlockTime,
    refetchUserStakedByVersion,
    refetchErc223Deposit,
    refetchStakingTokenData,
    refetchTokenBalances,
    refetchEarned,
  ]);

  const executeTransaction = useCallback(
    async ({
      functionName,
      args,
      abi,
      address: targetContract,
      customGasLimit,
      gasSettings,
      onHashReceive,
      onReceiptReceive,
      transactionTitle,
    }: {
      functionName: string;
      args?: any[];
      abi?: any;
      address?: Address;
      customGasLimit?: bigint;
      gasSettings?: CustomGasSettings;
      onHashReceive?: (hash: Hash) => void;
      onReceiptReceive?: (receipt: any) => void;
      transactionTitle?: any;
    }) => {
      if (!publicClient || !walletClient || !connectedAddress) {
        throw new Error("Wallet not connected");
      }

      const contract = targetContract || revenueAddress;

      if (!contract) {
        throw new Error("Revenue is not deployed on this network");
      }

      setIsTransactionPending(true);

      const params = {
        abi: abi || REVENUE_ABI,
        address: contract,
        functionName,
        args: args || [],
      };

      try {
        const estimatedGas = await publicClient.estimateContractGas({
          account: connectedAddress,
          ...params,
        } as any);

        const gasToUse = customGasLimit || estimatedGas + BigInt(30000);

        let request;
        try {
          const { request: simulatedRequest } = await publicClient.simulateContract({
            ...params,
            account: connectedAddress,
            ...gasSettings,
            gas: gasToUse,
          } as any);
          request = simulatedRequest;
        } catch (e) {
          request = {
            ...params,
            ...gasSettings,
            gas: gasToUse,
            account: undefined,
          } as any;
        }

        const hash = await walletClient.writeContract({
          ...request,
          account: undefined,
        });

        onHashReceive?.(hash);

        if (transactionTitle && connectedAddress) {
          const transaction = await getTransactionWithRetries({
            hash,
            publicClient,
          });

          if (transaction) {
            const nonce = transaction.nonce;
            addRecentTransaction(
              {
                hash,
                nonce,
                chainId: publicClient.chain?.id || chainId,
                gas: {
                  ...stringifyObject({ ...gasSettings }),
                  gas: gasToUse.toString(),
                },
                params: {
                  ...stringifyObject(params),
                },
                title: transactionTitle,
              },
              connectedAddress,
            );
          }
        }

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        onReceiptReceive?.(receipt);

        // A mined but reverted transaction is a failure, not a success.
        if (receipt.status === "reverted") {
          throw new Error(`Transaction reverted: ${receipt.transactionHash}`);
        }

        setIsTransactionPending(false);
        return { hash, receipt };
      } catch (error: any) {
        console.error("Transaction execution error:", error);
        setIsTransactionPending(false);
        throw error;
      }
    },
    [publicClient, walletClient, connectedAddress, chainId, addRecentTransaction, revenueAddress],
  );

  const approve = useCallback(
    async (
      amount: bigint,
      gasSettings?: CustomGasSettings,
      customGasLimit?: bigint,
      onHashReceive?: (hash: Hash) => void,
    ) => {
      if (!revenueAddress || !hasStakingToken) {
        throw new Error("Revenue is not deployed on this network");
      }

      return executeTransaction({
        functionName: "approve",
        args: [revenueAddress, amount],
        abi: ERC20_ABI,
        address: stakingTokenERC20,
        gasSettings,
        customGasLimit,
        onHashReceive,
        transactionTitle: {
          template: RecentTransactionTitleTemplate.APPROVE,
          symbol: stakingTokenSymbol,
          amount: formatUnits(amount, 18),
          logoURI: STAKING_TOKEN_LOGO,
        },
      });
    },
    [executeTransaction, revenueAddress, hasStakingToken, stakingTokenERC20, stakingTokenSymbol],
  );

  const stake = useCallback(
    async (
      amount: bigint,
      gasSettings?: CustomGasSettings,
      customGasLimit?: bigint,
      onHashReceive?: (hash: Hash) => void,
    ) => {
      if (!hasStakingToken) {
        throw new Error("Revenue is not deployed on this network");
      }

      return executeTransaction({
        functionName: "stake",
        args: [stakingTokenERC20, amount],
        gasSettings,
        customGasLimit,
        onHashReceive,
        transactionTitle: {
          template: RecentTransactionTitleTemplate.DEPOSIT,
          symbol: stakingTokenSymbol,
          amount: formatUnits(amount, 18),
          logoURI: STAKING_TOKEN_LOGO,
        },
      });
    },
    [executeTransaction, hasStakingToken, stakingTokenERC20, stakingTokenSymbol],
  );

  // ERC-223 staking is two steps: the transfer credits `erc223deposit` through
  // tokenReceived, then stake() consumes that deposit instead of pulling an allowance.
  const stakeERC223 = useCallback(
    async (
      amount: bigint,
      gasSettings?: CustomGasSettings,
      customGasLimit?: bigint,
      onHashReceive?: (hash: Hash) => void,
    ) => {
      if (!revenueAddress || stakingTokenERC223 === zeroAddress) {
        throw new Error("Revenue is not deployed on this network");
      }
      if (!publicClient || !connectedAddress) {
        throw new Error("Wallet not connected");
      }

      // An earlier transfer that was never staked still counts toward this stake.
      const deposited = await publicClient.readContract({
        abi: REVENUE_ABI,
        address: revenueAddress,
        functionName: "erc223deposit",
        args: [connectedAddress, stakingTokenERC223],
      });
      const toTransfer = amount > deposited ? amount - deposited : 0n;

      if (toTransfer > 0n) {
        await executeTransaction({
          functionName: "transfer",
          args: [revenueAddress, toTransfer],
          abi: ERC20_ABI,
          address: stakingTokenERC223,
          gasSettings,
          customGasLimit,
          transactionTitle: {
            template: RecentTransactionTitleTemplate.DEPOSIT,
            symbol: stakingTokenSymbol,
            amount: formatUnits(toTransfer, 18),
            logoURI: STAKING_TOKEN_LOGO,
          },
        });
      }

      return executeTransaction({
        functionName: "stake",
        args: [stakingTokenERC223, amount],
        gasSettings,
        onHashReceive,
        transactionTitle: {
          template: RecentTransactionTitleTemplate.DEPOSIT,
          symbol: stakingTokenSymbol,
          amount: formatUnits(amount, 18),
          logoURI: STAKING_TOKEN_LOGO,
        },
      });
    },
    [
      executeTransaction,
      revenueAddress,
      stakingTokenERC223,
      stakingTokenSymbol,
      publicClient,
      connectedAddress,
    ],
  );

  const unstake = useCallback(
    async (
      tokenAddress: Address,
      amount: bigint,
      gasSettings?: CustomGasSettings,
      customGasLimit?: bigint,
      standard: Standard = Standard.ERC20,
      onHashReceive?: (hash: Hash) => void,
    ) => {
      return executeTransaction({
        functionName: "withdraw",
        args: [tokenAddress, amount],
        gasSettings,
        customGasLimit,
        onHashReceive,
        transactionTitle: {
          template: RecentTransactionTitleTemplate.WITHDRAW,
          standard,
          symbol: stakingTokenSymbol,
          amount: formatUnits(amount, 18),
          logoURI: STAKING_TOKEN_LOGO,
        },
      });
    },
    [executeTransaction, stakingTokenSymbol],
  );

  const claim = useCallback(
    async (
      tokenAddresses: Address[],
      gasSettings?: CustomGasSettings,
      customGasLimit?: bigint,
      standard: Standard = Standard.ERC20,
      onHashReceive?: (hash: Hash) => void,
    ) => {
      return executeTransaction({
        functionName: "claim",
        args: [tokenAddresses],
        gasSettings,
        customGasLimit,
        onHashReceive,
        transactionTitle: {
          template: RecentTransactionTitleTemplate.WITHDRAW,
          standard,
          symbol: "REWARDS",
          amount: tokenAddresses.length.toString(),
          logoURI: "/images/tokens/placeholder.svg",
        },
      });
    },
    [executeTransaction],
  );

  const recoverDeposit = useCallback(
    async (tokenAddress: Address, gasSettings?: CustomGasSettings, customGasLimit?: bigint) => {
      return executeTransaction({
        functionName: "withdrawDeposit",
        args: [tokenAddress],
        gasSettings,
        customGasLimit,
        transactionTitle: {
          template: RecentTransactionTitleTemplate.WITHDRAW,
          standard: Standard.ERC223,
          symbol: stakingTokenSymbol,
          amount: formatUnits(erc223Deposit ?? 0n, 18),
          logoURI: STAKING_TOKEN_LOGO,
        },
      });
    },
    [executeTransaction, stakingTokenSymbol, erc223Deposit],
  );

  // Permissionless: the collector can only send pool protocol fees to this Revenue contract.
  const collectProtocolFees = useCallback(
    async (pools: Address[]) => {
      const feeCollectorAddress = getFeeCollectorAddress(chainId);
      if (!feeCollectorAddress) {
        throw new Error("Protocol fee collection is not available on this network");
      }

      return executeTransaction({
        functionName: "collect",
        args: [pools],
        abi: FEE_COLLECTOR_ABI,
        address: feeCollectorAddress,
      });
    },
    [executeTransaction, chainId],
  );

  return {
    contractAddress: revenueAddress,
    chainId,
    requiredChainId: chainId,
    isCorrectNetwork,
    isRevenueDeployed: Boolean(revenueAddress),
    stakingTokenERC20,
    stakingTokenERC223,
    stakingTokenSymbol,
    userStaked,
    userStakedErc20,
    userStakedErc223,
    userStakingTimestamp,
    claimDelay,
    rewardDuration,
    totalStaked,
    erc223Deposit,
    redErc20Balance,
    redErc223Balance,
    contractStakeErc20Balance,
    contractStakeErc223Balance,
    redTotalSupply,
    canUnstake: canUnstake.canUnstake,
    timeRemaining: canUnstake.timeRemaining,
    unlockTime: canUnstake.unlockTime,
    hasStaked,
    stakingPercentage,
    unstakeCountdown,
    claimableRewards,
    setRewardTokens,
    formatCountdown,
    approve,
    stake,
    stakeERC223,
    unstake,
    claim,
    recoverDeposit,
    collectProtocolFees,
    refetchUserData,
    isLoadingUserData:
      isLoadingRevenueConfig || isLoadingUserStaked || isLoadingUserStakingTimestamp,
    isTransactionPending,
  };
}
