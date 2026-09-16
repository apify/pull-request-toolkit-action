export const PRODUCT_ENGINEERING_TEAM_SLUG = 'product-engineering';

export const LABELS = {
    ADHOC: 'adhoc',
    TESTED: 'tested',
} as const;

export const TEAM_LABEL_PREFIX = 't-';

export const TEAM_NAME_TO_LABEL: { [name: string]: string } = {
    Infrastructure: 't-infra',
};

// Project boards are found by the "<TEAM_NAME> Team Kanban" convention. A team whose board
// carries a different name needs an entry here, or its board is silently not found.
export const TEAM_NAME_TO_PROJECT_TITLE: { [name: string]: string } = {
    Web: 'Acquisition Team Kanban',
};
export const PROJECT_FIELD_NAMES = {
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

export const DEPENDABOT_USER = 'dependabot[bot]';

export const KNOWN_BOT_USERS: readonly string[] = [
    'apify-service-account',
    'github-actions[bot]',
    DEPENDABOT_USER,
    'renovate[bot]',
    'copilot',
];

// Excludes the team from correct linking and estimate checks.
export const SKIP_LINKING_AND_ESTIMATE_CHECKS_FOR_TEAMS: readonly string[] = ['Docs'];

export const LINKING_CHECK_RETRIES = 8;
export const LINKING_CHECK_DELAY_MILLIS = 15 * 1000;
