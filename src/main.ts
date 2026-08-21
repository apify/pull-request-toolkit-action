import type * as Core from '@actions/core';
import type { context as Context, getOctokit as getOctokitImport } from '@actions/github';
import type { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';

import {
    TEAM_LABEL_PREFIX,
    LINKING_CHECK_RETRIES,
    LINKING_CHECK_DELAY_MILLIS,
    TEAMS_NOT_USING_ZENHUB,
    TEAM_TO_PROJECT_NUMBER,
    ORGANIZATION,
    TESTED_LABEL_NAME,
    SKIP_MILESTONES_AND_ESTIMATES_FOR_TEAMS,
    SKIP_ESTIMATES_FOR_TEAMS,
} from './consts.js';
import {
    assignPrCreator,
    fillCurrentMilestone,
    findUsersTeamName,
    addTeamLabel,
    assignPrToProjectSprint,
    ensureCorrectLinkingAndEstimates,
    isPullRequestTested,
    isRepoIncludedInZenHubWorkspace,
    retry,
} from './helpers.js';

type Octokit = ReturnType<typeof getOctokitImport>;

type PullRequest = GetResponseDataTypeFromEndpointMethod<Octokit['rest']['pulls']['get']>;
type Assignee = NonNullable<PullRequest['assignees']>[number];
type Label = NonNullable<PullRequest['labels']>[number];

export async function main({
    getOctokit,
    context,
    core,
    env,
}: {
    getOctokit: typeof getOctokitImport;
    context: typeof Context;
    core: typeof Core;
    env: Record<string, string | undefined>;
}) {
    try {
        const repoToken = env.GITHUB_REPO_TOKEN;
        const orgToken = env.GITHUB_ORG_TOKEN;
        const zenhubToken = env.ZENHUB_TOKEN;
        if (!repoToken) throw new Error('Missing repo-token input!');
        if (!orgToken) throw new Error('Missing org-token input!');
        if (!zenhubToken) throw new Error('Missing zenhub-token input!');

        // This skips the action when run on a PR from external fork, i.e., when the fork is not a part of the organization.
        // Do not use pull_request?.base but pull_request?.head because the former one does not container the forked repo name.
        if (!context.payload.pull_request?.head.repo.full_name.startsWith(`${ORGANIZATION}/`)) {
            core.warning(
                `Skipping toolkit action for PR from external fork: ${context.payload.pull_request?.head.repo.full_name}`,
            );
            return;
        }
        core.info('Pull request is from an apify organization, not from an external fork.');

        // Skip when PR is not into the default branch. We only want to run this on PRs to develop or main when develop is not used but we
        // don't want to run this on releases or PR chains.
        const defaultBranch = context.payload.pull_request.head.repo.default_branch;
        const targetBranch = context.payload.pull_request.base.ref;
        if (defaultBranch !== targetBranch) {
            core.info(
                `Skipping toolkit action for PR not into the default branch "${defaultBranch}" but "${targetBranch}" instead.`,
            );
            return;
        }
        core.info(`Pull request is into the default branch "${defaultBranch}".`);

        // Octokit configured with repository token - this can be used to modify pull-request.
        const repoOctokit = getOctokit(repoToken);

        const pullRequestContext = context.payload.pull_request;
        if (!pullRequestContext) throw new Error('Action works only for PRs!');

        const { data: pullRequest } = await repoOctokit.rest.pulls.get({
            owner: pullRequestContext.base.repo.owner.login,
            repo: pullRequestContext.base.repo.name,
            pull_number: pullRequestContext.number,
        });

        let user = pullRequestContext.user.login;
        if (user.toLowerCase() === 'dependabot[bot]') {
            core.info(`Skipping toolkit action for a PR from Dependabot.`);
            return;
        }
        if (user.toLowerCase() === 'copilot') {
            // copilot assigns the user who initiated the PR, let's use that
            const otherAssignees = pullRequest.assignees?.filter(
                (assignee) => assignee.login.toLowerCase() !== 'copilot',
            );
            if (otherAssignees?.length !== 1) {
                core.warning(
                    "PR created by Copilot, and there isn't exactly one other assignee -> cannot determine user. Skipping toolkit action.",
                );
                return;
            }
            user = otherAssignees[0].login;
            core.info(`PR created by Copilot on behalf of ${user}, proceeding.`);
        }

        // Organization token providing read-only access to the organization.
        const orgOctokit = getOctokit(orgToken);

        // Skip the PR if not a member of one of the product teams.
        const teamName = await findUsersTeamName(orgOctokit, user);
        if (!teamName) {
            core.warning(`User ${user} is not a member of team. Skipping toolkit action.`);
            return;
        }
        core.info(`User ${user} belongs to a ${teamName} team.`);

        // Skip if the repository is not connected to the ZenHub workspace.
        const belongsToZenhub = await isRepoIncludedInZenHubWorkspace(pullRequest.base.repo.name, zenhubToken);
        if (!belongsToZenhub) {
            core.warning(
                `Repository ${pullRequest.base.repo.name} is not included in ZenHub workspace. Skipping toolkit action.`,
            );
            return;
        }
        core.info(`Repository ${pullRequest.base.repo.name} is included in ZenHub workspace.`);

        // Skip if the team is listed in TEAMS_NOT_USING_ZENHUB.
        const isTeamUsingZenhub = !TEAMS_NOT_USING_ZENHUB.includes(teamName);
        if (!isTeamUsingZenhub) {
            core.info(`Team ${teamName} is listed in TEAMS_NOT_USING_ZENHUB. Skipping toolkit action.`);
            return;
        }
        core.info(`Team ${teamName} uses a ZenHub.`);

        // All these 4 actions below are idempotent, so they can be run on every PR update.
        // Also, these actions do not require any action from a PR author.

        // 1. Assigns PR creator if not already assigned.
        const isCreatorAssigned = pullRequest.assignees?.find((u: Assignee) => u?.login === user);
        if (!isCreatorAssigned) {
            await assignPrCreator(context, repoOctokit, pullRequest);
            core.info('Creator successfully assigned.');
        } else {
            core.info('Creator already assigned.');
        }

        // 2. Assigns current milestone if not already assigned.
        if (!pullRequest.milestone && !SKIP_MILESTONES_AND_ESTIMATES_FOR_TEAMS.includes(teamName)) {
            const milestoneTitle = await fillCurrentMilestone(context, repoOctokit, pullRequest, teamName);
            core.info(`Milestone successfully filled with ${milestoneTitle}.`);
        } else {
            core.info('Milestone already assigned or team is skipped.');
        }

        // 3. Adds team label if not already there.
        const teamLabel = pullRequest.labels.find((label: Label) => label.name.startsWith(TEAM_LABEL_PREFIX));
        if (!teamLabel) {
            await addTeamLabel(context, repoOctokit, pullRequest, teamName);
            core.info(`Team label for team ${teamName} successfully added`);
        } else {
            core.info(`Team label ${teamLabel.name} already present`);
        }

        // 4. Checks if PR is tested and adds a `tested` label if so.
        const isTested = await isPullRequestTested(repoOctokit, pullRequest);
        if (isTested) {
            core.info('PR is tested.');
            await repoOctokit.rest.issues.addLabels({
                owner: ORGANIZATION,
                repo: pullRequest.base.repo.name,
                issue_number: pullRequest.number,
                labels: [TESTED_LABEL_NAME],
            });
            core.info(`Label ${TESTED_LABEL_NAME} successfully added`);
        } else {
            core.info('PR is not tested.');
        }

        // 5. Adds PR to team's GitHub Project board and assigns to the current Sprint (if team is migrated to GitHub Projects).
        if (TEAM_TO_PROJECT_NUMBER[teamName] !== undefined) {
            try {
                const sprintTitle = await assignPrToProjectSprint(orgOctokit, pullRequest, teamName);
                core.info(`PR added to GitHub Project board and assigned to sprint "${sprintTitle}".`);
            } catch (err) {
                core.warning(`Failed to assign PR to project sprint: ${err instanceof Error ? err.message : err}`);
            }
        } else {
            core.info(`Team ${teamName} is not using GitHub Projects. Skipping sprint assignment.`);
        }

        if (SKIP_MILESTONES_AND_ESTIMATES_FOR_TEAMS.includes(teamName)) {
            core.info(
                `Team ${teamName} is listed in SKIP_MILESTONES_AND_ESTIMATES_FOR_TEAMS. Skipping the linking and estimate check.`,
            );
            return;
        }

        if (SKIP_ESTIMATES_FOR_TEAMS.includes(teamName)) {
            core.info(
                `Team ${teamName} is listed in SKIP_ESTIMATES_FOR_TEAMS. Skipping the linking and estimate check.`,
            );
            return;
        }

        // On the other hand, this is a check that author of the PR correctly filled in the details.
        // I.e., that the PR is linked to the ZenHub issue and that the estimate is set either on issue or on the PR.
        await retry(
            async () => ensureCorrectLinkingAndEstimates(pullRequest, orgOctokit, zenhubToken, core),
            LINKING_CHECK_RETRIES,
            LINKING_CHECK_DELAY_MILLIS,
            core,
        );
        core.info('Pull request is correctly linked to a ZenHub or GitHub issue, or is adhoc, and has an estimate.');
        core.info('All checks passed!');
    } catch (error) {
        if (error instanceof Error) {
            core.error(error);
            console.error(error); // eslint-disable-line no-console
            core.setFailed(error.message);
        }
    }
}
