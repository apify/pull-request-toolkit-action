# Changelog

## [2.3.0](https://github.com/apify/pull-request-toolkit-action/compare/v2.2.0...v2.3.0) (2026-09-16)


### Features

* Added GitHub native issue connection and Projects estimate field support ([68702ac](https://github.com/apify/pull-request-toolkit-action/commit/68702acf920672bd20635f54f08bb9d695d8f042))
* Added GitHub native issue connection and Projects estimate field support to PR checks ([5c3b28b](https://github.com/apify/pull-request-toolkit-action/commit/5c3b28bde10b025f788fef4b274c1506760f389f))
* adding project sprint assigment ([#47](https://github.com/apify/pull-request-toolkit-action/issues/47)) ([c3639fe](https://github.com/apify/pull-request-toolkit-action/commit/c3639fe07028ca8ab11eeb15697807e33ce6608c))
* allow a team board named other than "&lt;Team&gt; Team Kanban" ([#66](https://github.com/apify/pull-request-toolkit-action/issues/66)) ([32dd34b](https://github.com/apify/pull-request-toolkit-action/commit/32dd34bef2940a276af1fbdcd268cdeb1d67f046))
* skip linking and estimate check for Tooling team ([#54](https://github.com/apify/pull-request-toolkit-action/issues/54)) ([2f87379](https://github.com/apify/pull-request-toolkit-action/commit/2f87379537596140d21e705adb0ff577e57e20e5))
* Skip pull request toolkit milestone check from Security team ([#55](https://github.com/apify/pull-request-toolkit-action/issues/55)) ([0621254](https://github.com/apify/pull-request-toolkit-action/commit/0621254733d0712ae3865b6cc83d0d451b9e8d01))
* Stop excluding AI team from estimate and issue linking checks ([#60](https://github.com/apify/pull-request-toolkit-action/issues/60)) ([e83efbf](https://github.com/apify/pull-request-toolkit-action/commit/e83efbfeebf21f745bdba4a30a4ab97d94537267))
* Switch from Zenhub to GitHub projects (big rewrite) ([#61](https://github.com/apify/pull-request-toolkit-action/issues/61)) ([5c66832](https://github.com/apify/pull-request-toolkit-action/commit/5c668326df6e6181d5f8914f56ed3535a8a15fa4))


### Bug Fixes

* cleanup ([21b87b2](https://github.com/apify/pull-request-toolkit-action/commit/21b87b28cb59c7f52389fb1d655bae8b9571335f))
* committing dist changes ([cff06b4](https://github.com/apify/pull-request-toolkit-action/commit/cff06b4aa94fa4f3f7a2297c4d3e207e709a0d68))
* correctly detect estimation ([3934824](https://github.com/apify/pull-request-toolkit-action/commit/3934824e7ac0a233e1a223b7fa516dfd3358ca41))
* correctly detect estimation ([aad067a](https://github.com/apify/pull-request-toolkit-action/commit/aad067aa2b2bc48b3428d6bf10667f6cafcb6b0e))
* dist changes ([167abb2](https://github.com/apify/pull-request-toolkit-action/commit/167abb297dc56194b1a55175f3bd26a44c18029c))
* dist commit ([3195830](https://github.com/apify/pull-request-toolkit-action/commit/31958309784f71564fe79fe6c92e469892eec596))
* filter null nodes from closingIssuesReferences response ([9e4b133](https://github.com/apify/pull-request-toolkit-action/commit/9e4b133469cc3b411564904ba75bd25bdec8660b))
* formatting ([bf04442](https://github.com/apify/pull-request-toolkit-action/commit/bf04442183bad10404374a3dce52a6364ac5d045))
* handle null issue response for cross-repo closing references ([8730009](https://github.com/apify/pull-request-toolkit-action/commit/873000993ceb799d626b679628136e38e0c70bd9))
* idempotent checks read live PR state, not stale event payload ([567ee5b](https://github.com/apify/pull-request-toolkit-action/commit/567ee5b14e7031d85f068b99b5c532f252d10d1f))
* Lazy load secrets only when needed to fix PRs from forks with missing secrets ([#59](https://github.com/apify/pull-request-toolkit-action/issues/59)) ([c7f3d62](https://github.com/apify/pull-request-toolkit-action/commit/c7f3d627181223c57847c41cfbdb10e2b47316e6))
* quote workflow name to fix YAML syntax error ([75b7949](https://github.com/apify/pull-request-toolkit-action/commit/75b79496fa3de67fcb02fb0045f76033c7876829))
* read live PR state in idempotent checks instead of stale event payload ([bcd94c9](https://github.com/apify/pull-request-toolkit-action/commit/bcd94c91f49c45931fd3a1ba29b45e86dc72428c))
* resolve cross-repo closing references via org token for proper issue linking and estimate checks ([df5cd44](https://github.com/apify/pull-request-toolkit-action/commit/df5cd44c0cf2530ee5ed05a39aa2ee473a3c224d))
* simplify ([4d5f3db](https://github.com/apify/pull-request-toolkit-action/commit/4d5f3dbee10ebe1cc8a8f8b169713827ecd286b5))
* skip GitHub Projects estimate lookup for ZenHub-linked issues to avoid cross-repo API access ([2c8214d](https://github.com/apify/pull-request-toolkit-action/commit/2c8214d3befa33f9a5d8e26dfe1dc298dc03824d))
* Skip milestone filling for AI team ([#62](https://github.com/apify/pull-request-toolkit-action/issues/62)) ([acbc3a6](https://github.com/apify/pull-request-toolkit-action/commit/acbc3a6fb50b2d270c47149a6c757ed2a133008e))
* skip toolkit on bot PRs ([#68](https://github.com/apify/pull-request-toolkit-action/issues/68)) ([53d3dab](https://github.com/apify/pull-request-toolkit-action/commit/53d3dab02d182a0a20e13fcab4f64e5c0d694a08))
* support full GitHub URL format in cross-repo closing reference detection ([bb90fb5](https://github.com/apify/pull-request-toolkit-action/commit/bb90fb515e347004d95a30bfeaf8dd7d76a3647f))
* use body parsing as fallback for connection check when cross-repo issue fetch fails ([96401b2](https://github.com/apify/pull-request-toolkit-action/commit/96401b2581e265a5763061788f47fb08d7762cd5))
* use org token for cross-repo issue access in ensureCorrectLinkingAndEstimates ([8b54e72](https://github.com/apify/pull-request-toolkit-action/commit/8b54e72eef65040d6a31f036c0da252e056b9994))
* use unique concurrency group for testing workflow to avoid conflicts with org-level workflow ([6365798](https://github.com/apify/pull-request-toolkit-action/commit/6365798f2cbf4ecd8d2e7d05ff9a6b9580fe2e83))
