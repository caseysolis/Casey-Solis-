import { create } from 'zustand'

interface UiStore {
  activeFocusBlockId: string | null
  focusSeedMinutes: number | null
  openFocus: (blockId: string, seedMinutes?: number) => void
  closeFocus: () => void
}

export const useUi = create<UiStore>((set) => ({
  activeFocusBlockId: null,
  focusSeedMinutes: null,
  openFocus: (blockId, seedMinutes) => set({ activeFocusBlockId: blockId, focusSeedMinutes: seedMinutes ?? null }),
  closeFocus: () => set({ activeFocusBlockId: null, focusSeedMinutes: null }),
}))
