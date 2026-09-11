const MAX_RETRIES = 3;
const RETRY_BASE = 100; // base delay in milliseconds for retries

const NETWORK_ERROR_MESSAGE_PATTERNS = ['failed to fetch', 'terminated', 'network error', 'fetch failed'];

const isNetworkError = (error: unknown): boolean => {
    if (!(error instanceof TypeError)) {
        return false;
    }
    const message = error.message.toLowerCase();
    return NETWORK_ERROR_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
};

const isRetryableErrorStatus = (status: number): boolean => {
    return status === 429 || (status >= 500 && status <= 599);
};

export async function fetchWithRetry(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    for (let attempt = 0; attempt < MAX_RETRIES - 1; attempt++) {
        try {
            const response = await fetch(...args);
            if (!isRetryableErrorStatus(response.status)) {
                return response;
            }
        } catch (error) {
            if (!isNetworkError(error)) {
                throw error;
            }
        }
        const delay = RETRY_BASE * Math.pow(2, attempt) * (0.5 + Math.random());
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return await fetch(...args);
}
