import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Keep in sync with the expandable transitions in motion.css.
const OPEN_MS = 350;
const CLOSE_MS = 260;

// opening: collapsed, about to grow · open: growing · settled: full height, overflow visible · closing: shrinking
type Phase = 'closed' | 'opening' | 'open' | 'settled' | 'closing';

type Props = {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
};

/** Expands to its content height (fast, then slow) and keeps its last content mounted while collapsing. */
export function Expandable({ open, children, id, className }: Props) {
  const [phase, setPhase] = useState<Phase>(open ? 'settled' : 'closed');
  const lastChildren = useRef(children);
  if (open) lastChildren.current = children;

  if (open && (phase === 'closed' || phase === 'closing')) setPhase('opening');
  if (!open && phase !== 'closed' && phase !== 'closing') setPhase('closing');

  useEffect(() => {
    if (phase === 'opening') {
      // Let the collapsed state paint before transitioning to full height.
      let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setPhase('open')); });
      return () => cancelAnimationFrame(frame);
    }
    const next = phase === 'open' ? 'settled' : phase === 'closing' ? 'closed' : null;
    if (!next) return;
    const timer = window.setTimeout(() => setPhase(next), phase === 'open' ? OPEN_MS : CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'closed') return null;
  const classes = ['expandable', (phase === 'open' || phase === 'settled') && 'expanded',
    phase === 'settled' && 'settled', className].filter(Boolean).join(' ');
  return <div className={classes} id={id} inert={phase === 'closing' || undefined}>
    <div className="expandable-content">{open ? children : lastChildren.current}</div>
  </div>;
}
