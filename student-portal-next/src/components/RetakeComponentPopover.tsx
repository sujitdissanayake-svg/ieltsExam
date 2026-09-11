"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

type ComponentName = "Listening" | "Reading" | "Writing";

const OPTIONS: ComponentName[] = ["Listening", "Reading", "Writing"];

function optionClassName(option: ComponentName) {
  switch (option) {
    case "Listening":
      return "bg-blue-50 hover:bg-blue-100";
    case "Reading":
      return "bg-emerald-50 hover:bg-emerald-100";
    case "Writing":
      return "bg-amber-50 hover:bg-amber-100";
  }
}

export function RetakeComponentPopover({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | undefined>(undefined);
  const buttonId = useId();
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = () => {
    const anchor = buttonRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const preferredWidth = 460;
    const minMargin = 12;

    let left = rect.right + 16;
    let top = rect.top;
    const width = Math.min(preferredWidth, window.innerWidth - minMargin * 2);

    // If it doesn't fit to the right, align it to the left edge of the anchor.
    if (left + width > window.innerWidth - minMargin) {
      left = rect.left;
    }

    // Clamp within viewport.
    left = Math.max(minMargin, Math.min(left, window.innerWidth - width - minMargin));
    top = Math.max(minMargin, Math.min(top, window.innerHeight - minMargin));

    setPopoverStyle({ left, top, width });
  };

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onReflow = () => updatePosition();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onPointerDown = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (e.target instanceof Node && !container.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);

    const raf = window.requestAnimationFrame(() => {
      // Second pass after render to better fit height.
      const el = popoverRef.current;
      if (!el) return;
      const h = el.getBoundingClientRect().height;

      setPopoverStyle((prev) => {
        if (!prev) return prev;
        const minMargin = 12;
        const previousTop = typeof prev.top === "number" ? prev.top : 0;
        const clampedTop = Math.max(minMargin, Math.min(previousTop, window.innerHeight - h - minMargin));
        return { ...prev, top: clampedTop };
      });
    });

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
      window.cancelAnimationFrame(raf);
    };
  }, [open]);

  const onSelect = (component: ComponentName) => {
    // Demo portal: selection just closes the pop-out.
    // Wire navigation / action later if needed.
    void component;
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(180deg,#eef5ff_0%,#dfeeff_100%)] px-4 py-2.5 text-center text-sm font-bold text-blue-900 transition hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#e3f0ff_0%,#d5e8ff_100%)]"
      >
        {title}
      </button>

      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-labelledby={buttonId}
          style={popoverStyle}
          className="fixed z-50 mt-0 rounded-lg border-2 border-[#DA2C43] bg-slate-50 p-4 shadow-sm"
        >
          <p className="text-sm font-semibold text-slate-900">Select component</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSelect(opt)}
                className={`rounded-md border border-slate-200 px-3 py-4 text-center text-sm font-semibold ${optionClassName(opt)}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
