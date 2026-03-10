import { cn } from 'heroui-native';

export const appColors = {
  background: 'bg-background',
  surfaceDefault: 'bg-default',
  surfaceBorderLight: 'border-zinc-200',
  surfaceBorderDark: 'border-zinc-900',
  subtleSurface: 'bg-foreground/5',
  dangerSurface: 'bg-red-500/10',
  dangerForeground: 'text-red-500',
  foregroundMuted: 'text-foreground/70',
  foregroundSoft: 'text-foreground/40',
  mutedText: 'text-muted',
} as const;

export const appTypography = {
  screenTitle: 'text-[26px] font-semibold tracking-tight text-foreground',
  sectionLabel: 'px-1 text-base font-semibold text-foreground',
  sectionTitle: 'text-base font-semibold text-foreground',
  title: 'text-lg font-semibold text-foreground',
  listTitle: 'text-sm font-medium text-foreground',
  listCount: 'text-sm font-medium text-muted',
  listMeta: 'text-xs text-muted',
  bodyStrong: 'text-sm font-semibold text-foreground',
  body: 'text-sm leading-5 text-muted',
  bodyCentered: 'text-center text-sm leading-5 text-muted',
  bodyMuted: 'text-sm text-muted',
  caption: 'text-xs text-muted',
  dialogTitle: 'text-[18px] font-bold leading-6 text-black dark:text-white',
  buttonLabel: 'text-[14px]',
  fieldError: 'text-[12px]',
} as const;

export const appSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  screenTopOffset: 34,
  screenBottomOffset: 32,
  screenHorizontalPadding: 20,
  defaultHeaderOffset: 50,
  listTopOffset: 20,
  dialogKeyboardOffsetMax: 72,
} as const;

export const appSizes = {
  iconXs: 16,
  iconSm: 18,
  iconMd: 20,
  iconLg: 22,
  statusBadge: 40,
  emptyStateBadge: 56,
  projectPreview: 96,
  fieldHeight: 56,
  searchFieldHeight: 48,
} as const;

export const appLayout = {
  screenContent: 'gap-4',
  screenHorizontalPadding: 'px-5',
  homeHeaderRow: 'flex-row items-center justify-between gap-4 px-1',
  statusRow: 'flex-row items-start gap-3',
  sectionBlock: 'gap-3',
  compactList: 'gap-2',
  textStack: 'flex-1 gap-1',
  centeredStack: 'items-center gap-1',
  projectList: 'mt-5 gap-4',
} as const;

export const appCardStyles = {
  surface: 'border shadow-none',
  defaultBody: 'gap-3 p-4',
  loadingBody: 'items-center gap-3 p-6',
  emptyBody: 'items-center gap-4 p-6',
} as const;

export const appStateStyles = {
  alertBadge: 'size-10 items-center justify-center rounded-3xl bg-red-500/10',
  emptyBadge: 'size-14 items-center justify-center rounded-full bg-foreground/5',
} as const;

export const appListStyles = {
  filesystemRow: 'flex-row items-center gap-3 px-1 py-3',
  rowContent: 'flex-1',
  rowRight: 'flex-row items-center gap-2',
} as const;

export const appInputStyles = {
  searchField:
    'h-[48px] rounded-full border-0 bg-default py-0 text-[17px] text-foreground shadow-none focus:border-0',
  dialogField:
    'h-14 rounded-[12px] border-0 bg-zinc-100 px-4 py-0 text-black shadow-none focus:border-0 dark:bg-[#39393D] dark:text-white dark:focus:border-0',
  placeholder: 'text-muted',
  icon: 'text-muted',
} as const;

export const appDialogStyles = {
  content: 'bg-white px-6 pt-6 pb-5 dark:bg-[#1B1B1D]',
  body: 'gap-6',
  fieldStack: 'gap-2',
  footerRow: 'flex-row items-center justify-between gap-4',
  input: appInputStyles.dialogField,
  primaryButton: 'rounded-[12px] bg-black px-4 dark:bg-[#FFFFFF]',
} as const;

export const appAnimation = {
  screenStaggerMs: 60,
  cardEnterMs: 260,
  dialogEnterMs: 200,
  dialogExitMs: 150,
  keyboardRaiseMs: 220,
} as const;

export function getSurfaceCardClassName(isDark: boolean): string {
  return (
    cn(
      appCardStyles.surface,
      appColors.surfaceBorderLight,
      isDark && appColors.surfaceBorderDark
    ) ?? ''
  );
}
