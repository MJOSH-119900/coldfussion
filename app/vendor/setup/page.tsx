import { PasswordResetCompleteForm, VendorSetupLinkRecovery } from '../../components/PasswordSecurity';
import { createSupabaseServerClient } from '../../../server/supabase';
import VendorSetupEntry from './VendorSetupEntry';

export default async function VendorAccountSetupPage({ searchParams }: { searchParams: Promise<{ authError?: string; token?: string }> }) {
    const { authError } = await searchParams;
    if (authError === 'invalid-link') return <VendorSetupLinkRecovery />;
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return <VendorSetupEntry email={user?.email || ''}/>;
}
