import { describe, expect, test } from 'vitest';

import { isTestFilePath } from '../src/helpers.ts';

describe('isTestFilePath', () => {
    test('works with filenames', () => {
        expect(isTestFilePath('/dasdasd.test.js')).toBe(true);
        expect(isTestFilePath('asdasdlddd.ahoj.ss')).toBe(false);
        expect(isTestFilePath('bla.test.py')).toBe(true);
        expect(isTestFilePath('some-dir/another/test.py')).toBe(true);
        expect(isTestFilePath('asds/test/test.js')).toBe(true);
        expect(isTestFilePath('inte')).toBe(false);
        expect(isTestFilePath('bla.tests.py')).toBe(true);
        expect(isTestFilePath('testk.py')).toBe(false);
        expect(isTestFilePath('asds/test/test.js')).toBe(true);
        expect(isTestFilePath('ahoj.mjs')).toBe(false);
        expect(isTestFilePath('ahoj/test.mjs')).toBe(true);
        expect(isTestFilePath('ahoj/zdar/tests.py')).toBe(true);
        expect(isTestFilePath('my.tests.mjs')).toBe(true);
        expect(isTestFilePath('ahoj/test_basic.py')).toBe(true);
        expect(isTestFilePath('simething/jknkjnkj/js')).toBe(false);
        expect(isTestFilePath('test/jknkjnkj/js')).toBe(true);
        expect(isTestFilePath('/test/jknkjnkj/js')).toBe(true);
    });

    test('works with directories', () => {
        expect(isTestFilePath('something/test/something')).toBe(true);
        expect(isTestFilePath('something/tests/something')).toBe(true);
        expect(isTestFilePath('something/non-test/something')).toBe(false);
    });
});
