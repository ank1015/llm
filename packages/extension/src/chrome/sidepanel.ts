/**
 * Side panel UI — connects to background service worker via chrome.runtime.connect.
 *
 * Sends user prompts and receives agent events for display.
 * Manages session history via chrome.storage.local.
 */

// ── Types for side panel ↔ background messaging ────────────────────

interface PromptMessage {
  type: 'prompt';
  message: string;
  tabId: number;
  tabUrl: string;
  sessionId?: string | undefined;
}

interface LoadSessionMessage {
  type: 'loadSession';
  sessionId: string;
}

interface AgentEventMsg {
  type: 'agentEvent';
  requestId: string;
  event: {
    type: string;
    messageType?: string;
    messageId?: string;
    message?: {
      role?: string;
      content?: unknown;
    };
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: {
      content?: Array<{ type: string; content?: string }>;
    };
    isError?: boolean;
    agentMessages?: unknown[];
  };
}

interface ResultMsg {
  type: 'result';
  requestId: string;
  data: {
    sessionId?: string;
    messages?: StoredMessage[];
  };
}

interface ErrorMsg {
  type: 'error';
  requestId: string;
  error: string;
}

type BackgroundMessage = AgentEventMsg | ResultMsg | ErrorMsg;

// ── Stored message types (from session files) ───────────────────────

interface StoredMessage {
  role: string;
  content?: unknown;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
}

// ── Session metadata (chrome.storage.local) ─────────────────────────

interface SessionMeta {
  sessionId: string;
  url: string;
  preview: string;
  timestamp: number;
}

// ── DOM elements ────────────────────────────────────────────────────

const messagesEl = document.getElementById('messages')!;
const inputEl = document.getElementById('input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const form = document.getElementById('input-form') as HTMLFormElement;
const statusEl = document.getElementById('status')!;
const newSessionBtn = document.getElementById('new-session-btn')!;
const historyBtn = document.getElementById('history-btn')!;
const historyPanel = document.getElementById('history-panel')!;
const historyList = document.getElementById('history-list')!;
const historyEmpty = document.getElementById('history-empty')!;
const startView = document.getElementById('start-view')!;
const startBtn = document.getElementById('start-btn')!;

// ── State ───────────────────────────────────────────────────────────

let sessionId: string | undefined;
let isRunning = false;
let currentAssistantEl: HTMLElement | null = null;
let pendingPromptMeta: { url: string; preview: string } | null = null;
let waitingForLoadSession = false;

// ── Background port ─────────────────────────────────────────────────

const port = chrome.runtime.connect({ name: 'sidepanel' });

port.onMessage.addListener((msg: BackgroundMessage) => {
  switch (msg.type) {
    case 'agentEvent':
      handleAgentEvent(msg.event);
      break;
    case 'result':
      if (waitingForLoadSession) {
        handleLoadSessionResult(msg.data.messages ?? []);
      } else {
        handlePromptResult(msg.data);
      }
      break;
    case 'error':
      showError(msg.error);
      waitingForLoadSession = false;
      onPromptComplete();
      break;
  }
});

port.onDisconnect.addListener(() => {
  showError('Connection to extension lost. Please reload.');
});

// ── Prompt result handler ───────────────────────────────────────────

function handlePromptResult(data: ResultMsg['data']): void {
  const newSessionId = data.sessionId;
  if (newSessionId && newSessionId !== sessionId) {
    sessionId = newSessionId;
    if (pendingPromptMeta) {
      saveSessionMeta({
        sessionId: newSessionId,
        url: pendingPromptMeta.url,
        preview: pendingPromptMeta.preview,
        timestamp: Date.now(),
      });
    }
  }
  pendingPromptMeta = null;
  onPromptComplete();
}

// ── Load session result handler ─────────────────────────────────────

function handleLoadSessionResult(messages: StoredMessage[]): void {
  waitingForLoadSession = false;
  messagesEl.innerHTML = '';
  renderStoredMessages(messages);
  hideStartView();
  onPromptComplete();
}

// ── Event handlers ──────────────────────────────────────────────────

function handleAgentEvent(event: AgentEventMsg['event']): void {
  switch (event.type) {
    case 'message_start':
      if (event.messageType === 'assistant') {
        currentAssistantEl = addMessage('assistant', 'Thinking...');
      }
      break;

    case 'message_end':
      if (event.messageType === 'assistant' && event.message) {
        const text = extractTextContent(event.message.content);
        if (currentAssistantEl) {
          currentAssistantEl.textContent = text || '(empty response)';
        } else {
          addMessage('assistant', text || '(empty response)');
        }
        currentAssistantEl = null;
      }
      break;

    case 'tool_execution_start':
      setStatus(`Using tool: ${event.toolName}...`);
      addToolMessage(`${event.toolName}`, 'running...');
      break;

    case 'tool_execution_end': {
      clearStatus();
      const resultText = event.result?.content?.[0]?.content;
      const preview = resultText
        ? resultText.length > 200
          ? resultText.slice(0, 200) + '...'
          : resultText
        : '';
      const label = event.isError ? 'error' : 'done';
      addToolMessage(`${event.toolName}`, label, preview, event.isError);
      break;
    }

    case 'agent_start':
      setStatus('Agent started...');
      break;

    case 'agent_end':
      clearStatus();
      break;
  }
}

// ── Render stored messages ──────────────────────────────────────────

function renderStoredMessages(messages: StoredMessage[]): void {
  for (const msg of messages) {
    switch (msg.role) {
      case 'user': {
        const text = extractTextContent(msg.content);
        if (text) addMessage('user', text);
        break;
      }
      case 'assistant': {
        renderAssistantMessage(msg.content);
        break;
      }
      case 'toolResult': {
        const resultText = extractTextContent(msg.content);
        const preview = resultText
          ? resultText.length > 200
            ? resultText.slice(0, 200) + '...'
            : resultText
          : '';
        const label = msg.isError ? 'error' : 'done';
        addToolMessage(msg.toolName ?? 'tool', label, preview, msg.isError);
        break;
      }
    }
  }
  scrollToBottom();
}

function renderAssistantMessage(content: unknown): void {
  if (!Array.isArray(content)) {
    const text = extractTextContent(content);
    if (text) addMessage('assistant', text);
    return;
  }

  // Walk content blocks — render toolCalls and text separately
  const textParts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;

    if (b.type === 'toolCall') {
      // Flush accumulated text first
      if (textParts.length > 0) {
        addMessage('assistant', textParts.join('\n'));
        textParts.length = 0;
      }
      addToolMessage((b.name as string) ?? 'tool', 'called');
    } else if (b.type === 'response' || b.type === 'text' || b.type === 'textContent') {
      const text = b.type === 'response' ? extractTextContent(b.content) : extractTextContent([b]);
      if (text) textParts.push(text);
    }
  }

  if (textParts.length > 0) {
    const joined = textParts.join('\n');
    if (joined) addMessage('assistant', joined);
  }
}

// ── UI helpers ──────────────────────────────────────────────────────

function addMessage(role: 'user' | 'assistant' | 'error', text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function addToolMessage(
  toolName: string,
  status: string,
  preview?: string,
  isError?: boolean
): void {
  const el = document.createElement('div');
  el.className = 'message tool';

  let html = `<span class="tool-name">${escapeHtml(toolName)}</span>: `;
  if (isError) {
    html += `<span class="tool-error">${escapeHtml(status)}</span>`;
  } else {
    html += escapeHtml(status);
  }
  if (preview) {
    html += `<br/>${escapeHtml(preview)}`;
  }

  el.innerHTML = html;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function showError(error: string): void {
  addMessage('error', error);
  if (currentAssistantEl) {
    currentAssistantEl.remove();
    currentAssistantEl = null;
  }
}

function setStatus(text: string): void {
  statusEl.textContent = text;
  statusEl.classList.remove('hidden');
}

function clearStatus(): void {
  statusEl.classList.add('hidden');
}

function scrollToBottom(): void {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function extractTextContent(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;

      if (b.type === 'text' || b.type === 'textContent') {
        const text = (b.content as string | undefined) ?? (b.text as string | undefined) ?? '';
        if (text) parts.push(text);
      } else if (b.type === 'response' && Array.isArray(b.content)) {
        const inner = extractTextContent(b.content);
        if (inner) parts.push(inner);
      }
    }
    return parts.join('\n');
  }

  return '';
}

function setRunning(running: boolean): void {
  isRunning = running;
  sendBtn.disabled = running;
  inputEl.disabled = running;
  if (!running) {
    inputEl.focus();
  }
}

function onPromptComplete(): void {
  setRunning(false);
  clearStatus();
}

// ── Session metadata (chrome.storage.local) ─────────────────────────

async function getSessionsMeta(): Promise<SessionMeta[]> {
  const result = await chrome.storage.local.get('sessions');
  return (result.sessions as SessionMeta[] | undefined) ?? [];
}

async function saveSessionMeta(meta: SessionMeta): Promise<void> {
  const sessions = await getSessionsMeta();
  // Don't duplicate — update if sessionId exists
  const idx = sessions.findIndex((s) => s.sessionId === meta.sessionId);
  if (idx >= 0) {
    sessions[idx] = meta;
  } else {
    sessions.unshift(meta);
  }
  await chrome.storage.local.set({ sessions });
}

// ── History panel ───────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function renderHistoryPanel(): Promise<void> {
  const sessions = await getSessionsMeta();
  historyList.innerHTML = '';

  if (sessions.length === 0) {
    historyEmpty.classList.remove('hidden');
    return;
  }

  historyEmpty.classList.add('hidden');

  // Sort by timestamp descending (most recent first)
  sessions.sort((a, b) => b.timestamp - a.timestamp);

  for (const meta of sessions) {
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    if (meta.sessionId === sessionId) {
      entry.classList.add('active');
    }

    entry.innerHTML = `
      <div class="history-entry-url">${escapeHtml(meta.url)}</div>
      <div class="history-entry-preview">${escapeHtml(meta.preview)}</div>
      <div class="history-entry-time">${escapeHtml(formatRelativeTime(meta.timestamp))}</div>
    `;

    entry.addEventListener('click', () => {
      loadSession(meta.sessionId);
    });

    historyList.appendChild(entry);
  }
}

function toggleHistoryPanel(): void {
  const isHidden = historyPanel.classList.contains('hidden');
  if (isHidden) {
    renderHistoryPanel();
    historyPanel.classList.remove('hidden');
    historyBtn.classList.add('active');
  } else {
    historyPanel.classList.add('hidden');
    historyBtn.classList.remove('active');
  }
}

function closeHistoryPanel(): void {
  historyPanel.classList.add('hidden');
  historyBtn.classList.remove('active');
}

// ── Session actions ─────────────────────────────────────────────────

function newSession(): void {
  sessionId = undefined;
  messagesEl.innerHTML = '';
  messagesEl.appendChild(startView);
  showStartView();
  currentAssistantEl = null;
  closeHistoryPanel();
  clearStatus();
}

function loadSession(targetSessionId: string): void {
  if (isRunning) return;

  sessionId = targetSessionId;
  messagesEl.innerHTML = '';
  currentAssistantEl = null;
  waitingForLoadSession = true;
  setRunning(true);
  setStatus('Loading session...');
  closeHistoryPanel();

  const msg: LoadSessionMessage = {
    type: 'loadSession',
    sessionId: targetSessionId,
  };
  port.postMessage(msg);
}

// ── Send prompt ─────────────────────────────────────────────────────

async function sendPrompt(): Promise<void> {
  const message = inputEl.value.trim();
  if (!message || isRunning) return;

  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError('No active tab found.');
    return;
  }

  // Save metadata for when we get the sessionId back
  pendingPromptMeta = {
    url: tab.url ?? 'unknown',
    preview: message.slice(0, 80),
  };

  // Show user message and clear input
  hideStartView();
  addMessage('user', message);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  setRunning(true);

  // Send to background
  const prompt: PromptMessage = {
    type: 'prompt',
    message,
    tabId: tab.id,
    tabUrl: tab.url ?? 'unknown',
    sessionId,
  };

  port.postMessage(prompt);
}

// ── Start session (auto-summarize) ──────────────────────────────────

async function startSession(): Promise<void> {
  if (isRunning) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError('No active tab found.');
    return;
  }

  const autoMessage =
    'Summarize this page with a section-by-section overview so I can decide where to dive deeper.';

  pendingPromptMeta = {
    url: tab.url ?? 'unknown',
    preview: autoMessage.slice(0, 80),
  };

  hideStartView();
  setRunning(true);

  const prompt: PromptMessage = {
    type: 'prompt',
    message: autoMessage,
    tabId: tab.id,
    tabUrl: tab.url ?? 'unknown',
    sessionId,
  };

  port.postMessage(prompt);
}

function hideStartView(): void {
  startView.classList.add('hidden');
}

function showStartView(): void {
  startView.classList.remove('hidden');
}

// ── Input handling ──────────────────────────────────────────────────

form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendPrompt();
});

// Auto-resize textarea
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// Enter to send, Shift+Enter for newline
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});

// Session buttons
newSessionBtn.addEventListener('click', newSession);
historyBtn.addEventListener('click', toggleHistoryPanel);
startBtn.addEventListener('click', startSession);
