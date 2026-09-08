import { create } from "zustand";

export interface FundingState {
  selectedAccountId: string | null;
  setSelectedAccountId: (accountId: string) => void;
  reset: () => void;
}

export const useFundingStore = create<FundingState>((set) => ({
  selectedAccountId: null,
  setSelectedAccountId: (accountId) => set({ selectedAccountId: accountId }),
  reset: () => set({ selectedAccountId: null }),
}));
