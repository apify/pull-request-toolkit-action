import { fetchWithRetry } from './utils.ts';

const GITHUB_CONTROLLER_BASE_URL = 'https://platform-services--github-controller.apify.actor';

export class GitHubControllerActorClient {
    private apifyApiToken: string;

    constructor(apifyApiToken: string) {
        this.apifyApiToken = apifyApiToken;
    }

    public async call(method: 'GET', endpoint: string): Promise<any>;
    public async call(method: 'POST', endpoint: string, body?: any): Promise<any>;
    public async call(method: 'GET' | 'POST', endpoint: string, body?: any): Promise<any> {
        if (!endpoint.startsWith('/')) {
            endpoint = `/${endpoint}`;
        }

        const options: RequestInit = {
            method,
            headers: {
                Authorization: `Bearer ${this.apifyApiToken}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
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
