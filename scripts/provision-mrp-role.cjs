const { Pool } = require('pg');

const required = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'MRP_SERVICE_PASSWORD',
];
const missing = required.filter((name) => !process.env[name]);
if (!Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD')) {
  missing.push('DB_PASSWORD');
}
if (missing.length) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`,
  );
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 1,
});

async function provision() {
  const role = await pool.query(
    `SELECT format(
       'ALTER ROLE mrp_service LOGIN PASSWORD %L',
       $1::text
     ) AS statement
     WHERE EXISTS (
       SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'mrp_service'
     )`,
    [process.env.MRP_SERVICE_PASSWORD],
  );
  if (role.rowCount !== 1) {
    throw new Error('Role mrp_service does not exist; run migrations first.');
  }

  await pool.query(role.rows[0].statement);
  console.log('mrp_service login provisioned.');
}

provision()
  .finally(() => pool.end())
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
