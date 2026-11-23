export interface ProductPermissionPolicy {
    mainCategory: string;
    subcategory: string;
    initialPermissionAvailable: boolean;
}

export interface ProductPermissionRequest {
    requestId: string;
    mainCategory: string;
    subcategory: string;
    productName: string;
    productDescription: string;
    status: string;
    fulfilledAt: string | null;
}

export interface ProductPermissionSubmission {
    category: string;
    subcategory: string;
    title: string;
    description: string;
}

export type ProductPermissionDecision =
    | { allowed: true; grant: { type: 'initial' } | { type: 'request'; requestId: string } }
    | { allowed: false; error: string };

function normalizeText(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function matchesApprovedProductRequest(
    request: Pick<ProductPermissionRequest, 'mainCategory' | 'subcategory' | 'productName' | 'productDescription'>,
    submission: ProductPermissionSubmission,
) {
    return request.mainCategory === submission.category &&
        request.subcategory === submission.subcategory &&
        normalizeText(request.productName) === normalizeText(submission.title) &&
        normalizeText(request.productDescription) === normalizeText(submission.description);
}

export function authorizeVendorProductSubmission(
    policy: ProductPermissionPolicy | null,
    approvedRequests: ProductPermissionRequest[],
    submission: ProductPermissionSubmission,
    requestId?: string,
): ProductPermissionDecision {
    if (!policy) {
        return { allowed: false, error: 'Your vendor account has no product upload policy. Contact an administrator.' };
    }

    if (requestId) {
        const request = approvedRequests.find(item => item.requestId === requestId);
        if (!request || request.status !== 'approved' || request.fulfilledAt) {
            return { allowed: false, error: 'This product approval is no longer available.' };
        }
        return matchesApprovedProductRequest(request, submission)
            ? { allowed: true, grant: { type: 'request', requestId: request.requestId } }
            : { allowed: false, error: 'Product name, description, category, and subcategory must match the approved request.' };
    }

    if (policy.initialPermissionAvailable) {
        const matches = policy.mainCategory === submission.category && policy.subcategory === submission.subcategory;
        return matches
            ? { allowed: true, grant: { type: 'initial' } }
            : { allowed: false, error: 'Your first product must match the category and subcategory selected during registration.' };
    }

    return { allowed: false, error: 'No product upload permission remains. Request approval for another specific product.' };
}
