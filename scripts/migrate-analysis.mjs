import fs from 'node:fs';
import postgres from 'postgres';
if (!process.env.NEON_DATABASE_URL) throw new Error('NEON_DATABASE_URL is required.');
const sql=postgres(process.env.NEON_DATABASE_URL,{ssl:'require',max:1,connect_timeout:10});
try {await sql.unsafe(fs.readFileSync(new URL('../database/004_analysis.sql',import.meta.url),'utf8'));console.log('Analysis schema installed. Existing logs preserved.');} finally {await sql.end();}
