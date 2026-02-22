'use client';

import { ArrowUp, ChevronDown, Mic, Plus } from 'lucide-react';
import { useState } from 'react';

import { PromptInput, PromptInputActions, PromptInputTextarea } from './prompt-input';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const MODELS = [
  'GPT-5.3-Codex',
  'GPT-5.3',
  'GPT-4.1',
  'Claude Opus 4.6',
  'Claude Sonnet 4.6',
  'Gemini 2.5 Pro',
];

const REASONING_LEVELS = ['None', 'Low', 'Medium', 'High', 'Extra High'];

export function ThreadInput() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [selectedReasoning, setSelectedReasoning] = useState('Extra High');

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (trimmed === '') return;
    // TODO: send message
    setInput('');
  };

  return (
    <div className="bg-home-page absolute bottom-0 w-full px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-start pb-4">
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          className="w-full"
        >
          <PromptInputTextarea placeholder="Ask me anything..." />

          <PromptInputActions className="flex items-center justify-between pt-2">
            {/* Left side actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground hover:bg-home-hover flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
              >
                <Plus className="size-5" strokeWidth={1.8} />
              </button>

              {/* Model picker */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground hover:bg-home-hover flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[13px] transition-colors"
                  >
                    {selectedModel}
                    <ChevronDown className="size-3.5" strokeWidth={2} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  {MODELS.map((model) => (
                    <DropdownMenuItem
                      key={model}
                      onClick={() => setSelectedModel(model)}
                      className={cn('cursor-pointer', model === selectedModel && 'bg-accent')}
                    >
                      {model}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Reasoning level picker */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground hover:bg-home-hover flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[13px] transition-colors"
                  >
                    {selectedReasoning}
                    <ChevronDown className="size-3.5" strokeWidth={2} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[140px]">
                  {REASONING_LEVELS.map((level) => (
                    <DropdownMenuItem
                      key={level}
                      onClick={() => setSelectedReasoning(level)}
                      className={cn('cursor-pointer', level === selectedReasoning && 'bg-accent')}
                    >
                      {level}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors"
              >
                <Mic className="size-[18px]" strokeWidth={1.8} />
              </button>

              <Button
                variant="default"
                size="icon"
                className="h-8 w-8 cursor-pointer rounded-full"
                onClick={handleSubmit}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  );
}
