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

        // Skip if the repository is not connected to the ZenHub workspace.
        if (!isRepoIncludedInZenHubWorkspace(pullRequest.base.repo.name)) {
            core.warning(`Repository ${pullRequest.base.repo.name} is not included in ZenHub workspace. Skipping toolkit action.`);
            return;
        }

        // Skip if the team is listed in TEAMS_NOT_USING_ZENHUB.
        const isTeamUsingZenhub = !TEAMS_NOT_USING_ZENHUB.includes(teamName);
        if (!isTeamUsingZenhub) return;

        // All these 4 actions below are idempotent, so they can be run on every PR update.
        // Also, these actions do not require any action from a PR author.

        // 1. Assigns PR creator if not already assigned.
        const isCreatorAssigned = pullRequestContext.assignees.find((u: Assignee) => u?.login === pullRequestContext.user.login);
        if (!isCreatorAssigned) await assignPrCreator(github.context, repoOctokit, pullRequest);

        // 2. Assigns current milestone if not already assigned.
        if (!pullRequestContext.milestone) await fillCurrentMilestone(github.context, repoOctokit, pullRequest, teamName);

        // 3. Adds team label if not already there.
        const teamLabel = pullRequestContext.labels.find((label: Label) => label.name.startsWith(TEAM_LABEL_PREFIX));
        if (!teamLabel) await addTeamLabel(github.context, repoOctokit, pullRequest, teamName);

        // 4. Checks if PR is tested and adds a `tested` label if so.
        const isTested = await isPullRequestTested(repoOctokit, pullRequest);
        if (isTested) {
            await repoOctokit.rest.issues.addLabels({
                owner: ORGANIZATION,
                repo: pullRequest.base.repo.name,
                issue_number: pullRequest.number,
                labels: [TESTED_LABEL_NAME],
            });
        }

        // On the other hand, this is a check that author of the PR correctly filled in the details.
        // I.e., that the PR is linked to the ZenHub issue and that the estimate is set either on issue or on the PR.
        try {
            await ensureCorrectLinkingAndEstimates(pullRequest, repoOctokit, true);
        } catch (err) {
            console.log('Function ensureCorrectLinkingAndEstimates() has failed on dry run');
            console.log(err);
            console.log(`Sleeping for ${DRY_RUN_SLEEP_MINS} minutes`);
            await new Promise((resolve) => setTimeout(resolve, DRY_RUN_SLEEP_MINS * 60000));
            console.log('Running check again');
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
