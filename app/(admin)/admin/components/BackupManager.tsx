'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../../../components/ToastProvider';

const MAX_BACKUP_SIZE = 100 * 1024 * 1024;

export default function BackupManager() {
    const [file, setFile] = useState<File | null>(null);
    const [restoring, setRestoring] = useState(false);
    const { notify, confirm } = useToast();
    const router = useRouter();

    async function restoreBackup() {
        if (!file) {
            notify('error', 'Choose a ZIP backup file first.', 'No backup selected');
            return;
        }
        if (file.size > MAX_BACKUP_SIZE) {
            notify('error', 'Backup files must be smaller than 100 MB.', 'Backup too large');
            return;
        }
        const accepted = await confirm({
            title: 'Restore this backup?',
            message: 'This replaces current store data and uploaded media. Existing reset links will be revoked and all users will need to sign in again.',
            confirmText: 'Restore backup',
            cancelText: 'Cancel',
            danger: true,
        });
        if (!accepted)
            return;

        setRestoring(true);
        try {
            const response = await fetch('/api/admin/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/zip' },
                body: file,
            });
            const result = await response.json() as { success?: boolean; error?: string; dataFiles?: number; uploadFiles?: number };
            if (!response.ok || !result.success)
                throw new Error(result.error || 'Backup restore failed.');
            setFile(null);
            notify('success', `Restored ${result.dataFiles} data files and ${result.uploadFiles} uploads. Sign in again to continue.`, 'Backup restored');
            router.push('/admin/login');
            router.refresh();
        }
        catch (error) {
            notify('error', error instanceof Error ? error.message : 'Backup restore failed.', 'Restore failed');
        }
        finally {
            setRestoring(false);
        }
    }

    return <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Backup and restore</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Download a ZIP containing store data and uploaded media, or restore from a backup created here. Backups include account password hashes and must be kept private.</p>
      <a href="/api/admin/backup" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700">Download full backup</a>
      <div className="mt-8 border-t border-slate-200 pt-6">
        <h3 className="font-black">Restore a backup</h3>
        <p className="mt-1 text-sm text-slate-500">Restore replaces store data and uploads. Each JSON data file is backed up before replacement.</p>
        <input type="file" accept=".zip,application/zip" onChange={event => setFile(event.target.files?.[0] || null)} className="mt-4 block w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"/>
        {file && <p className="mt-2 text-xs text-slate-500">{file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
        <button type="button" disabled={!file || restoring} onClick={() => void restoreBackup()} className="mt-4 rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm font-bold text-red-700 disabled:opacity-50">{restoring ? 'Restoring…' : 'Restore selected backup'}</button>
      </div>
    </section>;
}
