require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.connect((err,_,release) => { if(err) console.error('❌ DB Error:',err.message); else { console.log('✅ DB Connected'); release(); } });
module.exports = pool;
