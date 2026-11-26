type QuantityStepperProps = {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseDisabled?: boolean;
  increaseDisabled?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  compact?: boolean;
};

export default function QuantityStepper({
  value,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
  increaseDisabled = false,
  decreaseLabel = 'Decrease quantity',
  increaseLabel = 'Increase quantity',
  compact = false,
}: QuantityStepperProps) {
  const buttonSize = compact ? 'h-11 w-11 sm:h-10 sm:w-10' : 'h-12 w-12 sm:h-10 sm:w-10';

  return (
    <div role="group" aria-label="Quantity controls" className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60">
      <button
        type="button"
        aria-label={decreaseLabel}
        onClick={onDecrease}
        disabled={decreaseDisabled}
        className={`${buttonSize} grid place-items-center rounded-full text-slate-600 transition hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 10h12" strokeLinecap="round" />
        </svg>
      </button>
      <output aria-live="polite" className="min-w-10 select-none text-center text-sm font-black tabular-nums text-slate-950">
        {value}
      </output>
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={onIncrease}
        disabled={increaseDisabled}
        className={`${buttonSize} grid place-items-center rounded-full bg-violet-700 text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 10h12M10 4v12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
