import * as core from '@actions/core';
import { type getOctokit } from '@actions/github';
import { Context } from '@actions/github/lib/context.d';
import { components } from '@octokit/openapi-types/types.d';
import axios from 'axios';

import {
    ORGANIZATION,
    PARENT_TEAM_SLUG,
    TEAM_NAME_TO_LABEL,
    ZENHUB_WORKSPACE_ID,
    ZENHUB_WORKSPACE_NAME,
} from './consts';

type Milestone = components['schemas']['milestone'];
type PullRequest = components['schemas']['pull-request'];

type OctokitType = ReturnType<typeof getOctokit>;

type ZenhubRepo = {
    id: number,
    name: string,
    gh_id: number,
};

type ZenhubIssue = {
    id: number,
    type: string,
    state: string,
    title: string,
    number: number,
}

type ZenhubIssueWithRepo = ZenhubIssue & {
    repo: ZenhubRepo,
}

export type ZenhubTimelineItem = {
    id: string,
    type: string,
    createdAt: Date,
    issue: object,
    data: {
        issue: ZenhubIssue,
        repository: ZenhubRepo,
        issue_repository: ZenhubRepo,
    },
};

/**
 * Iterates over child teams of a team PARENT_TEAM_SLUG and returns team name where user belongs to.
 */
export async function findUsersTeamName(orgOctokit: OctokitType, userLogin: string): Promise<string | null> {
    const { data: childTeams } = await orgOctokit.rest.teams.listChildInOrg({
        org: ORGANIZATION,
        team_slug: PARENT_TEAM_SLUG,
    });
    if (!childTeams.length) throw new Error('No child teams found!');

    let teamName = null;
    for (const childTeam of childTeams) {
        const { data: members } = await orgOctokit.rest.teams.listMembersInOrg({
            org: ORGANIZATION,
            team_slug: childTeam.slug,
        });

        const isMember = members.some((member) => member?.login === userLogin);
        if (isMember) {
            teamName = childTeam.name;
            break;
        }
    }

    return teamName;
}

/**
 * Finds a current milestone for a given team.
 * Milestone name must contain a team name and have correct start and end dates.
 */
export function findCurrentTeamMilestone(milestones: Milestone[], teamName: string): Milestone {
    const now = new Date();

    // All open milestones
    const openMilestones: Milestone[] = milestones.filter((milestone: Milestone) => {
        return milestone.state === 'open'
            && milestone.due_on
            && new Date(milestone.due_on) >= now;
    });

    // Find milestone for the team, if team name was provided
    const teamNameRegExp = new RegExp(teamName, 'i');
    const foundMilestone = openMilestones.find((milestone: Milestone) => {
        return milestone.title.match(teamNameRegExp);
    });
    if (!foundMilestone) throw new Error(`Cannot find milestone for "${teamName}" team`);

    return foundMilestone;
}

/**
 * Configures PR assignee to be the same as PR creater.
 */
export async function assignPrCreator(context: Context, octokit: OctokitType, pullRequest: PullRequest): Promise<void> {
    const assignees = pullRequest.assignees || [];
    const assigneeLogins = ([pullRequest.user].concat(assignees)).map((u) => u?.login).filter((login): login is string => !!login);

    // Assign pull request with PR creator
    await octokit.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        assignees: assigneeLogins,
    });
}

/**
 * If milestone is not set then sets it to a current milestone of a given team.
 */
export async function fillCurrentMilestone(context: Context, octokit: OctokitType, pullRequest: PullRequest, teamName: string): Promise<string> {
    // Assign PR to right sprint milestone
    const { data: milestones } = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
        owner: context.repo.owner,
        repo: context.repo.repo,
    });
    if (milestones.length === 0) await fail(pullRequest, 'No sprint milestone!');

    const foundMilestone = findCurrentTeamMilestone(milestones, teamName);
    if (!foundMilestone) await fail(pullRequest, 'Cannot find current sprint milestone!');

    await octokit.rest.issues.update({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        milestone: foundMilestone.number,
    });

    return foundMilestone.title;
}

/**
 * Converts team name into a label name (t-platform).
 * Custom mappings can be defined in TEAM_NAME_TO_LABEL constant.
 */
export function getTeamLabelName(teamName: string): string {
    return TEAM_NAME_TO_LABEL[teamName] || `t-${teamName.toLowerCase()}`;
}

/**
 * Assigns team label to the pull request.
 */
export async function addTeamLabel(context: Context, octokit: OctokitType, pullRequest: PullRequest, teamName: string): Promise<void> {
    const teamLabelName = getTeamLabelName(teamName);

    const { data: labels } = await octokit.rest.issues.listLabelsForRepo({
        owner: context.repo.owner,
        repo: context.repo.repo,
        per_page: 100, // Max
    });

    const isExistingLabel = labels.some((existingLabel: { name: string }) => existingLabel.name === teamLabelName);
    if (!isExistingLabel) await fail(pullRequest, `Team label "${teamLabelName}" of team ${teamName} does not exists!`);

    await octokit.rest.issues.addLabels({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequest.number,
        labels: [teamLabelName],
    });
}

/**
 * Sends a query to ZenHub GraphQL API server using Axios client.
 */
async function queryZenhubGraphql(operationName: string, query: string, variables: object) {
    const zenhubToken = core.getInput('zenhub-token');

    return axios({
        method: 'post',
        url: 'https://api.zenhub.com/public/graphql',
        headers: {
            Authorization: `Bearer ${zenhubToken}`,
        },
        data: { query, variables, operationName },
    });
}

const ZENHUB_PR_DETAILS_QUERY = `
query getIssueInfo($repositoryGhId: Int!, $issueNumber: Int!) {
    issueByInfo(repositoryGhId: $repositoryGhId, issueNumber: $issueNumber) {
        id
        repository {
            id
            ghId
        }
        number
        title
        body
        state
        timelineItems(first: 100) {
            nodes {
                type: key
                id
                data
                createdAt
            }
        }
        estimate {
            value
        }
    }
}
`;

const ZENHUB_ISSUE_ESTIMATE_QUERY = `
query getIssueInfo($repositoryGhId: Int!, $issueNumber: Int!) {
    issueByInfo(repositoryGhId: $repositoryGhId, issueNumber: $issueNumber) {
        estimate {
            value
        }
    }
}
`;

const ZENHUB_WORKSPACE_REPOSITORIES_QUERY = `
query getWorkspaceRepositories($workspaceName: String!, $endCursor: String) {
    viewer {
      id
      searchWorkspaces(query: $workspaceName) {
          nodes {
              id
              name
              repositoriesConnection(first: 100, after: $endCursor) {
                  nodes {
                      id
                      name
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
              }
          }
      }
    }
}
`;

/**
 * Checks if the repository is included in the ZenHub workspace defined by ZENHUB_WORKSPACE_NAME.
 */
export async function isRepoIncludedInZenHubWorkspace(repositoryName: string): Promise<boolean> {
    const repositories = [];
    let pageInfo;

    do {
        const response = await queryZenhubGraphql('getWorkspaceRepositories', ZENHUB_WORKSPACE_REPOSITORIES_QUERY, {
            workspaceName: ZENHUB_WORKSPACE_NAME,
            endCursor: pageInfo?.endCursor,
        });

        if (response.data.data.viewer.searchWorkspaces.nodes.length === 0) {
            throw new Error(`Workspace ${ZENHUB_WORKSPACE_NAME} was not found!`);
        }

        const { repositoriesConnection } = response.data.data.viewer.searchWorkspaces.nodes[0];
        const repos = repositoriesConnection.nodes;
        pageInfo = repositoriesConnection.pageInfo as { endCursor: string, hasNextPage: boolean };

        repositories.push(...repos);
    } while (pageInfo.hasNextPage);

    return repositories.map((repo) => repo.name).includes(repositoryName);
}

/**
 * Makes sure that:
 * - PR either has issue or epic linked or has `adhoc` label
 * - either PR or linked issue has estimate
 */
export async function ensureCorrectLinkingAndEstimates(pullRequest: PullRequest): Promise<void> {
    const pullRequestGraphqlResponse = await queryZenhubGraphql('getIssueInfo', ZENHUB_PR_DETAILS_QUERY, {
        repositoryGhId: pullRequest.head.repo?.id,
        issueNumber: pullRequest.number,
        workspaceId: ZENHUB_WORKSPACE_ID,
    });

    const pullRequestEstimate = pullRequestGraphqlResponse.data.data.issueByInfo.estimate?.value;
    const linkedIssue = getLinkedIssue(pullRequestGraphqlResponse.data.data.issueByInfo.timelineItems.nodes);
    const linkedEpics = getLinkedEpics(pullRequestGraphqlResponse.data.data.issueByInfo.timelineItems.nodes);

    if (
        !linkedIssue
        && linkedEpics.length === 0
        && !pullRequest.labels.some(({ name }) => name === 'adhoc')
    ) await fail(pullRequest, 'Pull request is neither linked to an issue or epic nor labeled as adhoc!');

    if (!linkedIssue && !pullRequestEstimate) {
        await fail(pullRequest, 'If issue is not linked to the pull request then estimate the pull request in Zenhub!');
    }
    if (!linkedIssue) return;

    const issueGraphqlResponse = await queryZenhubGraphql('getIssueInfo', ZENHUB_ISSUE_ESTIMATE_QUERY, {
        repositoryGhId: linkedIssue.repo.gh_id,
        issueNumber: linkedIssue.number,
        workspaceId: ZENHUB_WORKSPACE_ID,
    });
    const issueEstimate = issueGraphqlResponse.data.data.issueByInfo.estimate?.value;

    if (!pullRequestEstimate && !issueEstimate) await fail(pullRequest, 'None of the pull request and linked issue has estimate');
}

/**
 * Adds a comment describing what is wrong with the pull request setup and then fails the action.
 * Comment is not send if isDryRun=true. Only error is thrown in such case.
 */
export async function fail(pullRequest: PullRequest, errorMessage: string): Promise<void> {
    if (!pullRequest.head.repo) throw new Error('Unknown repo!');

    throw new Error(errorMessage);
}

/**
 * Processes a track record of ZenHub events for a PR and returns an issue that is currently linked to the PR.
 */
export function getLinkedIssue(timelineItems: ZenhubTimelineItem[]): ZenhubIssueWithRepo | undefined {
    const connectPrTimelineItems = timelineItems.filter(
        (item) => ['issue.disconnect_pr_from_issue', 'issue.connect_pr_to_issue'].includes(item.type),
    );
    connectPrTimelineItems.sort((a, b) => (new Date(a.createdAt).getTime()) - (new Date(b.createdAt).getTime()));

    const lastItem = connectPrTimelineItems.pop();
    if (!lastItem || lastItem.type as string === 'issue.disconnect_pr_from_issue') return;

    return {
        ...lastItem.data.issue,
        repo: lastItem.data.issue_repository,
    };
}

/**
 * Processes a track record of ZenHub events for a PR and returns a list of epics that are currently linked to the PR.
 */
export function getLinkedEpics(timelineItems: ZenhubTimelineItem[]): ZenhubIssue[] {
    const connectEpicTimelintItems = timelineItems.filter(
        (item) => ['issue.remove_issue_from_epic', 'issue.add_issue_to_epic'].includes(item.type),
    );
    connectEpicTimelintItems.sort((a, b) => (new Date(a.createdAt).getTime()) - (new Date(b.createdAt).getTime()));

    const connectedEpics: Map<number, ZenhubIssue> = new Map();

    for (const { type, data } of connectEpicTimelintItems) {
        const { issue } = data;

        if (type === 'issue.add_issue_to_epic') connectedEpics.set(issue.id, issue);
        else if (type === 'issue.remove_issue_from_epic') connectedEpics.delete(issue.id);
        else throw new Error('This should have never happened!');
    }

    return [...connectedEpics.values()];
}

export function isTestFilePath(filePath: string): boolean {
    const testFileNameRegex = /(\.|_|\w)*tests?(\.|_|\w)*\.\w{2,3}$/;

    return filePath.includes('/test/')
        || filePath.includes('/tests/')
        || filePath.startsWith('test/')
        || testFileNameRegex.test(filePath);
}

/**
 * Fetches a list of changed files and mark those that contain changes in test files.
 */
export async function isPullRequestTested(octokit: OctokitType, pullRequest: PullRequest) {
    const files = await octokit.rest.pulls.listFiles({
        owner: ORGANIZATION,
        repo: pullRequest.base.repo.name,
        pull_number: pullRequest.number,
    });
    const filePaths = files.data.map((file) => file.filename);
    const testFilePaths = filePaths.filter((filePath) => isTestFilePath(filePath));

    console.log(`${testFilePaths.length} test files found`); // eslint-disable-line no-console
    console.log(`- ${testFilePaths.join('\n- ')}`); // eslint-disable-line no-console

    return testFilePaths.length > 0;
}

/**
 * Retries given function `retries` times with `delayMillis` delay between each attempt if the function fails.
 */
export async function retry(func: (isLastAttempt: boolean) => Promise<void>, retries: number, delayMillis: number): Promise<void> {
    let currentRetry = 0;
    while (true) { // eslint-disable-line no-constant-condition
        try {
            const isLastAttempt = currentRetry === retries;

            return await func(isLastAttempt);
        } catch (err) {
            if (currentRetry === retries) throw err;

            core.info(`An attempt has failed. Retrying in ${delayMillis / 1000} secs...`);
            if (err instanceof Error) console.error(err.message); // eslint-disable-line no-console
            await new Promise((resolve) => setTimeout(resolve, delayMillis));
            currentRetry++;
        }
    }
}
