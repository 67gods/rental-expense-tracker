/**
 * Loads .env.local for scripts run outside Next.js.
 *
 * `next dev` and `next build` load the env files themselves, but the migrate,
 * seed, and integrity scripts run under tsx, where nothing does. Using Next's
 * own loader rather than plain dotenv keeps the precedence rules identical
 * between the app and the scripts - otherwise a value could resolve one way in
 * a migration and another way at runtime.
 *
 * Import this first, before anything that reads process.env.
 */

import { loadEnvConfig } from '@next/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve from this file rather than cwd, so the scripts work when run from
// the repo root as well as from apps/web.
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

loadEnvConfig(appDir, process.env.NODE_ENV !== 'production');
