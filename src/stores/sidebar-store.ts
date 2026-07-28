import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  isMobileOpen: boolean;
  toggle: () => void;
  setIsOpen: (isOpen: boolean) => void;
  toggleMobile: () => void;
  setMobileOpen: (isOpen: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: true,
  isMobileOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setIsOpen: (isOpen) => set({ isOpen }),
  toggleMobile: () => set((state) => ({ isMobileOpen: !state.isMobileOpen })),
  setMobileOpen: (isMobileOpen) => set({ isMobileOpen }),
}));
