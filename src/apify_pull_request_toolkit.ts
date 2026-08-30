/* oxlint-disable no-console */
import {
    FIELD_NAMES,
    KNOWN_BOT_USERS,
    PRODUCT_ENGINEERING_TEAM_SLUG,
    TEAM_LABEL_PREFIX,
    TEAM_NAME_TO_LABEL,
    TESTED_LABEL_NAME,
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
export class ApifyPullRequestToolkit {
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
        // but always fetch the PR fresh,
        // because the PR might have changed something in the meantime (e.g., a label was added or assignees changed),
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
     * Finds the human creator of the pull request, falling back to a human assignee if it was created by a bot.
     */
    public async getHumanCreator(): Promise<string | null> {
        const pullRequest = await this.getPullRequest();
        // Some PRs are created by bots, e.g., Dependabot or Copilot. In that case, we want to assign the PR to the human who created the PR.
        // Copilot already assigns the PR to the human who gave it the task, we can use that.
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
            this.core.info(`PR creator ${userLogin} is already assigned.`);
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
        return fields.find((field) => field.name === FIELD_NAMES.STATUS && field.data_type === 'single_select') as
            | SingleSelectField
            | undefined;
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
    public async getSprintFieldForProject(projectNumber: number): Promise<IterationField | undefined> {
        const fields = await this.githubModel.getProjectFields(this.pullRequestRepoOwner, projectNumber);
        return fields.find((field) => field.name === FIELD_NAMES.SPRINT && field.data_type === 'iteration') as
            | IterationField
            | undefined;
    }

    /**
     * Returns the current iteration from the given iteration based on the current date, if there is any.
     */
    public getCurrentIteration(iteration: IterationField): Iteration | undefined {
        if (!iteration.configuration.iterations) return undefined;
        const now = new Date();
        const currentIteration = iteration.configuration.iterations.find((option) => {
            const startDate = new Date(option.start_date);
            const endDate = new Date(new Date(option.start_date).getTime() + option.duration * 24 * 60 * 60 * 1000);
            return startDate <= now && now < endDate;
        });
        return currentIteration;
    }

    /**
     * Gets the sprint (iteration) value currently set on a project item.
     */
    public async getSprintForProjectItem(sprintField: IterationField, projectItemId: string) {
        const itemFields = await this.githubModel.getProjectItemFieldValues(projectItemId);

        const sprintFieldValue = itemFields[sprintField.name] as
            | Extract<FieldValue, { dataType: 'ITERATION' }>
            | undefined;
        return sprintFieldValue?.value || null;
    }

    /**
     * Sets the sprint (iteration) value on a project item.
     */
    public async setSprintForProjectItem(
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
     * Checks if the PR Toolkit is required for this repo (based on pull_request_toolkit_required custom repository property).
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
     * Gets all issues linked to the pull request, both natively and via references in the PR body.
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
     */
    private async getIssuesMentionedInPullRequestBody() {
        const pullRequest = await this.githubModel.getPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
        );
        if (!pullRequest.body) return [];
        const referenceWordRegexp = new RegExp('(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)', 'ig');
        const issueUrlRefRegexp = new RegExp(
            '(https://github.com/(?<owner>[^/\\s]+)/(?<repo>[^/\\s]+)/issues/(?<number>\\d+))',
            'ig',
        );
        const issueShortRefRegexp = new RegExp('((?<owner>[^/\\s]+)/(?<repo>[^/\\s]+))?#(?<number>\\d+)', 'ig');

        const fullRegexp = new RegExp(
            `${referenceWordRegexp.source}\\s+(${issueUrlRefRegexp.source}|${issueShortRefRegexp.source})`,
            'ig',
        );

        return [
            ...pullRequest.body.matchAll(fullRegexp).map((match) => ({
                owner: match.groups!.owner || pullRequest.base.repo.owner.login,
                repo: match.groups!.repo || pullRequest.base.repo.name,
                number: parseInt(match.groups!.number, 10),
            })),
        ];
    }

    /**
     * Gets the estimate value set on a project item, if any.
     */
    private async getEstimatesInProjectItems(projectItemId: string) {
        const fieldValues = await this.githubModel.getProjectItemFieldValues(projectItemId);
        const estimate = fieldValues[FIELD_NAMES.ESTIMATE] as Extract<FieldValue, { dataType: 'NUMBER' }> | undefined;
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
            const estimate = await this.getEstimatesInProjectItems(projectItem.id);
            if (estimate) {
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
            linkedIssues.length > 0 || pullRequest.labels.some((label: { name: string }) => label.name === 'adhoc');
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

        if (!repoLabels.includes(TESTED_LABEL_NAME))
            throw new UserError(
                `Label "${TESTED_LABEL_NAME}" does not exist on repository ${this.pullRequestRepoOwner}/${this.pullRequestRepoName}. Please create it first.`,
            );

        await this.githubModel.addLabelToIssueOrPullRequest(
            this.pullRequestRepoOwner,
            this.pullRequestRepoName,
            this.pullRequestNumber,
            TESTED_LABEL_NAME,
        );
    }
}
