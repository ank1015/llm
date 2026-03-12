import { cn } from 'heroui-native';

const TEXT_MUTED = 'text-muted';
const TEXT_XS_MUTED = 'text-xs text-muted';

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
  mutedText: TEXT_MUTED,
} as const;

export const appTypography = {
  screenTitle: 'text-[26px] font-semibold text-foreground',
  artifactTitle: 'text-[28px] font-semibold tracking-tight text-foreground',
  artifactTabActiveLabel: 'text-[17px] font-semibold text-foreground',
  artifactTabInactiveLabel: `text-[17px] font-semibold ${TEXT_MUTED}`,
  artifactChatTitle: 'text-[19px] font-medium text-foreground',
  artifactChatMeta: `text-[15px] leading-6 ${TEXT_MUTED}`,
  sidebarSectionLabel: `px-1 py-4 text-lg font-medium ${TEXT_MUTED}`,
  sidebarChatTitle: 'text-[17px] font-normal text-foreground',
  sectionLabel: 'px-1 text-base font-semibold text-foreground',
  sectionTitle: 'text-base font-semibold text-foreground',
  title: 'text-lg font-semibold text-foreground',
  listTitle: 'text-sm font-medium text-foreground',
  listCount: `text-sm font-medium ${TEXT_MUTED}`,
  listMeta: TEXT_XS_MUTED,
  bodyStrong: 'text-sm font-semibold text-foreground',
  body: `text-sm leading-5 ${TEXT_MUTED}`,
  bodyCentered: `text-center text-sm leading-5 ${TEXT_MUTED}`,
  bodyMuted: `text-sm ${TEXT_MUTED}`,
  caption: TEXT_XS_MUTED,
  composerInputText: 'text-[17px] leading-6 text-foreground',
  composerPickerLabel: 'text-[13px] font-medium text-foreground',
  composerEditLabel: `text-[11px] ${TEXT_MUTED}`,
  composerEditAction: 'text-[11px] font-medium text-foreground',
  composerMenuLabel: `px-2 pb-2 text-sm font-semibold ${TEXT_MUTED}`,
  composerMenuItemTitle: 'text-[15px] text-foreground',
  composerMentionTitle: 'text-sm font-medium text-foreground',
  composerMentionMeta: TEXT_XS_MUTED,
  composerMentionEmpty: `px-4 py-3 text-sm ${TEXT_MUTED}`,
  composerMentionError: 'px-4 py-3 text-sm text-red-500',
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
  iconXl: 36,
  statusBadge: 40,
  emptyStateBadge: 56,
  projectPreview: 96,
  fieldHeight: 56,
  searchFieldHeight: 48,
  composerInputMinHeight: 30,
  composerInputMaxHeight: 120,
  composerDockBaseHeight: 56,
} as const;

export const appLayout = {
  artifactChatList: 'gap-7',
  artifactChatRow: 'gap-1 px-1 py-1',
  artifactHeroRow: 'flex-row items-center gap-4 px-1',
  artifactScreen: 'gap-8',
  artifactTabsSection: 'gap-6',
  screenContent: 'gap-4',
  screenHorizontalPadding: 'px-5',
  homeHeaderRow: 'flex-row items-center justify-between gap-4 px-1',
  statusRow: 'flex-row items-start gap-3',
  sectionBlock: 'gap-3',
  compactList: 'gap-2',
  composerDock: 'relative',
  composerSurface: 'gap-3 rounded-[32px] border border-foreground/10 bg-default px-4 pb-3 pt-4',
  composerInputRegion: 'min-h-[64px] px-1',
  composerEditRow: 'flex-row items-center justify-between gap-3 px-1',
  composerFooter: 'flex-row items-center justify-between gap-3',
  composerFooterActions: 'flex-1 flex-row items-center gap-3',
  composerIconButton: 'size-9 items-center justify-center rounded-full',
  composerPickerTrigger: 'h-9 flex-row items-center gap-1.5 rounded-full px-2 py-2',
  composerSendButton: 'size-10 items-center justify-center rounded-full bg-foreground',
  composerMenuContent: 'px-4 pb-8 pt-3',
  composerMentionSurface:
    'overflow-hidden rounded-[22px] border border-foreground/10 bg-default py-2 shadow-none',
  composerMentionList: 'gap-1',
  composerMentionRow: 'flex-row items-center gap-3 px-4 py-3',
  sidebarSection: 'gap-1',
  sidebarSectionHeader: 'flex-row items-center justify-between px-3 pb-1 pt-3',
  sidebarNestedList: 'gap-4 px-2 pb-3 pl-6 pt-2',
  textStack: 'flex-1 gap-1',
  centeredStack: 'items-center gap-1',
  projectList: 'gap-4',
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
  sidebarPrimaryRow: 'gap-3 px-3 py-3',
  sidebarItemSurface: 'rounded-[22px]',
  sidebarThreadItem: 'rounded-[20px] px-3 py-2',
} as const;

export const appInputStyles = {
  searchField:
    'h-[48px] rounded-full border-0 bg-default py-0 text-[17px] text-foreground shadow-none focus:border-0',
  dialogField:
    'h-14 rounded-[12px] border-0 bg-zinc-100 px-4 py-0 text-black shadow-none focus:border-0 dark:bg-[#39393D] dark:text-white dark:focus:border-0',
  composerField:
    'rounded-none border-0 bg-transparent px-1 py-1 text-[17px] leading-6 text-foreground shadow-none focus:border-0 ios:shadow-none android:shadow-none',
  placeholder: TEXT_MUTED,
  icon: TEXT_MUTED,
} as const;

export const appTabsStyles = {
  artifactContent: 'pt-2',
  artifactIndicator: 'rounded-full bg-default shadow-none',
  artifactList: 'gap-3 self-start bg-transparent p-0',
  artifactTrigger: 'px-6 py-3',
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
