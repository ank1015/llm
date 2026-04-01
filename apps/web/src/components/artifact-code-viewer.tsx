"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

import { useUiStore } from "@/stores/ui-store";

import tomorrowTheme from "@/lib/monaco-themes/Tomorrow.json";
import tomorrowNightBrightTheme from "@/lib/monaco-themes/Tomorrow-Night-Bright.json";

import type { Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditorApi } from "monaco-editor";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
const MonacoDiffEditor = dynamic(
  async () => (await import("@monaco-editor/react")).DiffEditor,
  { ssr: false },
);

const LIGHT_THEME_NAME = "tomorrow";
const DARK_THEME_NAME = "tomorrow-night-bright";

const MONACO_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  acceptSuggestionOnCommitCharacter: true,
  acceptSuggestionOnEnter: "on",
  accessibilitySupport: "auto",
  ariaLabel: "Editor content",
  autoClosingBrackets: "languageDefined",
  autoClosingComments: "languageDefined",
  autoClosingDelete: "auto",
  autoClosingOvertype: "auto",
  autoClosingQuotes: "languageDefined",
  autoIndent: "full",
  autoSurround: "languageDefined",
  bracketPairColorization: {
    enabled: true,
    independentColorPoolPerBracketType: false,
  },
  guides: {
    bracketPairs: false,
    bracketPairsHorizontal: "active",
    highlightActiveBracketPair: true,
    indentation: true,
    highlightActiveIndentation: true,
  },
  stickyScroll: {
    enabled: true,
    maxLineCount: 5,
    defaultModel: "outlineModel",
    scrollWithEditor: true,
  },
  codeLens: true,
  colorDecorators: true,
  colorDecoratorActivatedOn: "clickAndHover",
  contextmenu: true,
  copyWithSyntaxHighlighting: true,
  cursorBlinking: "blink",
  cursorSmoothCaretAnimation: "off",
  cursorStyle: "line",
  dragAndDrop: true,
  experimentalWhitespaceRendering: "svg",
  find: {
    cursorMoveOnType: true,
    seedSearchStringFromSelection: "always",
    autoFindInSelection: "never",
    globalFindClipboard: false,
    addExtraSpaceOnTop: true,
    loop: true,
  },
  folding: true,
  foldingStrategy: "auto",
  foldingHighlight: true,
  foldingMaximumRegions: 5000,
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 12,
  fontWeight: "normal",
  formatOnPaste: false,
  formatOnType: false,
  glyphMargin: true,
  hideCursorInOverviewRuler: false,
  hover: {
    enabled: true,
    delay: 300,
    sticky: true,
    hidingDelay: 300,
    above: true,
  },
  inlayHints: {
    enabled: "on",
  },
  lineDecorationsWidth: 10,
  lineNumbers: "on",
  lineNumbersMinChars: 5,
  links: true,
  matchBrackets: "always",
  minimap: {
    enabled: true,
    autohide: "none",
    size: "proportional",
    side: "right",
    showSlider: "mouseover",
    scale: 1,
    renderCharacters: true,
    maxColumn: 120,
    showRegionSectionHeaders: true,
    showMarkSectionHeaders: true,
    sectionHeaderFontSize: 9,
    sectionHeaderLetterSpacing: 1,
  },
  mouseStyle: "text",
  mouseWheelScrollSensitivity: 1,
  mouseWheelZoom: false,
  occurrencesHighlight: "singleFile",
  overviewRulerBorder: true,
  overviewRulerLanes: 2,
  padding: {
    top: 0,
    bottom: 0,
  },
  parameterHints: {
    enabled: true,
    cycle: true,
  },
  peekWidgetDefaultFocus: "tree",
  quickSuggestions: {
    other: "on",
    comments: "off",
    strings: "off",
  },
  quickSuggestionsDelay: 10,
  renderControlCharacters: true,
  renderFinalNewline: "on",
  renderLineHighlight: "line",
  renderValidationDecorations: "editable",
  renderWhitespace: "selection",
  revealHorizontalRightPadding: 15,
  roundedSelection: true,
  scrollBeyondLastColumn: 4,
  scrollBeyondLastLine: true,
  scrollPredominantAxis: true,
  selectionClipboard: true,
  selectionHighlight: true,
  selectOnLineNumbers: true,
  showFoldingControls: "mouseover",
  showDeprecated: true,
  showUnused: true,
  smoothScrolling: false,
  stopRenderingLineAfter: 10000,
  suggest: {
    insertMode: "insert",
    filterGraceful: true,
    localityBonus: false,
    shareSuggestSelections: false,
    selectionMode: "always",
    snippetsPreventQuickSuggestions: false,
    showIcons: true,
    showStatusBar: false,
    preview: false,
    showInlineDetails: true,
    matchOnWordStartOnly: true,
  },
  suggestOnTriggerCharacters: true,
  suggestSelection: "first",
  tabCompletion: "off",
  tabFocusMode: false,
  scrollbar: {
    vertical: "auto",
    horizontal: "auto",
    verticalScrollbarSize: 14,
    horizontalScrollbarSize: 12,
    scrollByPage: false,
    ignoreHorizontalScrollbarInContentHeight: false,
  },
  unicodeHighlight: {
    nonBasicASCII: "inUntrustedWorkspace",
    invisibleCharacters: true,
    ambiguousCharacters: true,
    includeComments: "inUntrustedWorkspace",
    includeStrings: true,
    allowedCharacters: {},
    allowedLocales: {
      _os: true,
      _vscode: true,
    },
  },
  unusualLineTerminators: "prompt",
  useShadowDOM: true,
  useTabStops: true,
  wordBreak: "normal",
  wordSeparators: "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?",
  wordWrap: "off",
  wordWrapBreakAfterCharacters:
    " \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣",
  wordWrapBreakBeforeCharacters: "([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋",
  wordWrapColumn: 80,
  wrappingIndent: "same",
  wrappingStrategy: "simple",
} as const;

function resolveMonacoLanguage(path: string): string {
  const basename = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  const extension = basename.includes(".") ? basename.split(".").pop()?.toLowerCase() ?? "" : "";

  if (basename === ".env" || basename.startsWith(".env.")) return "ini";
  if (basename === ".editorconfig" || basename === ".npmrc") return "ini";
  if (basename === ".prettierrc") return "json";
  if (basename === ".gitignore" || basename === ".gitattributes") return "plaintext";
  if (!extension) return "plaintext";

  if (extension === "tsx") return "tsx";
  if (extension === "ts") return "typescript";
  if (extension === "jsx") return "javascript";
  if (extension === "js") return "javascript";
  if (extension === "json") return "json";
  if (extension === "md" || extension === "markdown" || extension === "mdx") return "markdown";
  if (extension === "yml") return "yaml";
  if (extension === "yaml") return "yaml";
  if (extension === "py") return "python";
  if (extension === "rs") return "rust";
  if (extension === "kt") return "kotlin";
  if (extension === "rb") return "ruby";
  if (extension === "cpp" || extension === "hpp" || extension === "h") return "cpp";
  if (extension === "c") return "c";
  if (extension === "cs") return "csharp";
  if (extension === "go") return "go";
  if (extension === "toml") return "ini";
  if (extension === "xml" || extension === "svg") return "xml";
  if (extension === "sql") return "sql";
  if (extension === "graphql") return "graphql";
  if (extension === "proto") return "protobuf";
  if (extension === "sh" || extension === "bash" || extension === "zsh") return "shell";
  if (extension === "env") return "ini";
  return extension;
}

function defineThemes(monaco: Monaco) {
  monaco.editor.defineTheme(LIGHT_THEME_NAME, tomorrowTheme);
  monaco.editor.defineTheme(DARK_THEME_NAME, tomorrowNightBrightTheme);
}

export function ArtifactCodeViewer({
  path,
  content,
  editable,
  onChange,
  wordWrapEnabled,
}: {
  path: string;
  content: string;
  editable: boolean;
  onChange: (nextValue: string) => void;
  wordWrapEnabled: boolean;
}) {
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const theme = useUiStore((state) => state.theme);
  const editorTheme = theme === "dark" ? DARK_THEME_NAME : LIGHT_THEME_NAME;
  const language = resolveMonacoLanguage(path);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.updateOptions({
      readOnly: !editable,
      domReadOnly: !editable,
      wordWrap: wordWrapEnabled ? "on" : "off",
    });

    const frameId = window.requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    const timeoutId = window.setTimeout(() => {
      editorRef.current?.layout();
    }, 220);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [content, editable, editorTheme, path, wordWrapEnabled]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <MonacoEditor
        height="100%"
        width="100%"
        language={language}
        value={content}
        onChange={(nextValue) => {
          onChange(nextValue ?? "");
        }}
        theme={editorTheme}
        beforeMount={defineThemes}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.updateOptions({
            readOnly: !editable,
            domReadOnly: !editable,
            wordWrap: wordWrapEnabled ? "on" : "off",
          });
          window.requestAnimationFrame(() => {
            editor.layout();
          });
        }}
        options={{
          ...MONACO_OPTIONS,
          readOnly: !editable,
          domReadOnly: !editable,
          wordWrap: wordWrapEnabled ? "on" : "off",
        }}
      />
    </div>
  );
}

export function ArtifactCodeDiffViewer({
  path,
  beforeContent,
  afterContent,
  wordWrapEnabled,
}: {
  path: string;
  beforeContent: string;
  afterContent: string;
  wordWrapEnabled: boolean;
}) {
  const editorRef = useRef<MonacoEditorApi.IStandaloneDiffEditor | null>(null);
  const theme = useUiStore((state) => state.theme);
  const editorTheme = theme === "dark" ? DARK_THEME_NAME : LIGHT_THEME_NAME;
  const language = resolveMonacoLanguage(path);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.updateOptions({
      readOnly: true,
      domReadOnly: true,
      wordWrap: wordWrapEnabled ? "on" : "off",
    });

    const frameId = window.requestAnimationFrame(() => {
      editorRef.current?.layout();
    });
    const timeoutId = window.setTimeout(() => {
      editorRef.current?.layout();
    }, 220);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [afterContent, beforeContent, editorTheme, path, wordWrapEnabled]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <MonacoDiffEditor
        height="100%"
        width="100%"
        language={language}
        original={beforeContent}
        modified={afterContent}
        theme={editorTheme}
        beforeMount={defineThemes}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.updateOptions({
            readOnly: true,
            domReadOnly: true,
            wordWrap: wordWrapEnabled ? "on" : "off",
          });
          window.requestAnimationFrame(() => {
            editor.layout();
          });
        }}
        options={{
          ...MONACO_OPTIONS,
          readOnly: true,
          domReadOnly: true,
          wordWrap: wordWrapEnabled ? "on" : "off",
        }}
      />
    </div>
  );
}
