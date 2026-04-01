"use client";

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

type PromptInputContextType = {
  isLoading: boolean;
  value: string;
  setValue: (value: string) => void;
  maxHeight: number | string;
  onSubmit?: () => void;
  disabled?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

const PromptInputContext = createContext<PromptInputContextType>({
  isLoading: false,
  value: "",
  setValue: () => {},
  maxHeight: 240,
  onSubmit: undefined,
  disabled: false,
  textareaRef: React.createRef<HTMLTextAreaElement>(),
});

function usePromptInput() {
  return useContext(PromptInputContext);
}

export type PromptInputProps = {
  isLoading?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  maxHeight?: number | string;
  onSubmit?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
} & React.ComponentProps<"div">;

function PromptInput({
  className,
  isLoading = false,
  maxHeight = 240,
  value,
  onValueChange,
  onSubmit,
  children,
  disabled = false,
  onClick,
  ...props
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(value || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
    onClick?.(event);
  };

  return (
    <PromptInputContext.Provider
      value={{
        isLoading,
        value: value ?? internalValue,
        setValue: onValueChange ?? handleChange,
        maxHeight,
        onSubmit,
        disabled,
        textareaRef,
      }}
    >
      <div
        onClick={handleClick}
        className={cn(
          "border-home-border bg-home-input cursor-text rounded-3xl border p-2 shadow-xs",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  );
}

export type PromptInputTextareaProps = {
  disableAutosize?: boolean;
} & React.ComponentProps<"textarea">;

const PromptInputTextarea = forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  function PromptInputTextarea(
    {
      className,
      onChange,
      onKeyDown,
      disableAutosize = false,
      ...props
    },
    forwardedRef,
  ) {
    const { value, setValue, maxHeight, onSubmit, disabled, textareaRef } = usePromptInput();

    const adjustHeight = useCallback(
      (element: HTMLTextAreaElement | null) => {
        if (!element || disableAutosize) {
          return;
        }

        element.style.height = "auto";
        if (typeof maxHeight === "number") {
          element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
        } else {
          element.style.height = `min(${element.scrollHeight}px, ${maxHeight})`;
        }
      },
      [disableAutosize, maxHeight],
    );

    useLayoutEffect(() => {
      adjustHeight(textareaRef.current);
    }, [adjustHeight, textareaRef, value]);

    const handleRef = (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element;
      if (typeof forwardedRef === "function") {
        forwardedRef(element);
      } else if (forwardedRef) {
        forwardedRef.current = element;
      }
      adjustHeight(element);
    };

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      adjustHeight(event.target);
      setValue(event.target.value);
      onChange?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSubmit?.();
      }
    };

    return (
      <textarea
        ref={handleRef}
        {...props}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={cn(
          "text-foreground min-h-[44px] w-full resize-none border-none bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
          className,
        )}
        rows={1}
        disabled={disabled}
      />
    );
  },
);

PromptInputTextarea.displayName = "PromptInputTextarea";

export type PromptInputActionsProps = React.HTMLAttributes<HTMLDivElement>;

function PromptInputActions({ children, className, ...props }: PromptInputActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {children}
    </div>
  );
}

export { PromptInput, PromptInputTextarea, PromptInputActions };
