export {};

declare module '@ank1015/llm-agents' {
  export function createTurnCompactionPrompt(): string;
  export function createUltraCompactionPrompt(): string;
  export function createOngoingTurnCompactionPrompt(): string;
}
