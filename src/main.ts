import { components } from '@octokit/openapi-types/types.d';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {
    assignPrCreator,
    fillCurrentMilestone,
    findUsersTeamName,
    addTeamLabel,
    ensureCorrectLinkingAndEstimates,
    isPullRequestTested,
    isRepoIncludedInZenHubWorkspace,
} from './helpers';
import {
    TEAM_LABEL_PREFIX,
    DRY_RUN_SLEEP_MINS,
    TEAMS_NOT_USING_ZENHUB,
    ORGANIZATION,
    TESTED_LABEL_NAME,
} from './consts';

type Assignee = components['schemas']['simple-user'];
type Label = components['schemas']['label'];

async function run(): Promise<void> {
    try {
        // This skips the action when run on a PR from external fork, i.e., when the fork is not a part of the organization.
        // Do not use pull_request?.base but pull_request?.head because the former one does not container the forked repo name.
        if (!github.context.payload.pull_request?.head.repo.full_name.startsWith(`${ORGANIZATION}/`)) {
            core.warning(`Skipping toolkit action for PR from external fork: ${github.context.payload.pull_request?.head.repo.full_name}`);
            return;
        }
        core.info('Pull request is from an apify organization, not from an external fork.');

        // Skip when PR is not into the default branch. We only want to run this on PRs to develop or main when develop is not used but we
        // don't want to run this on releases or PR chains.
        const defaultBranch = github.context.payload.pull_request.head.repo.default_branch;
        const targetBranch = github.context.payload.pull_request.base.ref;
        if (defaultBranch !== targetBranch) {
            core.info(`Skipping toolkit action for PR not into the default branch "${defaultBranch}" but "${targetBranch}" instead.`);
            return;
        }
        core.info(`Pull request is into the default branch "${defaultBranch}"`);

        // Octokit configured with repository token - this can be used to modify pull-request.
        const repoToken = core.getInput('repo-token');
        const repoOctokit = github.getOctokit(repoToken);

        // Organization token providing read-only access to the organization.
        const orgToken = core.getInput('org-token');
        const orgOctokit = github.getOctokit(orgToken);

        const pullRequestContext = github.context.payload.pull_request;
        if (!pullRequestContext) throw new Error('Action works only for PRs!');

        const { data: pullRequest } = await repoOctokit.rest.pulls.get({
            owner: pullRequestContext.base.repo.owner.login,
            repo: pullRequestContext.base.repo.name,
            pull_number: pullRequestContext.number,
        });

        // Skip the PR if not a member of one of the product teams.
        const teamName = await findUsersTeamName(orgOctokit, pullRequestContext.user.login);
        if (!teamName) {
            core.warning(`User ${pullRequestContext.user.login} is not a member of team. Skipping toolkit action.`);
            return;
        }
        core.info(`User ${pullRequestContext.user.login} belongs to a team ${teamName}`);

        // Skip if the repository is not connected to the ZenHub workspace.
        const belongsToZenhub = await isRepoIncludedInZenHubWorkspace(pullRequest.base.repo.name);
        if (!belongsToZenhub) {
            core.warning(`Repository ${pullRequest.base.repo.name} is not included in ZenHub workspace. Skipping toolkit action.`);
            return;
        }
        core.info(`Repository ${pullRequest.base.repo.name} is included in ZenHub workspace`);

        // Skip if the team is listed in TEAMS_NOT_USING_ZENHUB.
        const isTeamUsingZenhub = !TEAMS_NOT_USING_ZENHUB.includes(teamName);
        if (!isTeamUsingZenhub) {
            core.info(`Team ${teamName} is listed in TEAMS_NOT_USING_ZENHUB. Skipping toolkit action.`);
            return;
        }
        core.info(`Team ${teamName} uses a ZenHub`);

        // All these 4 actions below are idempotent, so they can be run on every PR update.
        // Also, these actions do not require any action from a PR author.

        // 1. Assigns PR creator if not already assigned.
        const isCreatorAssigned = pullRequestContext.assignees.find((u: Assignee) => u?.login === pullRequestContext.user.login);
        if (!isCreatorAssigned) {
            await assignPrCreator(github.context, repoOctokit, pullRequest);
            core.info('Creator successfully assigned');
        } else {
            core.info('Creator already assigned');
        }

        // 2. Assigns current milestone if not already assigned.
        if (!pullRequestContext.milestone) {
            const milestoneTitle = await fillCurrentMilestone(github.context, repoOctokit, pullRequest, teamName);
            core.info(`Milestone successfully filled with ${milestoneTitle}`);
        } else {
            core.info('Milestone already assigned');
        }

        // 3. Adds team label if not already there.
        const teamLabel = pullRequestContext.labels.find((label: Label) => label.name.startsWith(TEAM_LABEL_PREFIX));
        if (!teamLabel) {
            await addTeamLabel(github.context, repoOctokit, pullRequest, teamName);
            core.info(`Team label for team ${teamName} successfully added`);
        } else {
            core.info(`Team label ${teamLabel.name} already present`);
        }

        // 4. Checks if PR is tested and adds a `tested` label if so.
        const isTested = await isPullRequestTested(repoOctokit, pullRequest);
        if (isTested) {
            core.info('PR is tested');
            await repoOctokit.rest.issues.addLabels({
                owner: ORGANIZATION,
                repo: pullRequest.base.repo.name,
                issue_number: pullRequest.number,
                labels: [TESTED_LABEL_NAME],
            });
            core.info(`Label ${TESTED_LABEL_NAME} successfully added`);
        } else {
            core.info('PR is not tested');
        }

        // On the other hand, this is a check that author of the PR correctly filled in the details.
        // I.e., that the PR is linked to the ZenHub issue and that the estimate is set either on issue or on the PR.
        try {
            await ensureCorrectLinkingAndEstimates(pullRequest, repoOctokit, true);
        } catch (err) {
            core.info('Function ensureCorrectLinkingAndEstimates() has failed on dry run');
            console.error(err); // eslint-disable-line no-console
            core.info(`Sleeping for ${DRY_RUN_SLEEP_MINS} minutes`);
            await new Promise((resolve) => setTimeout(resolve, DRY_RUN_SLEEP_MINS * 60000));
            core.info('Running check again');
            await ensureCorrectLinkingAndEstimates(pullRequest, repoOctokit, false);
        }
    } catch (error) {
        if (error instanceof Error) {
            core.error(error);
            console.error(error); // eslint-disable-line no-console
            core.setFailed(error.message);
        }
    }
}

run();
