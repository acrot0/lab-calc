/**
 * Values the save-failure banner tests read.
 *
 * Exported from the real modules rather than retyped, so a rename in either
 * place fails the test rather than silently passing against a stale copy.
 */
export { STORAGE_KEY } from '../../src/ui/history.mjs';
export { BUNDLE_FORMAT as BUNDLE_FORMAT_FOR_TEST } from '../../src/ui/export.mjs';
