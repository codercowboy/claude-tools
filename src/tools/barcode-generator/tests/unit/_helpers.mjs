import { loadLogic as loadShared } from '../../../../lib/test-support/unit.mjs';

export const loadLogic = () => loadShared(import.meta.url);
