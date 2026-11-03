import { useLayoutEffect, useRef } from 'react';

const DIGITS = '0123456789';
const STAGGER_MS = 100;

type Props = { value: string; className?: string };

/** Renders a formatted value whose digits roll into place, one column after another, when it changes. */
export function RollingNumber({ value, className }: Props) {
  const previous = useRef<string | null>(null);
  const chars = [...value];

  // Columns are keyed from the right so the ones column keeps its identity when the value gains a digit.
  const prev = previous.current === null ? null : [...previous.current];
  let order = 0;
  const columns = chars.map((char, index) => {
    const fromRight = chars.length - index;
    const isDigit = DIGITS.includes(char);
    const changed = prev === null || prev[prev.length - fromRight] !== char;
    const delay = isDigit && changed ? order++ * STAGGER_MS : 0;
    return isDigit
      ? <DigitColumn key={`d${fromRight}`} digit={Number(char)} delayMs={delay} />
      : <span key={`c${fromRight}`} className="rolling-char">{char}</span>;
  });

  useLayoutEffect(() => { previous.current = value; }, [value]);

  return <span className={className ? `rolling-number ${className}` : 'rolling-number'}>
    <span className="rolling-number-text">{value}</span>
    <span aria-hidden="true">{columns}</span>
  </span>;
}

function DigitColumn({ digit, delayMs }: { digit: number; delayMs: number }) {
  const strip = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const element = strip.current;
    if (!element) return;
    // Flush the starting position on mount so new columns roll in from zero.
    if (!mounted.current) { void element.getBoundingClientRect(); mounted.current = true; }
    element.style.transitionDelay = `${delayMs}ms`;
    element.style.transform = `translateY(${-digit * 10}%)`;
  }, [digit, delayMs]);

  return <span className="rolling-digit">
    <span className="rolling-digit-sizer">{digit}</span>
    <span ref={strip} className="rolling-digit-strip">
      {[...DIGITS].map(char => <span key={char}>{char}</span>)}
    </span>
  </span>;
}
