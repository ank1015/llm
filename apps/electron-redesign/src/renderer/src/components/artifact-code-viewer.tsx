import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';

import tomorrowNightBrightTheme from '../lib/monaco-themes/Tomorrow-Night-Bright.json';
import tomorrowTheme from '../lib/monaco-themes/Tomorrow.json';

import type { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditorApi } from 'monaco-editor';

loader.config({ monaco });

const LIGHT_THEME_NAME = 'tomorrow';
const DARK_THEME_NAME = 'tomorrow-night-bright';

const MONACO_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  ariaLabel: 'Editor content',
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 12,
  fontWeight: 'normal',
  glyphMargin: true,
  lineDecorationsWidth: 10,
  lineNumbers: 'on',
  lineNumbersMinChars: 5,
  minimap: {
    enabled: true,
    autohide: 'none',
    size: 'proportional',
    side: 'right',
    showSlider: 'mouseover',
    scale: 1,
    renderCharacters: true,
    maxColumn: 120,
  },
  mouseWheelScrollSensitivity: 1,
  mouseWheelZoom: false,
  renderLineHighlight: 'line',
  renderWhitespace: 'selection',
  scrollBeyondLastColumn: 4,
  scrollBeyondLastLine: true,
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 14,
    horizontalScrollbarSize: 12,
    scrollByPage: false,
    ignoreHorizontalScrollbarInContentHeight: false,
  },
  stickyScroll: {
    enabled: true,
    maxLineCount: 5,
    defaultModel: 'outlineModel',
    scrollWithEditor: true,
  },
  useShadowDOM: true,
  wordWrap: 'off',
} as const;

export const ArtifactCodeViewer = ({
  path,
  content,
}: {
  readonly path: string;
  readonly content: string;
}): React.ReactElement => {
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const theme = useDocumentTheme();
  const editorTheme = theme === 'dark' ? DARK_THEME_NAME : LIGHT_THEME_NAME;

  useEffect(() => {
    if (editorRef.current === null) {
      return;
    }

    editorRef.current.updateOptions({
      readOnly: true,
      domReadOnly: true,
      wordWrap: 'off',
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
  }, [content, editorTheme, path]);

  return (
    <div className="code-viewer">
      <Editor
        height="100%"
        width="100%"
        language={resolveMonacoLanguage(path)}
        value={content}
        theme={editorTheme}
        beforeMount={defineThemes}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.updateOptions({
            readOnly: true,
            domReadOnly: true,
            wordWrap: 'off',
          });
          window.requestAnimationFrame(() => {
            editor.layout();
          });
        }}
        options={MONACO_OPTIONS}
      />
    </div>
  );
};

const defineThemes = (monaco: Monaco): void => {
  monaco.editor.defineTheme(
    LIGHT_THEME_NAME,
    tomorrowTheme as MonacoEditorApi.IStandaloneThemeData
  );
  monaco.editor.defineTheme(
    DARK_THEME_NAME,
    tomorrowNightBrightTheme as MonacoEditorApi.IStandaloneThemeData
  );
};

const useDocumentTheme = (): 'light' | 'dark' => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  return theme;
};

// Mirrors the web viewer's extension mapping; the branching is intentional.
// eslint-disable-next-line sonarjs/cognitive-complexity
const resolveMonacoLanguage = (path: string): string => {
  const basename = path.split('/').pop()?.toLowerCase() ?? path.toLowerCase();
  const extension = basename.includes('.') ? (basename.split('.').pop()?.toLowerCase() ?? '') : '';

  if (basename === '.env' || basename.startsWith('.env.')) return 'ini';
  if (basename === '.editorconfig' || basename === '.npmrc') return 'ini';
  if (basename === '.prettierrc') return 'json';
  if (basename === '.gitignore' || basename === '.gitattributes') return 'plaintext';
  if (!extension) return 'plaintext';
  if (extension === 'tsx') return 'tsx';
  if (extension === 'ts') return 'typescript';
  if (extension === 'jsx') return 'javascript';
  if (extension === 'js') return 'javascript';
  if (extension === 'json') return 'json';
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') return 'markdown';
  if (extension === 'yml' || extension === 'yaml') return 'yaml';
  if (extension === 'py') return 'python';
  if (extension === 'rs') return 'rust';
  if (extension === 'kt') return 'kotlin';
  if (extension === 'rb') return 'ruby';
  if (extension === 'cpp' || extension === 'hpp' || extension === 'h') return 'cpp';
  if (extension === 'c') return 'c';
  if (extension === 'cs') return 'csharp';
  if (extension === 'go') return 'go';
  if (extension === 'toml') return 'ini';
  if (extension === 'xml' || extension === 'svg') return 'xml';
  if (extension === 'sql') return 'sql';
  if (extension === 'graphql') return 'graphql';
  if (extension === 'proto') return 'protobuf';
  if (extension === 'sh' || extension === 'bash' || extension === 'zsh') return 'shell';
  if (extension === 'env') return 'ini';

  return extension;
};
