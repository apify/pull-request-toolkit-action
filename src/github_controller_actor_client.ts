import { fetchWithRetry } from './utils.ts';

const GITHUB_CONTROLLER_BASE_URL = 'https://platform-services--github-controller.apify.actor';

export class GitHubControllerActorClient {
    private apifyApiToken: string;

    constructor(apifyApiToken: string) {
        this.apifyApiToken = apifyApiToken;
    }

    public async call(method: string, endpoint: string): Promise<any> {
        if (!endpoint.startsWith('/')) {
            endpoint = `/${endpoint}`;
        }

        const options = {
            method,
            headers: {
                Authorization: `Bearer ${this.apifyApiToken}`,
            },
        };
        const url = `${GITHUB_CONTROLLER_BASE_URL}${endpoint}`;
        const response = await fetchWithRetry(url, options);
        if (!response.ok) {
            throw new Error(
                `Request to ${url} failed with status ${response.status} and body: ${await response.text()} `,
            );
        }
        return response.json();
    }
}
