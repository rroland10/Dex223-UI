import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SwapChartStore {
  isOpened: boolean;
  setIsOpened: (isOpened: boolean) => void;
}

const localStorageKey = "swap-price-chart-state";

export const useSwapChartStore = create<SwapChartStore>()(
  persist(
    (set) => ({
      // Open by default so the chart is visible next to the form on first visit.
      isOpened: true,
      setIsOpened: (isOpened) => set({ isOpened }),
    }),
    {
      name: localStorageKey,
    },
  ),
);
