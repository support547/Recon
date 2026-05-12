const { Client } = require('pg');
const c = new Client({
  host: 'localhost',
  port: 5432,
  database: 'invensync',
  user: 'postgres',
  password: 'Kevat@1a',
});
(async () => {
  await c.connect();
  const s = await c.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE posted_date IS NOT NULL AND TRIM(posted_date::text) <> '') AS has_posted,
      COUNT(*) FILTER (WHERE posted_date_time IS NOT NULL AND TRIM(posted_date_time::text) <> '') AS has_posted_tm
    FROM settlement_report
  `);
  console.log('counts:', s.rows[0]);
  const samp = await c.query(`
    SELECT posted_date, posted_date_time, transaction_type, order_id
    FROM settlement_report
    WHERE LOWER(COALESCE(transaction_type,'')) LIKE '%order%'
    LIMIT 8
  `);
  console.log('sample rows:', samp.rows);
  const agg = await c.query(`
    SELECT settlement_id, order_id, sku, order_item_code,
      MAX(
        CASE
          WHEN TRIM(COALESCE(posted_date::text, '')) <> '' THEN TRIM(posted_date::text)
          WHEN TRIM(COALESCE(posted_date_time::text, '')) <> '' THEN TRIM(SPLIT_PART(REGEXP_REPLACE(TRIM(posted_date_time::text), 'T', ' '), ' ', 1))
          ELSE NULL
        END
      ) AS eff
    FROM settlement_report
    WHERE LOWER(COALESCE(transaction_type,'')) LIKE '%order%' AND order_id IS NOT NULL AND order_id <> ''
    GROUP BY settlement_id, order_id, sku, order_item_code
    LIMIT 5
  `);
  console.log('aggregated eff:', agg.rows);
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
