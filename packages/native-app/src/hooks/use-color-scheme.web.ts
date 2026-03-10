import { useUiStore } from '@/stores/ui-store';

export function useColorScheme(): 'light' | 'dark' {
  return useUiStore((state) => state.theme);
}
