/**
 * Side panel UI — connects to background service worker via chrome.runtime.connect.
 *
 * Sends user prompts and receives agent events for display.
 */

// ── Types for side panel ↔ background messaging ────────────────────

interface PromptMessage {
  type: 'prompt';
  message: string;
  tabId: number;
  api: string;
  modelId: string;
  sessionId?: string | undefined;
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
  data: { sessionId: string };
}

interface ErrorMsg {
  type: 'error';
  requestId: string;
  error: string;
}

type BackgroundMessage = AgentEventMsg | ResultMsg | ErrorMsg;

// ── DOM elements ────────────────────────────────────────────────────

const messagesEl = document.getElementById('messages')!;
const inputEl = document.getElementById('input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const form = document.getElementById('input-form') as HTMLFormElement;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const statusEl = document.getElementById('status')!;

// ── State ───────────────────────────────────────────────────────────

let sessionId: string | undefined;
let isRunning = false;
let currentAssistantEl: HTMLElement | null = null;

// ── Background port ─────────────────────────────────────────────────

const port = chrome.runtime.connect({ name: 'sidepanel' });

port.onMessage.addListener((msg: BackgroundMessage) => {
  switch (msg.type) {
    case 'agentEvent':
      handleAgentEvent(msg.event);
      break;
    case 'result':
      sessionId = msg.data.sessionId;
      onPromptComplete();
      break;
    case 'error':
      showError(msg.error);
      onPromptComplete();
      break;
  }
});

port.onDisconnect.addListener(() => {
  showError('Connection to extension lost. Please reload.');
});

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

  // Content is an array of content blocks with varying structures:
  //   { type: 'text', content: '...' }            — direct text block
  //   { type: 'response', content: [{ type: 'text', content: '...' }] }  — wrapped text
  //   { type: 'toolCall', ... }                    — skip
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;

      if (b.type === 'text' || b.type === 'textContent') {
        const text = (b.content as string | undefined) ?? (b.text as string | undefined) ?? '';
        if (text) parts.push(text);
      } else if (b.type === 'response' && Array.isArray(b.content)) {
        // Unwrap nested response content blocks
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

  // Parse model selection
  const [api, modelId] = modelSelect.value.split(':');
  if (!api || !modelId) {
    showError('Invalid model selection.');
    return;
  }

  // Show user message and clear input
  addMessage('user', message);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  setRunning(true);

  // Send to background
  const prompt: PromptMessage = {
    type: 'prompt',
    message,
    tabId: tab.id,
    api,
    modelId,
    sessionId,
  };

  port.postMessage(prompt);
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
