'use client';

import { useEffect, useRef, useState } from 'react';

export function useTypewriter(text: string, speed = 30): string {
  const [display, setDisplay] = useState(text);
  const prevRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current === text) return;
    prevRef.current = text;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    let i = 0;
    setDisplay('');

    const tick = (): void => {
      i++;
      setDisplay(text.slice(0, i));
      if (i < text.length) {
        timerRef.current = setTimeout(tick, speed);
      }
    };

    timerRef.current = setTimeout(tick, speed);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, speed]);

  return display;
}
