import {
    LINKING_CHECK_RETRIES,
    LINKING_CHECK_DELAY_MILLIS,
    SKIP_LINKING_AND_ESTIMATE_CHECKS_FOR_TEAMS,
    STATUS_FIELD_VALUES,
} from './consts.ts';
import { UserError } from './errors.ts';
import { GitHubModel } from './github_model.ts';
import { PullRequestToolkit } from './pull_request_toolkit.ts';
import type { Core, Context, GetOctokitFunction } from './types.ts';

export async function main({
    getOctokit,
    context,
    core,
    input,
}: {
    getOctokit: GetOctokitFunction;
    context: Context;
    core: Core;
    input: { 'org-token'?: string };
}) {
    try {
        const pullRequestFromContext = context.payload.pull_request;
        if (!pullRequestFromContext) throw new UserError('This action works only for pull requests!');

        if (pullRequestFromContext.head.repo.full_name !== pullRequestFromContext.base.repo.full_name) {
            core.info(
                `Skipping toolkit action for pull request from external fork: ${pullRequestFromContext.head.repo.full_name}`,
            );
            return;
        }
        core.info('Pull request is from an Apify organization, not from an external fork.');

        // This secret is not provided for pull requests from forks, but we have skipped those already.
        // If it is missing at this point, the action is misconfigured and we should fail.
        if (!input['org-token']) throw new Error('Missing org-token input!');
        const orgOctokit = getOctokit(input['org-token']);

        const githubModel = new GitHubModel(orgOctokit);
        const pullRequestToolkit = new PullRequestToolkit(
            githubModel,
            core,
            pullRequestFromContext.base.repo.owner.login,
            pullRequestFromContext.base.repo.name,
            pullRequestFromContext.number,
        );

        // In practice, this should never happen, because the action is only triggered for repositories
        // which have `pull_request_toolkit_required` set to true in the repo settings,
        // but theoretically someone could trigger the action manually for a repo which doesn't have it set,
        // so we check the enablement anyway.
        if (!(await pullRequestToolkit.isPullRequestToolkitRequiredForRepo())) {
            core.info('Pull request toolkit is not required for this repository. Skipping.');
            return;
        }
        core.info('Pull request toolkit is required for this repository. Proceeding.');

        if (await pullRequestToolkit.isDraft()) {
            core.info('Pull request is a draft. Skipping toolkit action.');
            return;
        }
        core.info('Pull request is not a draft.');

        // Skip when the pull request is not into the default branch. We don't want to run this on releases or pull request chains.
        if (!(await pullRequestToolkit.isToDefaultBranch())) {
            core.info(`Skipping toolkit action for pull request not into the default branch.`);
            return;
        }
        core.info(`Pull request is into the default branch.`);

        const pullRequestHumanCreator = await pullRequestToolkit.getHumanCreator();
        if (!pullRequestHumanCreator) {
            core.info('Pull request creator is a bot and no human is assigned. Skipping toolkit action.');
            return;
        }

        const teamName = await pullRequestToolkit.findUsersProductEngineeringChildTeamName(pullRequestHumanCreator);
        if (!teamName) {
            core.info(
                `User ${pullRequestHumanCreator} is not a member of any Product Engineering team. Skipping toolkit action.`,
            );
            return;
        }
        core.info(`User ${pullRequestHumanCreator} belongs to ${teamName} team.`);

        // Checks if the pull request is tested and adds a `tested` label if so.
        const isTested = await pullRequestToolkit.isTested();
        if (isTested) {
            await pullRequestToolkit.markAsTested();
            core.info('Marked pull request as tested.');
        } else {
            core.info('Pull request is not tested.');
        }

        // Assigns the pull request creator.
        await pullRequestToolkit.assignCreator(pullRequestHumanCreator);
        core.info(`Assigned pull request creator ${pullRequestHumanCreator} to the pull request.`);

        // Adds team label if not already there.
        const teamLabelsOnPullRequest = await pullRequestToolkit.getTeamLabels();
        if (!teamLabelsOnPullRequest.length) {
            await pullRequestToolkit.addTeamLabel(teamName);
            core.info(`Team label for team ${teamName} successfully added`);
        } else {
            core.info(`Team labels already present on pull request: ${teamLabelsOnPullRequest.join(', ')}`);
        }

        // Adds the pull request to the team project if it exists,
        // sets the status field to "Pull Request",
        // and assigns it to the current sprint if the project has a sprint field.
        const project = await pullRequestToolkit.findProjectForTeam(teamName);
        if (project) {
            core.info(`Team ${teamName} has a GitHub Project: ${project.title} (ID: ${project.id})`);

            const projectItemReference = await pullRequestToolkit.addToProject(project.node_id);
            core.info(
                `Pull request added to GitHub Project board: ${project.title} (item ID: ${projectItemReference.id})`,
            );

            const statusField = await pullRequestToolkit.getStatusFieldForProject(project.number);
            if (!statusField) {
                throw new UserError(
                    `Project ${project.title} does not have a status field. Create one first in project settings.`,
                );
            }
            const statusOption = pullRequestToolkit.getStatusOptionForValue(
                statusField,
                STATUS_FIELD_VALUES.PULL_REQUEST,
            );
            if (!statusOption) {
                throw new UserError(
                    `Project ${project.title} does not have a status option "${STATUS_FIELD_VALUES.PULL_REQUEST}". Create one first in project settings.`,
                );
            }
            await pullRequestToolkit.setStatusForProjectItem(
                project.node_id,
                projectItemReference.id,
                statusField.node_id!,
                statusOption.id,
            );
            core.info(
                `Pull request status field set to "${STATUS_FIELD_VALUES.PULL_REQUEST}" in project "${project.title}"`,
            );

            const sprintField = await pullRequestToolkit.getSprintFieldForProject(project.number);
            if (sprintField) {
                const itemSprint = await pullRequestToolkit.getSprintForProjectItem(
                    sprintField,
                    projectItemReference.id,
                );
                if (!itemSprint) {
                    const currentSprint = pullRequestToolkit.getCurrentIteration(sprintField);
                    if (currentSprint) {
                        await pullRequestToolkit.setSprintForProjectItem(
                            project.node_id,
                            projectItemReference.id,
                            sprintField.node_id!,
                            currentSprint.id,
                        );
                        core.info(`Pull request added to current sprint "${currentSprint.title}"`);
                    } else {
                        throw new UserError(
                            `Project ${project.title} does not have a current sprint iteration. Create one first in project settings.`,
                        );
                    }
                } else {
                    core.info(`Pull request already has a sprint assigned: ${itemSprint.title}`);
                }
            } else {
                core.info(`Project ${project.title} does not have a sprint field. Skipping sprint assignment.`);
            }
        } else {
            core.info(`Team ${teamName} does not have a GitHub Project.`);
        }

        if (SKIP_LINKING_AND_ESTIMATE_CHECKS_FOR_TEAMS.includes(teamName)) {
            core.info(`Team ${teamName} is excluded from linking and estimate checks. Finishing now`);
            return;
        }

        // This check is retried a few times because linking/estimating an issue is often done by the author right after opening the PR,
        // so the data may not be there yet on the first check.
        core.info(
            `Checking if pull request is linked to a GitHub issue, or is adhoc, and if it or its linked issues have an estimate.`,
        );
        let isLinkedOrAdhoc = false;
        let isEstimated = false;
        for (let attempt = 1; attempt <= LINKING_CHECK_RETRIES; attempt++) {
            ({ isLinkedOrAdhoc, isEstimated } = await pullRequestToolkit.isCorrectlyLinkedAndEstimated());
            if (isLinkedOrAdhoc && isEstimated) {
                break;
            }

            if (attempt < LINKING_CHECK_RETRIES) {
                core.info(
                    `Pull request is not correctly linked or estimated. Retrying in ${LINKING_CHECK_DELAY_MILLIS} milliseconds (attempt ${attempt}/${LINKING_CHECK_RETRIES})...`,
                );
                await new Promise((resolve) => setTimeout(resolve, LINKING_CHECK_DELAY_MILLIS));
            }
        }
        if (!isLinkedOrAdhoc)
            throw new UserError('Pull request is not linked to a GitHub issue, and is not marked as adhoc.');
        if (!isEstimated) throw new UserError('Neither the pull request nor its linked issues have an estimate set.');

        core.info('Pull request is correctly linked to a GitHub issue, or is adhoc, and has an estimate.');

        core.info('All checks passed!');
    } catch (error) {
        if (error instanceof UserError) {
            core.error('There is a problem with the pull request that needs to be fixed by the user:');
        } else {
            core.error('There was an internal error when running the pull request toolkit, please report it on Slack:');
        }
        core.error(error instanceof Error ? error : String(error));
        core.setFailed(error instanceof Error ? error.message : String(error));
    }
}
