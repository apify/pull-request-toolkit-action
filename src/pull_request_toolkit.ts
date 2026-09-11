import {
    PROJECT_FIELD_NAMES,
    KNOWN_BOT_USERS,
    LABELS,
    PRODUCT_ENGINEERING_TEAM_SLUG,
    TEAM_LABEL_PREFIX,
    TEAM_NAME_TO_LABEL,
} from './consts.ts';
import { UserError } from './errors.ts';
import type { GitHubModel } from './github_model.ts';
import { isTestFilePath } from './helpers.ts';
import type {
    Core,
    FieldValue,
    IssueOrPullRequestSpec,
    Iteration,
    IterationField,
    SingleSelectField,
} from './types.ts';

/**
 * A toolkit for working with pull requests with Apify-specific requirements.
 * All pull-request related methods are directly related to a specific pull request specified in the constructor.
 * All methods are idempotent.
 * Does not call GitHub directly, but through `GitHubModel`.
 */
export class PullRequestToolkit {
    private githubModel: GitHubModel;
    private core: Core;

    private pullRequestRepoOwner: string;
    private pullRequestRepoName: string;
    private pullRequestNumber: number;

    constructor(githubModel: GitHubModel, core: Core, repoOwner: string, repoName: string, pullRequestNumber: number) {
        this.githubModel = githubModel;
        this.core = core;

        this.pullRequestNumber = pullRequestNumber;
        this.pullRequestRepoOwner = repoOwner;
        this.pullRequestRepoName = repoName;
    }

    /**
     * Fetches the current state of the pull request from GitHub.
     */
    private async getPullRequest() {
        // We explicitly don't use the pull request from context or cache this result,
        // but always fetch the pull request fresh,
        // because something might have changed in the meantime (e.g., a label was added or assignees changed),
        // and we want to have the latest state during retries.
        return this.githubModel.getPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
        );
    }

    /**
     * Checks whether the pull request targets the repository's default branch.
     */
    public async isToDefaultBranch(): Promise<boolean> {
        const pullRequest = await this.getPullRequest();
        return pullRequest.base.ref === pullRequest.base.repo.default_branch;
    }

    /**
     * Checks whether the pull request is a draft.
     */
    public async isDraft(): Promise<boolean> {
        const pullRequest = await this.getPullRequest();
        return !!pullRequest.draft;
    }

    /**
     * Checks whether the pull request is merged.
     */
    public async isMerged(): Promise<boolean> {
        const pullRequest = await this.getPullRequest();
        return !!pullRequest.merged;
    }

    /**
     * Finds the human creator of the pull request, falling back to a human assignee if it was created by a bot.
     */
    public async getHumanCreator(): Promise<string | null> {
        const pullRequest = await this.getPullRequest();
        // Some pull requests are created by bots, e.g., Dependabot or Copilot. In that case, we want to assign the pull request to the human who created it.
        // Copilot already assigns the pull request to the human who gave it the task, we can use that.
        const candidates = [pullRequest.user, ...(pullRequest.assignees ?? [])]
            .filter(
                (user) => user && !KNOWN_BOT_USERS.map((bot) => bot.toLowerCase()).includes(user.login.toLowerCase()),
            )
            .map((candidate) => candidate.login);

        if (candidates.length === 0) return null;
        return candidates[0];
    }

    /**
     * Assigns the given user to the pull request, keeping any existing assignees.
     */
    public async assignCreator(userLogin: string): Promise<void> {
        const pullRequest = await this.getPullRequest();
        const existingAssignees = pullRequest.assignees || [];
        if (existingAssignees.some((assignee) => assignee?.login === userLogin)) {
            this.core.info(`Pull request creator ${userLogin} is already assigned.`);
            return;
        }

        // The operation overwrites all assignees, so we need to include existing assignees as well.
        const assigneeLogins = [userLogin]
            .concat(existingAssignees.map((u) => u?.login))
            .filter((login): login is string => !!login);

        await this.githubModel.assignUsersToIssue(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
            assigneeLogins,
        );
    }

    /**
     * Finds whether the user is a member of any child team of the Product Engineering team and returns the name of that team.
     */
    public async findUsersProductEngineeringChildTeamName(userLogin: string): Promise<string | null> {
        const childTeams = await this.githubModel.getChildTeams(
            this.pullRequestRepoOwner,
            PRODUCT_ENGINEERING_TEAM_SLUG,
        );
        if (!childTeams.length) throw new Error(`No child teams found in Product Engineering team!`);

        let teamName = null;
        for (const childTeam of childTeams) {
            const members = await this.githubModel.getTeamMembers(this.pullRequestRepoOwner, childTeam.slug);

            const isMember = members.some((member) => member?.login === userLogin);
            if (isMember) {
                teamName = childTeam.name;
                break;
            }
        }

        return teamName;
    }

    /**
     * Finds a GitHub Project board for the given team called "<TEAM_NAME> Team Kanban".
     */
    public async findProjectForTeam(teamName: string) {
        const projects = await this.githubModel.listProjects(this.pullRequestRepoOwner);
        const projectName = `${teamName} Team Kanban`;
        const project = projects.find((p) => p.title === projectName);
        if (!project) return null;

        return project;
    }

    /**
     * Adds the pull request to the given project.
     */
    public async addToProject(projectNodeId: string) {
        const pullRequest = await this.getPullRequest();
        return await this.githubModel.addPullRequestToProject(projectNodeId, pullRequest.node_id);
    }

    /**
     * Finds the status (column) field on the given project.
     */
    public async getStatusFieldForProject(projectNumber: number): Promise<SingleSelectField | undefined> {
        const fields = await this.githubModel.getProjectFields(this.pullRequestRepoOwner, projectNumber);
        return fields.find(
            (field) => field.name === PROJECT_FIELD_NAMES.STATUS && field.data_type === 'single_select',
        ) as SingleSelectField | undefined;
    }

    /**
     * Finds the status field option with the given value.
     */
    public getStatusOptionForValue(statusField: SingleSelectField, value: string) {
        return statusField.options?.find((option) => option.name.raw.toLowerCase() === value.toLowerCase());
    }

    /**
     * Sets the status field of a project item.
     */
    public async setStatusForProjectItem(
        projectNodeId: string,
        projectItemId: string,
        statusFieldNodeId: string,
        statusOptionId: string,
    ): Promise<void> {
        await this.githubModel.setProjectItemSingleSelectFieldValue(
            projectNodeId,
            projectItemId,
            statusFieldNodeId,
            statusOptionId,
        );
    }

    /**
     * Finds the sprint (iteration) field on the given project.
     */
    private async getSprintFieldForProject(projectNumber: number): Promise<IterationField | undefined> {
        const fields = await this.githubModel.getProjectFields(this.pullRequestRepoOwner, projectNumber);
        return fields.find((field) => field.name === PROJECT_FIELD_NAMES.SPRINT && field.data_type === 'iteration') as
            | IterationField
            | undefined;
    }

    /**
     * Returns the current iteration from the given iteration based on the current date, if there is any.
     */
    private getCurrentIteration(iteration: IterationField): Iteration | undefined {
        if (!iteration.configuration.iterations) return undefined;
        const now = new Date();
        const currentIteration = iteration.configuration.iterations.find((option) => {
            const startDate = new Date(option.start_date);
            const endDate = new Date(new Date(option.start_date).getTime() + option.duration * 24 * 60 * 60 * 1000);
            return startDate <= now && now < endDate;
        });
        return currentIteration;
    }

    private getLastIteration(iteration: IterationField): Iteration | undefined {
        if (!iteration.configuration.iterations) return undefined;
        const lastIteration = iteration.configuration.iterations.reduce((latest, current) => {
            const latestEndDate = new Date(
                new Date(latest.start_date).getTime() + latest.duration * 24 * 60 * 60 * 1000,
            );
            const currentEndDate = new Date(
                new Date(current.start_date).getTime() + current.duration * 24 * 60 * 60 * 1000,
            );
            return currentEndDate > latestEndDate ? current : latest;
        });
        return lastIteration;
    }

    /**
     * Adds the current sprint (iteration) to the given project, if it has a sprint field and a current iteration.
     */
    private async ensureCurrentSprintInProject(projectNumber: number) {
        const sprintField = await this.getSprintFieldForProject(projectNumber);
        if (!sprintField) {
            this.core.info(`Project ${projectNumber} does not have a sprint field. Skipping adding current sprint.`);
            return;
        }

        const currentIteration = this.getCurrentIteration(sprintField);
        if (currentIteration) {
            return;
        }

        const lastIteration = this.getLastIteration(sprintField);
        if (!lastIteration) {
            this.core.info(
                `Project ${projectNumber} does not have any iterations in the sprint field. Adding the first iteration.`,
            );
            await this.githubModel.addIterationToIterationField(
                this.pullRequestRepoOwner,
                projectNumber,
                sprintField.id,
            );
            return;
        }

        const missingIterationCount =
            Math.ceil(
                (Date.now() - new Date(lastIteration.start_date).getTime()) /
                    (lastIteration.duration * 24 * 60 * 60 * 1000),
            ) + 1;
        this.core.info(`Project ${projectNumber} is missing ${missingIterationCount} iterations. Adding them.`);
        for (let i = 0; i < missingIterationCount; i++) {
            this.core.debug(`Adding iteration ${i + 1} of ${missingIterationCount} to project ${projectNumber}.`);
            await this.githubModel.addIterationToIterationField(
                this.pullRequestRepoOwner,
                projectNumber,
                sprintField.id,
            );
        }
    }

    /**
     * Gets the sprint (iteration) value currently set on a project item.
     */
    private async getSprintForProjectItem(sprintField: IterationField, projectItemId: string) {
        const itemFields = await this.githubModel.getProjectItemFieldValues(projectItemId);

        const sprintFieldValue = itemFields[sprintField.name] as
            | Extract<FieldValue, { dataType: 'ITERATION' }>
            | undefined;
        return sprintFieldValue?.value || null;
    }

    /**
     * Sets the sprint (iteration) value on a project item.
     */
    private async setSprintForProjectItem(
        projectNodeId: string,
        projectItemId: string,
        sprintFieldNodeId: string,
        iterationId: string,
    ): Promise<void> {
        await this.githubModel.setProjectItemIterationFieldValue(
            projectNodeId,
            projectItemId,
            sprintFieldNodeId,
            iterationId,
        );
    }

    /**
     * Assigns the pull request to the current sprint (iteration) of the given project, if it has a sprint field.
     * If the project does not have a sprint field, the function returns silently without doing anything.
     * If the pull request already has a sprint assigned, it is not changed.
     * If the project has a sprint field but no current iteration, the function throws an error.
     */
    public async maybeAssignProjectItemToCurrentSprint(
        projectNumber: number,
        projectNodeId: string,
        projectItemReferenceId: string,
    ) {
        const sprintField = await this.getSprintFieldForProject(projectNumber);
        if (!sprintField) {
            this.core.info(`Project ${projectNumber} does not have a sprint field. Skipping sprint assignment.`);
            return;
        }
        const itemSprint = await this.getSprintForProjectItem(sprintField, projectItemReferenceId);
        if (itemSprint) {
            this.core.info(`Pull request already has a sprint assigned: ${itemSprint.title}`);
            return;
        }

        await this.ensureCurrentSprintInProject(projectNumber);

        const currentSprint = this.getCurrentIteration(sprintField);
        if (!currentSprint) {
            throw new UserError(
                `Project ${projectNumber} does not have a current sprint iteration. Create one first in project settings.`,
            );
        }

        await this.setSprintForProjectItem(
            projectNodeId,
            projectItemReferenceId,
            sprintField.node_id!,
            currentSprint.id,
        );
        this.core.info(`Pull request added to current sprint "${currentSprint.title}"`);
    }

    /**
     * Checks if the Pull Request Toolkit is required for this repo (based on pull_request_toolkit_required custom repository property).
     */
    public async isPullRequestToolkitRequiredForRepo(): Promise<boolean> {
        const repo = await this.githubModel.getRepo(this.pullRequestRepoOwner, this.pullRequestRepoName);

        return repo.custom_properties?.pull_request_toolkit_required === 'Yes';
    }

    /**
     * Converts team name into a label name (t-core-services).
     * Custom mappings can be defined in TEAM_NAME_TO_LABEL constant.
     */
    private getTeamLabelForTeam(teamName: string): string {
        return TEAM_NAME_TO_LABEL[teamName] || `t-${teamName.toLowerCase().replace(/ /g, '-')}`;
    }

    /**
     * Returns the team labels currently assigned to the pull request.
     */
    public async getTeamLabels(): Promise<string[]> {
        const pullRequest = await this.getPullRequest();
        return pullRequest.labels
            .filter((label: { name: string }) => label.name.startsWith(TEAM_LABEL_PREFIX))
            .map((label: { name: string }) => label.name);
    }

    /**
     * Adds a team label to the pull request.
     */
    public async addTeamLabel(teamName: string): Promise<void> {
        const teamLabelName = this.getTeamLabelForTeam(teamName);
        const repoLabels = await this.githubModel.getLabelsForRepo(this.pullRequestRepoOwner, this.pullRequestRepoName);

        if (!repoLabels.includes(teamLabelName))
            throw new UserError(
                `Team label "${teamLabelName}" does not exist on repository ${this.pullRequestRepoOwner}/${this.pullRequestRepoName}. Please create it first.`,
            );

        await this.githubModel.addLabelToIssueOrPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
            teamLabelName,
        );
    }

    /**
     * Gets all issues linked to the pull request, both natively and via references in its body.
     */
    private async getLinkedIssues() {
        const nativelyLinkedIssues = await this.githubModel.getNativelyLinkedIssuesForPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
        );
        const issuesMentionedInBody = await this.getIssuesMentionedInPullRequestBody();

        // Merge and remove duplicates
        return this.deduplicateIssues([...nativelyLinkedIssues, ...issuesMentionedInBody]);
    }

    /**
     * Removes duplicate issue/pull request specs from the given list.
     */
    private deduplicateIssues(issues: IssueOrPullRequestSpec[]): IssueOrPullRequestSpec[] {
        return issues.filter(
            (issue, index, self) =>
                index ===
                self.findIndex((i) => i.owner === issue.owner && i.repo === issue.repo && i.number === issue.number),
        );
    }

    /**
     * Gets all linked issues along with their parent issues.
     */
    private async getLinkedAndParentIssues() {
        const linkedIssues = await this.getLinkedIssues();

        const linkedAndParentIssues = [...linkedIssues];
        for (let i = 0; i < linkedAndParentIssues.length; i++) {
            const parentIssue = await this.githubModel.getParentIssue(
                linkedAndParentIssues[i].owner,
                linkedAndParentIssues[i].repo,
                linkedAndParentIssues[i].number,
            );
            if (parentIssue) {
                // Check if the parent issue is already in the list to avoid duplicates
                if (
                    !linkedAndParentIssues.find(
                        (issue) =>
                            issue.owner === parentIssue.owner &&
                            issue.repo === parentIssue.repo &&
                            issue.number === parentIssue.number,
                    )
                ) {
                    linkedAndParentIssues.push(parentIssue);
                }
            }
        }
        return linkedAndParentIssues;
    }

    /**
     * Parses the pull request body for issue-closing references (e.g., "fixes #123") and returns the referenced issues.
     * This is a fallback/addition to `getNativelyLinkedIssuesForPullRequest`, since GitHub's own detection of such
     * references is not always reliable (e.g. references added by editing the body after the pull request creation).
     */
    private async getIssuesMentionedInPullRequestBody() {
        const pullRequest = await this.githubModel.getPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
        );
        if (!pullRequest.body) return [];

        // These are native GitHub reference phrases which cause an issue to be automatically linked
        const closingReferenceRegexp = new RegExp(
            '(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)',
            'ig',
        );
        // These are non-native reference phrases (an Apify extension)
        const nonClosingReferenceRegexp = new RegExp('(part of)', 'ig');
        const referenceRegexp = new RegExp(
            `(?<reference>${closingReferenceRegexp.source}|${nonClosingReferenceRegexp.source})`,
            'ig',
        );
        const issueUrlRefRegexp = new RegExp(
            '(https://github.com/(?<owner>[^/\\s]+)/(?<repo>[^/\\s]+)/issues/(?<number>\\d+))',
            'ig',
        );
        const issueShortRefRegexp = new RegExp('((?<owner>[^/\\s]+)/(?<repo>[^/\\s]+))?#(?<number>\\d+)', 'ig');

        const fullRegexp = new RegExp(
            `${referenceRegexp.source}\\s+(${issueUrlRefRegexp.source}|${issueShortRefRegexp.source})`,
            'ig',
        );

        return [
            ...pullRequest.body.matchAll(fullRegexp).map((match) => ({
                isClosingReference: closingReferenceRegexp.test(match.groups!.reference),
                isNativeReference: closingReferenceRegexp.test(match.groups!.reference), // Native GitHub references are all closing
                owner: match.groups!.owner || pullRequest.base.repo.owner.login,
                repo: match.groups!.repo || pullRequest.base.repo.name,
                number: parseInt(match.groups!.number, 10),
            })),
        ];
    }

    /**
     * Links all issues mentioned in the pull request body that are not native references.
     */
    public async linkIssuesMentionedInPullRequestBody() {
        const mentionedIssues = await this.getIssuesMentionedInPullRequestBody();

        // Native references are linked automatically by GitHub
        const issuesToLink = mentionedIssues.filter((issue) => !issue.isNativeReference);
        if (issuesToLink.length === 0) return;

        const pullRequest = await this.getPullRequest();

        for (const issueReference of issuesToLink) {
            const issue = await this.githubModel.getIssue(
                issueReference.owner,
                issueReference.repo,
                issueReference.number,
            );
            await this.githubModel.linkPullRequestToIssue(issue.node_id, pullRequest.node_id);
        }
    }

    /**
     * Closes all issues that are mentioned in the pull request body with a closing reference (e.g., "fixes #123").
     */
    public async closeIssuesMentionedInPullRequestBody() {
        const mentionedIssues = await this.getIssuesMentionedInPullRequestBody();
        const issuesToClose = mentionedIssues.filter((issue) => issue.isClosingReference);
        for (const issue of issuesToClose) {
            await this.githubModel.closeIssueAsCompleted(issue.owner, issue.repo, issue.number);
        }
    }

    /**
     * Gets the estimate value set on a project item, if any.
     */
    private async getEstimateInProjectItems(projectItemId: string) {
        const fieldValues = await this.githubModel.getProjectItemFieldValues(projectItemId);
        const estimate = fieldValues[PROJECT_FIELD_NAMES.ESTIMATE] as
            | Extract<FieldValue, { dataType: 'NUMBER' }>
            | undefined;
        if (estimate) {
            return estimate.value;
        }
        return null;
    }

    /**
     * Checks whether the pull request or any of its linked issues has an estimate set in a project.
     */
    private async isPullRequestOrLinkedIssuesEstimated(linkedIssues: IssueOrPullRequestSpec[] = []) {
        const projectItems = [
            ...(await this.githubModel.getProjectItemsForPullRequest(
                this.pullRequestRepoOwner,
                this.pullRequestRepoName,
                this.pullRequestNumber,
            )),
            ...(
                await Promise.all(
                    linkedIssues.map(async (issue) =>
                        this.githubModel.getProjectItemsForIssue(issue.owner, issue.repo, issue.number),
                    ),
                )
            ).flat(),
        ];
        for (const projectItem of projectItems) {
            const estimate = await this.getEstimateInProjectItems(projectItem.id);
            if (estimate !== undefined) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks whether the pull request is properly linked to issues (or marked as adhoc) and whether it is estimated.
     */
    public async isCorrectlyLinkedAndEstimated() {
        const pullRequest = await this.githubModel.getPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
        );
        const linkedIssues = await this.getLinkedAndParentIssues();
        const isLinkedOrAdhoc =
            linkedIssues.length > 0 ||
            pullRequest.labels.some((label: { name: string }) => label.name === LABELS.ADHOC);
        const isEstimated = await this.isPullRequestOrLinkedIssuesEstimated(linkedIssues);

        return { isLinkedOrAdhoc, isEstimated };
    }

    /**
     * Fetches a list of changed files and checks whether any of them are test files.
     */
    public async isTested() {
        const files = await this.githubModel.getPullRequestFiles(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
        );
        const filePaths = files.map((file) => file.filename);
        const testFilePaths = filePaths.filter((filePath) => isTestFilePath(filePath));

        return testFilePaths.length > 0;
    }

    /**
     * Adds the "tested" label to the pull request.
     */
    public async markAsTested() {
        const repoLabels = await this.githubModel.getLabelsForRepo(this.pullRequestRepoOwner, this.pullRequestRepoName);

        if (!repoLabels.includes(LABELS.TESTED))
            throw new UserError(
                `Label "${LABELS.TESTED}" does not exist on repository ${this.pullRequestRepoOwner}/${this.pullRequestRepoName}. Please create it first.`,
            );

        await this.githubModel.addLabelToIssueOrPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
            LABELS.TESTED,
        );
    }
}
