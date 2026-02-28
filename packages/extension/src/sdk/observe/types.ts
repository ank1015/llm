export type ObserveFilter =
  | 'interactive'
  | 'buttons'
  | 'links'
  | 'inputs'
  | 'text'
  | 'forms'
  | 'media'
  | 'alerts';

export interface WindowObserveOptions {
  tabId?: number;
  filters?: ObserveFilter[];
  /**
   * Optional semantic query. When provided, Window.observe passes a semantic input
   * string to the constructor-provided semanticFilter callback and returns its result.
   */
  semanticFilter?: string;
  /**
   * Maximum number of items to return in list-heavy sections.
   * Default: 120. Filtered observe defaults to a lower cap when omitted.
   */
  max?: number;
  timeoutMs?: number;
}

export interface ObserveLocator {
  id?: string;
  testId?: string;
  name?: string;
  role?: string;
  cssPath?: string;
}

export interface ObserveBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ObserveInteractiveCategory = 'button' | 'link' | 'input' | 'interactive';

export interface ObserveInteractiveElement {
  id: string;
  category: ObserveInteractiveCategory;
  tag: string;
  role: string;
  name: string;
  actions: string[];
  state: string[];
  locator: ObserveLocator;
  bbox: ObserveBBox;
  href?: string;
}

export interface ObserveTextBlock {
  id: string;
  kind: 'heading' | 'text';
  text: string;
  source: string;
  level?: number;
}

export interface ObserveFormSummary {
  id: string;
  name: string;
  fields: string[];
  submitButtons: string[];
}

export interface ObserveMediaElement {
  id: string;
  kind: 'audio' | 'video';
  name: string;
  state: string[];
  locator: ObserveLocator;
  bbox: ObserveBBox;
  currentTime: number;
  duration: number;
  src?: string;
}

export interface ObservePageInfo {
  url: string;
  title: string;
  lang: string;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  scroll: {
    x: number;
    y: number;
    maxY: number;
  };
}

export interface ObservePageSummary {
  interactiveCount: number;
  totalInteractiveCount: number;
  textBlockCount: number;
  totalTextBlockCount: number;
  formCount: number;
  mediaCount: number;
  alertCount: number;
  totalLinks: number;
  totalButtons: number;
  totalInputs: number;
}

export interface ObserveTruncation {
  interactive: boolean;
  textBlocks: boolean;
  hiddenFilteredCount: number;
  offscreenFilteredCount: number;
}

export interface ObserveSnapshot {
  page: ObservePageInfo;
  summary: ObservePageSummary;
  interactive: ObserveInteractiveElement[];
  textBlocks: ObserveTextBlock[];
  forms: ObserveFormSummary[];
  media: ObserveMediaElement[];
  alerts: string[];
  truncation: ObserveTruncation;
  warnings: string[];
}

export interface NormalizedObserveOptions {
  filters: ObserveFilter[];
  semanticFilter?: string;
  max: number;
  effectiveMax: number;
}

export interface ObserveView {
  interactive: ObserveInteractiveElement[];
  textBlocks: ObserveTextBlock[];
  forms: ObserveFormSummary[];
  media: ObserveMediaElement[];
  alerts: string[];
  includeSections: {
    interactive: boolean;
    text: boolean;
    forms: boolean;
    media: boolean;
    alerts: boolean;
  };
}
