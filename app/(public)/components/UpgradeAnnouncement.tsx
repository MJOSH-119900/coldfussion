'use client';
import { useEffect, useState } from 'react';
import type { UpgradeAnnouncement as Announcement } from '../../../lib/announcements';

export default function UpgradeAnnouncement() {
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let active = true;
        const loadAnnouncement = async () => {
            const response = await fetch('/api/upgrade-announcement', { cache: 'no-store' });
            if (!response.ok)
                throw new Error('Could not load upgrade announcement.');
            const value = await response.json() as Announcement | null;
            if (!active)
                return;
            setAnnouncement(value);
            setDismissed(Boolean(value && sessionStorage.getItem('upgrade-announcement-dismissed') === value.updated_at));
        };
        void loadAnnouncement().catch(error => console.error(error));
        const interval = window.setInterval(() => {
            void loadAnnouncement().catch(error => console.error(error));
        }, 30000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);

    if (!announcement || dismissed)
        return null;

    return <aside role="status" className="relative z-40 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
      <div className="mx-auto flex max-w-7xl items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-black">{announcement.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{announcement.message}</p>
        </div>
        <button type="button" aria-label="Dismiss announcement" onClick={() => {
            sessionStorage.setItem('upgrade-announcement-dismissed', announcement.updated_at);
            setDismissed(true);
        }} className="rounded-lg px-2 py-1 text-lg font-bold hover:bg-amber-100">×</button>
      </div>
    </aside>;
}
