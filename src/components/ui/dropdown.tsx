"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type DropdownProps = {
  trigger: ReactNode;
  children: ReactNode;
  menuClassName?: string;
};

export function Dropdown({ trigger, children, menuClassName }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div className="dropdown" ref={rootRef}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {trigger}
      </div>
      <div
        id={menuId}
        role="menu"
        className={`dropdown-menu${open ? " open" : ""}${menuClassName ? ` ${menuClassName}` : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
