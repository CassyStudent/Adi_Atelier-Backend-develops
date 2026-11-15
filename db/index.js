const { neon } = require('@neondatabase/serverless');

// pull the connection string from env — should be set in .env as DATABASE_URL
const sql = neon(process.env.DATABASE_URL);

module.exports = sql;