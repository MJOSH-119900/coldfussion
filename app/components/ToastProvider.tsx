'use client';
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
type ToastKind = 'success' | 'error' | 'warning' | 'info';
type ToastItem = {
    id: number;
    kind: ToastKind;
    title: string;
    message?: string;
};
type ConfirmOptions = {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
};
type ToastContextValue = {
    notify: (kind: ToastKind, message: string, title?: string) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
};
const ToastContext = createContext<ToastContextValue | null>(null);
let toastId = 0;
const styles: Record<ToastKind, {
    icon: string;
    shell: string;
    iconShell: string;
}> = {
    success: { icon: '✓', shell: 'border-emerald-200 bg-white', iconShell: 'bg-emerald-100 text-emerald-700' },
    error: { icon: '!', shell: 'border-rose-200 bg-white', iconShell: 'bg-rose-100 text-rose-700' },
    warning: { icon: '⚠', shell: 'border-amber-200 bg-white', iconShell: 'bg-amber-100 text-amber-700' },
    info: { icon: 'i', shell: 'border-blue-200 bg-white', iconShell: 'bg-blue-100 text-blue-700' },
};
export function ToastProvider({ children }: {
    children: ReactNode;
}) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [dialog, setDialog] = useState<(ConfirmOptions & {
        resolve: (value: boolean) => void;
    }) | null>(null);
    const dialogResolver = useRef<((value: boolean) => void) | null>(null);
    const notify = useCallback((kind: ToastKind, message: string, title?: string) => {
        const id = ++toastId;
        setToasts(current => [...current, { id, kind, title: title || ({ success: 'Success', error: 'Something went wrong', warning: 'Please check', info: 'Information' }[kind]), message }]);
        window.setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 4200);
    }, []);
    const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
        if (dialogResolver.current)
            dialogResolver.current(false);
        dialogResolver.current = resolve;
        setDialog({ ...options, resolve });
    }), []);
    const closeDialog = (answer: boolean) => {
        dialogResolver.current?.(answer);
        dialogResolver.current = null;
        setDialog(null);
    };
    return <ToastContext.Provider value={{ notify, confirm }}>
    {children}
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[390px] max-w-[calc(100vw-2rem)] flex-col gap-3 sm:right-6 sm:top-6">
      {toasts.map(toast => {
            const style = styles[toast.kind];
            return <div key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl shadow-slate-900/10 animate-[toast-in_.22s_ease-out] ${style.shell}`}>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${style.iconShell}`}>{style.icon}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-900">{toast.title}</p>{toast.message && <p className="mt-1 break-words text-sm leading-5 text-slate-600">{toast.message}</p>}</div>
          <button onClick={() => setToasts(current => current.filter(item => item.id !== toast.id))} aria-label="Dismiss notification" className="rounded-lg px-2 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
        </div>;
        })}
    </div>
    {dialog && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className={`mb-4 grid h-11 w-11 place-items-center rounded-full text-lg font-black ${dialog.danger ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'}`}>{dialog.danger ? '!' : '?'}</div>
        <h2 id="app-confirm-title" className="text-lg font-black text-slate-900">{dialog.title}</h2>
        <p id="app-confirm-message" className="mt-2 text-sm leading-6 text-slate-600">{dialog.message}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={() => closeDialog(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">{dialog.cancelText || 'Cancel'}</button>
          <button onClick={() => closeDialog(true)} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${dialog.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'}`}>{dialog.confirmText || 'Confirm'}</button>
        </div>
      </section>
    </div>}
  </ToastContext.Provider>;
}
export function useToast() {
    const context = useContext(ToastContext);
    if (!context)
        throw new Error('useToast must be used inside ToastProvider');
    return context;
}
