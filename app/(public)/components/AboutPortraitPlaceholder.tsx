export default function AboutPortraitPlaceholder({ className = '', label = 'Profile photo placeholder' }: {
    className?: string;
    label?: string;
}) {
    return (
        <div role="img" aria-label={label} className={`relative grid place-items-center overflow-hidden bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-100 ${className}`}>
            <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-white/50 blur-2xl" />
            <div className="absolute -bottom-12 -right-8 h-48 w-48 rounded-full bg-violet-300/40 blur-2xl" />
            <svg aria-hidden="true" viewBox="0 0 160 180" fill="none" className="relative h-3/4 max-h-72 w-auto text-violet-500">
                <circle cx="80" cy="56" r="31" fill="currentColor" fillOpacity=".22" />
                <path d="M25 164c4-34 25-53 55-53s51 19 55 53" fill="currentColor" fillOpacity=".22" />
                <circle cx="80" cy="56" r="24" stroke="currentColor" strokeWidth="3" />
                <path d="M38 157c6-25 21-38 42-38s36 13 42 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <path d="M68 58h.1M92 58h.1M72 73c5 4 11 4 16 0" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <span className="absolute bottom-4 rounded-full border border-white/70 bg-white/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-violet-800 backdrop-blur">Your portrait</span>
        </div>
    );
}
