import { createHash } from 'crypto';

export type PasswordBreachStatus = 'safe' | 'breached' | 'unavailable';

export async function checkPasswordAgainstBreaches(password: string): Promise<PasswordBreachStatus> {
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);

    try {
        const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
            headers: {
                'Add-Padding': 'true',
                'User-Agent': 'TechFashionStore-Password-Check',
            },
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok)
            return 'unavailable';

        const entries = (await response.text()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (!entries.length)
            return 'unavailable';

        let isBreached = false;
        for (const entry of entries) {
            const match = /^([A-F0-9]{35}):(\d+)$/i.exec(entry);
            if (!match)
                return 'unavailable';
            if (match[1].toUpperCase() === suffix && Number(match[2]) > 0)
                isBreached = true;
        }
        return isBreached ? 'breached' : 'safe';
    }
    catch {
        return 'unavailable';
    }
}
