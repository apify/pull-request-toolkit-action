export function isTestFilePath(filePath: string): boolean {
    const pathSegments = filePath.split('/');
    const fileName = pathSegments.pop() ?? '';

    // Any directory along the path that is a test directory, e.g. `test/`, `tests/` or `__tests__/`.
    if (pathSegments.some((segment) => /^_*tests?_*$/i.test(segment))) return true;

    // File names where `test` is a separate part, e.g. `foo.test.ts`, `test_foo.py` or `FooTest.java`.
    // Matching on parts rather than substrings keeps words like `latest` or `manifest` from counting as tests.
    const fileNameWithoutExtension = fileName.replace(/\.[^.]+$/, '');
    return (
        /(^|[._-])tests?([._-]|$)/i.test(fileNameWithoutExtension) || /[a-z0-9]Tests?$/.test(fileNameWithoutExtension)
    );
}
