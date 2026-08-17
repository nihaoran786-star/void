/**
 * navSearchStore — whether the navigation search dialog is open.
 *
 * The dialog is mounted by MainNav, but its trigger lives in the nav control
 * bar above the sidebar, so the open/closed flag cannot stay local to either
 * one. Presentation state only: no session, workspace or search data lives
 * here — the dialog still owns its own query and results.
 */

import { create } from 'zustand';

interface NavSearchState {
  open: boolean;
  openNavSearch: () => void;
  closeNavSearch: () => void;
  toggleNavSearch: () => void;
}

export const useNavSearchStore = create<NavSearchState>((set) => ({
  open: false,
  openNavSearch: () => set({ open: true }),
  closeNavSearch: () => set({ open: false }),
  toggleNavSearch: () => set((state) => ({ open: !state.open })),
}));
