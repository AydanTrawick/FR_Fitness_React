import { seedHistory } from '../lib/analysis/seed.ts';
// Pipe to a fixture file if desired. No database writes or real user IDs.
console.log(JSON.stringify(seedHistory(Number(process.argv[2]??60)),null,2));
