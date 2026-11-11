import React, { useEffect, useRef } from 'react';
import { CloseIcon } from '../icons.jsx';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ModalDialog({
  open,
  onClose,
  title,
  eyebrow,
  variant = 'modal', // 'modal' | 'drawer' | 'palette'
  initialFocusRef,
  children
}) {
  const containerRef = useRef(null);
  const returnFocusRef = useRef(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;

    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (containerRef.current) {
        const first = containerRef.current.querySelector(FOCUSABLE_SELECTOR);
        if (first) first.focus();
        else containerRef.current.focus();
      }
    }, 10);

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab' && containerRef.current) {
        const nodes = Array.from(containerRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
        if (nodes.length === 0) {
          e.preventDefault();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (returnFocusRef.current && typeof returnFocusRef.current.focus === 'function') {
        returnFocusRef.current.focus();
      }
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className={`overlay-backdrop overlay-${variant}`}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`overlay-surface surface-${variant}`}
      >
        <div className="overlay-header">
          <div>
            {eyebrow && <span className="eyebrow-tag">{eyebrow}</span>}
            <h2 id={titleId} className="overlay-title">{title}</h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="overlay-body">
          {children}
        </div>
      </div>
    </div>
  );
}
