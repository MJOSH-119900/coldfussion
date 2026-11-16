import { PasswordResetCompleteForm } from '../../components/PasswordSecurity';

export default async function PasswordResetCompletePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    return <PasswordResetCompleteForm token={token || ''}/>;
}
