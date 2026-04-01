import { describe, expect, it } from 'vitest';

import { buildUserMessage, buildToolResultMessage } from '../../../src/agent/utils.js';

import type { AgentToolResult, AssistantToolCall, Attachment } from '../../../src/types/index.js';

describe('buildUserMessage', () => {
  describe('text only', () => {
    it('should create a user message with text content', () => {
      const message = buildUserMessage('Hello, world!');

      expect(message.role).toBe('user');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(message.content).toHaveLength(1);
      expect(message.content[0]).toEqual({
        type: 'text',
        content: 'Hello, world!',
      });
    });

    it('should generate unique IDs for each message', () => {
      const message1 = buildUserMessage('First');
      const message2 = buildUserMessage('Second');

      expect(message1.id).not.toBe(message2.id);
    });

    it('should set timestamp to current time', () => {
      const before = Date.now();
      const message = buildUserMessage('Test');
      const after = Date.now();

      expect(message.timestamp).toBeGreaterThanOrEqual(before);
      expect(message.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty string input', () => {
      const message = buildUserMessage('');

      expect(message.content).toHaveLength(1);
      expect(message.content[0]).toEqual({
        type: 'text',
        content: '',
      });
    });

    it('should handle multiline text', () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      const message = buildUserMessage(multiline);

      expect(message.content[0]).toEqual({
        type: 'text',
        content: multiline,
      });
    });
  });

  describe('with attachments', () => {
    it('should include image attachment', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          type: 'image',
          content: 'base64encodedimage',
          mimeType: 'image/png',
          fileName: 'screenshot.png',
          size: 1024,
        },
      ];

      const message = buildUserMessage('Check this image', attachments);

      expect(message.content).toHaveLength(2);
      expect(message.content[0]).toEqual({
        type: 'text',
        content: 'Check this image',
      });
      expect(message.content[1]).toEqual({
        type: 'image',
        data: 'base64encodedimage',
        mimeType: 'image/png',
        metadata: {
          fileName: 'screenshot.png',
          size: 1024,
        },
      });
    });

    it('should include file attachment', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          type: 'file',
          content: 'file content here',
          mimeType: 'text/plain',
          fileName: 'document.txt',
          size: 512,
        },
      ];

      const message = buildUserMessage('Check this file', attachments);

      expect(message.content).toHaveLength(2);
      expect(message.content[0]).toEqual({
        type: 'text',
        content: 'Check this file',
      });
      expect(message.content[1]).toEqual({
        type: 'file',
        data: 'file content here',
        mimeType: 'text/plain',
        filename: 'document.txt',
        metadata: {
          fileName: 'document.txt',
          size: 512,
        },
      });
    });

    it('should handle multiple attachments', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          type: 'image',
          content: 'image1data',
          mimeType: 'image/jpeg',
          fileName: 'photo1.jpg',
          size: 2048,
        },
        {
          id: '2',
          type: 'image',
          content: 'image2data',
          mimeType: 'image/png',
          fileName: 'photo2.png',
          size: 4096,
        },
        {
          id: '3',
          type: 'file',
          content: 'pdf content',
          mimeType: 'application/pdf',
          fileName: 'report.pdf',
          size: 8192,
        },
      ];

      const message = buildUserMessage('Multiple files', attachments);

      expect(message.content).toHaveLength(4); // 1 text + 3 attachments
      expect(message.content[0].type).toBe('text');
      expect(message.content[1].type).toBe('image');
      expect(message.content[2].type).toBe('image');
      expect(message.content[3].type).toBe('file');
    });

    it('should default size to 0 when not provided', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          type: 'image',
          content: 'imagedata',
          mimeType: 'image/png',
          fileName: 'nosize.png',
        },
      ];

      const message = buildUserMessage('Test', attachments);

      expect(message.content[1]).toMatchObject({
        type: 'image',
        metadata: {
          size: 0,
        },
      });
    });

    it('should handle empty attachments array', () => {
      const message = buildUserMessage('No attachments', []);

      expect(message.content).toHaveLength(1);
      expect(message.content[0].type).toBe('text');
    });

    it('should handle undefined attachments', () => {
      const message = buildUserMessage('No attachments', undefined);

      expect(message.content).toHaveLength(1);
      expect(message.content[0].type).toBe('text');
    });
  });
});

describe('buildToolResultMessage', () => {
  const createToolCall = (name: string, args: Record<string, unknown>): AssistantToolCall => ({
    type: 'toolCall',
    name,
    arguments: args,
    toolCallId: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  });

  describe('successful execution', () => {
    it('should create a tool result message for successful execution', () => {
      const toolCall = createToolCall('calculator', { a: 1, b: 2 });
      const result: AgentToolResult<{ sum: number }> = {
        content: [{ type: 'text', content: 'Result: 3' }],
        details: { sum: 3 },
      };

      const message = buildToolResultMessage(toolCall, result, false);

      expect(message.role).toBe('toolResult');
      expect(message.id).toBeDefined();
      expect(message.toolCallId).toBe(toolCall.toolCallId);
      expect(message.toolName).toBe('calculator');
      expect(message.content).toEqual([{ type: 'text', content: 'Result: 3' }]);
      expect(message.details).toEqual({ sum: 3 });
      expect(message.isError).toBe(false);
      expect(message.error).toBeUndefined();
      expect(message.timestamp).toBeDefined();
    });

    it('should generate unique IDs for each message', () => {
      const toolCall = createToolCall('test', {});
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'ok' }],
        details: {},
      };

      const message1 = buildToolResultMessage(toolCall, result, false);
      const message2 = buildToolResultMessage(toolCall, result, false);

      expect(message1.id).not.toBe(message2.id);
    });

    it('should handle empty details', () => {
      const toolCall = createToolCall('simple', {});
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'Done' }],
        details: {},
      };

      const message = buildToolResultMessage(toolCall, result, false);

      expect(message.details).toEqual({});
    });

    it('should handle multiple content items', () => {
      const toolCall = createToolCall('multiOutput', {});
      const result: AgentToolResult<unknown> = {
        content: [
          { type: 'text', content: 'Part 1' },
          { type: 'text', content: 'Part 2' },
        ],
        details: {},
      };

      const message = buildToolResultMessage(toolCall, result, false);

      expect(message.content).toHaveLength(2);
    });
  });

  describe('error execution', () => {
    it('should create a tool result message for error execution', () => {
      const toolCall = createToolCall('failingTool', { input: 'bad' });
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'Error: Invalid input' }],
        details: {},
      };
      const errorDetails = {
        message: 'Invalid input',
        name: 'ValidationError',
      };

      const message = buildToolResultMessage(toolCall, result, true, errorDetails);

      expect(message.role).toBe('toolResult');
      expect(message.toolCallId).toBe(toolCall.toolCallId);
      expect(message.toolName).toBe('failingTool');
      expect(message.isError).toBe(true);
      expect(message.error).toEqual(errorDetails);
    });

    it('should include stack trace in error details when provided', () => {
      const toolCall = createToolCall('crashingTool', {});
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'Error occurred' }],
        details: {},
      };
      const errorDetails = {
        message: 'Something went wrong',
        name: 'Error',
        stack: 'Error: Something went wrong\n    at crashingTool (tool.js:10:5)',
      };

      const message = buildToolResultMessage(toolCall, result, true, errorDetails);

      expect(message.error?.stack).toBeDefined();
      expect(message.error?.stack).toContain('crashingTool');
    });

    it('should handle isError=true without errorDetails', () => {
      const toolCall = createToolCall('tool', {});
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'Failed' }],
        details: {},
      };

      const message = buildToolResultMessage(toolCall, result, true);

      expect(message.isError).toBe(true);
      expect(message.error).toBeUndefined();
    });
  });

  describe('preserves tool call information', () => {
    it('should preserve toolCallId from the original tool call', () => {
      const toolCall: AssistantToolCall = {
        type: 'toolCall',
        name: 'myTool',
        arguments: { key: 'value' },
        toolCallId: 'specific_call_id_12345',
      };
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'Result' }],
        details: {},
      };

      const message = buildToolResultMessage(toolCall, result, false);

      expect(message.toolCallId).toBe('specific_call_id_12345');
    });

    it('should preserve tool name from the original tool call', () => {
      const toolCall = createToolCall('specificToolName', {});
      const result: AgentToolResult<unknown> = {
        content: [{ type: 'text', content: 'Result' }],
        details: {},
      };

      const message = buildToolResultMessage(toolCall, result, false);

      expect(message.toolName).toBe('specificToolName');
    });
  });
});
