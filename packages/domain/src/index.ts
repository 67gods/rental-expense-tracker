/**
 * @rental/domain
 *
 * The shared tax and operations layer. No I/O, no framework, no environment
 * access - so the Android client at M4 imports this package unchanged and both
 * clients agree on every number by construction (§8.3).
 */

export * from './types';
export * from './money';
export * from './dates';
export * from './csv';

export * from './constants/hourCategories';
export * from './constants/scheduleE';
export * from './constants/thresholds';
export * from './constants/captureLists';

export * from './rules/eligibility';
export * from './rules/enterprise';
export * from './rules/allocation';
export * from './rules/contractors';
export * from './rules/trips';
export * from './rules/payments';
export * from './rules/placedInService';
export * from './rules/reconciliation';
export * from './rules/jobs';

export * from './totals/hours';

export * from './schemas';
