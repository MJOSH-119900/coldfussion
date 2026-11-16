import { readJson, updateJson } from './json-store';

export type UpgradeAnnouncement = {
    title: string;
    message: string;
    enabled: boolean;
    updated_at: string;
};

const EMPTY_ANNOUNCEMENT: UpgradeAnnouncement = {
    title: '',
    message: '',
    enabled: false,
    updated_at: '',
};

export async function getUpgradeAnnouncement(): Promise<UpgradeAnnouncement> {
    const settings = await readJson<Record<string, unknown>>('site_settings.json', {});
    const value = settings.upgrade_announcement;
    if (!value || typeof value !== 'object')
        return EMPTY_ANNOUNCEMENT;
    const announcement = value as Partial<UpgradeAnnouncement>;
    return {
        title: typeof announcement.title === 'string' ? announcement.title : '',
        message: typeof announcement.message === 'string' ? announcement.message : '',
        enabled: announcement.enabled === true,
        updated_at: typeof announcement.updated_at === 'string' ? announcement.updated_at : '',
    };
}

export async function saveUpgradeAnnouncement(title: string, message: string, enabled: boolean) {
    const normalizedTitle = title.trim();
    const normalizedMessage = message.trim();
    if (enabled && (!normalizedTitle || !normalizedMessage))
        throw new Error('Add a title and message before publishing the announcement.');
    if (normalizedTitle.length > 100)
        throw new Error('Announcement titles must be 100 characters or fewer.');
    if (normalizedMessage.length > 2000)
        throw new Error('Announcement messages must be 2,000 characters or fewer.');

    const announcement: UpgradeAnnouncement = {
        title: normalizedTitle,
        message: normalizedMessage,
        enabled,
        updated_at: new Date().toISOString(),
    };
    await updateJson<Record<string, unknown>>('site_settings.json', settings => ({
        ...settings,
        upgrade_announcement: announcement,
    }), {});
    return announcement;
}
