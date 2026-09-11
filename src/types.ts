import type * as CoreType from '@actions/core';
import type { context as contextImport, getOctokit } from '@actions/github';
import type { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';

export type Context = typeof contextImport;
export type Core = typeof CoreType;
export type GetOctokitFunction = typeof getOctokit;
export type Octokit = ReturnType<GetOctokitFunction>;

export type Project = GetResponseDataTypeFromEndpointMethod<Octokit['rest']['projects']['getForOrg']>;
export type ProjectField = GetResponseDataTypeFromEndpointMethod<Octokit['rest']['projects']['listFieldsForOrg']>['0'];
export type SingleSelectField = ProjectField & {
    configuration: undefined;
    options: NonNullable<ProjectField['options']>;
};
export type SingleSelectOption = NonNullable<SingleSelectField['options']>[0];
export type IterationField = ProjectField & {
    configuration: NonNullable<ProjectField['configuration']>;
    options: undefined;
};
export type Iteration = NonNullable<IterationField['configuration']['iterations']>[0];

export type FieldValue =
    | { id: string; dataType: 'DATE'; value: string }
    | {
          id: string;
          dataType: 'ITERATION';
          value: { iterationId: string; title: string; startDate: string; duration: number };
      }
    | { id: string; dataType: 'MULTI_SELECT'; value: { id: string; name: string }[] }
    | { id: string; dataType: 'NUMBER'; value: number }
    | { id: string; dataType: 'SINGLE_SELECT'; value: { name: string; optionId: string } }
    | { id: string; dataType: 'TEXT'; value: string };

export type IssueOrPullRequestSpec = {
    owner: string;
    repo: string;
    number: number;
};
