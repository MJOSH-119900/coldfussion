'use client';
import { useEffect, useState } from 'react';
import { getUpgradeAnnouncementAction, saveUpgradeAnnouncementAction } from '../actions';
import { useToast } from '../../../components/ToastProvider';
import type { UpgradeAnnouncement } from '../../../../lib/announcements';

const EMPTY_ANNOUNCEMENT: UpgradeAnnouncement = {
    title: '',
    message: '',
    enabled: false,
    updated_at: '',
};

export default function UpgradeAnnouncementManager() {
    const [announcement, setAnnouncement] = useState(EMPTY_ANNOUNCEMENT);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { notify } = useToast();

    useEffect(() => {
        let active = true;
        getUpgradeAnnouncementAction().then(value => {
            if (active)
                setAnnouncement(value);
        }).catch(error => {
            notify('error', error instanceof Error ? error.message : 'Could not load the announcement.', 'Announcement loading failed');
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => { active = false; };
    }, [notify]);

    async function save(enabled: boolean) {
        setSaving(true);
        try {
            const result = await saveUpgradeAnnouncementAction(announcement.title, announcement.message, enabled);
            if (!result.success || !result.announcement) {
                notify('error', result.error || 'Could not save the announcement.', 'Announcement not saved');
                return;
            }
            setAnnouncement(result.announcement);
            notify('success', enabled ? 'The upgrade message is now visible to shoppers and vendors.' : 'The upgrade message has been unpublished.', 'Announcement saved');
        }
        catch (error) {
            notify('error', error instanceof Error ? error.message : 'Could not save the announcement.', 'Announcement not saved');
        }
        finally {
            setSaving(false);
        }
    }

    return <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-black">Upgrade announcement</h2>
      <p className="mt-1 text-sm text-slate-500">Publish an in-app notice shown on the storefront and vendor dashboard. This does not send email or SMS.</p>
      {loading ? <p className="mt-5 text-sm text-slate-500">Loading announcement…</p> : <>
        <label className="mt-5 block text-sm font-semibold">Title<input maxLength={100} value={announcement.title} onChange={event => setAnnouncement(current => ({ ...current, title: event.target.value }))} placeholder="Store upgrade notice" className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
        <label className="mt-4 block text-sm font-semibold">Message<textarea maxLength={2000} rows={5} value={announcement.message} onChange={event => setAnnouncement(current => ({ ...current, message: event.target.value }))} placeholder="Let shoppers and vendors know what is changing…" className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
        <p className="mt-1 text-xs text-slate-500">{announcement.message.length}/2,000 characters</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled={saving} onClick={() => void save(true)} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Publish announcement'}</button>
          <button type="button" disabled={saving} onClick={() => void save(false)} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold disabled:opacity-50">Unpublish</button>
        </div>
      </>}
    </section>;
}
