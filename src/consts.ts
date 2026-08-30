export const PRODUCT_ENGINEERING_TEAM_SLUG = 'product-engineering';

export const TEAM_LABEL_PREFIX = 't-';

export const TEAM_NAME_TO_LABEL: { [name: string]: string } = {
    Infrastructure: 't-infra',
};
export const TESTED_LABEL_NAME = 'tested';

export const FIELD_NAMES = {
    ESTIMATE: 'Estimate',
    SPRINT: 'Sprint',
    STATUS: 'Status',
} as const;

export const STATUS_FIELD_VALUES = {
    NEW_ISSUES: 'New Issues',
    ICEBOX: 'Icebox',
    PRE_BACKLOG: 'Pre-Backlog',
    BACKLOG: 'Backlog',
    IN_PROGRESS: 'In Progress',
    PULL_REQUEST: 'Pull Request',
    CLOSED: 'Closed',
} as const;

export const KNOWN_BOT_USERS: readonly string[] = [
    'apify-service-account',
    'github-actions[bot]',
    'dependabot[bot]',
    'renovate[bot]',
    'copilot',
];

// Excludes the team from correct linking and estimate checks.
export const SKIP_LINKING_AND_ESTIMATE_CHECKS_FOR_TEAMS: readonly string[] = ['Docs'];

export const LINKING_CHECK_RETRIES = 8;
export const LINKING_CHECK_DELAY_MILLIS = 15 * 1000;
