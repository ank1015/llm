"use client";

import {
  ArrowRight01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Loading01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";

import { TextShimmer } from "@/components/ai/text-shimmer";
import { CopyButton } from "@/components/copy-button";
import { ChatMarkdown } from "@/components/markdown-renderer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  getWorkingTraceFiles,
  getWorkingTraceImages,
  getWorkingTraceTextContent,
} from "@/lib/messages/working-trace";
import { cn } from "@/lib/utils";

import type {
  WorkingToolEntry,
  WorkingTraceItem,
  WorkingTraceModel,
} from "@/lib/messages/working-trace";

type WorkingTraceProps = {
  model: WorkingTraceModel;
  presentation: "streaming" | "completed";
  label: string;
};

const TRACE_MARKDOWN_CLASSNAME =
  "text-[13px] leading-relaxed [&_h1]:!my-0 [&_h1]:!text-[13px] [&_h1]:!font-medium [&_h1]:!leading-relaxed [&_h1]:!text-foreground/85 [&_h2]:!my-0 [&_h2]:!text-[13px] [&_h2]:!font-medium [&_h2]:!leading-relaxed [&_h2]:!text-foreground/85 [&_h3]:!my-0 [&_h3]:!text-[13px] [&_h3]:!font-medium [&_h3]:!leading-relaxed [&_h3]:!text-foreground/85 [&_h4]:!my-0 [&_h4]:!text-[13px] [&_h4]:!font-medium [&_h4]:!leading-relaxed [&_h4]:!text-foreground/85 [&_h5]:!my-0 [&_h5]:!text-[13px] [&_h5]:!font-medium [&_h5]:!leading-relaxed [&_h5]:!text-foreground/85 [&_h6]:!my-0 [&_h6]:!text-[13px] [&_h6]:!font-medium [&_h6]:!leading-relaxed [&_h6]:!text-foreground/85 [&_p]:!my-0 [&_p]:!text-[13px] [&_p]:!leading-relaxed [&_p]:!text-foreground/80 [&_ul]:!my-1.5 [&_ul]:!text-[13px] [&_ol]:!my-1.5 [&_ol]:!text-[13px] [&_li]:!text-[13px] [&_li]:!leading-relaxed [&_li]:!text-foreground/80";

function ContentScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("max-h-48 overflow-auto pr-2", className)}>{children}</div>;
}

function FileChip({ filename, mimeType }: { filename: string; mimeType: string }) {
  return (
    <div className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
      <span className="font-medium">{filename}</span>
      <span>{mimeType}</span>
    </div>
  );
}

function renderUnknownArgs(args: unknown): string | null {
  if (args === undefined) {
    return null;
  }

  if (typeof args === "string") {
    return args;
  }

  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return null;
  }
}

function getStringArg(args: unknown, key: string): string | null {
  if (typeof args !== "object" || args === null || !(key in args)) {
    return null;
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getToolPanelLabel(toolName: string): string {
  switch (toolName) {
    case "bash":
      return "Shell";
    case "ls":
      return "List";
    case "find":
      return "Find";
    case "grep":
      return "Grep";
    case "read":
      return "Read";
    case "write":
      return "Write";
    case "edit":
      return "Edit";
    default:
      return "Tool";
  }
}

function getToolCopyText(entry: WorkingToolEntry): string | null {
  const textContent = getWorkingTraceTextContent(entry.content);

  if (entry.toolName === "bash") {
    const command = getStringArg(entry.args, "command");
    const output = textContent || entry.errorText;
    const value = [command ? `$ ${command}` : null, output].filter(Boolean).join("\n\n").trim();
    return value.length > 0 ? value : null;
  }

  if (entry.toolName === "edit") {
    const diff =
      typeof entry.details === "object" && entry.details !== null && "diff" in entry.details
        ? (entry.details as { diff?: unknown }).diff
        : undefined;

    if (typeof diff === "string" && diff.trim().length > 0) {
      return diff;
    }

    const oldText = getStringArg(entry.args, "oldText");
    const newText = getStringArg(entry.args, "newText");
    const value = [
      oldText ? `Before\n${oldText}` : null,
      newText ? `After\n${newText}` : null,
      textContent || entry.errorText || null,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return value.length > 0 ? value : null;
  }

  if (entry.toolName === "write") {
    const content = getStringArg(entry.args, "content");
    const value = [content, textContent || entry.errorText || null]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return value.length > 0 ? value : null;
  }

  const value = (textContent || renderUnknownArgs(entry.args) || entry.errorText || "").trim();
  return value.length > 0 ? value : null;
}

function ToolPanelStatus({ status }: { status: WorkingToolEntry["status"] }) {
  if (status === "running") {
    return (
      <>
        <HugeiconsIcon
          icon={Loading01Icon}
          size={14}
          color="currentColor"
          strokeWidth={1.8}
          className="animate-spin"
        />
        <span>Running</span>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <HugeiconsIcon icon={Cancel01Icon} size={14} color="currentColor" strokeWidth={1.8} />
        <span className="text-[#FF6363]">Error</span>
      </>
    );
  }

  return (
    <>
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={14}
        color="currentColor"
        strokeWidth={1.8}
      />
      <span>Success</span>
    </>
  );
}

function ToolContentPreview({ entry }: { entry: WorkingToolEntry }) {
  const textContent = useMemo(() => getWorkingTraceTextContent(entry.content), [entry.content]);
  const images = useMemo(() => getWorkingTraceImages(entry.content), [entry.content]);
  const files = useMemo(() => getWorkingTraceFiles(entry.content), [entry.content]);

  if (entry.toolName === "bash") {
    const command = getStringArg(entry.args, "command");
    const bodyText = [command ? `$ ${command}` : null, textContent || entry.errorText || null]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    return (
      <ContentScroll>
        <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
          {bodyText || "(no output)"}
        </pre>
      </ContentScroll>
    );
  }

  if (entry.toolName === "edit") {
    const diff =
      typeof entry.details === "object" && entry.details !== null && "diff" in entry.details
        ? (entry.details as { diff?: unknown }).diff
        : undefined;

    if (typeof diff === "string" && diff.trim().length > 0) {
      return (
        <ContentScroll>
          <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
            {diff}
          </pre>
        </ContentScroll>
      );
    }

    const oldText =
      typeof entry.args === "object" && entry.args !== null && "oldText" in entry.args
        ? (entry.args as { oldText?: unknown }).oldText
        : undefined;
    const newText =
      typeof entry.args === "object" && entry.args !== null && "newText" in entry.args
        ? (entry.args as { newText?: unknown }).newText
        : undefined;

    return (
      <div className="space-y-2">
        {typeof oldText === "string" && oldText.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Before
            </p>
            <ContentScroll>
              <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                {oldText}
              </pre>
            </ContentScroll>
          </div>
        ) : null}
        {typeof newText === "string" && newText.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              After
            </p>
            <ContentScroll>
              <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                {newText}
              </pre>
            </ContentScroll>
          </div>
        ) : null}
        {textContent ? (
          <ContentScroll>
            <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
              {textContent}
            </pre>
          </ContentScroll>
        ) : null}
      </div>
    );
  }

  if (entry.toolName === "write") {
    const content =
      typeof entry.args === "object" && entry.args !== null && "content" in entry.args
        ? (entry.args as { content?: unknown }).content
        : undefined;

    return (
      <div className="space-y-2">
        {typeof content === "string" && content.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              Content
            </p>
            <ContentScroll>
              <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                {content}
              </pre>
            </ContentScroll>
          </div>
        ) : null}
        {textContent ? (
          <ContentScroll>
            <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
              {textContent}
            </pre>
          </ContentScroll>
        ) : null}
      </div>
    );
  }

  if (images.length > 0 || files.length > 0) {
    return (
      <div className="space-y-3">
        {textContent ? (
          <ContentScroll>
            <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
              {textContent}
            </pre>
          </ContentScroll>
        ) : null}
        {images.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map((image, index) => (
              <div key={`${entry.toolCallId}-image-${index}`} className="overflow-hidden rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${image.mimeType};base64,${image.data}`}
                  alt=""
                  className="max-h-40 w-full object-contain"
                />
              </div>
            ))}
          </div>
        ) : null}
        {files.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {files.map((file, index) => (
              <FileChip
                key={`${entry.toolCallId}-file-${index}`}
                filename={file.filename}
                mimeType={file.mimeType}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const bodyText = textContent || renderUnknownArgs(entry.args) || entry.errorText || "(no output)";

  return (
    <ContentScroll>
      <pre className="text-foreground/85 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
        {bodyText}
      </pre>
    </ContentScroll>
  );
}

function ToolTraceItem({ entry }: { entry: WorkingToolEntry }) {
  const [open, setOpen] = useState(false);
  const copyText = useMemo(() => getToolCopyText(entry), [entry]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="min-w-0 pb-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-[13px] transition-opacity hover:opacity-80"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{entry.title}</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.8}
              className={cn("text-muted-foreground shrink-0 transition-transform", open && "rotate-90")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2">
            <div className="bg-home-panel border-home-border overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between px-3 pt-2.5">
                <span className="text-muted-foreground text-xs font-medium tracking-wide">
                  {getToolPanelLabel(entry.toolName)}
                </span>
                {copyText ? <CopyButton text={copyText} /> : <div className="size-6" />}
              </div>
              <div className="px-3 py-2">
                <ToolContentPreview entry={entry} />
              </div>
              <div className="text-muted-foreground flex items-center justify-end gap-1.5 px-3 pb-2.5 text-xs">
                <ToolPanelStatus status={entry.status} />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function TraceContent({
  item,
  presentation,
}: {
  item: Exclude<WorkingTraceItem, WorkingToolEntry>;
  presentation: WorkingTraceProps["presentation"];
}) {
  if (presentation === "streaming") {
    if (item.type === "assistant_note") {
      return (
        <div className="min-w-0 pb-4">
          <ChatMarkdown enableArtifactFileLinks className="text-foreground">
            {item.body}
          </ChatMarkdown>
        </div>
      );
    }

    if (item.format === "markdown") {
      return (
        <div className="min-w-0 pb-4">
          <ChatMarkdown enableArtifactFileLinks className="text-foreground">
            {item.body}
          </ChatMarkdown>
        </div>
      );
    }

    return (
      <div className="min-w-0 pb-4">
        {item.title ? (
          <p className="text-foreground text-[15px] font-medium leading-[1.8]">{item.title}</p>
        ) : null}
        {item.body ? (
          <p className="text-foreground whitespace-pre-wrap text-[15px] leading-[1.8]">
            {item.body}
          </p>
        ) : null}
      </div>
    );
  }

  if (item.type === "assistant_note") {
    return (
      <div className="min-w-0 pb-4">
        <ChatMarkdown enableArtifactFileLinks className={TRACE_MARKDOWN_CLASSNAME}>
          {item.body}
        </ChatMarkdown>
      </div>
    );
  }

  if (item.format === "markdown") {
    return (
      <div className="min-w-0 pb-4">
        <ChatMarkdown enableArtifactFileLinks className={TRACE_MARKDOWN_CLASSNAME}>
          {item.body}
        </ChatMarkdown>
      </div>
    );
  }

  return (
    <div className="min-w-0 pb-4">
      {item.title ? (
        <p className="text-foreground/85 text-[13px] font-medium leading-relaxed">{item.title}</p>
      ) : null}
      {item.body ? (
        <p className="text-foreground/80 mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">
          {item.body}
        </p>
      ) : null}
    </div>
  );
}

function TraceItemView({
  item,
  presentation,
}: {
  item: WorkingTraceItem;
  presentation: WorkingTraceProps["presentation"];
}) {
  if (item.type === "tool") {
    return <ToolTraceItem entry={item} />;
  }

  return <TraceContent item={item} presentation={presentation} />;
}

function TraceItems({
  model,
  presentation,
}: {
  model: WorkingTraceModel;
  presentation: WorkingTraceProps["presentation"];
}) {
  if (model.items.length === 0) {
    return <p className="text-muted-foreground text-[12px]">No working details captured.</p>;
  }

  return (
    <div>
      {model.items.map((item) => (
        <TraceItemView key={item.id} item={item} presentation={presentation} />
      ))}
    </div>
  );
}

export function WorkingTrace({ model, presentation, label }: WorkingTraceProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (presentation === "streaming") {
    return (
      <div className="ml-[2%] max-w-[96%]">
        <div className="flex items-center gap-1 text-left text-sm">
          <TextShimmer className="cursor-default font-medium">{label}</TextShimmer>
        </div>
        <div className="pt-3">
          <TraceItems model={model} presentation={presentation} />
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="ml-[2%] max-w-[96%]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-left text-sm transition-opacity hover:opacity-80"
          >
            <TextShimmer className="font-medium" stop>
              {label}
            </TextShimmer>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.8}
              className={cn("text-muted-foreground shrink-0 transition-transform", isOpen && "rotate-90")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-3">
            <TraceItems model={model} presentation={presentation} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
