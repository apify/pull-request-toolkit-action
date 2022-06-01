import { components } from '@octokit/openapi-types/types.d';
import * as core from '@actions/core';
import * as github from '@actions/github';
import {
    assignPrCreator,
    fillCurrentMilestone,
    findUsersTeamName,
} from './helpers';

type Assignee = components['schemas']['simple-user'];

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

        const teamName = await findUsersTeamName(orgOctokit, pullRequestContext.user.login);
        if (!teamName) {
            core.warning(`User ${pullRequestContext.user.login} is not a member of team. Skipping toolkit action.`);
            return;
        }

        const isCreatorAssigned = pullRequestContext.assignees.find((u: Assignee) => u?.login === pullRequestContext.user.login);
        if (!isCreatorAssigned) await assignPrCreator(github.context, repoOctokit, pullRequest);

        if (!pullRequestContext.milestone) await fillCurrentMilestone(github.context, repoOctokit, pullRequest, teamName);
    } catch (error) {
        if (error instanceof Error) {
            core.error(error);
            console.error(error); // eslint-disable-line no-console
            core.setFailed(error.message);
        }
    }
}

run();
