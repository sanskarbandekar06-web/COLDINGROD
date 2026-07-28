import { create } from 'zustand';

interface CommandPaletteState {
  isOpen: boolean;
  toggle: () => void;
  setIsOpen: (isOpen: boolean) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  setIsOpen: (isOpen) => set({ isOpen }),
}));
