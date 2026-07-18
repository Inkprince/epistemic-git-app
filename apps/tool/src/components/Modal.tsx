import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal shell: overlay + card + focus management. Tab is trapped inside, Escape closes,
 * and focus returns to the element that opened it. Every app modal renders through this.
 */
export function Modal({
  onClose, ariaLabel, children, width, closeOnOverlay = true,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
  width?: number;
  closeOnOverlay?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const card = cardRef.current;
    // Focus the first focusable control (or the card itself) unless a child already claimed focus.
    if (card && !card.contains(document.activeElement)) {
      const first = card.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? card).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !card) return;
      const nodes = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hasAttribute("disabled"));
      if (nodes.length === 0) return;
      const firstNode = nodes[0]!;
      const lastNode = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style: CSSProperties | undefined = width ? { width: `min(${width}px, 100%)` } : undefined;
  return (
    <div className="modal-overlay" onClick={closeOnOverlay ? onClose : undefined}>
      <div
        ref={cardRef}
        className="modal-card"
        {...(style ? { style } : {})}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
);
}
