import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserStore {
  userId: string;
  setUserId: (userId: string) => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    set => ({
      userId: '',
      setUserId: (userId: string) => set({ userId }),
    }),
    {
      name: 'user-storage', // localStorage のキー名
    }
  )
);
