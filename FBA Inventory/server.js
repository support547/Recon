// InvenSync ERP - Local Server
// Yeh aapke computer pe chal raha hai
// Browser me jaao: http://localhost:3001

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
const { parse: csvParseStream } = require('csv-parse');
const copyFrom = require('pg-copy-streams').from;
const { Readable } = require('stream');
const XLSX    = require('xlsx');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = 3001;
const publicDir = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : path.join(__dirname, 'Public');

// ============================================
// DATABASE CONFIG - Apna password yahan daalo
// ============================================
const pool = new Pool({
  host:     'localhost',
  port:     5432,
  database: 'invensync',
  user:     'postgres',
  password: 'Kevat@1a',        // <-- APNA POSTGRESQL PASSWORD YAHAN DAALO
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('');
    console.error('  ❌ PostgreSQL connect nahi hua!');
    console.error('  Error:', err.message);
    console.error('');
    console.error('  Kya karein:');
    console.error('  1. PostgreSQL install hai? https://www.postgresql.org/download/windows/');
    console.error('  2. server.js mein apna password daalo (line 21)');
    console.error('  3. Phir dobara START.bat chalao');
    console.error('');
  } else {
    release();
    console.log('  ✅ PostgreSQL se connect ho gaya!');
  }
});

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// File upload - memory me rakhta hai (disk pe save nahi)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const REMOVAL_RECEIPT_UPLOAD_SUB = 'removal-receipts';
const REMOVAL_RECEIPT_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
]);
const removalReceiptAttach = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const okMime = REMOVAL_RECEIPT_ALLOWED_MIME.has(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext);
    if (okMime || okExt) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WebP) or PDF allowed'));
  },
});

// ============================================
// UTILITIES
// ============================================
function parseFile(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv') {
    const rows = parse(buffer.toString('utf8'), {
      columns: false, skip_empty_lines: true, trim: true, relax_quotes: true
    });
    return rows.map(row => row.map(c => String(c).replace(/"/g, '').trim()));
  } else if (ext === '.tsv' || ext === '.txt') {
    // TSV - tab separated, strip ALL quotes from each cell
    const lines = buffer.toString('utf8').split('\n').map(l =>
      l.split('\t').map(c => c.trim().replace(/"/g, '').replace(/'/g, ''))
    );
    return lines.filter(l => l.length > 1);
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    return rows.map(row => row.map(c => String(c).replace(/"/g, '').trim()));
  }
}

function toNum(val) {
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n);
}

function normShippedCostHeader(h) {
  return String(h || '').replace(/\ufeff/g, '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseMoneyCell(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (s === '' || s === '—' || s === '-') return null;
  const n = parseFloat(s.replace(/,/g, '').replace(/^\$/, ''));
  return Number.isFinite(n) ? n : null;
}

function csvEscapeCell(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Line-item USD fields that sum to per-book cost (final total = this sum × quantity) */
const SHIPPED_COST_COMPONENT_MONEY_FIELDS = [
  'final_net_price_usd', 'commission_usd', 'supplier_shipping_usd', 'warehouse_prep_usd',
  'inventory_place_inbound_usd', 'expert_charges_usd', 'other_charges_usd',
];
const SHIPPED_COST_TEXT_FIELDS = ['publisher_name', 'supplier_name', 'delivery_location', 'purchase_id'];

/** Sum of Final Net Price → Other Charges including Export charges (per-unit book cost before × qty) */
const SHIPPED_PERBOOK_SUM_SQL = '(COALESCE(final_net_price_usd,0)+COALESCE(commission_usd,0)+COALESCE(supplier_shipping_usd,0)+COALESCE(warehouse_prep_usd,0)+COALESCE(inventory_place_inbound_usd,0)+COALESCE(expert_charges_usd,0)+COALESCE(other_charges_usd,0))';

function shippedPerBookFromRow(row) {
  if (row.per_book_cost_usd != null && row.per_book_cost_usd !== '') {
    const x = parseFloat(row.per_book_cost_usd);
    if (Number.isFinite(x)) return x;
  }
  return (parseFloat(row.final_net_price_usd) || 0) + (parseFloat(row.commission_usd) || 0)
    + (parseFloat(row.supplier_shipping_usd) || 0) + (parseFloat(row.warehouse_prep_usd) || 0)
    + (parseFloat(row.inventory_place_inbound_usd) || 0) + (parseFloat(row.expert_charges_usd) || 0)
    + (parseFloat(row.other_charges_usd) || 0);
}

function shippedLineTotalFromRow(row) {
  if (row.final_total_purchase_cost_usd != null && row.final_total_purchase_cost_usd !== '') {
    const x = parseFloat(row.final_total_purchase_cost_usd);
    if (Number.isFinite(x)) return x;
  }
  const q = Math.max(0, parseInt(row.quantity, 10) || 0);
  return shippedPerBookFromRow(row) * q;
}

async function applyShippedFbaComputedCosts(client, shipmentId, msku) {
  if (shipmentId != null && msku != null) {
    await client.query(
      `UPDATE shipped_to_fba SET
        per_book_cost_usd = ${SHIPPED_PERBOOK_SUM_SQL},
        final_total_purchase_cost_usd = ${SHIPPED_PERBOOK_SUM_SQL} * GREATEST(COALESCE(quantity,0), 0)
       WHERE shipment_id = $1 AND msku = $2`,
      [shipmentId, msku]
    );
    return;
  }
  if (shipmentId != null) {
    await client.query(
      `UPDATE shipped_to_fba SET
        per_book_cost_usd = ${SHIPPED_PERBOOK_SUM_SQL},
        final_total_purchase_cost_usd = ${SHIPPED_PERBOOK_SUM_SQL} * GREATEST(COALESCE(quantity,0), 0)
       WHERE shipment_id = $1`,
      [shipmentId]
    );
  }
}

const SHIPPED_COST_HEADER_TO_FIELD = (() => {
  const pairs = [
    ['shipment_id', ['shipment_id', 'fba_shipment_id']],
    ['msku', ['msku', 'merchant_sku', 'sku']],
    ['title', ['title']],
    ['asin', ['asin']],
    ['fnsku', ['fnsku']],
    ['ship_date', ['ship_date', 'shipdate']],
    ['quantity', ['quantity', 'quantity_shipped', 'shipped']],
    ['publisher_name', ['publisher_name', 'publisher']],
    ['supplier_name', ['supplier_name', 'supplier']],
    ['delivery_location', [
      'delivery_location', 'delivery_location_name', 'ship_to', 'destination',
      'del_loc', 'del_location',
    ]],
    ['purchase_id', ['purchase_id', 'purchase_order_id', 'po_id']],
    ['final_net_price_usd', ['final_net_price_usd', 'final_net_price', 'net_price_usd']],
    ['commission_usd', ['commission_usd', 'commission']],
    ['supplier_shipping_usd', ['supplier_shipping_usd', 'shipping_by_supplier_usd', 'supplier_shipping']],
    ['warehouse_prep_usd', ['warehouse_prep_usd', 'warehouse_prep_charges_usd', 'warehouse_prep']],
    ['inventory_place_inbound_usd', [
      'inventory_place_inbound_usd', 'inventory_place_fee_and_inbound_usd',
      'inventory_place_fee_inbound_usd', 'place_fee_inbound',
    ]],
    ['expert_charges_usd', [
      'expert_charges_usd', 'expert_charges', 'export_charges_usd', 'export_charges',
    ]],
    ['other_charges_usd', ['other_charges_usd', 'other_charges']],
    ['per_book_cost_usd', ['per_book_cost_usd', 'per_book_cost', 'per_book_usd']],
    ['final_total_purchase_cost_usd', [
      'final_total_purchase_cost_usd', 'final_total_purchase_cost', 'total_purchase_cost_usd',
    ]],
  ];
  const m = {};
  for (const [field, syns] of pairs) for (const s of syns) m[s] = field;
  return m;
})();

const SHIPPED_COST_EXPORT_HEADERS = [
  'Shipment ID', 'Merchant SKU', 'Title', 'ASIN', 'FNSKU', 'Ship Date', 'Quantity Shipped',
  'Publisher Name', 'Supplier Name', 'Del Loc', 'Purchase ID',
  'Final Net Price USD', 'Commission USD', 'Shipping By Supplier USD',
  'Warehouse Prep Charges USD', 'Inventory Place Fee And Inbound USD',
  'Export Charges USD', 'Other Charges USD', 'Per Book Cost USD', 'Final Total Purchase Cost USD',
];

function shippedCostFieldIndexFromHeaders(headerRow) {
  const idx = {};
  (headerRow || []).forEach((raw, colIndex) => {
    const n = normShippedCostHeader(raw);
    const field = SHIPPED_COST_HEADER_TO_FIELD[n];
    if (field && idx[field] === undefined) idx[field] = colIndex;
  });
  return idx;
}

function removalReceiptsUploadDir() {
  const dir = path.join(publicDir, 'uploads', REMOVAL_RECEIPT_UPLOAD_SUB);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isSafeRemovalAttachmentUrl(u) {
  return typeof u === 'string'
    && u.startsWith(`/uploads/${REMOVAL_RECEIPT_UPLOAD_SUB}/`)
    && !u.includes('..');
}

function parseAttachmentUrls(rowVal) {
  if (rowVal == null) return [];
  if (Array.isArray(rowVal)) return rowVal.filter(x => typeof x === 'string');
  if (typeof rowVal === 'string') {
    try {
      const j = JSON.parse(rowVal);
      return Array.isArray(j) ? j.filter(x => typeof x === 'string') : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function unlinkRemovalAttachments(urls) {
  if (!Array.isArray(urls)) return;
  const base = path.normalize(path.join(publicDir, 'uploads', REMOVAL_RECEIPT_UPLOAD_SUB));
  for (const u of urls) {
    if (!isSafeRemovalAttachmentUrl(u)) continue;
    const name = path.basename(u);
    if (!name || name.includes('..')) continue;
    const full = path.normalize(path.join(base, name));
    const rel = path.relative(base, full);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    try {
      if (fs.existsSync(full)) fs.unlinkSync(full);
    } catch (_) { /* ignore */ }
  }
}

function extForRemovalMime(mimetype, origName) {
  const fromName = path.extname(origName || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(fromName)) return fromName === '.jpeg' ? '.jpg' : fromName;
  const m = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return m[mimetype] || '.bin';
}

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // MM/DD/YYYY format
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // "Mar 6, 2026, 2:53 PM" or "Feb 4, 2026" — extract just date part before time
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // Try extracting "Month Day, Year" pattern
  const mdy2 = str.match(/([A-Za-z]+ \d{1,2},?\s*\d{4})/);
  if (mdy2) { const d2 = new Date(mdy2[1]); if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0]; }
  return null;
}

/** Track max calendar date seen while parsing an upload (for `uploaded_files.report_latest_date`). */
function createReportLatestDateTracker() {
  let max = null;
  return {
    note(val) {
      if (val == null || val === '') return;
      const d =
        val instanceof Date && !isNaN(val.getTime())
          ? val.toISOString().split('T')[0]
          : toDate(val);
      if (d && (!max || d > max)) max = d;
    },
    get() {
      return max;
    },
  };
}

// ============================================
// PERFORMANCE HELPERS
// ============================================

/**
 * Parse ?page= and ?limit= query params.
 * Returns { limit, page, offset } — safe, bounded values.
 */
function getPagination(query, defaultLimit = 500) {
  const limit  = Math.min(parseInt(query.limit)  || defaultLimit, 5000);
  const page   = Math.max(parseInt(query.page)   || 1, 1);
  const offset = (page - 1) * limit;
  return { limit, page, offset };
}

/**
 * Parse a file buffer as CSV/TSV in streaming mode and call onChunk(rows[]) every chunkSize rows.
 * Returns a Promise that resolves with { totalRows } when streaming is complete.
 * Keeps parseFile() for header/validation reads; this is only for the data rows.
 */
function streamCsvRows(buffer, filename, chunkSize, onChunk) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filename).toLowerCase();
    let totalRows = 0;
    let chunk = [];

    const flushChunk = async () => {
      if (chunk.length === 0) return;
      await onChunk(chunk);
      totalRows += chunk.length;
      chunk = [];
    };

    if (ext === '.tsv' || ext === '.txt') {
      // TSV — parse synchronously (tab-delimited, rarely large)
      const lines = buffer.toString('utf8').split('\n')
        .map(l => l.split('\t').map(c => c.trim().replace(/"/g, '').replace(/'/g, '')))
        .filter(l => l.length > 1);
      (async () => {
        for (const row of lines) {
          chunk.push(row);
          if (chunk.length >= chunkSize) await flushChunk();
        }
        await flushChunk();
        resolve({ totalRows });
      })().catch(reject);
      return;
    }

    if (ext !== '.csv') {
      // Excel — parse synchronously, chunk in memory
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        .map(row => row.map(c => String(c).replace(/"/g, '').trim()));
      (async () => {
        for (const row of rows) {
          chunk.push(row);
          if (chunk.length >= chunkSize) await flushChunk();
        }
        await flushChunk();
        resolve({ totalRows });
      })().catch(reject);
      return;
    }

    // CSV — true streaming via csv-parse Transform
    const readable = Readable.from(buffer.toString('utf8'));
    const parser   = csvParseStream({ columns: false, skip_empty_lines: true, trim: true, relax_quotes: true });

    const processRows = async () => {
      for await (const record of parser) {
        chunk.push(record.map(c => String(c).replace(/"/g, '').trim()));
        if (chunk.length >= chunkSize) await flushChunk();
      }
      await flushChunk();
      resolve({ totalRows });
    };

    readable.pipe(parser);
    processRows().catch(reject);
  });
}

/**
 * Bulk-insert rows into a PostgreSQL table using COPY FROM STDIN.
 * rows: array of arrays — each inner array maps to columns[] in order.
 * Values are escaped as CSV text and streamed directly into pg.
 */
function copyRowsToTable(client, tableName, columns, rows) {
  return new Promise((resolve, reject) => {
    if (rows.length === 0) return resolve(0);

    const colList  = columns.join(', ');
    const copySql  = `COPY ${tableName} (${colList}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`;
    const stream   = client.query(copyFrom(copySql));

    stream.on('error', reject);
    stream.on('finish', () => resolve(rows.length));

    for (const row of rows) {
      const line = row.map(v => {
        if (v === null || v === undefined) return '\\N';
        const s = String(v);
        if (/[",\n\r\\]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      }).join(',') + '\n';
      stream.write(line);
    }
    stream.end();
  });
}

/**
 * Temp-table COPY upsert pattern:
 *  1. Create temp table mirroring main table
 *  2. COPY rows into temp table
 *  3. INSERT ... SELECT ... ON CONFLICT into main table
 *  4. Temp table auto-drops at end of transaction
 */
async function copyUpsertRows(client, { tmpTable, mainTable, columns, rows, conflictSql }) {
  if (rows.length === 0) return 0;
  await client.query(
    `CREATE TEMP TABLE ${tmpTable} (LIKE ${mainTable} INCLUDING DEFAULTS) ON COMMIT DROP`
  );
  await copyRowsToTable(client, tmpTable, columns, rows);
  const colList = columns.join(', ');
  const result  = await client.query(
    `INSERT INTO ${mainTable} (${colList})
     SELECT ${colList} FROM ${tmpTable}
     ${conflictSql}`
  );
  return result.rowCount;
}

// ============================================
// HEALTH CHECK
// ============================================

/** Ensure sales_data.uq_sales matches INSERT … ON CONFLICT — includes qty + product_amount per shipment line. */
async function ensureSalesUqConstraint() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public' AND tc.table_name = 'sales_data'
        AND tc.constraint_type = 'UNIQUE' AND tc.constraint_name = 'uq_sales'
      GROUP BY tc.constraint_name`);
    if ((rows[0] && rows[0].cols) === 'sale_date,order_id,fc,ship_state,msku,quantity,product_amount') return;

    await client.query('BEGIN');
    await client.query(`UPDATE sales_data SET fc = COALESCE(fc,''), ship_state = COALESCE(ship_state,'')`);
    await client.query(`UPDATE sales_data SET quantity = COALESCE(quantity, 0), product_amount = COALESCE(product_amount, 0)`);
    await client.query(`
      DELETE FROM sales_data a USING sales_data b
      WHERE a.id < b.id
        AND a.sale_date IS NOT DISTINCT FROM b.sale_date
        AND COALESCE(a.order_id,'') = COALESCE(b.order_id,'')
        AND COALESCE(a.fc,'') = COALESCE(b.fc,'')
        AND COALESCE(a.ship_state,'') = COALESCE(b.ship_state,'')
        AND COALESCE(a.msku,'') = COALESCE(b.msku,'')
        AND COALESCE(a.quantity,0) = COALESCE(b.quantity,0)
        AND COALESCE(a.product_amount,0) = COALESCE(b.product_amount,0)`);
    await client.query(`ALTER TABLE sales_data DROP CONSTRAINT IF EXISTS uq_sales`);
    await client.query(`
      ALTER TABLE sales_data ADD CONSTRAINT uq_sales
      UNIQUE (sale_date, order_id, fc, ship_state, msku, quantity, product_amount)`);
    await client.query('COMMIT');
    console.log('  ✅ sales_data: unique key (sale_date, order_id, fc, ship_state, msku, quantity, product_amount)');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    console.warn('  ⚠ sales_data uq_sales migrate:', e.message);
  } finally {
    client.release();
  }
}

// ─── Auto-migrate: add new columns if missing ───
;(async () => {
  const migrations = [
    // removal_receipts new columns
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS seller_status     VARCHAR(100)`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS seller_comments   TEXT`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS warehouse_billed  VARCHAR(3)  DEFAULT 'NO'`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS billed_date       DATE`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS billed_amount     NUMERIC(10,2) DEFAULT 0`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS wrong_item_received BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS wrong_item_notes  TEXT`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS invoice_number    VARCHAR(120)`,
    `ALTER TABLE removal_receipts ADD COLUMN IF NOT EXISTS reshipped_qty     INT DEFAULT 0`,
    // shipped_to_fba — cost worksheet columns
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS publisher_name TEXT`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS supplier_name TEXT`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS delivery_location TEXT`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS purchase_id VARCHAR(120)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS final_net_price_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS commission_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS supplier_shipping_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS warehouse_prep_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS inventory_place_inbound_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS expert_charges_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS other_charges_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS final_total_purchase_cost_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS per_book_cost_usd NUMERIC(12,4)`,
    `ALTER TABLE shipped_to_fba ADD COLUMN IF NOT EXISTS cost_updated_at TIMESTAMPTZ`,
    // replacements new columns
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS shipment_date                  TIMESTAMPTZ`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS asin                           VARCHAR(20)`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS fulfillment_center_id          VARCHAR(20)`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS original_fulfillment_center_id VARCHAR(20)`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS replacement_reason_code        VARCHAR(20)`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS replacement_order_id           VARCHAR(50)`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS original_order_id              VARCHAR(50)`,
    `ALTER TABLE replacements ADD COLUMN IF NOT EXISTS uploaded_at                    TIMESTAMPTZ DEFAULT NOW()`,
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch(e) { /* table may not exist yet — skip */ }
  }
  // Add unique index on replacement_order_id (non-null) for upsert support
  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS replacements_repl_order_uniq
      ON replacements (replacement_order_id) WHERE replacement_order_id IS NOT NULL`);
  } catch(e) { /* ignore if already exists */ }
  await ensureSalesUqConstraint();
})();

// ═══════════════════════════════════════════════════════
//  REMOVAL RECEIPTS — Manual Warehouse Entry CRUD
// ═══════════════════════════════════════════════════════

// GET all receipts (with joins to removal_shipments + fba_removals)
app.get('/api/removal-receipts', async (req, res) => {
  try {
    const { order_id, status, from, to } = req.query;
    const { limit, page, offset } = getPagination(req.query);
    // receipt_invoice_number: explicit alias so join columns cannot clobber rr.invoice_number in node-pg row objects
    let base = `FROM removal_receipts rr
      LEFT JOIN removal_shipments rs
        ON rr.order_id = rs.order_id AND rr.fnsku = rs.fnsku AND rr.tracking_number = rs.tracking_number
      LEFT JOIN fba_removals ro
        ON rr.order_id = ro.order_id AND rr.fnsku = ro.fnsku
      WHERE 1=1`;
    const params = [];
    if (order_id) { params.push(order_id); base += ` AND rr.order_id=$${params.length}`; }
    if (status)   { params.push(status);   base += ` AND rr.status=$${params.length}`; }
    if (from)     { params.push(from);     base += ` AND rr.received_date>=$${params.length}`; }
    if (to)       { params.push(to);       base += ` AND rr.received_date<=$${params.length}`; }

    const countResult = await pool.query(`SELECT COUNT(*) ${base}`, params);
    const total_count = parseInt(countResult.rows[0].count);

    params.push(limit, offset);
    const q = `SELECT rr.*,
      rs.shipment_date, rs.removal_order_type,
      ro.order_status, ro.order_type, ro.order_source,
      ro.quantity       AS ordered_qty,
      ro.cancelled_qty  AS order_cancelled_qty,
      ro.disposed_qty   AS order_disposed_qty,
      ro.removal_fee,
      rr.invoice_number AS receipt_invoice_number
      ${base} ORDER BY rr.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(q, params);
    res.json({ rows: r.rows, total_count, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET reconciliation — ALL Removal Order Detail + Shipment + Receipt + Case status
app.get('/api/removal-recon', async (req, res) => {
  try {
    const { from, to, search, status } = req.query;

    // Check which tables exist to build query safely
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
      AND table_name IN ('removal_shipments','removal_receipts','case_tracker')
    `);
    const existingTables = tableCheck.rows.map(r => r.table_name);
    const hasShipments = existingTables.includes('removal_shipments');
    const hasReceipts  = existingTables.includes('removal_receipts');
    const hasCases     = existingTables.includes('case_tracker');

    // Check optional columns in removal_receipts
    let hasMissing=false, hasReimbQty=false, hasReimbAmt=false, hasFinalStatus=false, hasPostAction=false,
        hasItemTitle=false, hasBinLoc=false;
    if (hasReceipts) {
      const colCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name='removal_receipts'
        AND column_name IN ('reimb_qty','reimb_amount','final_status','post_action','missing_qty','item_title','bin_location')`);
      const cols = colCheck.rows.map(r => r.column_name);
      hasMissing     = cols.includes('missing_qty');
      hasReimbQty    = cols.includes('reimb_qty');
      hasReimbAmt    = cols.includes('reimb_amount');
      hasFinalStatus = cols.includes('final_status');
      hasPostAction  = cols.includes('post_action');
      hasItemTitle   = cols.includes('item_title');
      hasBinLoc      = cols.includes('bin_location');
    }

    // ── Subquery for removal_shipments (avoids row multiplication) ──
    const shipSub = hasShipments
      ? `LEFT JOIN (
          SELECT order_id, msku,
            STRING_AGG(DISTINCT carrier,         ' | ') AS carriers,
            STRING_AGG(DISTINCT tracking_number, ' | ') AS tracking_numbers,
            COALESCE(SUM(shipped_qty), 0)               AS actual_shipped_qty
          FROM removal_shipments
          GROUP BY order_id, msku
        ) rs ON ro.order_id = rs.order_id AND ro.msku = rs.msku`
      : '';

    // ── Subquery for removal_receipts (avoids row multiplication) ──
    const rcptSub = hasReceipts
      ? `LEFT JOIN (
          SELECT order_id, fnsku,
            COALESCE(SUM(received_qty),   0) AS received_qty,
            COALESCE(SUM(sellable_qty),   0) AS sellable_qty,
            COALESCE(SUM(unsellable_qty), 0) AS unsellable_qty,
            ${hasMissing     ? 'COALESCE(SUM(missing_qty), 0)'               : '0'}           AS wh_missing_qty,
            COUNT(*)                                                                            AS receipt_count,
            ${hasReimbQty    ? 'COALESCE(SUM(reimb_qty), 0)'                 : '0'}           AS rr_reimb_qty,
            ${hasReimbAmt    ? 'COALESCE(SUM(reimb_amount), 0)'              : '0'}           AS rr_reimb_amount,
            ${hasFinalStatus ? "STRING_AGG(DISTINCT final_status, ', ')"     : 'NULL::text'}  AS final_statuses,
            ${hasPostAction  ? "STRING_AGG(DISTINCT post_action, ', ')"      : 'NULL::text'}  AS post_actions,
            COUNT(*) FILTER (WHERE wrong_item_received = true)                                 AS wrong_item_count,
            ${hasItemTitle ? "NULLIF(STRING_AGG(NULLIF(TRIM(item_title), ''), ' | ' ORDER BY id), '')"       : 'NULL::text'} AS receipt_title,
            ${hasBinLoc ? "NULLIF(STRING_AGG(NULLIF(TRIM(bin_location), ''), ' | ' ORDER BY id), '')"        : 'NULL::text'} AS receipt_bin
          FROM removal_receipts
          GROUP BY order_id, fnsku
        ) rr ON ro.order_id = rr.order_id AND ro.fnsku = rr.fnsku`
      : '';

    // ── Subquery for case_tracker — includes approved reimbursement data ──
    const caseSub = hasCases
      ? `LEFT JOIN (
          SELECT order_id, fnsku,
            COUNT(*)                                                      AS case_count,
            STRING_AGG(DISTINCT case_id, ', ')                           AS case_ids,
            CASE
              WHEN MAX(CASE WHEN status='resolved' THEN 1 ELSE 0 END)=1 THEN 'Resolved'
              WHEN MAX(CASE WHEN status='raised'   THEN 1 ELSE 0 END)=1 THEN 'Open'
              WHEN MAX(CASE WHEN status='approved' THEN 1 ELSE 0 END)=1 THEN 'Approved'
              WHEN MAX(CASE WHEN status='rejected' THEN 1 ELSE 0 END)=1 THEN 'Rejected'
              WHEN MAX(CASE WHEN status='closed'   THEN 1 ELSE 0 END)=1 THEN 'Closed'
              ELSE 'Pending'
            END AS case_status,
            -- Any case with units_approved/amount_approved filled in contributes reimbursement
            -- (regardless of status — user may not change status when entering reimbursement)
            COALESCE(SUM(COALESCE(units_approved,  0)), 0) AS ct_reimb_qty,
            COALESCE(SUM(COALESCE(amount_approved, 0)), 0) AS ct_reimb_amount
          FROM case_tracker
          WHERE recon_type = 'removal'
          GROUP BY order_id, fnsku
        ) ct ON ro.order_id = ct.order_id AND (ro.fnsku = ct.fnsku OR ct.fnsku IS NULL)`
      : '';

    // ── SELECT columns (no GROUP BY needed — subqueries are pre-aggregated) ──
    const rcvQty     = hasReceipts ? 'COALESCE(rr.received_qty, 0)'   : '0';
    const sellQty    = hasReceipts ? 'COALESCE(rr.sellable_qty, 0)'   : '0';
    const unsellQty  = hasReceipts ? 'COALESCE(rr.unsellable_qty, 0)' : '0';
    const missQty    = hasReceipts ? 'COALESCE(rr.wh_missing_qty, 0)' : '0';
    const rcptCount  = hasReceipts ? 'COALESCE(rr.receipt_count, 0)'  : '0';
    const rrReimbQ   = hasReceipts ? 'COALESCE(rr.rr_reimb_qty, 0)'   : '0';
    const rrReimbA   = hasReceipts ? 'COALESCE(rr.rr_reimb_amount, 0)': '0';
    const ctReimbQ   = hasCases    ? 'COALESCE(ct.ct_reimb_qty, 0)'   : '0';
    const ctReimbA   = hasCases    ? 'COALESCE(ct.ct_reimb_amount, 0)': '0';

    // Combined reimb: receipt entry takes priority; fallback to approved case amount
    const reimbQtyExpr  = `CASE WHEN ${rrReimbQ} > 0 THEN ${rrReimbQ} ELSE ${ctReimbQ} END`;
    const reimbAmtExpr  = `CASE WHEN ${rrReimbA} > 0 THEN ${rrReimbA} ELSE ${ctReimbA} END`;

    // receipt_status: based on combined data
    const receiptStatusExpr = hasReceipts ? `
        CASE
          WHEN (${rrReimbQ}) > 0 OR (${ctReimbQ}) > 0  THEN 'Reimbursed'
          WHEN ${rcptCount} = 0 AND ro.order_status = 'Completed'
            AND ${hasShipments ? 'COALESCE(rs.actual_shipped_qty, 0)' : '0'} > 0
            THEN 'Awaiting'
          WHEN ${rcptCount} = 0                          THEN 'Not Applicable'
          WHEN ${unsellQty} > 0 AND ${sellQty} = 0      THEN 'Damaged'
          WHEN ${rcvQty} >= (ro.quantity - COALESCE(ro.cancelled_qty,0) - COALESCE(ro.disposed_qty,0))
            AND (ro.quantity - COALESCE(ro.cancelled_qty,0) - COALESCE(ro.disposed_qty,0)) > 0
            THEN 'Received'
          WHEN ${rcvQty} > 0                            THEN 'Partial'
          WHEN ${missQty} > 0                           THEN 'Missing'
          ELSE 'Awaiting'
        END` : "'Not Applicable'";

    let q = `
      SELECT
        ro.id, ro.order_id, ro.request_date, ro.msku, ro.fnsku,
        ro.order_type, ro.order_status, ro.disposition,
        ro.quantity                                                     AS requested_qty,
        COALESCE(ro.cancelled_qty, 0)                                   AS cancelled_qty,
        COALESCE(ro.disposed_qty,  0)                                   AS disposed_qty,
        ro.quantity - COALESCE(ro.cancelled_qty,0) - COALESCE(ro.disposed_qty,0)
                                                                        AS expected_shipped_qty,
        COALESCE(ro.in_process_qty, 0)                                  AS in_process_qty,
        ro.removal_fee, ro.currency,
        -- Shipments
        ${hasShipments ? 'COALESCE(rs.carriers, NULL)'           : 'NULL::text'} AS carriers,
        ${hasShipments ? 'COALESCE(rs.tracking_numbers, NULL)'   : 'NULL::text'} AS tracking_numbers,
        ${hasShipments ? 'COALESCE(rs.actual_shipped_qty, 0)'    : '0'}          AS actual_shipped_qty,
        -- Receipts
        ${rcvQty}    AS received_qty,
        ${sellQty}   AS sellable_qty,
        ${unsellQty} AS unsellable_qty,
        ${missQty}   AS wh_missing_qty,
        ${rcptCount} AS receipt_count,
        -- Reimbursement (receipt-entry first, approved case as fallback)
        ${reimbQtyExpr}  AS reimb_qty,
        ${reimbAmtExpr}  AS reimb_amount,
        -- Raw values for UI distinction
        ${rrReimbQ}  AS rr_reimb_qty,
        ${ctReimbQ}  AS ct_reimb_qty,
        ${rrReimbA}  AS rr_reimb_amount,
        ${ctReimbA}  AS ct_reimb_amount,
        ${hasReceipts ? 'rr.final_statuses'   : 'NULL::text'}  AS final_statuses,
        ${hasReceipts ? 'rr.post_actions'     : 'NULL::text'}  AS post_actions,
        ${hasReceipts ? 'COALESCE(rr.wrong_item_count, 0)' : '0'} AS wrong_item_count,
        ${hasReceipts && hasItemTitle ? 'rr.receipt_title' : 'NULL::text'} AS receipt_title,
        ${hasReceipts && hasBinLoc ? 'rr.receipt_bin' : 'NULL::text'} AS receipt_bin,
        ${receiptStatusExpr} AS receipt_status,
        -- Cases
        ${hasCases ? 'COALESCE(ct.case_count, 0)'           : '0'}           AS case_count,
        ${hasCases ? "COALESCE(ct.case_ids, NULL)"           : 'NULL::text'}  AS case_ids,
        ${hasCases ? "COALESCE(ct.case_status, 'No Case')"   : "'No Case'"}   AS case_status
      FROM fba_removals ro
      ${shipSub}
      ${rcptSub}
      ${caseSub}
      WHERE 1=1`;

    const params = [];
    if (from)   { params.push(from);   q += ` AND ro.request_date >= $${params.length}`; }
    if (to)     { params.push(to);     q += ` AND ro.request_date <= $${params.length}`; }
    if (search) {
      params.push('%' + search + '%');
      q += ` AND (ro.msku ILIKE $${params.length} OR ro.fnsku ILIKE $${params.length} OR ro.order_id ILIKE $${params.length})`;
    }
    if (status) { params.push(status); q += ` AND ro.order_status = $${params.length}`; }

    q += ` ORDER BY ro.request_date DESC`;

    const { limit, page, offset } = getPagination(req.query);
    const result = await pool.query(q, params);
    const allRows = result.rows;

    const stats = {
      total:          allRows.length,
      completed:      allRows.filter(r => r.order_status === 'Completed').length,
      received:       allRows.filter(r => r.receipt_status === 'Received').length,
      awaiting:       allRows.filter(r => r.receipt_status === 'Awaiting').length,
      partial:        allRows.filter(r => r.receipt_status === 'Partial').length,
      missing:        allRows.filter(r => r.receipt_status === 'Missing').length,
      damaged:        allRows.filter(r => r.receipt_status === 'Damaged').length,
      cases_open:     allRows.filter(r => r.case_status === 'Open').length,
      total_fee:      allRows.reduce((s,r) => s + (parseFloat(r.removal_fee)||0), 0),
    };

    const rows = allRows.slice(offset, offset + limit);
    res.json({ rows, stats, total_count: allRows.length, page, limit });
  } catch(e) {
    console.error('removal-recon error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Dedicated endpoint: case-tracker reimbursements for removal orders ──
// Joined purely by order_id — no fnsku ambiguity. Used by frontend to overlay
// case-approved reimbursements onto the Removal Orders table.
app.get('/api/removal-case-reimb', async (req, res) => {
  try {
    const { limit, page, offset } = getPagination(req.query);
    const countRes = await pool.query(`
      SELECT COUNT(DISTINCT order_id) FROM case_tracker
      WHERE recon_type = 'removal' AND order_id IS NOT NULL AND order_id <> ''
    `);
    const total_count = parseInt(countRes.rows[0].count);
    const r = await pool.query(`
      SELECT
        order_id,
        SUM(COALESCE(units_approved,  0)) AS ct_reimb_qty,
        SUM(COALESCE(amount_approved, 0)) AS ct_reimb_amount,
        STRING_AGG(DISTINCT case_id, ', ') FILTER (WHERE case_id IS NOT NULL) AS case_ids,
        COUNT(*) AS case_count,
        MAX(CASE WHEN status='resolved' THEN 4
                 WHEN status='approved' THEN 3
                 WHEN status='raised'   THEN 2
                 WHEN status='closed'   THEN 1
                 ELSE 0 END) AS status_rank,
        (ARRAY_AGG(status ORDER BY
          CASE WHEN status='resolved' THEN 4
               WHEN status='approved' THEN 3
               WHEN status='raised'   THEN 2
               WHEN status='closed'   THEN 1
               ELSE 0 END DESC))[1] AS top_status
      FROM case_tracker
      WHERE recon_type = 'removal'
        AND order_id IS NOT NULL
        AND order_id <> ''
      GROUP BY order_id
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json({ rows: r.rows, total_count, page, limit });
  } catch(e) {
    console.error('removal-case-reimb error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST — create/update receipt + raise case in case_tracker (same table as Cases & Adjustments)
app.post('/api/removal-receipts', async (req, res) => {
  try {
    const {
      order_id, fnsku, msku, tracking_number, carrier,
      expected_qty, received_date, received_qty,
      sellable_qty, unsellable_qty, condition_received,
      notes, received_by, status,
      raise_case, case_type, case_reason,
      units_claimed, amount_claimed, case_notes, issue_date,
      // Reimbursement fields (from saveReimb in Orders tab)
      reimb_qty, reimb_amount, final_status, post_action,
      // Warehouse fields
      warehouse_comment, transfer_to, wh_status,
      // New fields
      wrong_item_received, wrong_item_notes,
      seller_status, seller_comments,
      warehouse_billed, billed_date, billed_amount, invoice_number,
      item_title, bin_location,
    } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Upsert receipt
      const rr = await client.query(
        `INSERT INTO removal_receipts
           (order_id,fnsku,msku,tracking_number,carrier,expected_qty,received_date,
            received_qty,sellable_qty,unsellable_qty,condition_received,notes,received_by,status,
            warehouse_comment,transfer_to,wh_status,
            wrong_item_received,wrong_item_notes,item_title,bin_location)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (order_id, fnsku, tracking_number) DO UPDATE SET
           received_date=EXCLUDED.received_date,
           received_qty=EXCLUDED.received_qty,
           sellable_qty=EXCLUDED.sellable_qty,
           unsellable_qty=EXCLUDED.unsellable_qty,
           condition_received=EXCLUDED.condition_received,
           notes=EXCLUDED.notes,
           received_by=EXCLUDED.received_by,
           status=EXCLUDED.status,
           warehouse_comment=EXCLUDED.warehouse_comment,
           transfer_to=EXCLUDED.transfer_to,
           wh_status=EXCLUDED.wh_status,
           wrong_item_received=EXCLUDED.wrong_item_received,
           wrong_item_notes=EXCLUDED.wrong_item_notes,
           item_title=EXCLUDED.item_title,
           bin_location=EXCLUDED.bin_location,
           updated_at=NOW()
         RETURNING *`,
        [order_id, fnsku||null, msku||null, tracking_number||null, carrier||null,
         parseInt(expected_qty)||0, received_date||null,
         parseInt(received_qty)||0, parseInt(sellable_qty)||0,
         parseInt(unsellable_qty)||0, condition_received||'Pending',
         notes||null, received_by||null, status||'Pending',
         warehouse_comment||null, transfer_to||null, wh_status||'Pending',
         wrong_item_received===true||wrong_item_received==='true'||wrong_item_received===1 ? true : false,
         wrong_item_notes||null,
         (item_title != null && String(item_title).trim() !== '') ? String(item_title).trim() : null,
         (bin_location != null && String(bin_location).trim() !== '') ? String(bin_location).trim() : null]
      );

      await client.query('COMMIT');

      // 1b. Update extended fields if provided (reimb/action/billing/seller)
      if (rr.rows[0]) {
        try {
          const extFields = {
            reimb_qty, reimb_amount, final_status, post_action,
            seller_status, seller_comments,
            warehouse_billed, billed_date, billed_amount, invoice_number,
          };
          const setParts = []; const setVals = [];
          const coerce = { reimb_qty: v=>parseInt(v)||0, reimb_amount: v=>parseFloat(v)||0,
            billed_amount: v=>parseFloat(v)||0 };
          for (const [k, v] of Object.entries(extFields)) {
            if (v !== undefined && v !== null && v !== '') {
              setParts.push(`${k}=$${setVals.length+1}`);
              setVals.push(coerce[k] ? coerce[k](v) : v);
            }
          }
          if (setParts.length > 0) {
            setVals.push(rr.rows[0].id);
            await pool.query(
              `UPDATE removal_receipts SET ${setParts.join(', ')} WHERE id=$${setVals.length}`,
              setVals
            );
          }
        } catch(extErr) {
          console.log('  Note: extended fields update skipped:', extErr.message);
        }
      }

      // 2. Case creation — SEPARATE transaction so receipt is ALWAYS saved
      let caseRow = null;
      if (raise_case && msku && msku.trim()) {
        const caseClient = await pool.connect();
        try {
          await caseClient.query('BEGIN');
          const today = new Date().toISOString().split('T')[0];

          // Insert into case_tracker with recon_type='removal'
          // This matches the 'Removal' option in Cases & Adjustments dropdown
          const caseInsert = await caseClient.query(
            `INSERT INTO case_tracker
               (msku, fnsku, recon_type, order_id,
                case_reason, units_claimed, amount_claimed, currency,
                status, issue_date, raised_date, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [
              msku.trim(),
              fnsku || null,
              'removal',
              order_id || null,
              case_reason || case_type || 'Removal Issue',
              parseInt(units_claimed) || 0,
              parseFloat(amount_claimed) || 0,
              'USD',
              'raised',
              issue_date || received_date || today,
              today,
              case_notes || notes || null
            ]
          );
          caseRow = caseInsert.rows[0];

          // Try to link case to receipt (only if column exists)
          if (caseRow && rr.rows[0]) {
            try {
              await caseClient.query(
                `UPDATE removal_receipts
                   SET case_tracker_id=$1, case_raised_at=NOW()
                 WHERE id=$2`,
                [caseRow.id, rr.rows[0].id]
              );
            } catch(linkErr) {
              console.log('Note: case link column not yet migrated — run migrate_removal_receipt_case.sql');
            }
          }

          await caseClient.query('COMMIT');
          console.log('✅ Case created in case_tracker:', caseRow?.id, 'recon_type=removal');
        } catch(caseErr) {
          await caseClient.query('ROLLBACK');
          console.error('Case creation error (receipt still saved):', caseErr.message);
        } finally { caseClient.release(); }
      }

      res.json({ success: true, row: rr.rows[0], case: caseRow });
    } catch(e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch(e) {
    console.error('removal-receipts POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST — attach up to 4 images / PDFs to a receipt (replaces previous attachments)
app.post('/api/removal-receipts/:id/attachments', (req, res) => {
  removalReceiptAttach.array('attachments', 4)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload error' });
    }
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid receipt id' });

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'Select at least one file (max 4)' });
    }

    try {
      const cur = await pool.query(
        'SELECT attachment_urls FROM removal_receipts WHERE id=$1',
        [id]
      );
      if (!cur.rows.length) return res.status(404).json({ error: 'Receipt not found' });

      const oldUrls = parseAttachmentUrls(cur.rows[0].attachment_urls);
      const uploadDir = removalReceiptsUploadDir();
      const newUrls = [];
      const writtenPaths = [];

      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const ext = extForRemovalMime(f.mimetype, f.originalname);
          if (ext === '.bin') throw new Error('Unsupported file type');
          const name = `${id}-${crypto.randomBytes(6).toString('hex')}${ext}`;
          const full = path.join(uploadDir, name);
          fs.writeFileSync(full, f.buffer);
          writtenPaths.push(full);
          newUrls.push(`/uploads/${REMOVAL_RECEIPT_UPLOAD_SUB}/${name}`);
        }

        await pool.query(
          `UPDATE removal_receipts SET attachment_urls=$1::jsonb, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify(newUrls), id]
        );
        unlinkRemovalAttachments(oldUrls);
      } catch (inner) {
        for (const p of writtenPaths) {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* */ }
        }
        throw inner;
      }

      const row = await pool.query('SELECT id, attachment_urls FROM removal_receipts WHERE id=$1', [id]);
      res.json({ success: true, attachment_urls: parseAttachmentUrls(row.rows[0]?.attachment_urls), row: row.rows[0] });
    } catch (e) {
      console.error('removal-receipts attachments error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
});

// PUT reimb — update reimbursement on existing receipt by order_id+fnsku
app.put('/api/removal-receipts/reimb', async (req, res) => {
  try {
    const { order_id, fnsku, reimb_qty, reimb_amount, notes } = req.body;
    if (!order_id) return res.status(400).json({ error: 'order_id required' });

    // Check if columns exist (auto-migration should have run)
    const colChk = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='removal_receipts'
      AND column_name IN ('reimb_qty','reimb_amount','final_status','post_action')`);
    const hasCols = colChk.rows.length > 0;

    if (!hasCols) {
      return res.status(400).json({ error: 'Migration not run yet. Restart server to auto-migrate.' });
    }

    // Find existing receipt
    const existing = await pool.query(
      `SELECT id FROM removal_receipts WHERE order_id=$1 AND (fnsku=$2 OR $2 IS NULL OR $2='')
       ORDER BY received_qty DESC LIMIT 1`,
      [order_id, fnsku||null]
    );

    if (existing.rows.length > 0) {
      // Update existing receipt
      const id = existing.rows[0].id;
      await pool.query(
        `UPDATE removal_receipts
           SET reimb_qty=$1, reimb_amount=$2, status='Reimbursed',
               final_status='Reimbursement claimed', post_action='Reimbursement claimed',
               notes=COALESCE($3, notes), updated_at=NOW()
         WHERE id=$4`,
        [parseInt(reimb_qty)||0, parseFloat(reimb_amount)||0, notes||null, id]
      );
      const updated = await pool.query('SELECT * FROM removal_receipts WHERE id=$1', [id]);
      res.json({ success: true, row: updated.rows[0], updated: true });
    } else {
      // No receipt yet — create minimal one with reimb data
      const r = await pool.query(
        `INSERT INTO removal_receipts
           (order_id, fnsku, status, reimb_qty, reimb_amount,
            final_status, post_action, notes)
         VALUES ($1,$2,'Reimbursed',$3,$4,'Reimbursement claimed','Reimbursement claimed',$5)
         RETURNING *`,
        [order_id, fnsku||null, parseInt(reimb_qty)||0,
         parseFloat(reimb_amount)||0, notes||null]
      );
      res.json({ success: true, row: r.rows[0], created: true });
    }
  } catch(e) {
    console.error('reimb update error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT — update receipt (including post-action + reimbursement)
app.put('/api/removal-receipts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Strict whitelist — prevents SQL injection via field names
    const ALLOWED = {
      received_date:        v => v||null,
      received_qty:         v => parseInt(v)||0,
      sellable_qty:         v => parseInt(v)||0,
      unsellable_qty:       v => parseInt(v)||0,
      condition_received:   v => v||'Pending',
      notes:                v => v||null,
      received_by:          v => v||null,
      status:               v => v||'Pending',
      post_action:          v => v||null,
      action_remarks:       v => v||null,
      action_date:          v => v||null,
      final_status:         v => v||null,
      reimb_qty:            v => parseInt(v)||0,
      reimb_amount:         v => parseFloat(v)||0,
      warehouse_comment:    v => v||null,
      transfer_to:          v => v||null,
      reshipped_qty:        v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; },
      wh_status:            v => v||'Pending',
      // New fields
      seller_status:        v => v||null,
      seller_comments:      v => v||null,
      warehouse_billed:     v => (v==='YES'||v==='NO') ? v : 'NO',
      billed_date:          v => v||null,
      billed_amount:        v => parseFloat(v)||0,
      invoice_number:       v => (v != null && String(v).trim() !== '') ? String(v).trim().slice(0, 120) : null,
      wrong_item_received:  v => v===true||v==='true'||v===1||v==='1' ? true : false,
      wrong_item_notes:     v => v||null,
      item_title:           v => (v != null && String(v).trim() !== '') ? String(v).trim() : null,
      bin_location:         v => (v != null && String(v).trim() !== '') ? String(v).trim() : null,
    };

    const cols = ['updated_at'];
    const vals = [new Date()];

    for (const [field, coerce] of Object.entries(ALLOWED)) {
      if (req.body[field] !== undefined) {
        cols.push(field);
        vals.push(coerce(req.body[field]));
      }
    }

    const setClause = cols.map((c,i) => `${c}=$${i+1}`).join(', ');
    vals.push(id);
    const r = await pool.query(
      `UPDATE removal_receipts SET ${setClause} WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, row: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE — remove receipt
app.delete('/api/removal-receipts/:id', async (req, res) => {
  try {
    const prev = await pool.query(
      'SELECT attachment_urls FROM removal_receipts WHERE id=$1',
      [req.params.id]
    );
    if (prev.rows[0]) {
      unlinkRemovalAttachments(parseAttachmentUrls(prev.rows[0].attachment_urls));
    }
    await pool.query('DELETE FROM removal_receipts WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', message: 'InvenSync chal raha hai!' });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'disconnected', message: e.message });
  }
});

/** uploaded_files.report_type → data table (batch linked by uploaded_at) */
const UPLOAD_HISTORY_DATA_TABLE = {
  shipped_to_fba: 'shipped_to_fba',
  sales_data: 'sales_data',
  fba_receipts: 'fba_receipts',
  customer_returns: 'customer_returns',
  reimbursements: 'reimbursements',
  fc_transfers: 'fc_transfers',
  replacements: 'replacements',
  gnr_report: 'gnr_report',
  fba_removals: 'fba_removals',
  removal_shipments: 'removal_shipments',
  shipment_status: 'shipment_status',
  fba_summary: 'fba_summary',
  payment_repository: 'payment_repository',
  settlement_report: 'settlement_report',
};

const UPLOAD_HISTORY_ALLOWED_TABLES = new Set(Object.values(UPLOAD_HISTORY_DATA_TABLE));

/** SQL fragment: map normalized report_type → physical table (same keys as UPLOAD_HISTORY_DATA_TABLE). */
function uploadHistoryTypeMapSqlValues(alias = '_utm') {
  const esc = (s) => `'${String(s).replace(/'/g, "''")}'`;
  return `(VALUES ${Object.entries(UPLOAD_HISTORY_DATA_TABLE)
    .map(([k, v]) => `(${esc(k)}, ${esc(v)})`)
    .join(', ')}) AS ${alias}(rt_key, phys_table)`;
}

/** Strip BOM / zero-width / control chars that break plain key lookups. */
function sanitizeUploadHistoryReportTypeKey(s) {
  return String(s)
    .replace(/\ufeff/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\0/g, '')
    .trim();
}

/**
 * Map uploaded_files.report_type (any casing, hyphen, odd Unicode) to physical data table name.
 * Falls back to ASCII slug compare so lookalike / hidden chars still resolve.
 */
function dataTableForUploadHistoryReportType(reportTypeRaw) {
  if (reportTypeRaw == null) return null;
  let k = sanitizeUploadHistoryReportTypeKey(reportTypeRaw);
  if (!k) return null;
  try {
    k = k.normalize('NFKC');
  } catch (_) {}
  k = k.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  const direct = UPLOAD_HISTORY_DATA_TABLE[k];
  if (direct) return direct;
  const slug = k.replace(/[^a-z0-9_]/g, '');
  for (const [key, table] of Object.entries(UPLOAD_HISTORY_DATA_TABLE)) {
    if (key.replace(/[^a-z0-9_]/g, '') === slug) return table;
  }
  if (slug === 'settlementreport' || (slug.includes('settlement') && slug.includes('report')))
    return 'settlement_report';
  if (slug.includes('payment') && slug.includes('repository')) return 'payment_repository';
  return null;
}

const SQL_DELETE_SETTLEMENT_UPLOAD_BATCH = `
DELETE FROM settlement_report sr
 USING uploaded_files uf
 WHERE uf.id = $1
   AND (
     sr.upload_file_id = uf.id
     OR (
       sr.upload_file_id IS NULL
       AND uf.uploaded_at IS NOT NULL
       AND (
         sr.uploaded_at IS NOT DISTINCT FROM (uf.uploaded_at::timestamptz)
         OR abs(
           extract(epoch from sr.uploaded_at::timestamptz)
         - extract(epoch from uf.uploaded_at::timestamptz)
         ) < 1.0
       )
     )
   )
`;

/** Normalize table id for allowlist (NBSP / ZWJ / case / spacing broke Set.has for some DB strings). */
function normalizeUploadHistoryTableName(t) {
  if (t == null || t === '') return '';
  return String(t)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\ufeff\u00a0]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function allowUploadHistoryTable(t) {
  if (t == null || t === '') return false;
  const s = normalizeUploadHistoryTableName(t);
  if (!s) return false;
  if (UPLOAD_HISTORY_ALLOWED_TABLES.has(s)) return true;
  return Object.values(UPLOAD_HISTORY_DATA_TABLE).includes(s);
}

/** Settlement tab only: skips all report_type string mapping (avoids 400 when labels are messy). */
async function deleteSettlementUploadHistoryById(req, res) {
  const id = parseInt(String(req.params.id).trim(), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const meta = await client.query(
      `SELECT id,
              trim(both from coalesce(report_type::text, '')) AS report_type,
              trim(both from coalesce(filename::text, '')) AS filename
       FROM uploaded_files WHERE id = $1`,
      [id]
    );
    if (!meta.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Upload record not found' });
    }
    const { report_type, filename } = meta.rows[0];
    const del = await client.query(SQL_DELETE_SETTLEMENT_UPLOAD_BATCH, [id]);
    await client.query('DELETE FROM uploaded_files WHERE id = $1', [id]);
    await client.query('COMMIT');
    console.log(`  🗑 upload-history [settlement route] #${id} (${report_type} ${filename}) → removed ${del.rowCount} data rows`);
    res.json({ success: true, data_rows_removed: del.rowCount, id, report_type, filename });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('  ❌ upload-history delete-settlement:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
}

async function deleteUploadHistoryById(req, res) {
  const id = parseInt(String(req.params.id).trim(), 10);
  if (!Number.isFinite(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const base = await client.query(
      `SELECT id,
              trim(both from coalesce(report_type::text, '')) AS report_type,
              trim(both from coalesce(filename::text, '')) AS filename
       FROM uploaded_files WHERE id = $1`,
      [id]
    );
    if (!base.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Upload record not found' });
    }
    let { report_type, filename } = base.rows[0];
    report_type = sanitizeUploadHistoryReportTypeKey(report_type);
    filename = String(filename ?? '').replace(/\0/g, '').trim();

    /* 1) Strongest signal first — only settlement uses upload_file_id → uploaded_files.id */
    let table = null;
    try {
      const linked = await client.query(
        `SELECT COUNT(*)::int AS n FROM settlement_report WHERE upload_file_id = $1`,
        [id]
      );
      table = linked.rows[0].n > 0 ? 'settlement_report' : null;
    } catch (linkErr) {
      if (!/upload_file_id|column .* does not exist/i.test(String(linkErr.message))) throw linkErr;
    }

    if (!table) {
      const typeMapSql = uploadHistoryTypeMapSqlValues();
      let u;
      try {
        u = await client.query(
          `SELECT COALESCE(
                NULLIF(trim(both from coalesce(uf.data_target_table::text, '')), ''),
                _utm.phys_table,
                CASE
                  WHEN lower(coalesce(uf.report_type::text, '')) LIKE '%settlement%'
                   AND lower(coalesce(uf.report_type::text, '')) LIKE '%report%'
                  THEN 'settlement_report'
                  ELSE NULL
                END
              ) AS data_table
           FROM uploaded_files uf
           LEFT JOIN ${typeMapSql}
             ON lower(trim(both '_' from regexp_replace(
                  regexp_replace(trim(both from coalesce(uf.report_type::text, '')), '[[:space:]\\-]+', '_', 'g'),
                  '_+', '_', 'g'))) = _utm.rt_key
           WHERE uf.id = $1`,
          [id]
        );
      } catch (err) {
        if (!/data_target_table|column .* does not exist/i.test(String(err.message))) throw err;
        u = await client.query(
          `SELECT COALESCE(
                _utm.phys_table,
                CASE
                  WHEN lower(coalesce(uf.report_type::text, '')) LIKE '%settlement%'
                   AND lower(coalesce(uf.report_type::text, '')) LIKE '%report%'
                  THEN 'settlement_report'
                  ELSE NULL
                END
              ) AS data_table
           FROM uploaded_files uf
           LEFT JOIN ${typeMapSql}
             ON lower(trim(both '_' from regexp_replace(
                  regexp_replace(trim(both from coalesce(uf.report_type::text, '')), '[[:space:]\\-]+', '_', 'g'),
                  '_+', '_', 'g'))) = _utm.rt_key
           WHERE uf.id = $1`,
          [id]
        );
      }
      const dt = u.rows[0]?.data_table;
      table =
        (allowUploadHistoryTable(dt) ? normalizeUploadHistoryTableName(dt) : null) ||
        dataTableForUploadHistoryReportType(report_type);

      if (!table) {
        const lo = String(report_type ?? '')
          .normalize('NFKC')
          .replace(/[\u200B-\u200D\ufeff\u00a0]/g, '')
          .toLowerCase();
        if (lo.includes('settlement') && lo.includes('report')) table = 'settlement_report';
      }

      if (!table) {
        let leg;
        try {
          leg = await client.query(
            `SELECT COUNT(*)::int AS n
             FROM settlement_report sr
             INNER JOIN uploaded_files uf ON uf.id = $1
             WHERE sr.upload_file_id IS NULL
               AND uf.uploaded_at IS NOT NULL
               AND (
                 lower(coalesce(uf.report_type::text, '')) LIKE '%settlement%'
                 OR NULLIF(trim(both from coalesce(uf.data_target_table::text, '')), '') = 'settlement_report'
               )
               AND (
                 sr.uploaded_at IS NOT DISTINCT FROM (uf.uploaded_at::timestamptz)
                 OR abs(
                   extract(epoch from sr.uploaded_at::timestamptz)
                 - extract(epoch from uf.uploaded_at::timestamptz)
                 ) < 1.0
               )`,
            [id]
          );
        } catch (err2) {
          if (!/data_target_table|column .* does not exist/i.test(String(err2.message))) throw err2;
          leg = await client.query(
            `SELECT COUNT(*)::int AS n
             FROM settlement_report sr
             INNER JOIN uploaded_files uf ON uf.id = $1
             WHERE sr.upload_file_id IS NULL
               AND uf.uploaded_at IS NOT NULL
               AND lower(coalesce(uf.report_type::text, '')) LIKE '%settlement%'
               AND (
                 sr.uploaded_at IS NOT DISTINCT FROM (uf.uploaded_at::timestamptz)
                 OR abs(
                   extract(epoch from sr.uploaded_at::timestamptz)
                 - extract(epoch from uf.uploaded_at::timestamptz)
                 ) < 1.0
               )`,
            [id]
          );
        }
        if (leg.rows[0].n > 0) table = 'settlement_report';
      }
    }

    /* Last resort: settlement upload log + lines whose settlement_id appears in that filename (legacy unlinked batches). */
    if (!allowUploadHistoryTable(table)) {
      const sniff = await client.query(
        `SELECT EXISTS (
           SELECT 1 FROM uploaded_files uf
           WHERE uf.id = $1
             AND lower(coalesce(uf.report_type::text, '')) LIKE '%settlement%'
             AND uf.filename IS NOT NULL AND length(trim(uf.filename::text)) > 2
             AND EXISTS (
               SELECT 1 FROM settlement_report sr
               WHERE sr.settlement_id IS NOT NULL AND btrim(sr.settlement_id::text) <> ''
                 AND position(btrim(sr.settlement_id::text) in uf.filename::text) > 0
             )
         ) AS ok`,
        [id]
      );
      if (sniff.rows[0]?.ok) table = 'settlement_report';
    }

    if (table) {
      const tn = normalizeUploadHistoryTableName(table);
      if (tn) table = tn;
    }

    if (!allowUploadHistoryTable(table)) {
      const rp = String(report_type || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\ufeff\u00a0]/g, '')
        .toLowerCase();
      if (rp.includes('settlement') && rp.includes('report')) table = 'settlement_report';
    }

    if (!allowUploadHistoryTable(table)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Cannot delete data for report_type: ${report_type || '(empty)'}. Use START.bat from the project folder, restart the server, then try again.`,
      });
    }

    let del;
    if (table === 'settlement_report') {
      del = await client.query(SQL_DELETE_SETTLEMENT_UPLOAD_BATCH, [id]);
    } else {
      del = await client.query(
        `DELETE FROM ${table} AS t
         USING (SELECT uploaded_at::timestamptz AS ua FROM uploaded_files WHERE id = $1) AS u
         WHERE u.ua IS NOT NULL AND t.uploaded_at IS NOT DISTINCT FROM u.ua`,
        [id]
      );
    }
    await client.query('DELETE FROM uploaded_files WHERE id = $1', [id]);
    await client.query('COMMIT');
    console.log(`  🗑 upload-history #${id} (${report_type} ${filename}) → removed ${del.rowCount} data rows`);
    res.json({ success: true, data_rows_removed: del.rowCount, id, report_type, filename });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('  ❌ upload-history delete:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
}
/* Register settlement-specific POST before generic :id/delete (avoids any path-matching edge cases). */
app.post('/api/upload-history/:id/delete-settlement', deleteSettlementUploadHistoryById);
app.delete('/api/upload-history/:id', deleteUploadHistoryById);
app.post('/api/upload-history/:id/delete', deleteUploadHistoryById);

// ============================================
// UPLOAD ROUTES - Har file ka alag route
// ============================================

// Helper: generic uploader
async function doUpload(req, res, tableName, mapFn) {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const rows = parseFile(req.file.buffer, req.file.originalname);
  const dataRows = rows.slice(1); // header skip
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${tableName}`); // fresh data
    const map = {};
    dataRows.forEach(row => mapFn(row, map));
    const entries = Object.values(map).filter(e => e.msku);
    for (const e of entries) {
      await insertRow(client, tableName, e);
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type, filename, row_count, data_target_table, report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      [tableName, req.file.originalname, entries.length, tableName, null]
    );
    await client.query('COMMIT');
    res.json({ success: true, table: tableName, rows_saved: entries.length, filename: req.file.originalname });
    console.log(`  ✅ ${tableName}: ${entries.length} rows saved`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ❌ ${tableName} error:`, err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
}

async function insertRow(client, table, e) {
  switch(table) {
    case 'shipped_to_fba':
      return client.query(
        `INSERT INTO shipped_to_fba (msku,title,asin,fnsku,ship_date,quantity) VALUES ($1,$2,$3,$4,$5,$6)`,
        [e.msku, e.title||'', e.asin||'', e.fnsku||'', e.date, e.qty]
      );
    case 'sales_data':
      return client.query(
        `INSERT INTO sales_data (msku,title,quantity,condition_value) VALUES ($1,$2,$3,$4)`,
        [e.msku, e.title||'', e.qty, e.cond||0]
      );
    case 'fba_receipts':
      return client.query(
        `INSERT INTO fba_receipts (msku,title,asin,fnsku,quantity,receipt_date) VALUES ($1,$2,$3,$4,$5,$6)`,
        [e.msku, e.title||'', e.asin||'', e.fnsku||'', e.qty, e.date]
      );
    case 'customer_returns':
      return client.query(
        `INSERT INTO customer_returns (msku,order_id,quantity) VALUES ($1,$2,$3)`,
        [e.msku, e.orderId||'', e.qty]
      );
    case 'reimbursements':
      return client.query(
        `INSERT INTO reimbursements (msku,order_id,reason,quantity) VALUES ($1,$2,$3,$4)`,
        [e.msku, e.orderId||'', e.reason||'', e.qty]
      );
    case 'replacements':
      return client.query(
        `INSERT INTO replacements (msku,order_id,quantity) VALUES ($1,$2,$3)`,
        [e.msku, e.orderId||'', e.qty]
      );
    case 'fc_transfers':
      return client.query(
        `INSERT INTO fc_transfers (msku,fnsku,asin,title,quantity,transfer_date) VALUES ($1,$2,$3,$4,$5,$6)`,
        [e.msku||'', e.fnsku||'', e.asin||'', e.title||'', e.qty, e.date]
      );
    case 'adjustments':
      return client.query(
        `INSERT INTO adjustments (msku,flag,quantity) VALUES ($1,'F',$2)`,
        [e.msku, e.qty]
      );
  }
}

// --- Payment Repository (registered early so upload always resolves) ---
// Headers: date/time, settlement id, type, order id, sku, description, quantity, marketplace, account type,
// fulfillment, order city/state/postal, tax collection model, product sales, fees, other, total, transaction status, etc.
function paymentRepositoryTemplatePath() {
  const candidates = [
    path.join(publicDir, 'payment_repository_template.csv'),
    path.join(__dirname, 'Public', 'payment_repository_template.csv'),
    path.join(__dirname, 'public', 'payment_repository_template.csv'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function handlePaymentRepositoryUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  let allRows;
  try {
    allRows = parseFile(req.file.buffer, req.file.originalname);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read CSV/Excel file: ' + (e.message || String(e)) });
  }
  const hdr = (allRows[0] || []).map(c => String(c || '').toLowerCase().trim().replace(/['"]/g, '').replace(/\ufeff/g, ''));
  const findCol = (...terms) => {
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = hdr.findIndex(h => h.includes(tl));
      if (i !== -1) return i;
    }
    return -1;
  };
  const iDate = findCol('date/time', 'date / time', 'posted date', 'posted date/time');
  const iSettle = findCol('settlement id', 'settlement-id', 'settlement');
  let iType = -1;
  for (let hi = 0; hi < hdr.length; hi++) {
    const x = String(hdr[hi] || '')
      .toLowerCase()
      .trim()
      .replace(/\ufeff/g, '')
      .replace(/[\s_]+/g, ' ');
    const xCompact = x.replace(/\s/g, '');
    if (x.includes('account') && x.includes('type')) continue;
    if (
      x === 'type' ||
      x === 'transaction type' ||
      x === 'transactiontype' ||
      xCompact === 'transaction-type' ||
      x.includes('transaction type') ||
      (x.includes('transaction') && x.includes('type')) ||
      x === 'line type' ||
      xCompact === 'line-type'
    ) {
      iType = hi;
      break;
    }
  }
  let iOrder = findCol('order id', 'order-id', 'amazon order id');
  if (iOrder === -1) {
    iOrder = hdr.findIndex((h) => {
      const x = String(h || '')
        .toLowerCase()
        .trim()
        .replace(/\ufeff/g, '');
      if (x.includes('city') || x.includes('state') || x.includes('postal')) return false;
      return (
        x === 'order' ||
        x === 'amazon order' ||
        x === 'amazon-order' ||
        x.endsWith(' order id') ||
        x.startsWith('order id')
      );
    });
  }
  let iSku = hdr.findIndex(h => String(h).toLowerCase().trim() === 'sku');
  if (iSku === -1) iSku = findCol('merchant sku');
  const iDesc = findCol('description', 'product description');
  const iQty = findCol('quantity', 'qty');
  const iMkt = findCol('marketplace');
  const iAcct = findCol('account type', 'account-type');
  const iFul = findCol('fulfillment');
  const iCity = findCol('order city');
  const iState = findCol('order state');
  const iPostal = findCol('order postal', 'postal');
  const iTaxModel = findCol('tax collection model');
  const iProdSales = findCol('product sales');
  const iProdTax = findCol('product sales tax');
  const iShipCred = findCol('shipping credits');
  const iShipCredTax = findCol('shipping credits tax');
  const iGift = findCol('gift wrap credits');
  const iGiftTax = findCol('gift wrap credits tax');
  const iRegFee = findCol('regulatory fee');
  const iRegTax = findCol('tax on regulatory fee');
  const iPromo = findCol('promotional rebates');
  const iPromoTax = findCol('promotional rebates tax');
  const iWithheld = findCol('marketplace withheld tax');
  const iSellFee = findCol('selling fees');
  const iFba = findCol('fba fees');
  const iOtherFees = findCol('other transaction fees', 'other-transaction fees');
  const iOtherAmt = hdr.findIndex(h => String(h).toLowerCase().trim() === 'other');
  let iTotal = hdr.findIndex(h => String(h).toLowerCase().trim() === 'total');
  if (iTotal === -1) iTotal = findCol('transaction total', 'amount');
  const iStatus = findCol('transaction status');
  const iRelease = findCol('transaction release date', 'release date');

  const looksPayment =
    hdr.some(h => h.includes('settlement') && h.includes('id')) ||
    (iProdSales !== -1 && iFba !== -1) ||
    (iDate !== -1 && iTotal !== -1 && (iSku !== -1 || iDesc !== -1));
  if (!looksPayment) {
    return res.status(400).json({
      error: '❌ Wrong report! Expected an Amazon Payment / Transaction (repository-style) CSV.\n\nLook for columns such as: date/time, settlement id, sku, description, total, transaction status.',
    });
  }

  const toMoney = (v) => {
    if (v == null || v === '') return null;
    let s = String(v).trim();
    let neg = false;
    if (/^\(.*\)$/.test(s)) {
      neg = true;
      s = s.slice(1, -1).trim();
    }
    const n = parseFloat(s.replace(/,/g, '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n)) return null;
    return neg ? -Math.abs(n) : n;
  };
  const get = (row, idx) => (idx === -1 ? '' : row[idx] ?? '');

  const dataRows = allRows.slice(1).filter((r) => r && r.some((c) => String(c || '').trim()));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dt = createReportLatestDateTracker();
    let n = 0;
    for (const row of dataRows) {
      const posted = String(get(row, iDate)).trim();
      const settlement_id = String(get(row, iSettle)).trim();
      const line_type = String(get(row, iType)).trim();
      const order_id = String(get(row, iOrder)).trim();
      const sku = String(get(row, iSku)).trim();
      const description = String(get(row, iDesc)).trim();
      const qty = toNum(get(row, iQty));
      if (!posted && !sku && !description && !order_id && !settlement_id && !line_type) continue;
      dt.note(posted);
      await client.query(
        `INSERT INTO payment_repository (
          posted_datetime, settlement_id, line_type, order_id, sku, description, quantity,
          marketplace, account_type, fulfillment, order_city, order_state, order_postal, tax_collection_model,
          product_sales, product_sales_tax, shipping_credits, shipping_credits_tax, gift_wrap_credits, gift_wrap_credits_tax,
          regulatory_fee, tax_on_regulatory_fee, promotional_rebates, promotional_rebates_tax, marketplace_withheld_tax,
          selling_fees, fba_fees, other_transaction_fees, other_amount, total_amount, transaction_status, transaction_release_datetime
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        )`,
        [
          posted || null,
          settlement_id || null,
          line_type || null,
          order_id || null,
          sku || null,
          description || null,
          qty,
          String(get(row, iMkt)).trim() || null,
          String(get(row, iAcct)).trim() || null,
          String(get(row, iFul)).trim() || null,
          String(get(row, iCity)).trim() || null,
          String(get(row, iState)).trim() || null,
          String(get(row, iPostal)).trim() || null,
          String(get(row, iTaxModel)).trim() || null,
          toMoney(get(row, iProdSales)),
          toMoney(get(row, iProdTax)),
          toMoney(get(row, iShipCred)),
          toMoney(get(row, iShipCredTax)),
          toMoney(get(row, iGift)),
          toMoney(get(row, iGiftTax)),
          toMoney(get(row, iRegFee)),
          toMoney(get(row, iRegTax)),
          toMoney(get(row, iPromo)),
          toMoney(get(row, iPromoTax)),
          toMoney(get(row, iWithheld)),
          toMoney(get(row, iSellFee)),
          toMoney(get(row, iFba)),
          toMoney(get(row, iOtherFees)),
          toMoney(get(row, iOtherAmt)),
          toMoney(get(row, iTotal)),
          String(get(row, iStatus)).trim() || null,
          String(get(row, iRelease)).trim() || null,
        ]
      );
      n++;
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['payment_repository', req.file.originalname, n, 'payment_repository', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ payment_repository: ${n} rows saved`);
    res.json({ success: true, rows_saved: n });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ❌ payment-repository error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

app.post('/api/upload/payment-repository', upload.single('file'), handlePaymentRepositoryUpload);
app.post('/api/upload/payment_repository', upload.single('file'), handlePaymentRepositoryUpload);
app.post('/api/upload/paymentrepo', upload.single('file'), handlePaymentRepositoryUpload);

// ═══════════════════════════════════════════════════════
//  SETTLEMENT REPORT UPLOAD
// ═══════════════════════════════════════════════════════
/** Normalize posted-date cells from CSV/TSV/Excel (serial, Date object, or string). */
function formatSettlementPostedForDb(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getMonth() + 1}/${v.getDate()}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n >= 1 && n < 1000000) {
      const epoch = new Date(1899, 11, 30);
      const d = new Date(epoch.getTime() + Math.round(n) * 86400000);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 1950 && d.getFullYear() <= 2100) {
        return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      }
    }
  }
  return s;
}

/** Effective posted date for a row (prefer posted-date column; else date part of posted-date-time). */
function settlementPostedDateFromRow(get, row, iPostDt, iPostDtTm) {
  let raw = iPostDt !== -1 ? get(row, iPostDt) : '';
  let s = formatSettlementPostedForDb(raw);
  if (!s && iPostDtTm !== -1) s = formatSettlementPostedForDb(get(row, iPostDtTm));
  if (!s) return null;
  const first = String(s).trim().split(/\s+/)[0];
  return first || null;
}
async function handleSettlementReportUpload(req, res) {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  let allRows;
  try {
    allRows = parseFile(req.file.buffer, req.file.originalname);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read file: ' + (e.message || String(e)) });
  }
  const hdr = (allRows[0] || []).map(c =>
    String(c || '').toLowerCase().trim().replace(/\ufeff/g, '').replace(/['"]/g, '')
  );
  const findCol = (...terms) => {
    for (const t of terms) {
      const tl = t.toLowerCase();
      const i = hdr.findIndex(h => h === tl || h.replace(/[\s_]+/g, '-') === tl.replace(/[\s_]+/g, '-'));
      if (i !== -1) return i;
    }
    return -1;
  };

  const iSettId   = findCol('settlement-id',                'settlement id');
  const iStartDt  = findCol('settlement-start-date',        'settlement start date');
  const iEndDt    = findCol('settlement-end-date',          'settlement end date');
  const iDepDt    = findCol('deposit-date',                 'deposit date');
  const iTotalAmt = findCol('total-amount',                 'total amount');
  const iCurr     = findCol('currency');
  const iTxType   = findCol('transaction-type',             'transaction type');
  const iOrderId  = findCol('order-id',                    'order id');
  const iMchOrd   = findCol('merchant-order-id',           'merchant order id');
  const iAdjId    = findCol('adjustment-id',               'adjustment id');
  const iShipId   = findCol('shipment-id',                 'shipment id');
  const iMktName  = findCol('marketplace-name',            'marketplace name');
  const iAmtType  = findCol('amount-type',                 'amount type');
  const iAmtDesc  = findCol('amount-description',          'amount description');
  const iAmount   = hdr.findIndex(h => h === 'amount');
  const iFulId    = findCol('fulfillment-id',              'fulfillment id');
  const iPostDt   = findCol('posted-date', 'posted date', 'posted_date', 'post-date', 'post date');
  const iPostDtTm = findCol('posted-date-time', 'posted date time', 'posted_datetime', 'posteddatetime');
  const iOrdItm   = findCol('order-item-code',             'order item code');
  const iMchOrdIt = findCol('merchant-order-item-id',      'merchant order item id');
  const iMchAdjIt = findCol('merchant-adjustment-item-id', 'merchant adjustment item id');
  const iSku      = hdr.findIndex(h => h === 'sku');
  const iQty      = findCol(
    'quantity-purchased',
    'quantity purchased',
    'quantity',
    'qty'
  );
  const iPromoId  = findCol('promotion-id',                'promotion id');

  const looksSettlement = iSettId !== -1 && (iAmtType !== -1 || iTxType !== -1 || iTotalAmt !== -1);
  if (!looksSettlement) {
    return res.status(400).json({
      error: '❌ Wrong report! Expected an Amazon Settlement Report TSV.\n\nLook for columns: settlement-id, transaction-type, amount-type, amount-description, amount.',
    });
  }

  const get = (row, idx) => (idx === -1 ? '' : row[idx] ?? '');
  const toMoney = (v) => {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).trim().replace(/,/g, '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const toInt = (v) => {
    const n = parseInt(String(v || '').trim(), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const dataRows = allRows.slice(1).filter(r => r && r.some(c => String(c || '').trim()));
  const settlementIdsInFile = [
    ...new Set(
      dataRows
        .map(row => String(get(row, iSettId)).trim())
        .filter(id => id.length > 0)
    ),
  ];
  const client = await pool.connect();
  try {
    if (settlementIdsInFile.length > 0) {
      const dup = await client.query(
        `SELECT DISTINCT settlement_id::text AS settlement_id
         FROM settlement_report
         WHERE settlement_id = ANY($1::text[])
         ORDER BY settlement_id`,
        [settlementIdsInFile]
      );
      if (dup.rows.length > 0) {
        const ids = dup.rows.map(r => r.settlement_id).join(', ');
        return res.status(400).json({
          error:
            `Settlement report already imported for settlement ID(s): ${ids}. ` +
            `Each settlement ID can only be loaded once. Remove the existing upload (Upload History) or delete the data in the database, then try again.`,
          duplicate_settlement_ids: dup.rows.map(r => r.settlement_id),
        });
      }
    }
    await client.query('BEGIN');
    const batchTsRes = await client.query('SELECT transaction_timestamp() AS ts');
    const batchUploadedAt = batchTsRes.rows[0].ts;
    const dt = createReportLatestDateTracker();
    const logIns = await client.query(
      `INSERT INTO uploaded_files (report_type, filename, row_count, uploaded_at, data_target_table)
       VALUES ($1,$2,0,$3,$4) RETURNING id`,
      ['settlement_report', req.file.originalname, batchUploadedAt, 'settlement_report']
    );
    const uploadFileId = logIns.rows[0].id;
    let n = 0;
    for (const row of dataRows) {
      const settlement_id    = String(get(row, iSettId)).trim();
      const transaction_type = String(get(row, iTxType)).trim();
      const amount_type      = String(get(row, iAmtType)).trim();
      if (!settlement_id && !transaction_type && !amount_type) continue;

      dt.note(settlementPostedDateFromRow(get, row, iPostDt, iPostDtTm));
      dt.note(get(row, iStartDt));
      dt.note(get(row, iEndDt));
      dt.note(get(row, iDepDt));

      await client.query(
        `INSERT INTO settlement_report (
          settlement_id, settlement_start_date, settlement_end_date, deposit_date,
          total_amount, currency, transaction_type, order_id, merchant_order_id,
          adjustment_id, shipment_id, marketplace_name, amount_type, amount_description,
          amount, fulfillment_id, posted_date, posted_date_time, order_item_code,
          merchant_order_item_id, merchant_adjustment_item_id, sku, quantity_purchased, promotion_id,
          uploaded_at, upload_file_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
        )`,
        [
          settlement_id || null,
          String(get(row, iStartDt)).trim()  || null,
          String(get(row, iEndDt)).trim()    || null,
          String(get(row, iDepDt)).trim()    || null,
          toMoney(get(row, iTotalAmt)),
          String(get(row, iCurr)).trim()     || null,
          transaction_type                   || null,
          String(get(row, iOrderId)).trim()  || null,
          String(get(row, iMchOrd)).trim()   || null,
          String(get(row, iAdjId)).trim()    || null,
          String(get(row, iShipId)).trim()   || null,
          String(get(row, iMktName)).trim()  || null,
          amount_type                        || null,
          String(get(row, iAmtDesc)).trim()  || null,
          toMoney(get(row, iAmount)),
          String(get(row, iFulId)).trim()    || null,
          settlementPostedDateFromRow(get, row, iPostDt, iPostDtTm),
          String(get(row, iPostDtTm)).trim() || null,
          String(get(row, iOrdItm)).trim()   || null,
          String(get(row, iMchOrdIt)).trim() || null,
          String(get(row, iMchAdjIt)).trim() || null,
          String(get(row, iSku)).trim()      || null,
          toInt(get(row, iQty)),
          String(get(row, iPromoId)).trim()  || null,
          batchUploadedAt,
          uploadFileId,
        ]
      );
      n++;
    }
    await client.query(
      `UPDATE uploaded_files SET row_count = $1, report_latest_date = $2::date WHERE id = $3`,
      [n, dt.get(), uploadFileId]
    );
    await client.query('COMMIT');
    console.log(`  ✅ settlement_report: ${n} rows saved`);
    res.json({ success: true, rows_saved: n });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ❌ settlement-report error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

app.post('/api/upload/settlement-report', upload.single('file'), handleSettlementReportUpload);
app.post('/api/upload/settlement_report', upload.single('file'), handleSettlementReportUpload);

// ═══════════════════════════════════════════════════════
//  SETTLEMENT REPORT — View API
// ═══════════════════════════════════════════════════════
function normalizeSettlementTab(tab) {
  const s = String(tab ?? 'orders').trim().toLowerCase();
  if (s === 'refund' || s === 'refunds') return 'refunds';
  if (s === 'order' || s === 'orders') return 'orders';
  if (s === 'other') return 'other';
  return s;
}

function settlementTabFilter(tab) {
  const t = normalizeSettlementTab(tab);
  if (t === 'orders') return "LOWER(COALESCE(transaction_type,'')) LIKE '%order%'";
  if (t === 'refunds') return "LOWER(COALESCE(transaction_type,'')) LIKE '%refund%'";
  return "LOWER(COALESCE(transaction_type,'')) NOT LIKE '%order%' AND LOWER(COALESCE(transaction_type,'')) NOT LIKE '%refund%'";
}

/** Amazon US: VariableClosingFee is $1.80 per unit — used to derive refund line qty when quantity is blank. */
const SETTLEMENT_VARIABLE_FEE_PER_UNIT = 1.8;

/** Other-tab row qty: quantity-purchased from file; if 0, derive from VariableClosingFee or Grade & Resell ($1.80/unit). */
function settlementOtherLineQtyExpr() {
  const clean =
    "REPLACE(REPLACE(TRIM(COALESCE(amount_description, '')), CHR(160), ''), CHR(65279), '')";
  const desc = `LOWER(REGEXP_REPLACE(${clean}, '[[:space:]]+', '', 'g'))`;
  return `(CASE
    WHEN COALESCE(quantity_purchased, 0) <> 0 THEN quantity_purchased::int
    WHEN ${desc} LIKE '%variableclosingfee%'
      THEN GREATEST(0, ROUND(ABS(COALESCE(amount, 0)::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric))::int
    WHEN LOWER(COALESCE(amount_type, '')) LIKE '%grade%resell%'
      THEN GREATEST(0, ROUND(ABS(COALESCE(amount, 0)::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric))::int
    ELSE 0
  END)`;
}

/** Aggregate: best posted date per line (file column posted-date, else date part of posted-date-time). */
const SETTLEMENT_EFFECTIVE_POSTED_MAX = `MAX(
  CASE
    WHEN TRIM(COALESCE(posted_date::text, '')) <> '' THEN TRIM(posted_date::text)
    WHEN TRIM(COALESCE(posted_date_time::text, '')) <> '' THEN TRIM(SPLIT_PART(REGEXP_REPLACE(TRIM(posted_date_time::text), 'T', ' '), ' ', 1))
    ELSE NULL
  END
)`;

/** Normalized amount_description → sales / FBA fees / commission / variable closing / other (orders & refunds). */
function settlementAmountPivotExpr(colRef = 'amount_description', amtRef = 'amount') {
  const clean = `REPLACE(REPLACE(TRIM(COALESCE(${colRef}, '')), CHR(160), ''), CHR(65279), '')`;
  const desc = `LOWER(REGEXP_REPLACE(${clean}, '[[:space:]]+', '', 'g'))`;
  const amt = `COALESCE(${amtRef}, 0)`;
  return {
    sales: `SUM(CASE WHEN ${desc} = 'principal' THEN ${amt} ELSE 0 END)`,
    fbaFees: `SUM(CASE WHEN ${desc} LIKE '%fbaperunitfulfillmentfee%' THEN ${amt} ELSE 0 END)`,
    commission: `SUM(CASE WHEN ${desc} = 'commission' THEN ${amt} ELSE 0 END)`,
    variableFee: `SUM(CASE WHEN ${desc} LIKE '%variableclosingfee%' THEN ${amt} ELSE 0 END)`,
    other: `SUM(CASE
      WHEN ${desc} = 'principal' THEN 0
      WHEN ${desc} LIKE '%fbaperunitfulfillmentfee%' THEN 0
      WHEN ${desc} = 'commission' THEN 0
      WHEN ${desc} LIKE '%variableclosingfee%' THEN 0
      ELSE ${amt}
    END)`,
    total: `SUM(${amt})`,
  };
}

app.get('/api/settlement-report/settlements', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT settlement_id,
        MIN(settlement_start_date) AS start_date,
        MIN(settlement_end_date)   AS end_date,
        COUNT(*) AS row_count
      FROM settlement_report
      WHERE settlement_id IS NOT NULL AND settlement_id <> ''
      GROUP BY settlement_id
      ORDER BY settlement_id DESC
      LIMIT 100
    `);
    res.json({ rows: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/settlement-report/kpis', async (req, res) => {
  const { settlement_id } = req.query;
  const tab = normalizeSettlementTab(req.query.tab);
  const tw = settlementTabFilter(tab);
  const params = [];
  let ex = '';
  if (settlement_id) { params.push(settlement_id); ex = ` AND settlement_id=$${params.length}`; }
  try {
    let sql;
    if (tab === 'orders' || tab === 'refunds') {
      const Pk = settlementAmountPivotExpr();
      const kpiRefundQty = `COALESCE(ROUND(ABS(z.variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::int`;
      sql =
        tab === 'refunds'
          ? `
        SELECT
          COUNT(DISTINCT x.order_id) AS unique_orders,
          COUNT(DISTINCT x.sku)     AS unique_skus,
          SUM(x.qty)                 AS total_qty,
          SUM(x.item_amt)            AS net_amount
        FROM (
          SELECT
            z.order_id,
            z.sku,
            SUM(${kpiRefundQty}) AS qty,
            SUM(z.item_amt)      AS item_amt
          FROM (
            SELECT order_id, sku, order_item_code,
              SUM(amount) AS item_amt,
              ${Pk.variableFee} AS variable_fee
            FROM settlement_report
            WHERE ${tw}${ex} AND order_id IS NOT NULL AND order_id <> ''
            GROUP BY order_id, sku, order_item_code
          ) z
          GROUP BY z.order_id, z.sku
        ) x
      `
          : `
        SELECT
          COUNT(DISTINCT order_id)  AS unique_orders,
          COUNT(DISTINCT sku)       AS unique_skus,
          SUM(x.qty)                AS total_qty,
          SUM(x.item_amt)           AS net_amount
        FROM (
          SELECT order_id, sku, order_item_code,
            MAX(quantity_purchased) AS qty,
            SUM(amount)             AS item_amt
          FROM settlement_report
          WHERE ${tw}${ex} AND order_id IS NOT NULL AND order_id <> ''
          GROUP BY order_id, sku, order_item_code
        ) x
      `;
    } else {
      sql = `
        SELECT
          COUNT(*)                        AS row_count,
          COUNT(DISTINCT transaction_type) AS tx_types,
          SUM(amount)                     AS net_amount,
          COUNT(DISTINCT settlement_id)   AS settlements
        FROM settlement_report WHERE ${tw}${ex}
      `;
    }
    const r = await pool.query(sql, params);
    res.json(r.rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/settlement-report', async (req, res) => {
  const { settlement_id, page = 1, limit = 100 } = req.query;
  const tab = normalizeSettlementTab(req.query.tab);
  const pg  = Math.max(1, parseInt(page) || 1);
  const lim = Math.min(500, Math.max(10, parseInt(limit) || 100));
  const off = (pg - 1) * lim;
  const tw  = settlementTabFilter(tab);
  const params = [];
  let ex = '';
  if (settlement_id) { params.push(settlement_id); ex = ` AND settlement_id=$${params.length}`; }
  try {
    let sql, cntSql, cntParams;
    if (tab === 'orders' || tab === 'refunds') {
      const baseFrom = `FROM settlement_report WHERE ${tw}${ex} AND order_id IS NOT NULL AND order_id <> ''`;
      const P = settlementAmountPivotExpr();
      sql =
        tab === 'refunds'
          ? `
        SELECT
          u.order_id,
          u.sku,
          SUM(u.line_qty)::bigint AS qty,
          SUM(u.sales_amount)::numeric(16,4)    AS sales_amount,
          SUM(u.fba_fees)::numeric(16,4)       AS fba_fees,
          SUM(u.fba_commission)::numeric(16,4)  AS fba_commission,
          SUM(u.variable_fee)::numeric(16,4)    AS variable_fee,
          SUM(u.other_charges)::numeric(16,4)   AS other_charges,
          SUM(u.total_amount)::numeric(16,4)    AS total_amount,
          MAX(u.posted_date) AS posted_date,
          jsonb_agg(
            jsonb_build_object(
              'settlement_id', NULLIF(TRIM(u.settlement_id::text), ''),
              'order_item_code', NULLIF(TRIM(u.order_item_code::text), ''),
              'qty', u.line_qty,
              'posted_date', u.posted_date
            )
            ORDER BY u.posted_date DESC NULLS LAST, u.settlement_id::text DESC NULLS LAST
          ) AS refund_breakdown
        FROM (
          SELECT
            t.settlement_id,
            t.posted_date,
            t.order_id,
            t.sku,
            t.order_item_code,
            COALESCE(
              ROUND(ABS(t.variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0),
              0
            )::int AS line_qty,
            t.sales_amount,
            t.fba_fees,
            t.fba_commission,
            t.variable_fee,
            t.other_charges,
            t.total_amount
          FROM (
            SELECT settlement_id, order_id, sku, order_item_code,
                   ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
                   ${P.sales}       AS sales_amount,
                   ${P.fbaFees}     AS fba_fees,
                   ${P.commission}  AS fba_commission,
                   ${P.variableFee} AS variable_fee,
                   ${P.other}       AS other_charges,
                   ${P.total}       AS total_amount
            ${baseFrom}
            GROUP BY settlement_id, order_id, sku, order_item_code
          ) t
        ) u
        GROUP BY u.order_id, u.sku
        ORDER BY MAX(u.posted_date) DESC NULLS LAST, u.order_id, u.sku
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `
          : `
        SELECT settlement_id,
               ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
               order_id, sku, order_item_code,
               MAX(quantity_purchased) AS qty,
               ${P.sales}       AS sales_amount,
               ${P.fbaFees}     AS fba_fees,
               ${P.commission}  AS fba_commission,
               ${P.variableFee} AS variable_fee,
               ${P.other}       AS other_charges,
               ${P.total}       AS total_amount
        ${baseFrom}
        GROUP BY settlement_id, order_id, sku, order_item_code
        ORDER BY ${SETTLEMENT_EFFECTIVE_POSTED_MAX} DESC NULLS LAST, settlement_id DESC, order_id, sku
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      cntSql =
        tab === 'refunds'
          ? `SELECT COUNT(*)::bigint AS total FROM (
               SELECT u.order_id, u.sku
               FROM (
                 SELECT settlement_id, order_id, sku, order_item_code
                 ${baseFrom}
                 GROUP BY settlement_id, order_id, sku, order_item_code
               ) u
               GROUP BY u.order_id, u.sku
             ) c`
          : `SELECT COUNT(*) AS total FROM (SELECT 1 ${baseFrom} GROUP BY settlement_id, order_id, sku, order_item_code) s`;
      cntParams = [...params];
    } else {
      sql = `
        SELECT settlement_id, transaction_type, amount_type, amount_description,
               amount, posted_date, order_id, sku, qty
        FROM (
          SELECT settlement_id, transaction_type, amount_type, amount_description,
                 amount,
                 CASE
                   WHEN TRIM(COALESCE(posted_date::text, '')) <> '' THEN TRIM(posted_date::text)
                   WHEN TRIM(COALESCE(posted_date_time::text, '')) <> '' THEN TRIM(SPLIT_PART(REGEXP_REPLACE(TRIM(posted_date_time::text), 'T', ' '), ' ', 1))
                   ELSE NULL
                 END AS posted_date,
                 order_id, sku,
                 ${settlementOtherLineQtyExpr()} AS qty,
                 id AS _sort_id
          FROM settlement_report WHERE ${tw}${ex}
        ) u
        ORDER BY u.posted_date DESC NULLS LAST, u.settlement_id DESC, u.transaction_type, u.amount_type, u.amount_description, u._sort_id
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      cntSql    = `SELECT COUNT(*) AS total FROM settlement_report WHERE ${tw}${ex}`;
      cntParams = [...params];
    }
    params.push(lim, off);
    const [d, c] = await Promise.all([pool.query(sql, params), pool.query(cntSql, cntParams)]);
    res.json({ rows: d.rows, total: parseInt(c.rows[0]?.total || 0), page: pg, limit: lim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** One row per settlement: order / refund / other buckets with same amount-description mapping as detail tabs. */
app.get('/api/settlement-report/summary', async (req, res) => {
  const { settlement_id } = req.query;
  const params = [];
  let ex = '';
  if (settlement_id) {
    params.push(settlement_id);
    ex = ` AND settlement_id = $${params.length}`;
  }
  const tx = `LOWER(COALESCE(transaction_type, ''))`;
  const normDesc = `LOWER(REGEXP_REPLACE(REPLACE(REPLACE(TRIM(COALESCE(amount_description, '')), CHR(160), ''), CHR(65279), ''), '[[:space:]]+', '', 'g'))`;
  const isPivotOther = `NOT (${normDesc} = 'principal' OR ${normDesc} LIKE '%fbaperunitfulfillmentfee%' OR ${normDesc} = 'commission' OR ${normDesc} LIKE '%variableclosingfee%')`;
  const lastPosted = `MAX(
    CASE
      WHEN TRIM(COALESCE(posted_date::text, '')) <> '' THEN TRIM(posted_date::text)
      WHEN TRIM(COALESCE(posted_date_time::text, '')) <> '' THEN TRIM(SPLIT_PART(REGEXP_REPLACE(TRIM(posted_date_time::text), 'T', ' '), ' ', 1))
      ELSE NULL
    END
  )`;
  try {
    const sql = `
      SELECT
        settlement_id,
        MIN(settlement_start_date) AS start_date,
        MIN(settlement_end_date)   AS end_date,
        ${lastPosted}              AS last_posted,
        SUM(CASE WHEN ${tx} LIKE '%order%' AND ${normDesc} = 'principal' THEN COALESCE(amount, 0) ELSE 0 END) AS order_sales,
        SUM(CASE WHEN ${tx} LIKE '%order%' AND ${normDesc} LIKE '%fbaperunitfulfillmentfee%' THEN COALESCE(amount, 0) ELSE 0 END) AS order_fba_fees,
        SUM(CASE WHEN ${tx} LIKE '%order%' AND ${normDesc} = 'commission' THEN COALESCE(amount, 0) ELSE 0 END) AS order_fba_commission,
        SUM(CASE WHEN ${tx} LIKE '%order%' AND ${normDesc} LIKE '%variableclosingfee%' THEN COALESCE(amount, 0) ELSE 0 END) AS order_variable_fee,
        SUM(CASE WHEN ${tx} LIKE '%order%' AND ${isPivotOther} THEN COALESCE(amount, 0) ELSE 0 END) AS order_other_charges,
        SUM(CASE WHEN ${tx} LIKE '%order%' THEN COALESCE(amount, 0) ELSE 0 END) AS order_total,
        SUM(CASE WHEN ${tx} LIKE '%order%' THEN COALESCE(quantity_purchased, 0) ELSE 0 END)::bigint AS order_qty,
        SUM(CASE WHEN ${tx} LIKE '%refund%' AND ${normDesc} = 'principal' THEN COALESCE(amount, 0) ELSE 0 END) AS refund_sales,
        SUM(CASE WHEN ${tx} LIKE '%refund%' AND ${normDesc} LIKE '%fbaperunitfulfillmentfee%' THEN COALESCE(amount, 0) ELSE 0 END) AS refund_fba_fees,
        SUM(CASE WHEN ${tx} LIKE '%refund%' AND ${normDesc} = 'commission' THEN COALESCE(amount, 0) ELSE 0 END) AS refund_fba_commission,
        SUM(CASE WHEN ${tx} LIKE '%refund%' AND ${normDesc} LIKE '%variableclosingfee%' THEN COALESCE(amount, 0) ELSE 0 END) AS refund_variable_fee,
        SUM(CASE WHEN ${tx} LIKE '%refund%' AND ${isPivotOther} THEN COALESCE(amount, 0) ELSE 0 END) AS refund_other_charges,
        SUM(CASE WHEN ${tx} LIKE '%refund%' THEN COALESCE(amount, 0) ELSE 0 END) AS refund_total,
        SUM(CASE WHEN ${tx} LIKE '%refund%' THEN COALESCE(quantity_purchased, 0) ELSE 0 END)::bigint AS refund_qty,
        SUM(CASE WHEN NOT (${tx} LIKE '%order%') AND NOT (${tx} LIKE '%refund%') THEN COALESCE(amount, 0) ELSE 0 END) AS other_total,
        SUM(CASE WHEN NOT (${tx} LIKE '%order%') AND NOT (${tx} LIKE '%refund%') THEN COALESCE(quantity_purchased, 0) ELSE 0 END)::bigint AS other_qty
      FROM settlement_report
      WHERE settlement_id IS NOT NULL AND TRIM(COALESCE(settlement_id::text, '')) <> ''${ex}
      GROUP BY settlement_id
      ORDER BY last_posted DESC NULLS LAST, settlement_id DESC
    `;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Sales Recon: settlement orders + refunds rolled up by normalized order_id + sku (MSKU), with distinct settlement IDs — same pivots as Settlement Report tabs. */
app.get('/api/sales-recon/settlement-rollup', async (req, res) => {
  try {
    const P = settlementAmountPivotExpr();
    const twOrders = settlementTabFilter('orders');
    const twRefunds = settlementTabFilter('refunds');
    const baseOrders = `FROM settlement_report WHERE ${twOrders} AND order_id IS NOT NULL AND TRIM(COALESCE(order_id::text,'')) <> ''`;
    const baseRefunds = `FROM settlement_report WHERE ${twRefunds} AND order_id IS NOT NULL AND TRIM(COALESCE(order_id::text,'')) <> ''`;
    const oidExpr = `TRIM(REPLACE(REPLACE(COALESCE(order_id::text, ''), CHR(160), ''), CHR(65279), ''))`;
    const skuExpr = `LOWER(TRIM(REPLACE(REPLACE(COALESCE(sku::text, ''), CHR(160), ''), CHR(65279), '')))`;

    const ordersSql = `
      WITH t AS (
        SELECT settlement_id,
               ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
               order_id, sku, order_item_code,
               MAX(quantity_purchased) AS qty,
               ${P.sales} AS sales_amount,
               ${P.fbaFees} AS fba_fees,
               ${P.commission} AS fba_commission,
               ${P.variableFee} AS variable_fee,
               ${P.other} AS other_charges,
               ${P.total} AS total_amount
        ${baseOrders}
        GROUP BY settlement_id, order_id, sku, order_item_code
      )
      SELECT
        ${oidExpr} AS order_id,
        ${skuExpr} AS sku_norm,
        COALESCE(array_agg(DISTINCT NULLIF(TRIM(settlement_id::text), '')), ARRAY[]::text[]) AS settlement_ids,
        SUM(qty)::bigint AS qty,
        SUM(sales_amount)::numeric(16,4) AS sales_amount,
        SUM(fba_fees)::numeric(16,4) AS fba_fees,
        SUM(fba_commission)::numeric(16,4) AS fba_commission,
        SUM(variable_fee)::numeric(16,4) AS variable_fee,
        SUM(other_charges)::numeric(16,4) AS other_charges,
        SUM(total_amount)::numeric(16,4) AS total_amount
      FROM t
      GROUP BY ${oidExpr}, ${skuExpr}
    `;

    const refundsSql = `
      WITH u AS (
        SELECT
          t.settlement_id,
          t.posted_date,
          t.order_id,
          t.sku,
          t.order_item_code,
          COALESCE(
            ROUND(ABS(t.variable_fee::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0),
            0
          )::int AS line_qty,
          t.sales_amount,
          t.fba_fees,
          t.fba_commission,
          t.variable_fee,
          t.other_charges,
          t.total_amount
        FROM (
          SELECT settlement_id, order_id, sku, order_item_code,
                 ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS posted_date,
                 ${P.sales} AS sales_amount,
                 ${P.fbaFees} AS fba_fees,
                 ${P.commission} AS fba_commission,
                 ${P.variableFee} AS variable_fee,
                 ${P.other} AS other_charges,
                 ${P.total} AS total_amount
          ${baseRefunds}
          GROUP BY settlement_id, order_id, sku, order_item_code
        ) t
      )
      SELECT
        ${oidExpr} AS order_id,
        ${skuExpr} AS sku_norm,
        COALESCE(array_agg(DISTINCT NULLIF(TRIM(settlement_id::text), '')), ARRAY[]::text[]) AS settlement_ids,
        SUM(line_qty)::bigint AS qty,
        SUM(sales_amount)::numeric(16,4) AS sales_amount,
        SUM(fba_fees)::numeric(16,4) AS fba_fees,
        SUM(fba_commission)::numeric(16,4) AS fba_commission,
        SUM(variable_fee)::numeric(16,4) AS variable_fee,
        SUM(other_charges)::numeric(16,4) AS other_charges,
        SUM(total_amount)::numeric(16,4) AS total_amount
      FROM u
      GROUP BY ${oidExpr}, ${skuExpr}
    `;

    const [o, r] = await Promise.all([pool.query(ordersSql), pool.query(refundsSql)]);
    res.json({ orders: o.rows, refunds: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- CSV templates: files in Public/upload-templates/<slug>.csv (also served by static middleware)
function normalizeUploadTemplateSlug(s) {
  return String(s || '').toLowerCase().replace(/_/g, '-');
}
const UPLOAD_TEMPLATE_SLUGS = new Set([
  'shipped', 'sales', 'receipts', 'returns', 'reimbursements', 'fctransfer', 'replacements', 'gnr', 'removals',
  'removal-shipments', 'shipment-receiving', 'fbasummary',
]);

app.get('/api/template/:slug', (req, res) => {
  const slug = normalizeUploadTemplateSlug(req.params.slug);
  if (slug === 'payment-repository' || slug === 'paymentrepo') {
    const p = paymentRepositoryTemplatePath();
    if (!p) {
      return res.status(404).json({ error: 'Template file missing — add Public/payment_repository_template.csv next to server.js' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payment_repository_template.csv"');
    return res.sendFile(path.resolve(p));
  }
  if (!UPLOAD_TEMPLATE_SLUGS.has(slug)) {
    return res.status(404).json({
      error: `Unknown template "${slug}". Valid slugs match upload report types (e.g. returns → Public/upload-templates/returns.csv).`,
    });
  }
  const fp = path.join(publicDir, 'upload-templates', `${slug}.csv`);
  if (!fs.existsSync(fp)) {
    return res.status(404).json({ error: `Missing file: upload-templates/${slug}.csv` });
  }
  const dl = `${slug.replace(/-/g, '_')}_template.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${dl}"`);
  return res.sendFile(path.resolve(fp));
});

// --- Shipped to FBA (Amazon TSV format) ---
app.post('/api/upload/shipped', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });

  const allRows = parseFile(req.file.buffer, req.file.originalname);

  // Row 1: Shipment ID -> col 2
  // Row 2: Name (has date) -> col 2
  // Row 8: Column headers (Merchant SKU, Title, ASIN, FNSKU, ..., Shipped)
  // Row 9+: Data

  const shipmentId = String(allRows[0]?.[1] || '').trim();
  const nameVal    = String(allRows[1]?.[1] || '').trim();

  // Extract date from Name like "FBA STA (12/19/2025 09:53)-LBE1"
  let shipDate = null;
  const dateMatch = nameVal.match(/\((\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) {
    const parts = dateMatch[1].split('/');
    shipDate = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  }

  // Find header row (has "Merchant SKU")
  let headerIdx = -1;
  for (let i = 0; i < allRows.length; i++) {
    if (String(allRows[i][0]).includes('Merchant SKU') || String(allRows[i][0]).includes('merchant-sku')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return res.status(400).json({ error: '❌ Wrong report! Yeh "Shipped to FBA" report nahi hai.\n\n"Merchant SKU" column nahi mila. Sahi Shipped to FBA file upload karo.' });

  const dataRows = allRows.slice(headerIdx + 1).filter(r => r[0] && String(r[0]).trim());

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prevCosts = await client.query(
      `SELECT msku, publisher_name, supplier_name, delivery_location, purchase_id,
        final_net_price_usd, commission_usd, supplier_shipping_usd, warehouse_prep_usd,
        inventory_place_inbound_usd, expert_charges_usd, other_charges_usd, cost_updated_at
       FROM shipped_to_fba WHERE shipment_id = $1`,
      [shipmentId]
    );
    const costByMsku = {};
    for (const r of prevCosts.rows) costByMsku[r.msku] = r;

    await client.query('DELETE FROM shipped_to_fba WHERE shipment_id = $1', [shipmentId]);

    const map = {};
    dataRows.forEach(row => {
      const msku  = String(row[0]||'').trim(); // Merchant SKU - col 1
      const title = String(row[1]||'').trim(); // Title - col 2
      const asin  = String(row[2]||'').trim(); // ASIN - col 3
      const fnsku = String(row[3]||'').trim(); // FNSKU - col 4
      const qty   = toNum(row[9]);             // Shipped - col 10 (last)
      if (!msku) return;
      if (!map[msku]) map[msku] = { msku, title, asin, fnsku, qty: 0 };
      map[msku].qty += qty;
    });

    const entries = Object.values(map).filter(e => e.msku && e.qty > 0);
    const dt = createReportLatestDateTracker();
    dt.note(shipDate);
    if (!dt.get()) dt.note(toDate(nameVal));
    if (!dt.get()) {
      for (let ri = 0; ri < allRows.length && ri < 40; ri++) {
        const row = allRows[ri];
        if (!row) continue;
        for (let cj = 0; cj < Math.min(row.length, 8); cj++) {
          const cell = row[cj];
          if (cell == null || cell === '') continue;
          const s = String(cell).trim();
          if (/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{1,2}-\d{1,2}/.test(s)) dt.note(toDate(s));
        }
      }
    }

    // Pattern A: DELETE + direct COPY (no ON CONFLICT needed — deleted above)
    const copyRows = entries.map(e => {
      const c = costByMsku[e.msku] || {};
      return [
        e.msku, e.title, e.asin, e.fnsku, shipDate, e.qty, shipmentId,
        c.publisher_name ?? null, c.supplier_name ?? null, c.delivery_location ?? null, c.purchase_id ?? null,
        c.final_net_price_usd ?? null, c.commission_usd ?? null, c.supplier_shipping_usd ?? null,
        c.warehouse_prep_usd ?? null, c.inventory_place_inbound_usd ?? null,
        c.expert_charges_usd ?? null, c.other_charges_usd ?? null, c.cost_updated_at ?? null,
      ];
    });
    await copyRowsToTable(client, 'shipped_to_fba',
      ['msku','title','asin','fnsku','ship_date','quantity','shipment_id',
       'publisher_name','supplier_name','delivery_location','purchase_id',
       'final_net_price_usd','commission_usd','supplier_shipping_usd','warehouse_prep_usd',
       'inventory_place_inbound_usd','expert_charges_usd','other_charges_usd','cost_updated_at'],
      copyRows
    );
    await applyShippedFbaComputedCosts(client, shipmentId, null);
    await client.query(
      `INSERT INTO uploaded_files (report_type, filename, row_count, data_target_table, report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['shipped_to_fba', req.file.originalname, entries.length, 'shipped_to_fba', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ shipped_to_fba: ${entries.length} MSKUs | Shipment: ${shipmentId} | Date: ${shipDate}`);
    res.json({ success: true, rows_saved: entries.length, shipment_id: shipmentId, ship_date: shipDate });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ❌ shipped error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// Shipped to FBA — distinct shipment IDs for cost worksheet export filter
app.get('/api/shipped-to-fba/shipment-ids', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT shipment_id,
        COUNT(*)::int AS row_count,
        MAX(ship_date) AS last_ship_date
      FROM shipped_to_fba
      WHERE shipment_id IS NOT NULL AND TRIM(shipment_id) <> ''
      GROUP BY shipment_id
      ORDER BY MAX(ship_date) DESC NULLS LAST, shipment_id DESC
      LIMIT 250
    `);
    res.json({ rows: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shipped to FBA — download cost worksheet (CSV) from DB rows
app.get('/api/shipped-to-fba/cost-export', async (req, res) => {
  try {
    const shipmentId = req.query.shipment_id ? String(req.query.shipment_id).trim() : null;
    let q = `
      SELECT shipment_id, msku, title, asin, fnsku, ship_date, quantity,
        publisher_name, supplier_name, delivery_location, purchase_id,
        final_net_price_usd, commission_usd, supplier_shipping_usd, warehouse_prep_usd,
        inventory_place_inbound_usd, expert_charges_usd, other_charges_usd, per_book_cost_usd, final_total_purchase_cost_usd
      FROM shipped_to_fba WHERE 1=1`;
    const params = [];
    if (shipmentId) {
      params.push(shipmentId);
      q += ` AND shipment_id = $${params.length}`;
    }
    q += ' ORDER BY shipment_id NULLS LAST, msku';
    const r = await pool.query(q, params);
    const lines = [SHIPPED_COST_EXPORT_HEADERS.map(csvEscapeCell).join(',')];
    for (const row of r.rows) {
      const sd = row.ship_date
        ? (row.ship_date instanceof Date
          ? row.ship_date.toISOString().split('T')[0]
          : String(row.ship_date).split('T')[0])
        : '';
      const pb = shippedPerBookFromRow(row);
      const lt = shippedLineTotalFromRow(row);
      lines.push([
        row.shipment_id, row.msku, row.title, row.asin, row.fnsku, sd, row.quantity,
        row.publisher_name, row.supplier_name, row.delivery_location, row.purchase_id,
        row.final_net_price_usd, row.commission_usd, row.supplier_shipping_usd, row.warehouse_prep_usd,
        row.inventory_place_inbound_usd, row.expert_charges_usd, row.other_charges_usd,
        pb, lt,
      ].map(csvEscapeCell).join(','));
    }
    const body = `\ufeff${lines.join('\r\n')}`;
    const fn = shipmentId
      ? `shipped_fba_cost_${String(shipmentId).replace(/[^\w.-]+/g, '_')}.csv`
      : 'shipped_fba_cost_all_shipments.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shipped to FBA — upload filled cost worksheet; updates cost columns only
app.post('/api/upload/shipped-cost', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File required' });
  let allRows;
  try {
    allRows = parseFile(req.file.buffer, req.file.originalname);
  } catch (e) {
    return res.status(400).json({ error: 'Could not read file: ' + e.message });
  }
  if (!allRows.length) return res.status(400).json({ error: 'Empty file' });
  const idx = shippedCostFieldIndexFromHeaders(allRows[0]);
  if (idx.shipment_id === undefined || idx.msku === undefined) {
    return res.status(400).json({
      error: 'Worksheet must include Shipment ID and Merchant SKU columns (use Download cost worksheet).',
    });
  }
  const hasCostCol = SHIPPED_COST_TEXT_FIELDS.some(f => idx[f] !== undefined)
    || SHIPPED_COST_COMPONENT_MONEY_FIELDS.some(f => idx[f] !== undefined);
  if (!hasCostCol) {
    return res.status(400).json({
      error: 'No cost columns found. Keep the header row from Download cost worksheet (Publisher Name, Supplier Name, Del Loc, Purchase ID, USD fee columns through Other Charges USD, etc.). Per book and line total are calculated for you.',
    });
  }
  const dataRows = allRows.slice(1).filter(r => r && r.length);
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let ri = 0; ri < dataRows.length; ri++) {
      const row = dataRows[ri];
      const shipmentId = String(row[idx.shipment_id] ?? '').trim();
      const msku = String(row[idx.msku] ?? '').trim();
      if (!shipmentId || !msku) {
        skipped++;
        continue;
      }
      const updates = {};
      for (const f of SHIPPED_COST_TEXT_FIELDS) {
        if (idx[f] === undefined) continue;
        const raw = row[idx[f]];
        const t = raw == null ? '' : String(raw).trim();
        updates[f] = t === '' ? null : t;
      }
      for (const f of SHIPPED_COST_COMPONENT_MONEY_FIELDS) {
        if (idx[f] === undefined) continue;
        updates[f] = parseMoneyCell(row[idx[f]]);
      }
      const setParts = [];
      const vals = [];
      let pn = 1;
      for (const f of [...SHIPPED_COST_TEXT_FIELDS, ...SHIPPED_COST_COMPONENT_MONEY_FIELDS]) {
        if (!Object.prototype.hasOwnProperty.call(updates, f)) continue;
        setParts.push(`${f}=$${pn++}`);
        vals.push(updates[f]);
      }
      if (!setParts.length) {
        skipped++;
        continue;
      }
      setParts.push('cost_updated_at=NOW()');
      const wShip = pn;
      const wMsku = pn + 1;
      vals.push(shipmentId, msku);
      const q = `UPDATE shipped_to_fba SET ${setParts.join(', ')}
        WHERE shipment_id=$${wShip} AND msku=$${wMsku}`;
      const u = await client.query(q, vals);
      if (u.rowCount > 0) {
        updated++;
        await applyShippedFbaComputedCosts(client, shipmentId, msku);
      }
      else {
        skipped++;
        if (errors.length < 15) errors.push(`No row for shipment_id=${shipmentId} msku=${msku}`);
      }
    }
    await client.query('COMMIT');
    console.log(`  ✅ shipped_to_fba cost update: ${updated} rows, skipped ${skipped}`);
    res.json({
      success: true,
      rows_updated: updated,
      rows_skipped: skipped,
      warnings: errors.length ? errors : undefined,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ❌ shipped-cost error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Sales Data ---
// Natural row: (sale_date, order_id, fc, ship_state, msku, quantity, product_amount) — same order+MSKU can have
// multiple Customer Shipment lines (different qty/amount); re-upload of identical line upserts only.
// Columns: Date(0) MSKU(1) FNSKU(2) ASIN(3) FC(4) Quantity(5) OrderId(6)
app.post('/api/upload/sales', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  // -- VALIDATION --
  const hdrSales = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,'').replace(/\ufeff/g,''));
  if (!hdrSales.some(c=>c.includes('amazon order id')||c.includes('order id')) && !hdrSales.some(c=>c.includes('merchant sku')||c.includes('customer shipment'))) {
    return res.status(400).json({ error: '\u274c Wrong report! Yeh Sales Data report nahi hai.\n\nSahi column chahiye: "Amazon Order Id", "Merchant SKU"' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Columns: 0=Customer Shipment Date, 1=Merchant SKU, 2=FNSKU, 3=ASIN,
    //           4=FC, 5=Quantity, 6=Amazon Order Id, 7=Currency,
    //           8=Product Amount, 9=Shipping Amount, 10=Gift Amount,
    //           11=Shipment To City, 12=Shipment To State, 13=Shipment To Postal Code
    const entries = [];
    const dt = createReportLatestDateTracker();

    await streamCsvRows(req.file.buffer, req.file.originalname, 1000, async (chunk) => {
      for (const row of chunk) {
        const msku         = String(row[1]||'').trim();
        const fnsku        = String(row[2]||'').trim();
        const asin         = String(row[3]||'').trim();
        const fc           = String(row[4]||'').trim();
        const qty          = toNum(row[5]);
        const order_id     = String(row[6]||'').trim();
        const currency     = String(row[7]||'USD').trim();
        const product_amt  = parseFloat(String(row[8]||'0').replace(/[^0-9.-]/g,''))||0;
        const shipping_amt = parseFloat(String(row[9]||'0').replace(/[^0-9.-]/g,''))||0;
        const gift_amt     = parseFloat(String(row[10]||'0').replace(/[^0-9.-]/g,''))||0;
        const ship_city    = String(row[11]||'').trim();
        const ship_state   = String(row[12]||'').trim();
        const ship_postal  = String(row[13]||'').replace(/[\r\n]/g,'').trim();
        const date         = toDate(row[0]);
        if (!msku || !order_id) continue;
        dt.note(date);
        entries.push([msku, fnsku, asin, fc||'', qty, date, order_id,
                      currency, product_amt, shipping_amt, gift_amt,
                      ship_city, ship_state, ship_postal]);
      }
    });

    // Skip header row (streamCsvRows includes it); filter after
    const dataEntries = entries.filter(e => e[0] && e[6] && e[0] !== 'Merchant SKU' && e[0] !== 'msku');

    await copyUpsertRows(client, {
      tmpTable:    'tmp_sales_data',
      mainTable:   'sales_data',
      columns:     ['msku','fnsku','asin','fc','quantity','sale_date','order_id','currency',
                    'product_amount','shipping_amount','gift_amount',
                    'ship_city','ship_state','ship_postal_code'],
      rows:        dataEntries,
      conflictSql: `ON CONFLICT (sale_date, order_id, fc, ship_state, msku, quantity, product_amount) DO UPDATE SET
                      fnsku=EXCLUDED.fnsku, asin=EXCLUDED.asin,
                      currency=EXCLUDED.currency,
                      shipping_amount=EXCLUDED.shipping_amount,
                      gift_amount=EXCLUDED.gift_amount,
                      ship_city=EXCLUDED.ship_city, ship_state=EXCLUDED.ship_state,
                      ship_postal_code=EXCLUDED.ship_postal_code,
                      uploaded_at=NOW()`,
    });

    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['sales_data', req.file.originalname, dataEntries.length, 'sales_data', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ sales_data: ${dataEntries.length} rows saved`);
    res.json({ success: true, rows_saved: dataEntries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ sales error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- FBA Receipts (Amazon TSV format) ---
// Columns: Date(0) FNSKU(1) ASIN(2) MSKU(3) Title(4) EventType(5) ReferenceID(6) Quantity(7) FC(8) Disposition(9)
// Same MSKU ka positive + negative quantity SUM karo → net qty
app.post('/api/upload/receipts', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);

  // ── VALIDATION ──
  const hdrReceipts = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  const dataValsReceipts = allRows.slice(1,5).map(r=>(r[5]||'').toString().trim().toLowerCase());
  const isReceiptsType = dataValsReceipts.some(v=>v.includes('receipt'));
  const hasFnskuR = hdrReceipts.some(c=>c.includes('fnsku'));
  if (!hasFnskuR || !isReceiptsType) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh FBA Receipts report nahi hai.\n\nEvent Type column mein "Receipts" value chahiye. FC Transfer ya koi aur file mat upload karo.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // FNSKU + ShipmentID ke hisaab se group karo aur qty SUM karo (net qty)
    const map = {};
    // Columns: 0=Date, 1=FNSKU, 2=ASIN, 3=MSKU, 4=Title, 5=Event Type,
    //           6=Reference ID (Shipment ID), 7=Quantity, 8=Fulfillment Center,
    //           9=Disposition, 10=Reason, 11=Country, 12=Reconciled Qty,
    //           13=Unreconciled Qty, 14=Date and Time, 15=Store
    const dt = createReportLatestDateTracker();

    await streamCsvRows(req.file.buffer, req.file.originalname, 1000, async (chunk) => {
      for (const row of chunk) {
        const msku         = String(row[3]||'').trim();
        const fnsku        = String(row[1]||'').trim();
        if (!fnsku && !msku) continue;
        // Skip header row (fnsku header value is literally 'fnsku')
        if (fnsku.toLowerCase() === 'fnsku' || msku.toLowerCase() === 'msku') continue;
        const asin         = String(row[2]||'').trim();
        const title        = String(row[4]||'').trim();
        const event_type   = String(row[5]||'').trim();
        const shipmentId   = String(row[6]||'').trim();
        const qty          = toNum(row[7]);
        const fc           = String(row[8]||'').trim();
        const disposition  = String(row[9]||'').trim();
        const reason       = String(row[10]||'').trim();
        const country      = String(row[11]||'').trim();
        const recon_qty    = toNum(row[12]);
        const unrecon_qty  = toNum(row[13]);
        const datetime_raw = String(row[14]||'').trim();
        const store        = String(row[15]||'').replace(/[\r\n]/g,'').trim();
        const date         = toDate(row[0]);
        const recv_dt      = datetime_raw ? toDate(datetime_raw) : date;
        dt.note(date);
        dt.note(recv_dt);
        const key = fnsku + '|||' + shipmentId + '|||' + (date||'');
        if (!map[key]) map[key] = { msku, fnsku, asin, title, event_type, shipmentId,
                                     fc, disposition, reason, country,
                                     recon_qty: 0, unrecon_qty: 0,
                                     qty: 0, date, recv_dt, store };
        map[key].qty         += qty;
        map[key].recon_qty   += recon_qty;
        map[key].unrecon_qty += unrecon_qty;
      }
    });

    const entries = Object.values(map);
    const dataEntries = entries.map(e => [
      e.msku, e.title, e.asin, e.fnsku, e.qty, e.date, e.shipmentId||null,
      e.event_type||null, e.fc||null, e.disposition||null, e.reason||null,
      e.country||null, e.recon_qty||0, e.unrecon_qty||0,
      e.recv_dt||null, e.store||null,
    ]);

    await copyUpsertRows(client, {
      tmpTable:    'tmp_fba_receipts',
      mainTable:   'fba_receipts',
      columns:     ['msku','title','asin','fnsku','quantity','receipt_date','shipment_id',
                    'event_type','fulfillment_center','disposition','reason','country',
                    'reconciled_qty','unreconciled_qty','receipt_datetime','store'],
      rows:        dataEntries,
      conflictSql: `ON CONFLICT (receipt_date, fnsku, shipment_id) DO UPDATE SET
                      msku=EXCLUDED.msku, title=EXCLUDED.title, asin=EXCLUDED.asin,
                      quantity=EXCLUDED.quantity,
                      event_type=EXCLUDED.event_type,
                      fulfillment_center=EXCLUDED.fulfillment_center,
                      disposition=EXCLUDED.disposition, reason=EXCLUDED.reason,
                      country=EXCLUDED.country,
                      reconciled_qty=EXCLUDED.reconciled_qty,
                      unreconciled_qty=EXCLUDED.unreconciled_qty,
                      receipt_datetime=EXCLUDED.receipt_datetime,
                      store=EXCLUDED.store, uploaded_at=NOW()`,
    });

    await client.query(
      `INSERT INTO uploaded_files (report_type, filename, row_count, data_target_table, report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['fba_receipts', req.file.originalname, dataEntries.length, 'fba_receipts', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ fba_receipts: ${dataEntries.length} rows saved (net qty calculated)`);
    res.json({ success: true, rows_saved: dataEntries.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ❌ receipts error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- Customer Returns ---
// Cols: 0=return-date 1=order-id 2=sku(MSKU) 3=asin 4=fnsku 5=product-name
//       6=quantity 7=fulfillment-center-id 8=detailed-disposition 9=reason
//       10=status 11=license-plate-number 12=customer-comments
app.post('/api/upload/returns', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  const hdrReturns = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  if (!hdrReturns.some(c=>c.includes('disposition'))) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh Customer Returns report nahi hai.\n\nSahi column chahiye: "disposition"' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const entries = [];
    const dt = createReportLatestDateTracker();

    await streamCsvRows(req.file.buffer, req.file.originalname, 1000, async (chunk) => {
      for (const row of chunk) {
        const msku     = String(row[2]||'').trim();
        if (!msku) continue;
        const asin     = String(row[3]||'').trim();
        const fnsku    = String(row[4]||'').trim();
        const title    = String(row[5]||'').trim();
        const qty      = toNum(row[6]);
        const fc       = String(row[7]||'').trim();
        const det_disp = String(row[8]||'').trim();
        const reason   = String(row[9]||'').trim();
        const status   = String(row[10]||'').trim();
        const lpn      = String(row[11]||'').trim();
        const comments = String(row[12]||'').replace(/[\r\n]/g,'').trim();
        const retDateVal = toDate(row[0]);
        const order_id = String(row[1]||'').trim();
        const disp     = det_disp.split('_')[0] || det_disp;
        dt.note(retDateVal);
        entries.push([msku, asin, fnsku, title, qty, disp, det_disp, reason,
                      status, retDateVal, order_id, fc, lpn||'', comments||null]);
      }
    });

    const dataEntries = entries.filter(e => e[0] && e[0] !== 'sku' && e[0] !== 'msku');
    await copyUpsertRows(client, {
      tmpTable:    'tmp_customer_returns',
      mainTable:   'customer_returns',
      columns:     ['msku','asin','fnsku','title','quantity','disposition','detailed_disposition','reason',
                    'status','return_date','order_id','fulfillment_center','license_plate_number','customer_comments'],
      rows:        dataEntries,
      conflictSql: `ON CONFLICT (return_date, fnsku, license_plate_number, disposition) DO UPDATE SET
                      msku=EXCLUDED.msku, asin=EXCLUDED.asin, title=EXCLUDED.title,
                      quantity=EXCLUDED.quantity, reason=EXCLUDED.reason,
                      detailed_disposition=EXCLUDED.detailed_disposition,
                      status=EXCLUDED.status, order_id=EXCLUDED.order_id,
                      fulfillment_center=EXCLUDED.fulfillment_center,
                      customer_comments=EXCLUDED.customer_comments, uploaded_at=NOW()`,
    });

    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['customer_returns', req.file.originalname, dataEntries.length, 'customer_returns', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ customer_returns: ${dataEntries.length} rows saved`);
    res.json({ success: true, rows_saved: dataEntries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ returns error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- Reimbursements ---
// Cols: 0=approval-date 1=reimbursement-id 2=case-id 3=amazon-order-id 4=reason
//       5=sku(MSKU) 6=fnsku 7=asin 8=product-name 9=condition 10=currency-unit
//       11=amount-per-unit 12=amount-total 13=qty-cash 14=qty-inventory
//       15=qty-total 16=original-reimbursement-id 17=original-reimbursement-type
app.post('/api/upload/reimbursements', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  const hdrReimb = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  if (!hdrReimb.some(c=>c.includes('reimbursement-id')||c.includes('reimbursement id')||c.includes('reimbursement'))) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh Reimbursements report nahi hai.\n\nSahi column chahiye: "reimbursement-id"' });
  }
  const dataRows = allRows.slice(1).filter(r => r[5] && String(r[5]).trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const entries = [];
    dataRows.forEach(row => {
      const approval_date= toDate(row[0]);
      const reimb_id     = String(row[1]||'').trim();
      const case_id      = String(row[2]||'').trim();
      const order_id     = String(row[3]||'').trim();
      const reason       = String(row[4]||'').trim();
      const msku         = String(row[5]||'').trim();
      const fnsku        = String(row[6]||'').trim();
      const asin         = String(row[7]||'').trim();
      const title        = String(row[8]||'').trim();
      const condition    = String(row[9]||'').trim();
      const currency     = String(row[10]||'USD').trim();
      const amt_per_unit = parseFloat(String(row[11]||'0').replace(/,/g,''))||0;
      const amount       = parseFloat(String(row[12]||'0').replace(/,/g,''))||0;
      const qty_cash     = toNum(row[13]);
      const qty_inv      = toNum(row[14]);
      const qty          = toNum(row[15]);
      const orig_id      = String(row[16]||'').trim();
      const orig_type    = String(row[17]||'').replace(/[\r\n]/g,'').trim();
      if (!msku) return;
      entries.push({ approval_date, reimb_id, case_id, order_id, reason, msku, fnsku, asin, title,
                     condition, currency, amt_per_unit, amount, qty_cash, qty_inv, qty,
                     orig_id, orig_type });
    });
    const dt = createReportLatestDateTracker();
    entries.forEach((e) => dt.note(e.approval_date));
    for (const e of entries) {
      await client.query(
        `INSERT INTO reimbursements
           (msku,fnsku,asin,title,reason,quantity,amount,reimbursement_id,
            approval_date,case_id,amazon_order_id,condition_val,currency,amount_per_unit,
            qty_cash,qty_inventory,original_reimb_id,original_reimb_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (reimbursement_id, fnsku) DO UPDATE SET
           msku=EXCLUDED.msku, asin=EXCLUDED.asin, title=EXCLUDED.title,
           reason=EXCLUDED.reason, quantity=EXCLUDED.quantity, amount=EXCLUDED.amount,
           approval_date=EXCLUDED.approval_date,
           case_id=EXCLUDED.case_id, amazon_order_id=EXCLUDED.amazon_order_id,
           condition_val=EXCLUDED.condition_val, currency=EXCLUDED.currency,
           amount_per_unit=EXCLUDED.amount_per_unit,
           qty_cash=EXCLUDED.qty_cash, qty_inventory=EXCLUDED.qty_inventory,
           original_reimb_id=EXCLUDED.original_reimb_id,
           original_reimb_type=EXCLUDED.original_reimb_type, uploaded_at=NOW()`,
        [e.msku, e.fnsku, e.asin, e.title, e.reason, e.qty, e.amount, e.reimb_id,
         e.approval_date||null, e.case_id||null, e.order_id||null, e.condition||null, e.currency||'USD',
         e.amt_per_unit, e.qty_cash, e.qty_inv,
         e.orig_id||null, e.orig_type||null]
      );
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['reimbursements', req.file.originalname, entries.length, 'reimbursements', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ reimbursements: ${entries.length} rows saved`);
    res.json({ success: true, rows_saved: entries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ reimbursements error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- FC Transfer ---
// Cols: 0=Date 1=FNSKU 2=ASIN 3=MSKU 4=Title 5=Event Type 6=Reference ID
//       7=Quantity 8=Fulfillment Center 9=Disposition 10=Reason 11=Country
//       12=Reconciled Quantity 13=Unreconciled Quantity 14=Date and Time 15=Store
// FC Transfers: ALWAYS full replace each upload
app.post('/api/upload/fctransfer', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  const hdrFC = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  const dataValsFC = allRows.slice(1,5).map(r=>(r[5]||'').toString().trim().toLowerCase());
  const isFCType = dataValsFC.some(v=>v.includes('whse')||v.includes('transfer'));
  if (!hdrFC.some(c=>c.includes('fnsku'))) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh FC Transfer report nahi hai.\n\nSahi column chahiye: "FNSKU"' });
  }
  if (!isFCType) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh FC Transfer report nahi hai.\n\nEvent Type "WhseTransfers" wali file chahiye. FBA Receipts ya koi aur file mat upload karo.' });
  }
  const dataRows = allRows.slice(1).filter(r => r[3] && String(r[3]).trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM fc_transfers');
    const dt = createReportLatestDateTracker();
    // Store each row individually (not grouped) to preserve full detail
    for (const row of dataRows) {
      const msku        = String(row[3]||'').trim();
      const fnsku       = String(row[1]||'').trim();
      const asin        = String(row[2]||'').trim();
      const title       = String(row[4]||'').trim();
      const event_type  = String(row[5]||'').trim();
      const ref_id      = String(row[6]||'').trim();
      const qty         = toNum(row[7]);
      const fc          = String(row[8]||'').trim();
      const disposition = String(row[9]||'').trim();
      const reason      = String(row[10]||'').trim();
      const country     = String(row[11]||'').trim();
      const recon_qty   = toNum(row[12]);
      const unrecon_qty = toNum(row[13]);
      const dt_raw      = String(row[14]||'').trim();
      const store       = String(row[15]||'').replace(/[\r\n]/g,'').trim();
      const date        = toDate(row[0]);
      const recv_dt     = dt_raw ? toDate(dt_raw) : date;
      dt.note(date);
      dt.note(recv_dt);
      if (!msku && !fnsku) continue;
      await client.query(
        `INSERT INTO fc_transfers
           (msku,fnsku,asin,title,quantity,transfer_date,event_type,reference_id,
            fulfillment_center,disposition,reason,country,
            reconciled_qty,unreconciled_qty,transfer_datetime,store)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [msku, fnsku, asin, title, qty, date, event_type||null, ref_id||null,
         fc||null, disposition||null, reason||null, country||null,
         recon_qty||0, unrecon_qty||0, recv_dt||null, store||null]
      );
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['fc_transfers', req.file.originalname, dataRows.length, 'fc_transfers', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ fc_transfers: ${dataRows.length} rows saved`);
    res.json({ success: true, rows_saved: dataRows.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ fc_transfers error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- Replacements ---
// Amazon Replacements Report columns:
// ?shipment-date(0)  sku(1)  asin(2)  fulfillment-center-id(3)  original-fulfillment-center-id(4)
// quantity(5)  replacement-reason-code(6)  replacement-amazon-order-id(7)  original-amazon-order-id(8)
app.post('/api/upload/replacements', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  if (!allRows || allRows.length < 2) return res.status(400).json({ error: 'File is empty or unreadable' });

  // Header-based column detection (robust against column reordering)
  const rawHdr = (allRows[0]||[]).map(c => String(c||'').toLowerCase().trim().replace(/[?'"]/g,''));
  const ci = name => rawHdr.findIndex(h => h.replace(/[-_\s]/g,'').includes(name.replace(/[-_\s]/g,'')));

  const idxDate     = ci('shipment-date');
  const idxSku      = rawHdr.findIndex(h => h === 'sku' || h === 'msku');
  const idxAsin     = rawHdr.findIndex(h => h === 'asin');
  const idxFc       = ci('fulfillment-center-id');
  const idxOrigFc   = ci('original-fulfillment-center-id');
  const idxQty      = rawHdr.findIndex(h => h === 'quantity');
  const idxReason   = ci('replacement-reason-code');
  const idxReplOrd  = ci('replacement-amazon-order-id');
  const idxOrigOrd  = ci('original-amazon-order-id');

  // Validate it's the right report
  const hasRequired = idxSku >= 0 && (idxReplOrd >= 0 || idxOrigOrd >= 0);
  if (!hasRequired) {
    return res.status(400).json({
      error: '❌ Wrong report! This is not the Amazon Replacements report.\nExpected columns: "sku", "replacement-amazon-order-id", "original-amazon-order-id"'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dt = createReportLatestDateTracker();
    const entries = [];

    await streamCsvRows(req.file.buffer, req.file.originalname, 1000, async (chunk) => {
      for (const row of chunk) {
        const msku             = String(row[idxSku]   ||'').trim(); if (!msku) continue;
        const asin             = String(row[idxAsin]  ||'').trim();
        const fc               = String(row[idxFc]    ||'').trim();
        const origFc           = String(row[idxOrigFc]||'').trim();
        const qty              = parseInt(String(row[idxQty]||'0').replace(/,/g,''))||0;
        const reasonCode       = String(row[idxReason]  ||'').trim();
        const replacementOrdId = String(row[idxReplOrd] ||'').trim();
        const originalOrdId    = String(row[idxOrigOrd] ||'').trim();
        const shipDate         = idxDate >= 0 ? toDate(row[idxDate]) : null;
        dt.note(shipDate);
        entries.push([msku, replacementOrdId||originalOrdId, qty, asin||null, fc||null,
                      origFc||null, reasonCode||null, replacementOrdId||null, originalOrdId||null,
                      shipDate||null]);
      }
    });

    const dataEntries = entries.filter(e => e[0] && e[0] !== 'sku');
    // replacements uses a partial unique index on replacement_order_id WHERE NOT NULL
    // Rows without replacement_order_id use ON CONFLICT DO NOTHING (no safe upsert key)
    for (const e of dataEntries) {
      await client.query(
        `INSERT INTO replacements
           (msku, order_id, quantity, asin, fulfillment_center_id,
            original_fulfillment_center_id, replacement_reason_code,
            replacement_order_id, original_order_id, shipment_date, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (replacement_order_id) WHERE replacement_order_id IS NOT NULL
         DO UPDATE SET
           msku=EXCLUDED.msku, quantity=EXCLUDED.quantity, asin=EXCLUDED.asin,
           fulfillment_center_id=EXCLUDED.fulfillment_center_id,
           original_fulfillment_center_id=EXCLUDED.original_fulfillment_center_id,
           replacement_reason_code=EXCLUDED.replacement_reason_code,
           original_order_id=EXCLUDED.original_order_id,
           shipment_date=EXCLUDED.shipment_date, uploaded_at=NOW()`,
        e
      );
    }

    await client.query(
      `INSERT INTO uploaded_files (report_type, filename, row_count, data_target_table, report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['replacements', req.file.originalname, dataEntries.length, 'replacements', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ replacements: ${dataEntries.length} rows saved`);
    res.json({ success: true, rows_saved: dataEntries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ replacements upload error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- Grade and Resell (GNR) Report ---
// Columns: date, order-id, value-recovery-type, lpn, manual-order-item-id,
//          merchant-sku, fnsku, asin, quantity, unit-status,
//          reason-for-unit-status, grade-and-resell-used-condition,
//          grade-and-resell-used-merchant-sku, grade-and-resell-used-fnsku
app.post('/api/upload/gnr', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  if (!allRows || allRows.length < 2) return res.status(400).json({ error: 'File is empty or unreadable' });

  // Header-based column detection
  const rawHdr = (allRows[0]||[]).map(c => String(c||'').toLowerCase().trim().replace(/[?'"]/g,''));
  const ci = name => rawHdr.findIndex(h => h.replace(/[-_\s]/g,'').includes(name.replace(/[-_\s]/g,'')));

  const idxDate       = ci('date');
  const idxOrderId    = ci('orderid');
  const idxType       = ci('valuerecoverytype');
  const idxLpn        = ci('lpn');
  const idxManualId   = ci('manualorderitemid');
  const idxMsku       = rawHdr.findIndex(h => h === 'merchant-sku' || h === 'merchantsku' || h === 'sku');
  const idxFnsku      = rawHdr.findIndex(h => h === 'fnsku');
  const idxAsin       = rawHdr.findIndex(h => h === 'asin');
  const idxQty        = rawHdr.findIndex(h => h === 'quantity');
  const idxStatus     = ci('unitstatus');
  const idxReason     = ci('reasonforunitstatus');
  const idxCondition  = ci('gradeandresellused-condition') >= 0 ? ci('gradeandresellused-condition') : ci('usedcondition');
  const idxUsedMsku   = rawHdr.findIndex(h => h.includes('grade') && h.includes('merchant'));
  const idxUsedFnsku  = rawHdr.findIndex(h => h.includes('grade') && h.includes('fnsku'));

  // Validate — must have order-id
  if (idxOrderId < 0) {
    return res.status(400).json({ error: '❌ Wrong report! Expected columns: "order-id", "merchant-sku", "unit-status"' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dt = createReportLatestDateTracker();
    const entries = [];

    await streamCsvRows(req.file.buffer, req.file.originalname, 1000, async (chunk) => {
      for (const row of chunk) {
        const orderId  = String(row[idxOrderId]||'').trim(); if (!orderId) continue;
        const msku     = idxMsku      >= 0 ? String(row[idxMsku]     ||'').trim()||null : null;
        const fnsku    = idxFnsku     >= 0 ? String(row[idxFnsku]    ||'').trim()||null : null;
        const asin     = idxAsin      >= 0 ? String(row[idxAsin]     ||'').trim()||null : null;
        const qty      = idxQty       >= 0 ? parseInt(String(row[idxQty]||'1').replace(/,/g,''))||1 : 1;
        const rDate    = idxDate      >= 0 ? toDate(row[idxDate]) : null;
        dt.note(rDate);
        const vType    = idxType      >= 0 ? String(row[idxType]     ||'').trim()||null : null;
        const lpn      = idxLpn       >= 0 ? String(row[idxLpn]      ||'').trim()||null : null;
        const manId    = idxManualId  >= 0 ? String(row[idxManualId] ||'').trim()||null : null;
        const status   = idxStatus    >= 0 ? String(row[idxStatus]   ||'').trim()||null : null;
        const reason   = idxReason    >= 0 ? String(row[idxReason]   ||'').trim()||null : null;
        const cond     = idxCondition >= 0 ? String(row[idxCondition]||'').trim()||null : null;
        const usedMsku = idxUsedMsku  >= 0 ? String(row[idxUsedMsku] ||'').trim()||null : null;
        const usedFnsku= idxUsedFnsku >= 0 ? String(row[idxUsedFnsku]||'').trim()||null : null;
        entries.push([rDate, orderId, vType, lpn, manId, msku, fnsku, asin, qty,
                      status, reason, cond, usedMsku, usedFnsku]);
      }
    });

    const dataEntries = entries.filter(e => e[1] && e[1] !== 'order-id');
    // gnr_report uses a partial unique index on order_id WHERE NOT NULL
    // Use batched upsert since partial index prevents standard copyUpsertRows pattern
    for (const e of dataEntries) {
      await client.query(
        `INSERT INTO gnr_report
           (report_date, order_id, value_recovery_type, lpn, manual_order_item_id,
            msku, fnsku, asin, quantity, unit_status, reason_for_unit_status,
            used_condition, used_msku, used_fnsku, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (order_id) WHERE order_id IS NOT NULL
         DO UPDATE SET
           report_date=EXCLUDED.report_date, value_recovery_type=EXCLUDED.value_recovery_type,
           lpn=EXCLUDED.lpn, msku=EXCLUDED.msku, fnsku=EXCLUDED.fnsku, asin=EXCLUDED.asin,
           quantity=EXCLUDED.quantity, unit_status=EXCLUDED.unit_status,
           reason_for_unit_status=EXCLUDED.reason_for_unit_status,
           used_condition=EXCLUDED.used_condition, used_msku=EXCLUDED.used_msku,
           used_fnsku=EXCLUDED.used_fnsku, uploaded_at=NOW()`,
        e
      );
    }

    await client.query(
      `INSERT INTO uploaded_files (report_type, filename, row_count, data_target_table, report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['gnr_report', req.file.originalname, dataEntries.length, 'gnr_report', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ gnr_report: ${dataEntries.length} rows saved`);
    res.json({ success: true, rows_saved: dataEntries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ gnr upload error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// GNR log endpoint
app.get('/api/gnr-log', async (req, res) => {
  try {
    const { from, to, search, status } = req.query;
    const params = [];
    const rConds = ['1=1'];
    const mConds = ['1=1']; // include all grade_resell_items in GNR log
    if (from) {
      params.push(from);
      rConds.push(`report_date >= $${params.length}`);
      mConds.push(`graded_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      rConds.push(`report_date <= $${params.length}`);
      mConds.push(`graded_date <= $${params.length}`);
    }
    if (status) {
      params.push(status);
      rConds.push(`unit_status = $${params.length}`);
      mConds.push(`unit_status = $${params.length}`);
    }
    if (search) {
      params.push('%'+search+'%');
      const sc = params.length;
      rConds.push(`(msku ILIKE $${sc} OR fnsku ILIKE $${sc} OR asin ILIKE $${sc} OR order_id ILIKE $${sc} OR used_msku ILIKE $${sc})`);
      mConds.push(`(msku ILIKE $${sc} OR fnsku ILIKE $${sc} OR asin ILIKE $${sc} OR order_id ILIKE $${sc} OR used_msku ILIKE $${sc})`);
    }
    const q = `
      SELECT report_date, order_id, lpn, value_recovery_type,
             msku, fnsku, asin, quantity, unit_status, reason_for_unit_status,
             used_condition, used_msku, used_fnsku,
             'report' AS entry_source
      FROM gnr_report WHERE ${rConds.join(' AND ')}
      UNION ALL
      SELECT graded_date AS report_date, order_id, lpn,
             'Manual Entry' AS value_recovery_type,
             msku, fnsku, asin, quantity, unit_status, notes AS reason_for_unit_status,
             used_condition, used_msku, used_fnsku,
             'manual' AS entry_source
      FROM grade_resell_items WHERE ${mConds.join(' AND ')}
      ORDER BY report_date DESC NULLS LAST
      LIMIT 5000
    `;
    const r = await pool.query(q, params);
    res.json({ rows: r.rows, count: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GNR Reconciliation — grouped by used_msku + used_fnsku
app.get('/api/gnr-recon', async (req, res) => {
  try {
    const { search, action_status } = req.query;
    const params = [];
    const gnrWhere = ['1=1'];
    if (search) {
      params.push('%'+search+'%');
      gnrWhere.push(`(used_msku ILIKE $${params.length} OR used_fnsku ILIKE $${params.length} OR asin ILIKE $${params.length} OR fnsku ILIKE $${params.length})`);
    }
    const q = `
      WITH gnr_combined AS (
        -- Uploaded GNR report rows
        SELECT used_msku, used_fnsku, fnsku, asin, used_condition,
               quantity, unit_status, order_id, lpn, report_date
        FROM gnr_report
        WHERE ${gnrWhere.join(' AND ')}
        UNION ALL
        -- Manual entries from Grade & Resell
        -- If used_msku is filled → merges with matching report rows by used_msku+used_fnsku
        -- If used_msku is empty  → uses original msku as a distinct grouping key
        SELECT
          COALESCE(NULLIF(TRIM(used_msku),''), 'Manual: '||msku)  AS used_msku,
          COALESCE(NULLIF(TRIM(used_fnsku),''), fnsku)             AS used_fnsku,
          fnsku, asin,
          COALESCE(NULLIF(TRIM(used_condition),''), grade)         AS used_condition,
          quantity,
          COALESCE(NULLIF(TRIM(unit_status),''), 'Succeeded')      AS unit_status,
          order_id, lpn, graded_date AS report_date
        FROM grade_resell_items
        WHERE (${gnrWhere.join(' AND ').replace(/gnr_report\./g,'')})
      ),
      gnr_base AS (
        SELECT
          COALESCE(used_msku, '(No Used SKU)')              AS used_msku,
          COALESCE(used_fnsku,'(No Used FNSKU)')            AS used_fnsku,
          MAX(fnsku)                                         AS orig_fnsku,
          MAX(asin)                                          AS asin,
          MAX(used_condition)                                AS used_condition,
          SUM(quantity)                                      AS gnr_qty,
          COUNT(DISTINCT order_id)                           AS order_count,
          SUM(CASE WHEN LOWER(unit_status)='succeeded' THEN quantity ELSE 0 END) AS succeeded_qty,
          SUM(CASE WHEN LOWER(unit_status)='failed'    THEN quantity ELSE 0 END) AS failed_qty,
          STRING_AGG(DISTINCT order_id, ', ' ORDER BY order_id)
            FILTER (WHERE order_id IS NOT NULL AND order_id <> '') AS order_ids,
          STRING_AGG(DISTINCT lpn, ', ' ORDER BY lpn)
            FILTER (WHERE lpn IS NOT NULL AND lpn <> '')    AS lpns,
          MIN(report_date)                                   AS first_date,
          MAX(report_date)                                   AS last_date
        FROM gnr_combined
        GROUP BY used_msku, used_fnsku
      ),
      sales_agg AS (
        SELECT fnsku, SUM(quantity) AS sales_qty
        FROM sales_data GROUP BY fnsku
      ),
      returns_agg AS (
        SELECT fnsku, SUM(quantity) AS return_qty
        FROM customer_returns GROUP BY fnsku
      ),
      removals_agg AS (
        SELECT fnsku, SUM(quantity) AS removal_qty
        FROM fba_removals GROUP BY fnsku
      ),
      reimb_agg AS (
        SELECT fnsku, SUM(quantity) AS reimb_qty, SUM(COALESCE(amount,0)) AS reimb_amount
        FROM reimbursements GROUP BY fnsku
      ),
      fba_latest AS (
        SELECT DISTINCT ON (fnsku)
          fnsku, ending_balance AS fba_ending, summary_date
        FROM fba_summary
        ORDER BY fnsku, summary_date DESC NULLS LAST
      )
      SELECT
        g.*,
        COALESCE(s.sales_qty,  0) AS sales_qty,
        COALESCE(r.return_qty, 0) AS return_qty,
        COALESCE(rem.removal_qty, 0) AS removal_qty,
        COALESCE(reimb.reimb_qty, 0)   AS reimb_qty,
        COALESCE(reimb.reimb_amount, 0) AS reimb_amount,
        fs.fba_ending,
        fs.summary_date AS fba_summary_date,
        (g.gnr_qty
          - COALESCE(s.sales_qty, 0)
          - COALESCE(rem.removal_qty, 0)
          - COALESCE(reimb.reimb_qty, 0)
          + COALESCE(r.return_qty, 0)
        ) AS ending_balance,
        grm.remarks AS recon_remarks,
        grm.remarks AS remarks
      FROM gnr_base g
      LEFT JOIN sales_agg   s    ON s.fnsku    = g.used_fnsku
      LEFT JOIN returns_agg r    ON r.fnsku    = g.used_fnsku
      LEFT JOIN removals_agg rem ON rem.fnsku  = g.used_fnsku
      LEFT JOIN reimb_agg   reimb ON reimb.fnsku = g.used_fnsku
      LEFT JOIN fba_latest  fs   ON fs.fnsku   = g.used_fnsku
      LEFT JOIN gnr_recon_remarks grm ON grm.used_msku = g.used_msku AND grm.used_fnsku = g.used_fnsku
      ORDER BY
        CASE WHEN (g.gnr_qty - COALESCE(s.sales_qty,0) - COALESCE(rem.removal_qty,0) - COALESCE(reimb.reimb_qty,0) + COALESCE(r.return_qty,0)) > 0 THEN 0 ELSE 1 END,
        g.gnr_qty DESC,
        g.used_msku
    `;
    const r = await pool.query(q, params);
    const rows = r.rows;

    // Compute action_status per row — primary comparison: ending_balance vs fba_ending
    // Logic (FBA-first):
    //   ending == fba          → matched       ✅  (perfectly reconciled)
    //   fba==0 && ending>0     → take-action   ⚠️  (FBA shows nothing but we have balance → missing)
    //   ending > fba (other)   → over-accounted 🔄  (we calculated more than FBA shows)
    //   ending < fba, ≤60 days → waiting       ⏳  (FBA shows more — gap, but recent)
    //   ending < fba, >60 days → take-action   ⚠️  (FBA shows more — gap, stale → raise case)
    // Fallback when no FBA data:
    //   ending == 0            → balanced      ✓   (no discrepancy detected)
    //   ending < 0             → review        🔍  (unexpected negative)
    //   ending > 0, ≤60 days   → waiting       ⏳
    //   ending > 0, >60 days   → take-action   ⚠️
    const today = new Date();
    const enriched = rows.map(row => {
      const bal    = parseInt(row.ending_balance || 0);
      const fba    = row.fba_ending != null ? parseInt(row.fba_ending) : null;
      const lastDate = row.last_date ? new Date(row.last_date) : null;
      const daysSince = lastDate ? Math.floor((today - lastDate) / (1000 * 86400)) : 999;
      let ast;
      if (fba !== null) {
        if (bal === fba)                    ast = 'matched';
        else if (fba === 0 && bal > 0)      ast = 'take-action';   // FBA shows 0 but we have balance → missing units
        else if (bal > fba)                 ast = 'over-accounted';
        else /* bal < fba */                ast = daysSince > 60 ? 'take-action' : 'waiting';
      } else {
        // No FBA Summary data — if ending balance > 0 units are unaccounted → Take Action
        if (bal === 0)   ast = 'balanced';
        else if (bal < 0) ast = 'review';
        else              ast = 'take-action'; // no FBA to compare, but has outstanding balance
      }
      return { ...row, action_status: ast, days_since: daysSince };
    });

    // Apply action_status filter
    const filtered = action_status
      ? enriched.filter(x => x.action_status === action_status)
      : enriched;

    const stats = {
      total_skus:     enriched.length,
      total_gnr_qty:  enriched.reduce((s,x)=>s+parseInt(x.gnr_qty||0),0),
      matched:        enriched.filter(x=>x.action_status==='matched').length,
      take_action:    enriched.filter(x=>x.action_status==='take-action').length,
      waiting:        enriched.filter(x=>x.action_status==='waiting').length,
      over_accounted: enriched.filter(x=>x.action_status==='over-accounted').length,
      balanced:       enriched.filter(x=>x.action_status==='balanced').length,
      review:         enriched.filter(x=>x.action_status==='review').length,
    };
    const { limit, page, offset } = getPagination(req.query);
    const paginatedRows = filtered.slice(offset, offset + limit);
    res.json({ rows: paginatedRows, stats, total_count: filtered.length, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function saveGnrReconRemarksHandler(req, res) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gnr_recon_remarks (
        used_msku VARCHAR(512) NOT NULL,
        used_fnsku VARCHAR(512) NOT NULL,
        remarks TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (used_msku, used_fnsku)
      )
    `);
    const { used_msku, used_fnsku, remarks } = req.body || {};
    if (!used_msku || !used_fnsku) return res.status(400).json({ error: 'used_msku and used_fnsku required' });
    await pool.query(
      `INSERT INTO gnr_recon_remarks (used_msku, used_fnsku, remarks, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (used_msku, used_fnsku) DO UPDATE SET remarks = EXCLUDED.remarks, updated_at = NOW()`,
      [used_msku, used_fnsku, remarks != null ? String(remarks) : null]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('gnr-recon-remarks error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
app.post('/api/gnr-recon-remarks', saveGnrReconRemarksHandler);
app.put('/api/gnr-recon-remarks', saveGnrReconRemarksHandler);

// --- FBA Removal ---
// Columns: request-date(0) order-id(1) order-source(2) order-type(3) order-status(4) last-updated(5) sku/MSKU(6) fnsku(7) disposition(8) requested-qty(9) cancelled-qty(10) disposed-qty(11) shipped-qty(12) in-process-qty(13)
app.post('/api/upload/removals', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  // ── VALIDATION ──
  const hdrRemovals = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  if (!hdrRemovals.some(c=>c.includes('order-type')||c.includes('order type')||c.includes('order'))) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh FBA Removal report nahi hai.\n\nSahi column chahiye: "order-type"' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batchTs = (await client.query('SELECT transaction_timestamp() AS ts')).rows[0].ts;
    // Cols: 0=request-date 1=order-id 2=order-source 3=order-type 4=order-status
    //        5=last-updated 6=sku 7=fnsku 8=disposition 9=requested-qty
    //        10=cancelled-qty 11=disposed-qty 12=shipped-qty 13=in-process-qty
    //        14=removal-fee 15=currency
    const entries = [];
    const dt = createReportLatestDateTracker();

    await streamCsvRows(req.file.buffer, req.file.originalname, 1000, async (chunk) => {
      for (const row of chunk) {
        const msku         = String(row[6]||'').trim();
        const fnsku        = String(row[7]||'').trim();
        if (!msku && !fnsku) continue;
        const disp         = String(row[8]||'').trim();
        const order_source = String(row[2]||'').trim();
        const order_type   = String(row[3]||'').trim();
        const status       = String(row[4]||'').trim();
        const order_id     = String(row[1]||'').trim();
        const date         = toDate(row[0]);
        const last_upd     = toDate(row[5]);
        const can_qty      = toNum(row[10]);
        const dis_qty      = toNum(row[11]);
        const qty          = toNum(row[12]); // shipped-quantity
        const inp_qty      = toNum(row[13]);
        const fee          = parseFloat(String(row[14]||'0').replace(/,/g,''))||0;
        const currency     = String(row[15]||'USD').replace(/[\r\n]/g,'').trim();
        dt.note(date);
        dt.note(last_upd);
        entries.push([msku, fnsku, qty, disp, status, order_id||'', date,
                      order_source||null, order_type||null, last_upd||null,
                      can_qty, dis_qty, inp_qty, fee, currency||'USD', batchTs]);
      }
    });

    const dataEntries = entries.filter(e => (e[0] || e[1]) && e[0] !== 'sku');
    await copyUpsertRows(client, {
      tmpTable:    'tmp_fba_removals',
      mainTable:   'fba_removals',
      columns:     ['msku','fnsku','quantity','disposition','order_status','order_id','request_date',
                    'order_source','order_type','last_updated','cancelled_qty','disposed_qty',
                    'in_process_qty','removal_fee','currency','uploaded_at'],
      rows:        dataEntries,
      conflictSql: `ON CONFLICT (request_date, order_id, fnsku) DO UPDATE SET
                      msku=EXCLUDED.msku, quantity=EXCLUDED.quantity, disposition=EXCLUDED.disposition,
                      order_status=EXCLUDED.order_status, order_source=EXCLUDED.order_source,
                      order_type=EXCLUDED.order_type, last_updated=EXCLUDED.last_updated,
                      cancelled_qty=EXCLUDED.cancelled_qty, disposed_qty=EXCLUDED.disposed_qty,
                      in_process_qty=EXCLUDED.in_process_qty,
                      removal_fee=EXCLUDED.removal_fee, currency=EXCLUDED.currency, uploaded_at=EXCLUDED.uploaded_at`,
    });

    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,uploaded_at,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['fba_removals', req.file.originalname, dataEntries.length, batchTs, 'fba_removals', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ fba_removals: ${dataEntries.length} rows saved`);
    res.json({ success: true, rows_saved: dataEntries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ removals error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- Shipment Receiving Status ---
// Columns: Shipment name(0) Shipment ID(1) Created(2) Last updated(3) Ship to(4) SKUs(5) Units expected(6) Units located(7) Status(8)

// ── Upload: Removal Shipment Detail ──
app.post('/api/upload/removal-shipments', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  if (allRows.length < 2) return res.status(400).json({ error: 'File empty hai' });

  const hdr = (allRows[0]||[]).map(c => String(c||'').toLowerCase().trim().replace(/['"]/g,''));

  // Validate correct file
  if (!hdr.some(c => c.includes('tracking'))) {
    return res.status(400).json({ error: 'Wrong file! Removal Shipment Detail chahiye. tracking-number column nahi mili.' });
  }

  // Dynamic column detection (matches your actual Amazon file)
  const ci = {
    request_date:   hdr.findIndex(c => c.includes('request-date') || c === 'request date'),
    order_id:       hdr.findIndex(c => c.includes('order-id') || c === 'order id'),
    shipment_date:  hdr.findIndex(c => c.includes('shipment-date') || c === 'shipment date'),
    msku:           hdr.findIndex(c => c === 'sku'),
    fnsku:          hdr.findIndex(c => c === 'fnsku'),
    disposition:    hdr.findIndex(c => c.includes('disposition')),
    shipped_qty:    hdr.findIndex(c => c.includes('shipped-quantity') || c.includes('shipped quantity')),
    carrier:        hdr.findIndex(c => c === 'carrier'),
    tracking:       hdr.findIndex(c => c.includes('tracking-number') || c.includes('tracking number')),
    order_type:     hdr.findIndex(c => c.includes('removal-order-type') || c.includes('removal order type')),
  };

  const dataRows = allRows.slice(1).filter(r => r[ci.order_id] && String(r[ci.order_id]).trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dt = createReportLatestDateTracker();
    let saved = 0;
    for (const row of dataRows) {
      const orderId  = String(row[ci.order_id]||'').trim();
      const fnsku    = ci.fnsku >= 0 ? String(row[ci.fnsku]||'').trim() : '';
      const tracking = ci.tracking >= 0 ? String(row[ci.tracking]||'').trim() : '';
      if (!orderId || !fnsku || !tracking) continue;

      dt.note(toDate(ci.request_date >= 0 ? row[ci.request_date] : null));
      dt.note(toDate(ci.shipment_date >= 0 ? row[ci.shipment_date] : null));

      await client.query(
        `INSERT INTO removal_shipments
           (order_id, request_date, shipment_date, msku, fnsku, disposition,
            shipped_qty, carrier, tracking_number, removal_order_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (order_id, fnsku, tracking_number) DO UPDATE SET
           request_date      = EXCLUDED.request_date,
           shipment_date     = EXCLUDED.shipment_date,
           msku              = EXCLUDED.msku,
           disposition       = EXCLUDED.disposition,
           shipped_qty       = EXCLUDED.shipped_qty,
           carrier           = EXCLUDED.carrier,
           removal_order_type= EXCLUDED.removal_order_type,
           uploaded_at       = NOW()`,
        [
          orderId,
          toDate(ci.request_date >= 0 ? row[ci.request_date] : null) || null,
          toDate(ci.shipment_date >= 0 ? row[ci.shipment_date] : null) || null,
          ci.msku >= 0 ? String(row[ci.msku]||'').trim() || null : null,
          fnsku,
          ci.disposition >= 0 ? String(row[ci.disposition]||'').trim() || null : null,
          ci.shipped_qty >= 0 ? (parseInt(row[ci.shipped_qty])||0) : 0,
          ci.carrier >= 0 ? String(row[ci.carrier]||'').trim() || null : null,
          tracking,
          ci.order_type >= 0 ? String(row[ci.order_type]||'').trim() || null : null,
        ]
      );
      saved++;
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['removal_shipments', req.file.originalname, saved, 'removal_shipments', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ removal_shipments: ${saved} rows saved`);
    res.json({ success: true, rows_saved: saved });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('removal_shipments upload error:', e.message);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});


app.post('/api/upload/shipment-receiving', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  // ── VALIDATION ──
  const hdrShipStatus = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,'').replace(/\ufeff/g,''));
  if (!hdrShipStatus.some(c=>c.includes('shipment id')||c.includes('shipment-id')||c.includes('shipmentid')) || !hdrShipStatus.some(c=>c.includes('expected')||c.includes('units expected'))) {
    return res.status(400).json({ error: '❌ Wrong report! Yeh Shipment Status report nahi hai.\n\nSahi column chahiye: "Shipment ID", "Units expected"' });
  }
  const dataRows = allRows.slice(1).filter(r => r[1] && String(r[1]).trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dt = createReportLatestDateTracker();
    for (const row of dataRows) {
      const name     = String(row[0]||'').trim();
      const sid      = String(row[1]||'').trim();
      const created  = toDate(row[2]);
      const updated  = toDate(row[3]);
      dt.note(created);
      dt.note(updated);
      const ship_to  = String(row[4]||'').trim();
      const skus     = toNum(row[5]);
      const expected = toNum(row[6]);
      const located  = toNum(row[7]);
      const status   = String(row[8]||'').trim();
      if (!sid) continue;
      await client.query(
        `INSERT INTO shipment_status (shipment_name,shipment_id,created_date,last_updated,ship_to,total_skus,units_expected,units_located,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (shipment_id) DO UPDATE SET
           shipment_name=EXCLUDED.shipment_name, last_updated=EXCLUDED.last_updated,
           total_skus=EXCLUDED.total_skus, units_expected=EXCLUDED.units_expected,
           units_located=EXCLUDED.units_located, status=EXCLUDED.status, uploaded_at=NOW()`,
        [name, sid, created, updated, ship_to, skus, expected, located, status]
      );
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['shipment_status', req.file.originalname, dataRows.length, 'shipment_status', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ shipment_status: ${dataRows.length} rows saved`);
    res.json({ success: true, rows_saved: dataRows.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ shipment-receiving error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// --- FBA Summary ---
// Columns: Date(0) FNSKU(1) ASIN(2) MSKU(3) Title(4) Disposition(5) Starting(6) InTransit(7) Receipts(8) CustShipments(9) CustReturns(10) VendorReturns(11) WhseTransfer(12) Found(13) Lost(14) Damaged(15) Disposed(16) Other(17) EndingBalance(18)
app.post('/api/upload/fbasummary', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  // ── VALIDATION ──
  const hdrSummary = (allRows[0]||[]).map(c=>String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  if (!hdrSummary.some(c=>c.includes('ending')||c.includes('disposition')||c.includes('fnsku'))) {
    return res.status(400).json({ error: '❌ Wrong report! FBA Summary/Event Detail report expected.\n\nRequired columns: "fnsku", "disposition", "ending warehouse balance"' });
  }
  // ── HEADER-BASED COLUMN DETECTION (robust against column order changes) ──
  const findCol = (...terms) => {
    for (const t of terms) {
      const i = hdrSummary.findIndex(h => h.includes(t));
      if (i !== -1) return i;
    }
    return -1;
  };
  const iDate    = findCol('date');
  const iFnsku   = findCol('fnsku');
  const iAsin    = findCol('asin');
  const iMsku    = findCol('msku', 'sku');
  const iTitle   = findCol('product name', 'title');
  const iDisp    = findCol('disposition');
  const iStart   = findCol('starting warehouse', 'starting balance', 'starting inventory');
  const iTransit = findCol('in transit between', 'in-transit', 'in transit');
  const iRecpts  = findCol('receipts');
  const iShip    = findCol('customer shipments', 'customer ship');
  const iReturn  = findCol('customer returns');
  const iVendor  = findCol('vendor returns');
  const iXfer    = findCol('warehouse transfer');
  const iFound   = findCol('found');
  const iLost    = findCol('lost');
  const iDamage  = findCol('damaged');
  const iDispos  = findCol('dispos');
  const iOther   = findCol('other events');
  const iEnding  = findCol('ending warehouse', 'ending inventory', 'ending balance');
  const iUnknown = findCol('unknown events', 'unknown');
  const iLoc     = findCol('location');
  const iStore   = findCol('store');

  if (iFnsku === -1 || iEnding === -1) {
    return res.status(400).json({ error: `❌ Required columns not found.\nFound headers: ${hdrSummary.slice(0,10).join(', ')}` });
  }

  const get = (row, idx) => idx === -1 ? '' : (row[idx] ?? '');
  const dataRows = allRows.slice(1).filter(r => get(r, iFnsku) && String(get(r, iFnsku)).trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const map = {};
    dataRows.forEach(row => {
      const msku    = String(get(row, iMsku)||'').trim();
      const fnsku   = String(get(row, iFnsku)||'').trim();
      const asin    = String(get(row, iAsin)||'').trim();
      const title   = String(get(row, iTitle)||'').trim();
      const disp    = String(get(row, iDisp)||'').trim();
      const starting  = toNum(get(row, iStart));
      const in_transit= toNum(get(row, iTransit));
      const receipts  = toNum(get(row, iRecpts));
      const shipments = toNum(get(row, iShip));
      const returns   = toNum(get(row, iReturn));
      const vendor_ret= toNum(get(row, iVendor));
      const transfer  = toNum(get(row, iXfer));
      const found     = toNum(get(row, iFound));
      const lost      = toNum(get(row, iLost));
      const damaged   = toNum(get(row, iDamage));
      const disposed  = toNum(get(row, iDispos));
      const other     = toNum(get(row, iOther));
      const ending    = toNum(get(row, iEnding));
      const unknown   = toNum(get(row, iUnknown));
      const location  = String(get(row, iLoc)||'').trim();
      const store     = String(get(row, iStore)||'').replace(/[\r\n]/g,'').trim();
      const date      = toDate(get(row, iDate));
      if (!fnsku) return;
      const key = (date||'') + '|' + fnsku + '|' + disp;
      if (!map[key]) map[key] = { msku, fnsku, asin, title, disp,
        ending:0, starting:0, in_transit:0, receipts:0, shipments:0, returns:0,
        vendor_ret:0, transfer:0, found:0, lost:0, damaged:0, disposed:0,
        other:0, unknown:0, location, store, date };
      map[key].ending    += ending;   map[key].starting  += starting;
      map[key].in_transit+= in_transit; map[key].receipts  += receipts;
      map[key].shipments += shipments; map[key].returns   += returns;
      map[key].vendor_ret+= vendor_ret; map[key].transfer  += transfer;
      map[key].found     += found;    map[key].lost      += lost;
      map[key].damaged   += damaged;  map[key].disposed  += disposed;
      map[key].other     += other;    map[key].unknown   += unknown;
    });
    const entries = Object.values(map);
    const dt = createReportLatestDateTracker();
    entries.forEach((e) => dt.note(e.date));
    for (const e of entries) {
      await client.query(
        `INSERT INTO fba_summary
           (msku,fnsku,asin,title,disposition,ending_balance,starting_balance,
            in_transit,receipts,customer_shipments,customer_returns,vendor_returns,
            warehouse_transfer,found,lost,damaged,disposed_qty,other_events,
            unknown_events,location,store,summary_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (summary_date, fnsku, disposition) DO UPDATE SET
           msku=EXCLUDED.msku, asin=EXCLUDED.asin, title=EXCLUDED.title,
           ending_balance=EXCLUDED.ending_balance, starting_balance=EXCLUDED.starting_balance,
           in_transit=EXCLUDED.in_transit, receipts=EXCLUDED.receipts,
           customer_shipments=EXCLUDED.customer_shipments, customer_returns=EXCLUDED.customer_returns,
           vendor_returns=EXCLUDED.vendor_returns, warehouse_transfer=EXCLUDED.warehouse_transfer,
           found=EXCLUDED.found, lost=EXCLUDED.lost, damaged=EXCLUDED.damaged,
           disposed_qty=EXCLUDED.disposed_qty, other_events=EXCLUDED.other_events,
           unknown_events=EXCLUDED.unknown_events, location=EXCLUDED.location,
           store=EXCLUDED.store, uploaded_at=NOW()`,
        [e.msku, e.fnsku, e.asin, e.title, e.disp, e.ending, e.starting,
         e.in_transit, e.receipts, e.shipments, e.returns, e.vendor_ret,
         e.transfer, e.found, e.lost, e.damaged, e.disposed, e.other,
         e.unknown, e.location||null, e.store||null, e.date]
      );
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['fba_summary', req.file.originalname, entries.length, 'fba_summary', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ fba_summary: ${entries.length} rows saved`);
    res.json({ success: true, rows_saved: entries.length });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ fba_summary error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});


// ============================================================
//  REMOVAL SHIPMENT DETAIL — Upload Route
// ============================================================
// Amazon Removal Shipment Detail TSV columns (0-indexed):
//   0=request-date  1=order-id  2=shipment-date  3=fnsku
//   4=asin  5=sku(msku)  6=title  7=quantity
//   8=tracking-number  9=carrier
app.post('/api/upload/removal-shipments', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File nahi mili' });
  const allRows = parseFile(req.file.buffer, req.file.originalname);
  const hdr = (allRows[0]||[]).map(c => String(c||'').toLowerCase().trim().replace(/['"]/g,''));
  // Validation — must have order-id and shipment-date columns
  const hasOrderId   = hdr.some(c => c.includes('order-id') || c.includes('order id'));
  const hasShipDate  = hdr.some(c => c.includes('shipment-date') || c.includes('shipment date'));
  if (!hasOrderId || !hasShipDate) {
    return res.status(400).json({ error: 'Wrong file! Removal Shipment Detail report chahiye. Required columns: order-id and shipment-date' });
  }

  // Detect column positions dynamically
  const ci = {
    request_date:    hdr.findIndex(c => c.includes('request-date') || c === 'request date'),
    order_id:        hdr.findIndex(c => c.includes('order-id') || c === 'order id'),
    shipment_date:   hdr.findIndex(c => c.includes('shipment-date') || c === 'shipment date'),
    fnsku:           hdr.findIndex(c => c === 'fnsku'),
    asin:            hdr.findIndex(c => c === 'asin'),
    msku:            hdr.findIndex(c => c === 'sku' || c === 'msku' || c === 'merchant-sku' || c === 'merchant sku'),
    title:           hdr.findIndex(c => c === 'title' || c === 'product-name'),
    quantity:        hdr.findIndex(c => c === 'quantity' || c.includes('shipped-qty') || c.includes('quantity-shipped')),
    tracking_number: hdr.findIndex(c => c.includes('tracking') || c.includes('tracking-number')),
    carrier:         hdr.findIndex(c => c === 'carrier' || c.includes('carrier')),
  };
  // Fallback positional if dynamic failed
  if (ci.request_date  < 0) ci.request_date  = 0;
  if (ci.order_id      < 0) ci.order_id      = 1;
  if (ci.shipment_date < 0) ci.shipment_date  = 2;
  if (ci.fnsku         < 0) ci.fnsku         = 3;
  if (ci.asin          < 0) ci.asin          = 4;
  if (ci.msku          < 0) ci.msku          = 5;
  if (ci.title         < 0) ci.title         = 6;
  if (ci.quantity      < 0) ci.quantity      = 7;
  if (ci.tracking_number < 0) ci.tracking_number = 8;
  if (ci.carrier       < 0) ci.carrier       = 9;

  const dataRows = allRows.slice(1).filter(r => r[ci.order_id] && String(r[ci.order_id]).trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dt = createReportLatestDateTracker();
    let saved = 0;
    for (const row of dataRows) {
      const order_id        = String(row[ci.order_id]||'').trim();
      const fnsku           = String(row[ci.fnsku]||'').trim();
      const tracking_number = String(row[ci.tracking_number]||'').trim() || null;
      const request_date    = toDate(row[ci.request_date]);
      const shipment_date   = toDate(row[ci.shipment_date]);
      dt.note(request_date);
      dt.note(shipment_date);
      const asin            = String(row[ci.asin]||'').trim() || null;
      const msku            = String(row[ci.msku]||'').trim() || null;
      const title           = String(row[ci.title]||'').trim() || null;
      const quantity        = toNum(row[ci.quantity]);
      const carrier         = String(row[ci.carrier]||'').trim() || null;
      if (!order_id || !fnsku) continue;
      await client.query(
        `INSERT INTO removal_shipments
           (order_id, request_date, shipment_date, fnsku, asin, msku, title, quantity, tracking_number, carrier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (order_id, fnsku, COALESCE(tracking_number,'__NULL__')) DO UPDATE SET
           shipment_date=EXCLUDED.shipment_date, asin=EXCLUDED.asin, msku=EXCLUDED.msku,
           title=EXCLUDED.title, quantity=EXCLUDED.quantity, carrier=EXCLUDED.carrier,
           uploaded_at=NOW()`,
        [order_id, request_date||null, shipment_date||null, fnsku, asin, msku, title, quantity, tracking_number, carrier]
      );
      saved++;
    }
    await client.query(
      `INSERT INTO uploaded_files (report_type,filename,row_count,data_target_table,report_latest_date) VALUES ($1,$2,$3,$4,$5)`,
      ['removal_shipments', req.file.originalname, saved, 'removal_shipments', dt.get()]
    );
    await client.query('COMMIT');
    console.log(`  ✅ removal_shipments: ${saved} rows saved`);
    res.json({ success: true, rows_saved: saved });
  } catch(err) {
    await client.query('ROLLBACK');
    console.error('  ❌ removal_shipments error:', err.message);
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// ============================================================
//  REMOVAL RECONCILIATION — API
// ============================================================
app.get('/api/removal-recon', async (req, res) => {
  try {
    const { status, order_status, from, to, search } = req.query;

    // ── Main reconciliation query ──
    // LEFT JOIN: all orders, with shipment data where available
    // FULL OUTER via UNION to also catch orphan shipments
    const reconSQL = `
      WITH
      -- Order Detail aggregated per order_id + fnsku
      orders AS (
        SELECT
          order_id, fnsku, msku,
          MIN(request_date)   AS request_date,
          MAX(last_updated)   AS last_updated,
          order_status, order_type, order_source, disposition,
          SUM(quantity)       AS requested_qty,
          SUM(cancelled_qty)  AS cancelled_qty,
          SUM(disposed_qty)   AS disposed_qty,
          SUM(in_process_qty) AS in_process_qty,
          SUM(removal_fee)    AS removal_fee,
          MAX(currency)       AS currency,
          SUM(quantity) - SUM(cancelled_qty) - SUM(disposed_qty) AS expected_shipped
        FROM fba_removals
        GROUP BY order_id, fnsku, msku, order_status, order_type, order_source, disposition
      ),
      -- Shipment Detail aggregated per order_id + fnsku
      shipments AS (
        SELECT
          order_id, fnsku,
          SUM(quantity)            AS actual_shipped,
          COUNT(DISTINCT CASE WHEN tracking_number IS NOT NULL THEN tracking_number END) AS shipment_count,
          MAX(shipment_date)       AS last_shipment_date,
          STRING_AGG(DISTINCT carrier, ', ' ORDER BY carrier) AS carriers
        FROM removal_shipments
        GROUP BY order_id, fnsku
      ),
      -- Combined
      combined AS (
        -- Orders with or without shipments
        SELECT
          o.order_id,
          o.fnsku,
          o.msku,
          o.request_date,
          o.last_updated,
          o.order_status,
          o.order_type,
          o.order_source,
          o.disposition,
          o.requested_qty,
          o.cancelled_qty,
          o.disposed_qty,
          o.in_process_qty,
          o.expected_shipped,
          o.removal_fee,
          o.currency,
          COALESCE(s.actual_shipped, 0)   AS actual_shipped,
          COALESCE(s.shipment_count, 0)   AS shipment_count,
          s.last_shipment_date,
          s.carriers,
          COALESCE(s.actual_shipped, 0) - o.expected_shipped AS qty_variance,
          FALSE AS is_orphan,
          -- Reconciliation status logic
          CASE
            WHEN o.order_status ILIKE '%cancel%' AND COALESCE(s.actual_shipped,0) = 0
              THEN 'Cancelled OK'
            WHEN o.order_status ILIKE '%cancel%' AND COALESCE(s.actual_shipped,0) > 0
              THEN 'Cancelled but Shipped'
            WHEN o.order_status ILIKE '%pending%'
              THEN 'Pending'
            WHEN o.order_status ILIKE '%progress%'
              THEN 'In Progress'
            WHEN o.order_status ILIKE '%complet%' AND COALESCE(s.actual_shipped,0) = 0
              THEN 'Not Shipped'
            WHEN o.order_status ILIKE '%complet%' AND (COALESCE(s.actual_shipped,0) - o.expected_shipped) = 0
              THEN 'Matched'
            WHEN o.order_status ILIKE '%complet%' AND (COALESCE(s.actual_shipped,0) - o.expected_shipped) < 0
              THEN 'Short Shipped'
            WHEN o.order_status ILIKE '%complet%' AND (COALESCE(s.actual_shipped,0) - o.expected_shipped) > 0
              THEN 'Over Shipped'
            ELSE 'Unknown'
          END AS recon_status
        FROM orders o
        LEFT JOIN shipments s ON s.order_id = o.order_id AND s.fnsku = o.fnsku

        UNION ALL

        -- Orphan shipments (in shipment detail but NO matching order)
        SELECT
          s.order_id,
          s.fnsku,
          rs.msku,
          rs.request_date,
          NULL,
          'N/A',
          NULL, NULL, NULL,
          0, 0, 0, 0, 0, 0, NULL,
          s.actual_shipped,
          s.shipment_count,
          s.last_shipment_date,
          s.carriers,
          s.actual_shipped,
          TRUE,
          'Orphan Shipment'
        FROM shipments s
        LEFT JOIN (SELECT DISTINCT order_id, fnsku, msku, request_date FROM fba_removals) rs
          ON rs.order_id = s.order_id AND rs.fnsku = s.fnsku
        LEFT JOIN orders o ON o.order_id = s.order_id AND o.fnsku = s.fnsku
        WHERE o.order_id IS NULL
      )
      SELECT * FROM combined
      WHERE 1=1
      ${from   ? `AND (request_date >= '${from}'  OR last_shipment_date >= '${from}')` : ''}
      ${to     ? `AND (request_date <= '${to} 23:59:59' OR last_shipment_date <= '${to} 23:59:59')` : ''}
      ${order_status ? `AND order_status ILIKE '%${order_status.replace(/'/g,"''")}%'` : ''}
      ${status ? `AND recon_status = '${status.replace(/'/g,"''")}'` : ''}
      ${search ? `AND (order_id ILIKE '%${search.replace(/'/g,"''")}%' OR fnsku ILIKE '%${search.replace(/'/g,"''")}%' OR msku ILIKE '%${search.replace(/'/g,"''")}%')` : ''}
      ORDER BY request_date DESC NULLS LAST, order_id, fnsku
    `;

    const result = await pool.query(reconSQL);
    const allRows = result.rows;

    // ── Summary cards ──
    const total_orders    = new Set(allRows.filter(r=>!r.is_orphan).map(r=>r.order_id)).size;
    const matched         = allRows.filter(r=>r.recon_status==='Matched').length;
    const not_shipped     = allRows.filter(r=>r.recon_status==='Not Shipped').length;
    const short_shipped   = allRows.filter(r=>r.recon_status==='Short Shipped').length;
    const over_shipped    = allRows.filter(r=>r.recon_status==='Over Shipped').length;
    const orphans         = allRows.filter(r=>r.is_orphan).length;
    const total_fee       = allRows.reduce((s,r)=>s+(parseFloat(r.removal_fee)||0),0);
    const cancelled_ok    = allRows.filter(r=>r.recon_status==='Cancelled OK').length;
    const cancelled_issue = allRows.filter(r=>r.recon_status==='Cancelled but Shipped').length;

    const { limit, page, offset } = getPagination(req.query);
    const rows = allRows.slice(offset, offset + limit);
    res.json({
      rows,
      summary: {
        total_orders, matched, not_shipped, short_shipped,
        over_shipped, orphans, total_fee, cancelled_ok, cancelled_issue
      },
      total_count: allRows.length, page, limit,
    });
  } catch(e) {
    console.error('removal-recon error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Removal recon — distinct statuses for filter dropdown
app.get('/api/removal-recon/statuses', async (req, res) => {
  try {
    const r = await pool.query(`SELECT DISTINCT order_status FROM fba_removals WHERE order_status IS NOT NULL ORDER BY 1`);
    res.json({ statuses: r.rows.map(x=>x.order_status) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// --- Adjustments ---
app.post('/api/upload/adjustments', upload.single('file'), (req, res) =>
  doUpload(req, res, 'adjustments', (row, map) => {
    if (String(row[10]||'').trim() !== 'F') return;
    const msku = String(row[3]||'').trim();
    if (!msku) return;
    if (!map[msku]) map[msku] = { msku, qty:0 };
    map[msku].qty += toNum(row[7]);
  })
);


// ============================================
// ============================================
// CASE TRACKER API
// ============================================

// ── Case reimbursement summary — used by ALL recon pages to overlay case data ──
// Returns one row per (recon_type, msku, fnsku, shipment_id, order_id) with totals
app.get('/api/case-reimb-summary', async (req, res) => {
  try {
    const { recon_type } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    if (recon_type && recon_type !== 'all') {
      params.push(recon_type);
      where = `WHERE recon_type=$${params.length}`;
    }
    const r = await pool.query(`
      SELECT
        recon_type,
        msku,
        fnsku,
        shipment_id,
        order_id,
        SUM(COALESCE(units_claimed,  0))  AS total_claimed,
        SUM(COALESCE(units_approved, 0))  AS total_approved,
        SUM(COALESCE(amount_approved,0))  AS total_amount,
        COUNT(*)                          AS case_count,
        STRING_AGG(DISTINCT case_id, ', ')
          FILTER (WHERE case_id IS NOT NULL AND case_id <> '')  AS case_ids,
        STRING_AGG(DISTINCT case_reason, '; ')
          FILTER (WHERE case_reason IS NOT NULL AND case_reason <> '')    AS reasons,
        STRING_AGG(DISTINCT notes,  '; ')
          FILTER (WHERE notes  IS NOT NULL AND notes  <> '')    AS notes,
        MIN(created_at)                   AS first_raised_at,
        MAX(updated_at)                   AS last_updated_at,
        (ARRAY_AGG(status ORDER BY
          CASE WHEN status='resolved' THEN 5
               WHEN status='approved' THEN 4
               WHEN status='raised'   THEN 3
               WHEN status='pending'  THEN 2
               WHEN status='rejected' THEN 1
               ELSE 0 END DESC))[1]       AS top_status
      FROM case_tracker
      ${where}
      GROUP BY recon_type, msku, fnsku, shipment_id, order_id
      ORDER BY recon_type, msku
    `, params);
    res.json({ rows: r.rows });
  } catch(e) {
    console.error('case-reimb-summary error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get all cases (with optional filters)
app.get('/api/cases', async (req, res) => {
  try {
    const { recon_type, status, msku, search } = req.query;
    let q = 'SELECT * FROM case_tracker WHERE 1=1';
    const params = [];
    if (recon_type && recon_type !== 'all') { params.push(recon_type); q += ` AND recon_type=$${params.length}`; }
    if (status && status !== 'all')         { params.push(status);     q += ` AND status=$${params.length}`; }
    if (msku)                               { params.push(msku);       q += ` AND msku=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (msku ILIKE $${params.length} OR asin ILIKE $${params.length} OR case_id ILIKE $${params.length} OR title ILIKE $${params.length})`;
    }
    q += ' ORDER BY created_at DESC LIMIT 1000';
    const r = await pool.query(q, params);
    res.json({ rows: r.rows, count: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Shared helper: sync case reimbursement → removal_receipts ──
// Called after any case INSERT or UPDATE for recon_type='removal'
async function syncCaseReimbToReceipt(ct) {
  if (!ct || ct.recon_type !== 'removal' || !ct.order_id) return;
  const approvedQty = parseInt(ct.units_approved)    || 0;
  const approvedAmt = parseFloat(ct.amount_approved) || 0;
  // Only sync when actual reimbursement data is present
  if (approvedQty <= 0 && approvedAmt <= 0) return;
  try {
    const colChk = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='removal_receipts'
      AND column_name IN ('reimb_qty','reimb_amount','final_status','post_action')`);
    const hasCols = colChk.rows.map(r => r.column_name);
    if (hasCols.length === 0) return;

    const existing = await pool.query(
      `SELECT id FROM removal_receipts
       WHERE order_id=$1 AND (fnsku=$2 OR $2 IS NULL OR $2='')
       ORDER BY received_qty DESC NULLS LAST LIMIT 1`,
      [ct.order_id, ct.fnsku || null]
    );

    if (existing.rows.length > 0) {
      const rid = existing.rows[0].id;
      const setParts = [], setVals = [];
      if (hasCols.includes('reimb_qty'))   { setParts.push(`reimb_qty=$${setVals.length+1}`);   setVals.push(approvedQty); }
      if (hasCols.includes('reimb_amount')) { setParts.push(`reimb_amount=$${setVals.length+1}`);setVals.push(approvedAmt); }
      if (hasCols.includes('final_status')) { setParts.push(`final_status=$${setVals.length+1}`);setVals.push('Reimbursement claimed'); }
      if (hasCols.includes('post_action'))  { setParts.push(`post_action=$${setVals.length+1}`); setVals.push('Reimbursement claimed'); }
      if (setParts.length > 0) {
        setVals.push(rid);
        await pool.query(
          `UPDATE removal_receipts SET ${setParts.join(',')}, updated_at=NOW() WHERE id=$${setVals.length}`,
          setVals
        );
        console.log(`  ✅ Synced case #${ct.id} reimb (qty:${approvedQty}, $${approvedAmt}) → receipt #${rid}`);
      }
    } else {
      // No receipt yet — create a minimal reimbursement-only receipt
      const cols2 = ['order_id','fnsku','status'];
      const vals2 = [ct.order_id, ct.fnsku || null, 'Reimbursed'];
      if (hasCols.includes('reimb_qty'))   { cols2.push('reimb_qty');   vals2.push(approvedQty); }
      if (hasCols.includes('reimb_amount')) { cols2.push('reimb_amount');vals2.push(approvedAmt); }
      if (hasCols.includes('final_status')) { cols2.push('final_status');vals2.push('Reimbursement claimed'); }
      if (hasCols.includes('post_action'))  { cols2.push('post_action'); vals2.push('Reimbursement claimed'); }
      const ph = vals2.map((_,i) => `$${i+1}`).join(',');
      await pool.query(
        `INSERT INTO removal_receipts (${cols2.join(',')}) VALUES (${ph})`,
        vals2
      );
      console.log(`  ✅ Auto-created reimb receipt for order ${ct.order_id} from case #${ct.id}`);
    }
  } catch(syncErr) {
    console.log('  Note: Case reimb sync skipped:', syncErr.message);
  }
}

// Create new case
app.post('/api/cases', async (req, res) => {
  try {
    const {
      msku, asin, fnsku, title, recon_type,
      shipment_id, order_id, reference_id,
      case_id, case_reason, units_claimed, units_approved,
      amount_claimed, amount_approved, currency,
      status, issue_date, raised_date, resolved_date, notes
    } = req.body;
    if (!msku || !recon_type) return res.status(400).json({ error: 'msku and recon_type required' });
    const r = await pool.query(
      `INSERT INTO case_tracker
        (msku,asin,fnsku,title,recon_type,shipment_id,order_id,reference_id,
         case_id,case_reason,units_claimed,units_approved,
         amount_claimed,amount_approved,currency,
         status,issue_date,raised_date,resolved_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [msku,asin||null,fnsku||null,title||null,recon_type,
       shipment_id||null,order_id||null,reference_id||null,
       case_id||null,case_reason||null,units_claimed||0,units_approved||0,
       amount_claimed||0,amount_approved||0,currency||'USD',
       status||'pending',issue_date||null,raised_date||null,resolved_date||null,notes||null]
    );
    const ct = r.rows[0];
    console.log(`  ✅ Case created: ${msku} [${recon_type}]`);
    // Auto-sync reimbursement to removal_receipts if applicable
    if (ct) await syncCaseReimbToReceipt(ct);
    res.json({ success: true, row: ct });
  } catch(e) { console.error('case create error:', e.message); res.status(500).json({ error: e.message }); }
});

// Update case — and auto-sync approved reimbursement to removal_receipts
app.put('/api/cases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Filter out null/undefined — never overwrite a NOT NULL column with null
    const fields = Object.fromEntries(
      Object.entries(req.body).filter(([, v]) => v !== null && v !== undefined)
    );
    if (Object.keys(fields).length === 0) return res.json({ success: true });
    const sets = Object.keys(fields).map((k,i) => `${k}=$${i+2}`).join(',');
    const vals = Object.values(fields);
    await pool.query(
      `UPDATE case_tracker SET ${sets}, updated_at=NOW() WHERE id=$1`,
      [id, ...vals]
    );

    // ── Auto-sync reimbursement to removal_receipts (uses shared helper) ──
    try {
      const updated = await pool.query('SELECT * FROM case_tracker WHERE id=$1', [id]);
      if (updated.rows[0]) await syncCaseReimbToReceipt(updated.rows[0]);
    } catch(syncErr) {
      console.log('  Note: Case reimb sync skipped:', syncErr.message);
    }

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete case
app.delete('/api/cases/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM case_tracker WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// MANUAL ADJUSTMENTS API
// ============================================

// Get all adjustments
app.get('/api/manual-adjustments', async (req, res) => {
  try {
    const { recon_type, adj_type, msku, search } = req.query;
    let q = 'SELECT * FROM manual_adjustments WHERE 1=1';
    const params = [];
    if (recon_type && recon_type !== 'all') { params.push(recon_type); q += ` AND recon_type=$${params.length}`; }
    if (adj_type   && adj_type   !== 'all') { params.push(adj_type);   q += ` AND adj_type=$${params.length}`; }
    if (msku)                               { params.push(msku);       q += ` AND msku=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      q += ` AND (msku ILIKE $${params.length} OR asin ILIKE $${params.length} OR reason ILIKE $${params.length})`;
    }
    q += ' ORDER BY created_at DESC LIMIT 1000';
    const r = await pool.query(q, params);
    res.json({ rows: r.rows, count: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Create adjustment
app.post('/api/manual-adjustments', async (req, res) => {
  try {
    const {
      msku, asin, fnsku, title, recon_type,
      shipment_id, order_id, reference_id,
      adj_type, qty_before, qty_adjusted, qty_after,
      reason, verified_by, source_doc, notes, adj_date
    } = req.body;
    if (!msku || !recon_type || !adj_type || !reason)
      return res.status(400).json({ error: 'msku, recon_type, adj_type, reason required' });
    const r = await pool.query(
      `INSERT INTO manual_adjustments
        (msku,asin,fnsku,title,recon_type,shipment_id,order_id,reference_id,
         adj_type,qty_before,qty_adjusted,qty_after,reason,verified_by,source_doc,notes,adj_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [msku,asin||null,fnsku||null,title||null,recon_type,
       shipment_id||null,order_id||null,reference_id||null,
       adj_type,qty_before||0,qty_adjusted||0,qty_after||0,
       reason,verified_by||null,source_doc||null,notes||null,adj_date||null]
    );
    console.log(`  ✅ Adjustment created: ${msku} [${adj_type}] ${qty_adjusted > 0 ? '+' : ''}${qty_adjusted}`);
    res.json({ success: true, row: r.rows[0] });
  } catch(e) { console.error('adj create error:', e.message); res.status(500).json({ error: e.message }); }
});

// Update adjustment
app.put('/api/manual-adjustments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const sets = Object.keys(fields).map((k,i) => `${k}=$${i+2}`).join(',');
    const vals = Object.values(fields);
    await pool.query(`UPDATE manual_adjustments SET ${sets} WHERE id=$1`, [id, ...vals]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete adjustment
app.delete('/api/manual-adjustments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM manual_adjustments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// DATA ROUTES
// ============================================


// ── Shipment Recon — Combined data (shipped + status) ──
app.get('/api/shipment-recon-data', async (req, res) => {
  try {
    const { limit, page, offset } = getPagination(req.query);
    const countRes = await pool.query(`SELECT COUNT(*) FROM shipped_to_fba`);
    const total_count = parseInt(countRes.rows[0].count);
    const result = await pool.query(`
      SELECT
        sh.msku, sh.title, sh.asin, sh.fnsku,
        sh.ship_date, sh.quantity, sh.shipment_id,
        COALESCE(ss.status, 'Unknown') AS shipment_status,
        ss.shipment_name, ss.units_expected, ss.units_located,
        ss.last_updated
      FROM shipped_to_fba sh
      LEFT JOIN shipment_status ss
        ON TRIM(sh.shipment_id) = TRIM(ss.shipment_id)
      ORDER BY sh.ship_date DESC NULLS LAST, sh.shipment_id
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json({ rows: result.rows, total_count, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ═══════════════════════════════════════════════
// REPORTS API — Summary + Filtered Data
// ═══════════════════════════════════════════════

function normalizeReportTableParam(raw) {
  let t = String(raw || '').trim().toLowerCase().replace(/%5f/gi, '_');
  if (t === 'payment-repository' || t === 'paymentrepo' || t === 'payment') t = 'payment_repository';
  return t;
}

// Generic report data with filters
app.get('/api/report/:table', async (req, res) => {
  const allowed = ['shipped_to_fba','sales_data','fba_receipts','customer_returns',
                   'reimbursements','fc_transfers','fba_removals','shipment_status','fba_summary',
                   'removal_shipments','removal_receipts','payment_repository'];
  const table = normalizeReportTableParam(req.params.table);
  if (!allowed.includes(table)) {
    return res.status(400).json({
      error: 'Invalid table',
      received: req.params.table,
      normalized: table,
      hint: 'For Payment Repository use payment_repository. Fully stop Node (Ctrl+C) and run START.bat again if you just updated server.js.',
    });
  }

  const { shipment_id, msku, fnsku, asin, disposition, status, reason, search, from, to, order_type, fulfillment_center,
    settlement_id, tx_status, limit=5000 } = req.query;
  let q = `SELECT * FROM ${table} WHERE 1=1`;
  const params = [];

  const addFilter = (col, val) => { params.push(val); q += ` AND ${col} = $${params.length}`; };
  const addILike  = (col, val) => { params.push(`%${val}%`); q += ` AND ${col} ILIKE $${params.length}`; };

  // payment_repository columns differ (sku, no msku/fnsku/shipment_id/status) — skip generic filters or SQL errors → empty UI
  if (table !== 'payment_repository') {
    if (shipment_id) addFilter('shipment_id', shipment_id);
    if (msku)        addILike('msku', msku);
    if (fnsku)       addILike('fnsku', fnsku);
    if (asin)        addILike('asin', asin);
    if (disposition) addFilter('disposition', disposition);
    if (status)      addFilter('status', status);
    if (reason)      addILike('reason', reason);
    if (order_type)  addFilter('order_type', order_type);
    if (fulfillment_center) addFilter('fulfillment_center', fulfillment_center);
  }
  if (table === 'payment_repository' && settlement_id) addILike('settlement_id', settlement_id);
  if (table === 'payment_repository' && tx_status) addILike('transaction_status', tx_status);
  // Table-specific date column mapping
  const dateCol = {
    shipped_to_fba:   'ship_date',
    sales_data:       'sale_date',
    fba_receipts:     'receipt_date',
    customer_returns: 'return_date',
    reimbursements:   'approval_date',
    fc_transfers:     'transfer_date',
    fba_removals:     'request_date',
    shipment_status:    'created_date',
    fba_summary:        'summary_date',
    removal_shipments:  'shipment_date',
    removal_receipts:   'received_date',
    payment_repository: 'uploaded_at',
  }[table];
  if (from && dateCol) { params.push(from); q += ` AND ${dateCol} >= $${params.length}`; }
  if (to   && dateCol) { params.push(to);   q += ` AND ${dateCol} <= $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    const p = params.length;
    const cols = {
      shipped_to_fba: `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR asin ILIKE $${p} OR title ILIKE $${p} OR shipment_id ILIKE $${p} OR publisher_name ILIKE $${p} OR supplier_name ILIKE $${p} OR delivery_location ILIKE $${p} OR purchase_id ILIKE $${p})`,
      sales_data:     `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR asin ILIKE $${p} OR order_id ILIKE $${p})`,
      fba_receipts:   `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR asin ILIKE $${p} OR shipment_id ILIKE $${p})`,
      customer_returns:`(msku ILIKE $${p} OR fnsku ILIKE $${p} OR asin ILIKE $${p} OR disposition ILIKE $${p})`,
      reimbursements: `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR reason ILIKE $${p} OR reimbursement_id ILIKE $${p})`,
      fc_transfers:   `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR asin ILIKE $${p})`,
      fba_removals:   `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR order_id ILIKE $${p} OR disposition ILIKE $${p})`,
      shipment_status:`(shipment_id ILIKE $${p} OR shipment_name ILIKE $${p} OR status ILIKE $${p})`,
      fba_summary:    `(msku ILIKE $${p} OR fnsku ILIKE $${p} OR asin ILIKE $${p} OR disposition ILIKE $${p})`,
      payment_repository: `(settlement_id ILIKE $${p} OR order_id ILIKE $${p} OR sku ILIKE $${p} OR description ILIKE $${p} OR line_type ILIKE $${p} OR transaction_status ILIKE $${p})`,
    };
    if (cols[table]) q += ` AND ${cols[table]}`;
  }

  q += ` ORDER BY id DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit));

  try {
    const r = await pool.query(q, params);
    res.json({ rows: r.rows, count: r.rowCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Report summary stats
app.get('/api/report-summary/:table', async (req, res) => {
  try {
    const table = normalizeReportTableParam(req.params.table);
    let summary = {};
    if (table === 'shipped_to_fba') {
      const r = await pool.query(`SELECT COUNT(DISTINCT shipment_id) shipments, COUNT(DISTINCT msku) skus,
        SUM(quantity) total_units,
        SUM( ${SHIPPED_PERBOOK_SUM_SQL} * GREATEST(COALESCE(quantity,0), 0) ) AS total_purchase_cost_usd,
        MIN(ship_date) first_date, MAX(ship_date) last_date FROM shipped_to_fba`);
      const si = await pool.query(`SELECT shipment_id, SUM(quantity) qty, COUNT(DISTINCT msku) skus FROM shipped_to_fba GROUP BY shipment_id ORDER BY MAX(ship_date) DESC`);
      summary = { ...r.rows[0], shipment_list: si.rows };
    } else if (table === 'sales_data') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT msku)     skus,
        COUNT(DISTINCT order_id) orders,
        SUM(quantity)            total_units,
        SUM(product_amount)      total_product_amount,
        SUM(shipping_amount)     total_shipping_amount,
        MIN(sale_date)           first_date,
        MAX(sale_date)           last_date
        FROM sales_data`);
      const top = await pool.query(`SELECT msku, SUM(quantity) qty, SUM(product_amount) amt FROM sales_data GROUP BY msku ORDER BY qty DESC LIMIT 10`);
      const topfc = await pool.query(`SELECT fc, COUNT(DISTINCT order_id) orders, SUM(quantity) qty FROM sales_data WHERE fc IS NOT NULL AND fc <> '' GROUP BY fc ORDER BY qty DESC LIMIT 10`);
      const monthly = await pool.query(`SELECT TO_CHAR(sale_date,'YYYY-MM') month, SUM(quantity) qty, COUNT(DISTINCT order_id) orders, SUM(product_amount) amt FROM sales_data WHERE sale_date IS NOT NULL GROUP BY 1 ORDER BY 1`);
      summary = { ...r.rows[0], top_skus: top.rows, top_fc: topfc.rows, monthly: monthly.rows };
    } else if (table === 'fba_receipts') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT shipment_id)  shipments,
        COUNT(DISTINCT fnsku)        fnskus,
        COUNT(DISTINCT msku)         skus,
        SUM(quantity)                total_units,
        SUM(CASE WHEN quantity>0 THEN quantity ELSE 0 END) total_received,
        SUM(CASE WHEN quantity<0 THEN ABS(quantity) ELSE 0 END) total_adjustments,
        MIN(receipt_date) first_date, MAX(receipt_date) last_date
        FROM fba_receipts`);
      const si = await pool.query(`SELECT shipment_id, SUM(quantity) qty, COUNT(DISTINCT fnsku) fnskus, MAX(receipt_date) last_date FROM fba_receipts WHERE shipment_id IS NOT NULL GROUP BY shipment_id ORDER BY MAX(receipt_date) DESC`);
      const byFC   = await pool.query(`SELECT fulfillment_center fc, COUNT(DISTINCT fnsku) fnskus, SUM(quantity) qty FROM fba_receipts WHERE fulfillment_center IS NOT NULL AND fulfillment_center <> '' GROUP BY fulfillment_center ORDER BY qty DESC LIMIT 10`);
      const byDisp = await pool.query(`SELECT disposition, SUM(quantity) qty FROM fba_receipts WHERE disposition IS NOT NULL GROUP BY disposition ORDER BY qty DESC`);
      summary = { ...r.rows[0], shipment_list: si.rows, by_fc: byFC.rows, by_disposition: byDisp.rows };
    } else if (table === 'customer_returns') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT msku)  skus,
        COUNT(DISTINCT fnsku) fnskus,
        SUM(quantity)         total_units,
        MIN(return_date)      first_date,
        MAX(return_date)      last_date
        FROM customer_returns`);
      const disp   = await pool.query(`SELECT detailed_disposition, SUM(quantity) qty FROM customer_returns WHERE detailed_disposition IS NOT NULL AND detailed_disposition <> '' GROUP BY detailed_disposition ORDER BY qty DESC`);
      const reason = await pool.query(`SELECT reason, SUM(quantity) qty FROM customer_returns WHERE reason IS NOT NULL AND reason <> '' GROUP BY reason ORDER BY qty DESC`);
      summary = { ...r.rows[0], by_disposition: disp.rows, top_reasons: reason.rows };
    } else if (table === 'reimbursements') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT msku)             skus,
        COUNT(DISTINCT fnsku)            fnskus,
        COUNT(DISTINCT reimbursement_id) cases,
        SUM(quantity)                    total_units,
        SUM(amount)                      total_amount,
        MIN(approval_date)               first_date,
        MAX(approval_date)               last_date
        FROM reimbursements`);
      const rCase = await pool.query(`SELECT
        COUNT(DISTINCT msku)             skus_case,
        COUNT(DISTINCT reimbursement_id) cases_case,
        SUM(quantity)                    units_case,
        SUM(amount)                      amount_case
        FROM reimbursements WHERE case_id IS NOT NULL AND case_id <> ''`);
      const byReason = await pool.query(`SELECT reason, COUNT(DISTINCT reimbursement_id) cnt, SUM(quantity) qty, SUM(amount) amt FROM reimbursements GROUP BY reason ORDER BY amt DESC`);
      summary = { ...r.rows[0], ...rCase.rows[0], by_reason: byReason.rows };
    } else if (table === 'fc_transfers') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT msku)  skus,
        COUNT(DISTINCT fnsku) fnskus,
        SUM(quantity)         total_units,
        SUM(CASE WHEN quantity>0 THEN quantity ELSE 0 END) total_in,
        SUM(CASE WHEN quantity<0 THEN ABS(quantity) ELSE 0 END) total_out,
        MIN(transfer_date)    first_date,
        MAX(transfer_date)    last_date
        FROM fc_transfers`);
      const byFC = await pool.query(`SELECT fulfillment_center fc, SUM(quantity) qty, COUNT(DISTINCT fnsku) fnskus FROM fc_transfers WHERE fulfillment_center IS NOT NULL AND fulfillment_center <> '' GROUP BY fulfillment_center ORDER BY qty DESC LIMIT 10`);
      summary = { ...r.rows[0], by_fc: byFC.rows };
    } else if (table === 'fba_removals') {
      const r = await pool.query(`SELECT COUNT(DISTINCT msku) skus, COUNT(DISTINCT order_id) orders,
        SUM(quantity) total_units, MIN(request_date) first_date, MAX(request_date) last_date FROM fba_removals`);
      const disp = await pool.query(`SELECT disposition, SUM(quantity) qty FROM fba_removals GROUP BY disposition ORDER BY qty DESC`);
      const st   = await pool.query(`SELECT order_status, COUNT(*) cnt FROM fba_removals GROUP BY order_status ORDER BY cnt DESC`);
      summary = { ...r.rows[0], by_disposition: disp.rows, by_status: st.rows };
    } else if (table === 'shipment_status') {
      const r = await pool.query(`SELECT COUNT(*) shipments, COUNT(CASE WHEN status='Closed' THEN 1 END) closed,
        COUNT(CASE WHEN status='Receiving' THEN 1 END) receiving, COUNT(CASE WHEN status='Working' THEN 1 END) working,
        SUM(units_expected) total_expected, SUM(units_located) total_located FROM shipment_status`);
      const list = await pool.query(`SELECT shipment_id, shipment_name, status, units_expected, units_located, last_updated FROM shipment_status ORDER BY last_updated DESC NULLS LAST`);
      summary = { ...r.rows[0], shipment_list: list.rows };
    } else if (table === 'removal_shipments') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT order_id)      orders,
        COUNT(DISTINCT fnsku)         fnskus,
        COUNT(DISTINCT tracking_number) shipments,
        SUM(shipped_qty)              total_shipped,
        MIN(shipment_date)            first_date,
        MAX(shipment_date)            last_date
        FROM removal_shipments`);
      const carriers = await pool.query(`SELECT carrier, COUNT(*) cnt, SUM(shipped_qty) qty
        FROM removal_shipments WHERE carrier IS NOT NULL GROUP BY carrier ORDER BY cnt DESC`);
      summary = { ...r.rows[0], by_carrier: carriers.rows };
    } else if (table === 'fba_summary') {
      const r = await pool.query(`SELECT COUNT(DISTINCT msku) skus, COUNT(DISTINCT fnsku) fnskus,
        SUM(CASE WHEN disposition='SELLABLE' THEN ending_balance ELSE 0 END) sellable,
        SUM(CASE WHEN disposition='UNSELLABLE' THEN ending_balance ELSE 0 END) unsellable,
        SUM(ending_balance) total_balance, MAX(summary_date) last_date FROM fba_summary`);
      const disp = await pool.query(`SELECT disposition, SUM(ending_balance) qty FROM fba_summary GROUP BY disposition ORDER BY qty DESC`);
      summary = { ...r.rows[0], by_disposition: disp.rows };
    } else if (table === 'removal_shipments') {
      const r = await pool.query(`SELECT
        COUNT(DISTINCT order_id)        orders,
        COUNT(DISTINCT fnsku)           fnskus,
        COUNT(DISTINCT tracking_number) trackings,
        SUM(shipped_qty)                total_shipped,
        MIN(shipment_date)              first_date,
        MAX(shipment_date)              last_date
        FROM removal_shipments`);
      const carriers = await pool.query(`SELECT carrier, COUNT(*) cnt, SUM(shipped_qty) qty
        FROM removal_shipments WHERE carrier IS NOT NULL GROUP BY carrier ORDER BY cnt DESC`);
      summary = { ...r.rows[0], by_carrier: carriers.rows };
    } else if (table === 'removal_receipts') {
      const r = await pool.query(`SELECT
        COUNT(*)                        total,
        SUM(expected_qty)               total_expected,
        SUM(received_qty)               total_received,
        SUM(sellable_qty)               total_sellable,
        SUM(unsellable_qty)             total_unsellable,
        SUM(missing_qty)                total_missing
        FROM removal_receipts`);
      const byStatus = await pool.query(`SELECT status, COUNT(*) cnt FROM removal_receipts GROUP BY status ORDER BY cnt DESC`);
      summary = { ...r.rows[0], by_status: byStatus.rows };
    } else if (table === 'payment_repository') {
      const r = await pool.query(`SELECT
        COUNT(*)                                      rows_n,
        COUNT(DISTINCT settlement_id)                 settlements,
        COUNT(DISTINCT NULLIF(TRIM(sku),''))          skus,
        SUM(COALESCE(total_amount,0))                 total_amount_sum,
        SUM(COALESCE(product_sales,0))                product_sales_sum,
        SUM(COALESCE(selling_fees,0))                 selling_fees_sum,
        SUM(COALESCE(fba_fees,0))                     fba_fees_sum,
        MIN(uploaded_at)                              first_uploaded,
        MAX(uploaded_at)                              last_uploaded
        FROM payment_repository`);
      const byLine = await pool.query(`SELECT COALESCE(NULLIF(TRIM(line_type),''),'(blank)') AS line_type, COUNT(*) cnt,
        SUM(COALESCE(total_amount,0)) amt FROM payment_repository GROUP BY 1 ORDER BY cnt DESC LIMIT 20`);
      const byStatus = await pool.query(`SELECT COALESCE(NULLIF(TRIM(transaction_status),''),'(blank)') AS transaction_status, COUNT(*) cnt
        FROM payment_repository GROUP BY 1 ORDER BY cnt DESC LIMIT 15`);
      summary = { ...r.rows[0], by_line_type: byLine.rows, by_tx_status: byStatus.rows };
    }
    res.json(summary);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Reconciliation - main SQL VIEW se
// Phase 1: Shipped → Receipts → Shortage → Sold, per unique FNSKU
app.get('/api/full-recon', async (req, res) => {
  try {
    const { search } = req.query;
    const { limit, page, offset } = getPagination(req.query);
    const params = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE (sh.msku ILIKE $1 OR sh.fnsku ILIKE $1 OR sh.asin ILIKE $1 OR sh.title ILIKE $1)`;
    }

    const sql = `
      WITH
        shipped_agg AS (
          SELECT
            st.fnsku,
            MAX(st.msku)      AS msku,
            MAX(st.title)     AS title,
            MAX(st.asin)      AS asin,
            SUM(st.quantity)  AS shipped_qty,
            STRING_AGG(DISTINCT COALESCE(ss.status,'Unknown'), ', '
              ORDER BY COALESCE(ss.status,'Unknown')) AS shipment_statuses,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'shipment_id',  st.shipment_id,
                'ship_date',    st.ship_date,
                'qty',          st.quantity,
                'status',       COALESCE(ss.status, 'Unknown'),
                'receipt_date', rc.latest_receipt_date
              )
              ORDER BY st.ship_date DESC NULLS LAST
            ) AS shipment_details
          FROM shipped_to_fba st
          LEFT JOIN shipment_status ss ON TRIM(st.shipment_id) = TRIM(ss.shipment_id)
          LEFT JOIN (
            SELECT shipment_id, MAX(receipt_date) AS latest_receipt_date
            FROM fba_receipts
            WHERE shipment_id IS NOT NULL AND TRIM(shipment_id) != ''
            GROUP BY shipment_id
          ) rc ON TRIM(st.shipment_id) = TRIM(rc.shipment_id)
          WHERE st.fnsku IS NOT NULL AND TRIM(st.fnsku) != ''
          GROUP BY st.fnsku
        ),
        receipts_agg AS (
          SELECT
            fnsku,
            SUM(quantity)      AS receipt_qty,
            MAX(receipt_date)  AS latest_recv_date
          FROM fba_receipts
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
          GROUP BY fnsku
        ),
        sales_agg AS (
          SELECT
            fnsku,
            SUM(quantity)    AS sold_qty,
            MAX(sale_date)   AS latest_sale_date
          FROM sales_data
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
            AND COALESCE(product_amount, 0) != 0
          GROUP BY fnsku
        ),
        returns_agg AS (
          SELECT
            fnsku,
            SUM(grp_qty)  AS return_qty,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'qty',    grp_qty,
                'status', grp_status,
                'disp',   grp_disp,
                'reason', grp_reason,
                'orders', grp_orders
              ) ORDER BY grp_qty DESC
            ) AS return_details
          FROM (
            SELECT
              fnsku,
              SUM(quantity)                                        AS grp_qty,
              COALESCE(status,      '—')                           AS grp_status,
              COALESCE(disposition, '—')                           AS grp_disp,
              COALESCE(reason,      '—')                           AS grp_reason,
              STRING_AGG(DISTINCT COALESCE(order_id,''), ', ')     AS grp_orders
            FROM customer_returns
            WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
            GROUP BY fnsku, status, disposition, reason
          ) grouped
          GROUP BY fnsku
        ),
        reimb_agg AS (
          SELECT
            fnsku,
            SUM(grp_qty)                                              AS reimb_qty,
            SUM(grp_amount)                                           AS reimb_amt,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'qty',      grp_qty,
                'amount',   grp_amount,
                'reason',   grp_reason,
                'order_id', grp_order_id,
                'case_id',  grp_case_id
              ) ORDER BY grp_qty DESC
            )                                                         AS reimb_details
          FROM (
            SELECT
              fnsku,
              SUM(quantity)                        AS grp_qty,
              SUM(COALESCE(amount, 0))             AS grp_amount,
              COALESCE(reason, '—')                AS grp_reason,
              COALESCE(amazon_order_id, '—')       AS grp_order_id,
              COALESCE(case_id, '—')               AS grp_case_id
            FROM reimbursements
            WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
              AND reason ILIKE ANY(ARRAY[
                -- Inbound shortage (must match Shipment Recon riMap: Lost_Inbound only there; include related inbound reasons)
                'Lost_Inbound','Damaged_Inbound','MissingFromInbound',
                'Lost_Warehouse','Damaged_Outbound','Lost_Outbound',
                'Damaged_Warehouse','Reimbursement_Reversal'
              ])
            GROUP BY fnsku, reason, amazon_order_id, case_id
          ) grouped
          GROUP BY fnsku
        ),
        removal_rcpt_agg AS (
          SELECT
            fnsku,
            SUM(grp_qty)  AS removal_rcpt_qty,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'order_id',   order_id,
                'qty',        grp_qty,
                'sellable',   grp_sellable,
                'unsellable', grp_unsellable,
                'condition',  grp_condition,
                'status',     grp_status,
                'date',       grp_date
              ) ORDER BY grp_date DESC NULLS LAST
            ) AS removal_rcpt_details
          FROM (
            SELECT
              fnsku,
              COALESCE(order_id, '—')               AS order_id,
              SUM(COALESCE(received_qty, 0))         AS grp_qty,
              SUM(COALESCE(sellable_qty, 0))         AS grp_sellable,
              SUM(COALESCE(unsellable_qty, 0))       AS grp_unsellable,
              MAX(COALESCE(condition_received, '—')) AS grp_condition,
              MAX(COALESCE(status, '—'))             AS grp_status,
              MAX(received_date)                     AS grp_date
            FROM removal_receipts
            WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
              AND COALESCE(received_qty, 0) > 0
            GROUP BY fnsku, order_id
          ) grp
          GROUP BY fnsku
        ),
        gnr_agg AS (
          SELECT
            fnsku,
            SUM(grp_qty)       AS gnr_qty,
            SUM(grp_succeeded) AS gnr_succeeded,
            SUM(grp_failed)    AS gnr_failed,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'used_msku',   used_msku,
                'used_fnsku',  used_fnsku,
                'condition',   used_condition,
                'qty',         grp_qty,
                'succeeded',   grp_succeeded,
                'failed',      grp_failed
              ) ORDER BY grp_qty DESC
            ) AS gnr_details
          FROM (
            SELECT
              fnsku,
              COALESCE(NULLIF(TRIM(used_msku),   ''), '—') AS used_msku,
              COALESCE(NULLIF(TRIM(used_fnsku),  ''), '—') AS used_fnsku,
              COALESCE(NULLIF(TRIM(used_condition),''), '—') AS used_condition,
              SUM(quantity) AS grp_qty,
              SUM(CASE WHEN LOWER(unit_status)='succeeded' THEN quantity ELSE 0 END) AS grp_succeeded,
              SUM(CASE WHEN LOWER(unit_status)='failed'    THEN quantity ELSE 0 END) AS grp_failed
            FROM gnr_report
            WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
            GROUP BY fnsku, used_msku, used_fnsku, used_condition
            UNION ALL
            SELECT
              fnsku,
              COALESCE(NULLIF(TRIM(used_msku),   ''), '—') AS used_msku,
              COALESCE(NULLIF(TRIM(used_fnsku),  ''), '—') AS used_fnsku,
              COALESCE(NULLIF(TRIM(used_condition),''), '—') AS used_condition,
              SUM(quantity) AS grp_qty,
              SUM(CASE WHEN LOWER(unit_status)='succeeded' THEN quantity ELSE 0 END) AS grp_succeeded,
              SUM(CASE WHEN LOWER(unit_status)='failed'    THEN quantity ELSE 0 END) AS grp_failed
            FROM grade_resell_items
            WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
            GROUP BY fnsku, used_msku, used_fnsku, used_condition
          ) combined
          GROUP BY fnsku
        ),
        cases_agg AS (
          SELECT
            fnsku,
            COUNT(*)                                              AS case_count,
            STRING_AGG(DISTINCT status, ', ' ORDER BY status)    AS case_statuses,
            COALESCE(SUM(units_approved), 0)                     AS case_reimb_qty,
            COALESCE(SUM(amount_approved), 0)                    AS case_reimb_amt
          FROM case_tracker
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
          GROUP BY fnsku
        ),
        adj_agg AS (
          SELECT
            fnsku,
            SUM(qty_adjusted) AS adj_qty,
            COUNT(*)          AS adj_count
          FROM manual_adjustments
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
          GROUP BY fnsku
        ),
        repl_agg AS (
          SELECT
            r.msku,
            (-SUM(r.quantity))::int                                       AS repl_qty,
            COALESCE(SUM(ret.return_qty),    0)::int                     AS repl_return_qty,
            COALESCE(SUM(ri.reimb_qty),      0)::int                     AS repl_reimb_qty,
            COALESCE(SUM(ri.reimb_amount),   0)::numeric                 AS repl_reimb_amt,
            CASE
              WHEN COALESCE(SUM(ri.reimb_qty), 0) + COALESCE(SUM(ret.return_qty), 0)
                     >= SUM(r.quantity)   THEN 'Covered'
              WHEN COALESCE(SUM(ri.reimb_qty), 0) + COALESCE(SUM(ret.return_qty), 0)
                     > 0                 THEN 'Partial'
              ELSE                            'Pending'
            END AS repl_status
          FROM replacements r
          LEFT JOIN LATERAL (
            SELECT SUM(cr.quantity) AS return_qty
            FROM customer_returns cr
            WHERE cr.msku = r.msku
              AND (
                (r.replacement_order_id IS NOT NULL AND cr.order_id = r.replacement_order_id)
                OR
                (r.original_order_id    IS NOT NULL AND cr.order_id = r.original_order_id)
              )
          ) ret ON true
          LEFT JOIN LATERAL (
            SELECT SUM(ri2.quantity) AS reimb_qty, SUM(ri2.amount) AS reimb_amount
            FROM reimbursements ri2
            WHERE ri2.msku = r.msku
              AND (
                (r.replacement_order_id IS NOT NULL AND ri2.amazon_order_id = r.replacement_order_id)
                OR
                (r.original_order_id    IS NOT NULL AND ri2.amazon_order_id = r.original_order_id)
              )
          ) ri ON true
          WHERE r.msku IS NOT NULL AND TRIM(r.msku) != ''
          GROUP BY r.msku
        ),
        fba_end_agg AS (
          -- Latest SELLABLE ending balance per FNSKU
          SELECT DISTINCT ON (fnsku)
            fnsku,
            ending_balance  AS fba_ending_balance,
            summary_date    AS fba_summary_date
          FROM fba_summary
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
            AND LOWER(COALESCE(disposition,'')) = 'sellable'
          ORDER BY fnsku, summary_date DESC NULLS LAST
        ),
        fba_adj_agg AS (
          -- Sum adjustment events across ALL dispositions and ALL dates
          SELECT
            fnsku,
            SUM(COALESCE(vendor_returns, 0))  AS fba_vendor_returns,
            SUM(COALESCE(found,          0))  AS fba_found,
            SUM(COALESCE(lost,           0))  AS fba_lost,
            SUM(COALESCE(damaged,        0))  AS fba_damaged,
            SUM(COALESCE(disposed_qty,   0))  AS fba_disposed,
            SUM(COALESCE(other_events,   0))  AS fba_other,
            SUM(COALESCE(unknown_events, 0))  AS fba_unknown,
            SUM(
              COALESCE(vendor_returns, 0) + COALESCE(found, 0) + COALESCE(lost, 0)
              + COALESCE(damaged, 0) + COALESCE(disposed_qty, 0)
              + COALESCE(other_events, 0) + COALESCE(unknown_events, 0)
            )                                 AS fba_adj_total
          FROM fba_summary
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
          GROUP BY fnsku
        ),
        fc_agg AS (
          SELECT
            fnsku,
            SUM(quantity)::int                                              AS fc_net_qty,
            SUM(CASE WHEN quantity > 0 THEN quantity  ELSE 0 END)::int     AS fc_in_qty,
            SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END)::int AS fc_out_qty,
            COUNT(DISTINCT transfer_date::date)::int                       AS fc_event_days,
            MIN(transfer_date::date)                                       AS fc_earliest_date,
            MAX(transfer_date::date)                                       AS fc_latest_date,
            (CURRENT_DATE - MIN(transfer_date::date))::int                 AS fc_days_pending,
            CASE
              WHEN SUM(quantity) = 0                                          THEN 'Balanced'
              WHEN SUM(quantity) > 0                                          THEN 'Excess'
              WHEN (CURRENT_DATE - MIN(transfer_date::date)) > 60            THEN 'Take Action'
              ELSE                                                                 'Waiting'
            END AS fc_status
          FROM fc_transfers
          WHERE fnsku IS NOT NULL AND TRIM(fnsku) != ''
          GROUP BY fnsku
        )
      SELECT
        sh.fnsku,
        sh.msku,
        sh.title,
        sh.asin,
        sh.shipped_qty::int                                          AS shipped_qty,
        COALESCE(rc.receipt_qty, 0)::int                             AS receipt_qty,
        (sh.shipped_qty - COALESCE(rc.receipt_qty, 0))::int          AS shortage_qty,
        COALESCE(sa.sold_qty, 0)::int                                AS sold_qty,
        rc.latest_recv_date,
        sa.latest_sale_date,
        CASE
          WHEN rc.latest_recv_date IS NOT NULL AND sa.latest_sale_date IS NOT NULL
          THEN (sa.latest_sale_date::date - rc.latest_recv_date::date)
          ELSE NULL
        END                                                           AS days_recv_to_sale,
        sh.shipment_statuses,
        sh.shipment_details,
        COALESCE(rt.return_qty, 0)::int                              AS return_qty,
        rt.return_details,
        COALESCE(rb.reimb_qty, 0)::int                               AS reimb_qty,
        COALESCE(rb.reimb_amt, 0)::numeric                           AS reimb_amt,
        rb.reimb_details,
        COALESCE(rr.removal_rcpt_qty, 0)::int                        AS removal_rcpt_qty,
        rr.removal_rcpt_details,
        COALESCE(gn.gnr_qty, 0)::int                                 AS gnr_qty,
        COALESCE(gn.gnr_succeeded, 0)::int                           AS gnr_succeeded,
        COALESCE(gn.gnr_failed, 0)::int                              AS gnr_failed,
        gn.gnr_details,
        COALESCE(ca.case_count, 0)::int                              AS case_count,
        COALESCE(ca.case_statuses, '')                               AS case_statuses,
        COALESCE(ca.case_reimb_qty, 0)::int                          AS case_reimb_qty,
        COALESCE(ca.case_reimb_amt, 0)::numeric                      AS case_reimb_amt,
        COALESCE(ad.adj_qty, 0)::int                                 AS adj_qty,
        COALESCE(ad.adj_count, 0)::int                               AS adj_count,
        COALESCE(rp.repl_qty, 0)::int                                AS repl_qty,
        COALESCE(rp.repl_return_qty, 0)::int                         AS repl_return_qty,
        COALESCE(rp.repl_reimb_qty, 0)::int                          AS repl_reimb_qty,
        COALESCE(rp.repl_reimb_amt, 0)::numeric                      AS repl_reimb_amt,
        rp.repl_status,
        fc.fc_net_qty,
        fc.fc_in_qty,
        fc.fc_out_qty,
        fc.fc_event_days,
        fc.fc_earliest_date,
        fc.fc_latest_date,
        fc.fc_days_pending,
        fc.fc_status,
        fe.fba_ending_balance,
        fe.fba_summary_date,
        fa.fba_vendor_returns,
        fa.fba_found,
        fa.fba_lost,
        fa.fba_damaged,
        fa.fba_disposed,
        fa.fba_other,
        fa.fba_unknown,
        fa.fba_adj_total,
        fr.remarks AS full_recon_remarks,
        fr.remarks AS remarks
      FROM shipped_agg sh
      LEFT JOIN receipts_agg rc ON sh.fnsku = rc.fnsku
      LEFT JOIN sales_agg    sa ON sh.fnsku = sa.fnsku
      LEFT JOIN returns_agg      rt ON sh.fnsku = rt.fnsku
      LEFT JOIN reimb_agg        rb ON sh.fnsku = rb.fnsku
      LEFT JOIN removal_rcpt_agg rr ON sh.fnsku = rr.fnsku
      LEFT JOIN gnr_agg          gn ON sh.fnsku = gn.fnsku
      LEFT JOIN cases_agg    ca ON sh.fnsku = ca.fnsku
      LEFT JOIN adj_agg      ad ON sh.fnsku = ad.fnsku
      LEFT JOIN repl_agg     rp ON sh.msku  = rp.msku
      LEFT JOIN fc_agg        fc ON sh.fnsku = fc.fnsku
      LEFT JOIN fba_end_agg   fe ON sh.fnsku = fe.fnsku
      LEFT JOIN fba_adj_agg   fa ON sh.fnsku = fa.fnsku
      LEFT JOIN full_recon_remarks fr ON fr.fnsku = sh.fnsku
      ${whereClause}
      ORDER BY sh.msku
    `;

    params.push(limit, offset);
    const limitedSql = sql + ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM shipped_to_fba sh ${whereClause}`, search ? [`%${search}%`] : []),
      pool.query(limitedSql, params),
    ]);
    const total_count = parseInt(countResult.rows[0].count);
    res.json({ rows: dataResult.rows, count: dataResult.rowCount, total_count, page, limit });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function saveFullReconRemarksHandler(req, res) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS full_recon_remarks (
        fnsku VARCHAR(256) NOT NULL PRIMARY KEY,
        remarks TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    const { fnsku, remarks } = req.body || {};
    if (!fnsku || !String(fnsku).trim()) return res.status(400).json({ error: 'fnsku required' });
    await pool.query(
      `INSERT INTO full_recon_remarks (fnsku, remarks, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (fnsku) DO UPDATE SET remarks = EXCLUDED.remarks, updated_at = NOW()`,
      [String(fnsku).trim(), remarks != null ? String(remarks) : null]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('full-recon-remarks error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
app.post('/api/full-recon-remarks', saveFullReconRemarksHandler);
app.put('/api/full-recon-remarks', saveFullReconRemarksHandler);

// Stats for dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const summary = await pool.query(`
      SELECT
        COUNT(*)::int AS total_skus,
        SUM(CASE WHEN status='matched'  THEN 1 ELSE 0 END)::int AS matched,
        SUM(CASE WHEN status='mismatch' THEN 1 ELSE 0 END)::int AS mismatches,
        SUM(CASE WHEN status='pending'  THEN 1 ELSE 0 END)::int AS pending,
        COALESCE(SUM(variance),0)::int AS total_variance
      FROM reconciliation_summary
    `);
    const typeTotals = await pool.query(`
      SELECT 'shipped' as type, COALESCE(SUM(quantity),0)::int as total FROM shipped_to_fba
      UNION ALL SELECT 'sold',          COALESCE(SUM(quantity),0) FROM sales_data
      UNION ALL SELECT 'received',      COALESCE(SUM(quantity),0) FROM fba_receipts
      UNION ALL SELECT 'returns',       COALESCE(SUM(quantity),0) FROM customer_returns
      UNION ALL SELECT 'reimbursements',COALESCE(SUM(quantity),0) FROM reimbursements
      UNION ALL SELECT 'replacements',  COALESCE(SUM(quantity),0) FROM replacements
      UNION ALL SELECT 'fc_transfer',   COALESCE(SUM(quantity),0) FROM fc_transfers
    `);
    const uploadLog = await pool.query(`
      SELECT report_type, filename, row_count, uploaded_at
      FROM uploaded_files ORDER BY uploaded_at DESC LIMIT 20
    `);
    res.json({
      summary: summary.rows[0],
      type_totals: typeTotals.rows,
      upload_log: uploadLog.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Shared WITH … joined_with_profit — used by GET /api/sales-orders and Sales Again Purchase MSKU aggregates. */
function buildSalesOrdersJoinedWithProfitCte() {
  const stTab = settlementTabFilter('orders');
  const stRefTab = settlementTabFilter('refunds');
  const P = settlementAmountPivotExpr();
  const normMsku = (col) =>
    `LOWER(TRIM(BOTH FROM REPLACE(REPLACE(TRIM(COALESCE(${col}, '')), CHR(160), ''), CHR(65279), '')))`;
  const normAsin = (col) =>
    `NULLIF(LOWER(TRIM(BOTH FROM REPLACE(REPLACE(TRIM(COALESCE(${col}::text, '')), CHR(160), ''), CHR(65279), ''))), '')`;
  return `
      WITH sales_agg AS (
        SELECT
          order_id,
          msku AS sku,
          MAX(${normMsku('msku')}) AS sku_norm_key,
          MAX(${normAsin('asin')}) AS sale_asin_norm,
          SUM(quantity)::bigint AS qty,
          MAX(COALESCE(NULLIF(TRIM(currency), ''), 'USD')) AS currency,
          SUM(COALESCE(product_amount,0) + COALESCE(shipping_amount,0) + COALESCE(gift_amount,0))::numeric(14,4) AS sales_rpt_gross,
          MIN(sale_date) AS sale_first,
          MAX(sale_date) AS sale_last,
          (MAX(sale_date::date) - MIN(sale_date::date))::int AS sale_span_days
        FROM sales_data
        WHERE TRIM(COALESCE(order_id, '')) <> '' AND TRIM(COALESCE(msku, '')) <> ''
        GROUP BY order_id, msku
      ),
      sr_order_line AS (
        SELECT
          settlement_id,
          order_id,
          LOWER(TRIM(COALESCE(sku, ''))) AS sku_norm,
          order_item_code,
          ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS line_posted_date,
          MAX(COALESCE(quantity_purchased, 0))::bigint AS line_qty,
          ${P.sales}       AS line_sales,
          ${P.fbaFees}     AS line_fba,
          ${P.commission}  AS line_commission,
          ${P.variableFee} AS line_var,
          ${P.other}       AS line_other,
          ${P.total}       AS line_total,
          MAX(NULLIF(TRIM(COALESCE(currency::text, '')), '')) AS line_currency
        FROM settlement_report
        WHERE (${stTab})
          AND TRIM(COALESCE(order_id, '')) <> ''
          AND TRIM(COALESCE(sku, '')) <> ''
        GROUP BY settlement_id, order_id, LOWER(TRIM(COALESCE(sku, ''))), order_item_code
      ),
      sr_order_sku_agg AS (
        SELECT
          order_id,
          sku_norm,
          SUM(line_qty) AS st_qty,
          SUM(line_sales) AS st_sales,
          SUM(line_fba) AS st_fba_fees,
          SUM(line_commission) AS st_fba_commission,
          SUM(line_var) AS st_variable_fee,
          SUM(line_other) AS st_other_charges,
          SUM(line_total) AS st_total,
          MAX(NULLIF(TRIM(line_currency::text), '')) AS st_currency,
          MIN(line_posted_date) AS settlement_posted_min,
          MAX(line_posted_date) AS settlement_posted_max
        FROM sr_order_line
        GROUP BY order_id, sku_norm
      ),
      settlement_report_qty_agg AS (
        SELECT
          order_id,
          sku_norm,
          jsonb_agg(
            jsonb_build_object(
              'settlement_id', NULLIF(TRIM(sid::text), ''),
              'qty', settle_qty,
              'posted_date', NULLIF(TRIM(posted_date::text), '')
            ) ORDER BY posted_date DESC NULLS LAST, sid::text NULLS LAST
          ) AS settlements
        FROM (
          SELECT
            order_id,
            sku_norm,
            settlement_id AS sid,
            SUM(line_qty)::bigint AS settle_qty,
            MAX(line_posted_date) AS posted_date
          FROM sr_order_line
          GROUP BY order_id, sku_norm, settlement_id
        ) u
        GROUP BY order_id, sku_norm
      ),
      refund_sr_line AS (
        SELECT
          settlement_id,
          order_id,
          LOWER(TRIM(COALESCE(sku, ''))) AS sku_norm,
          order_item_code,
          ${SETTLEMENT_EFFECTIVE_POSTED_MAX} AS line_posted_date,
          ${P.sales}       AS line_sales,
          ${P.fbaFees}     AS line_fba,
          ${P.commission}  AS line_commission,
          ${P.variableFee} AS line_var,
          ${P.other}       AS line_other,
          ${P.total}       AS line_total
        FROM settlement_report
        WHERE (${stRefTab})
          AND TRIM(COALESCE(order_id, '')) <> ''
          AND TRIM(COALESCE(sku, '')) <> ''
        GROUP BY settlement_id, order_id, LOWER(TRIM(COALESCE(sku, ''))), order_item_code
      ),
      refund_order_sku_agg AS (
        SELECT
          order_id,
          sku_norm,
          SUM(COALESCE(ROUND(ABS(line_var::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::bigint) AS refund_qty,
          SUM(line_total) AS refund_total,
          SUM(line_sales) AS refund_sales,
          SUM(line_fba) AS refund_fba_fees,
          SUM(line_commission) AS refund_fba_commission,
          SUM(line_var) AS refund_variable_fee,
          SUM(line_other) AS refund_other_charges,
          jsonb_agg(
            jsonb_build_object(
              'settlement_id', NULLIF(TRIM(settlement_id::text), ''),
              'posted_date', NULLIF(TRIM(line_posted_date::text), ''),
              'qty', COALESCE(ROUND(ABS(line_var::numeric) / ${SETTLEMENT_VARIABLE_FEE_PER_UNIT}::numeric, 0), 0)::int
            ) ORDER BY line_posted_date DESC NULLS LAST, settlement_id::text DESC NULLS LAST
          ) AS refund_qty_breakdown
        FROM refund_sr_line
        GROUP BY order_id, sku_norm
      ),
      order_settlement_ids AS (
        SELECT
          norm_oid,
          jsonb_agg(sid ORDER BY sid::text NULLS LAST) AS settlement_ids_for_order
        FROM (
          SELECT DISTINCT
            TRIM(REPLACE(REPLACE(COALESCE(order_id::text, ''), CHR(160), ''), CHR(65279), '')) AS norm_oid,
            NULLIF(TRIM(settlement_id::text), '') AS sid
          FROM settlement_report
          WHERE ((${stTab}) OR (${stRefTab}))
            AND TRIM(COALESCE(order_id, '')) <> ''
            AND NULLIF(TRIM(settlement_id::text), '') IS NOT NULL
        ) u
        WHERE norm_oid <> ''
        GROUP BY norm_oid
      ),
      shipped_sku_lookup AS (
        SELECT DISTINCT ON (${normMsku('msku')})
          ${normMsku('msku')} AS msku_norm,
          NULLIF(TRIM(purchase_id::text), '') AS purchase_id,
          NULLIF(TRIM(COALESCE(title, '')), '') AS listing_title,
          NULLIF(TRIM(COALESCE(asin, '')), '') AS asin,
          NULLIF(TRIM(COALESCE(publisher_name, '')), '') AS publisher,
          NULLIF(TRIM(COALESCE(delivery_location, '')), '') AS delivery_location,
          per_book_cost_usd,
          final_net_price_usd, commission_usd, supplier_shipping_usd, warehouse_prep_usd,
          inventory_place_inbound_usd, expert_charges_usd, other_charges_usd
        FROM shipped_to_fba
        WHERE TRIM(COALESCE(msku, '')) <> ''
        ORDER BY ${normMsku('msku')}, ship_date DESC NULLS LAST, id DESC
      ),
      shipped_asin_lookup AS (
        SELECT DISTINCT ON (${normAsin('asin')})
          ${normAsin('asin')} AS asin_norm,
          NULLIF(TRIM(purchase_id::text), '') AS purchase_id,
          NULLIF(TRIM(COALESCE(title, '')), '') AS listing_title,
          NULLIF(TRIM(COALESCE(asin, '')), '') AS asin,
          NULLIF(TRIM(COALESCE(publisher_name, '')), '') AS publisher,
          NULLIF(TRIM(COALESCE(delivery_location, '')), '') AS delivery_location,
          per_book_cost_usd,
          final_net_price_usd, commission_usd, supplier_shipping_usd, warehouse_prep_usd,
          inventory_place_inbound_usd, expert_charges_usd, other_charges_usd
        FROM shipped_to_fba
        WHERE ${normAsin('asin')} IS NOT NULL
        ORDER BY ${normAsin('asin')}, ship_date DESC NULLS LAST, id DESC
      ),
      joined AS (
        SELECT
          sa.order_id,
          sa.sku,
          sa.qty,
          COALESCE(
            NULLIF(TRIM(sr.st_currency::text), ''),
            NULLIF(TRIM(sa.currency::text), ''),
            'USD'
          ) AS currency,
          sa.sales_rpt_gross,
          sa.sale_first,
          sa.sale_last,
          sa.sale_span_days,
          sr.st_qty,
          sr.st_sales,
          sr.st_fba_fees,
          sr.st_fba_commission,
          sr.st_variable_fee,
          sr.st_other_charges,
          sr.st_total,
          sr.settlement_posted_min,
          sr.settlement_posted_max,
          ps.settlements AS settlement_qty_breakdown,
          (sr.order_id IS NOT NULL) AS has_settlement_breakdown,
          CASE WHEN sr.order_id IS NOT NULL THEN sr.st_total ELSE sa.sales_rpt_gross END AS amount,
          COALESCE(shf.purchase_id, sha.purchase_id) AS purchase_id,
          COALESCE(shf.listing_title, sha.listing_title) AS listing_title,
          COALESCE(shf.asin, sha.asin) AS asin,
          COALESCE(shf.publisher, sha.publisher) AS publisher,
          COALESCE(shf.delivery_location, sha.delivery_location) AS delivery_location,
          COALESCE(shf.per_book_cost_usd, sha.per_book_cost_usd) AS sh_stored_per_book_usd,
          COALESCE(shf.final_net_price_usd, sha.final_net_price_usd) AS sh_final_net_price_usd,
          COALESCE(shf.commission_usd, sha.commission_usd) AS sh_commission_usd,
          COALESCE(shf.supplier_shipping_usd, sha.supplier_shipping_usd) AS sh_supplier_shipping_usd,
          COALESCE(shf.warehouse_prep_usd, sha.warehouse_prep_usd) AS sh_warehouse_prep_usd,
          COALESCE(shf.inventory_place_inbound_usd, sha.inventory_place_inbound_usd) AS sh_inventory_place_inbound_usd,
          COALESCE(shf.expert_charges_usd, sha.expert_charges_usd) AS sh_expert_charges_usd,
          COALESCE(shf.other_charges_usd, sha.other_charges_usd) AS sh_other_charges_usd,
          CASE
            WHEN shf.msku_norm IS NULL AND sha.asin_norm IS NULL THEN NULL
            ELSE COALESCE(
              COALESCE(shf.per_book_cost_usd, sha.per_book_cost_usd),
              COALESCE(COALESCE(shf.final_net_price_usd, sha.final_net_price_usd), 0)::numeric
                + COALESCE(COALESCE(shf.commission_usd, sha.commission_usd), 0)::numeric
                + COALESCE(COALESCE(shf.supplier_shipping_usd, sha.supplier_shipping_usd), 0)::numeric
                + COALESCE(COALESCE(shf.warehouse_prep_usd, sha.warehouse_prep_usd), 0)::numeric
                + COALESCE(COALESCE(shf.inventory_place_inbound_usd, sha.inventory_place_inbound_usd), 0)::numeric
                + COALESCE(COALESCE(shf.expert_charges_usd, sha.expert_charges_usd), 0)::numeric
                + COALESCE(COALESCE(shf.other_charges_usd, sha.other_charges_usd), 0)::numeric
            )
          END AS shipped_per_book_usd,
          rf.refund_qty,
          rf.refund_total,
          rf.refund_sales,
          rf.refund_fba_fees,
          rf.refund_fba_commission,
          rf.refund_variable_fee,
          rf.refund_other_charges,
          rf.refund_qty_breakdown,
          (COALESCE(rf.refund_qty, 0) > 0 OR COALESCE(rf.refund_total, 0) <> 0) AS has_refund_breakdown,
          osi.settlement_ids_for_order AS order_settlement_ids
        FROM sales_agg sa
        LEFT JOIN sr_order_sku_agg sr
          ON sr.order_id = sa.order_id
         AND sr.sku_norm = LOWER(TRIM(COALESCE(sa.sku,'')))
        LEFT JOIN settlement_report_qty_agg ps
          ON ps.order_id = sa.order_id
         AND ps.sku_norm = LOWER(TRIM(COALESCE(sa.sku,'')))
        LEFT JOIN shipped_sku_lookup shf
          ON shf.msku_norm = sa.sku_norm_key
        LEFT JOIN shipped_asin_lookup sha
          ON sa.sale_asin_norm IS NOT NULL
         AND sha.asin_norm = sa.sale_asin_norm
         AND shf.msku_norm IS NULL
        LEFT JOIN refund_order_sku_agg rf
          ON rf.order_id = sa.order_id
         AND rf.sku_norm = LOWER(TRIM(COALESCE(sa.sku,'')))
        LEFT JOIN order_settlement_ids osi
          ON osi.norm_oid = TRIM(REPLACE(REPLACE(COALESCE(sa.order_id::text, ''), CHR(160), ''), CHR(65279), ''))
      ),
      joined_with_profit AS (
        SELECT j.*,
          CASE
            WHEN (COALESCE(j.qty, 0)::bigint - COALESCE(j.refund_qty, 0)::bigint) = 0
            THEN (j.amount::numeric + COALESCE(j.refund_total, 0)::numeric)
            WHEN COALESCE(j.qty, 0)::numeric <> 0 AND j.shipped_per_book_usd IS NOT NULL
            THEN (j.amount::numeric / NULLIF(j.qty::numeric, 0)) - j.shipped_per_book_usd::numeric
            ELSE NULL
          END AS per_book_profit_usd
        FROM joined j
      )`;
}

/** MSKU-level rollups from joined_with_profit (same grain as Sales Orders) for Sales Again Purchase. */
function buildSapSalesByMskuSql() {
  return `${buildSalesOrdersJoinedWithProfitCte()},
      merged_set_qty AS (
        SELECT
          LOWER(TRIM(COALESCE(j.sku,''))) AS sku_norm,
          NULLIF(TRIM(elem->>'settlement_id'),'') AS settlement_id,
          SUM((elem->>'qty')::bigint) AS qty,
          MAX(elem->>'posted_date') AS posted_date
        FROM joined_with_profit j,
        LATERAL jsonb_array_elements(COALESCE(j.settlement_qty_breakdown, '[]'::jsonb)) AS elem
        WHERE elem->>'settlement_id' IS NOT NULL AND TRIM(elem->>'settlement_id') <> ''
        GROUP BY 1, 2
      ),
      merged_set_qty_json AS (
        SELECT sku_norm,
          jsonb_agg(
            jsonb_build_object(
              'settlement_id', settlement_id,
              'qty', qty,
              'posted_date', NULLIF(TRIM(posted_date::text), '')
            ) ORDER BY posted_date DESC NULLS LAST, settlement_id::text NULLS LAST
          ) AS settlement_qty_breakdown
        FROM merged_set_qty
        GROUP BY sku_norm
      ),
      merged_ref_qty AS (
        SELECT
          LOWER(TRIM(COALESCE(j.sku,''))) AS sku_norm,
          NULLIF(TRIM(elem->>'settlement_id'),'') AS settlement_id,
          SUM((elem->>'qty')::bigint) AS qty,
          MAX(elem->>'posted_date') AS posted_date
        FROM joined_with_profit j,
        LATERAL jsonb_array_elements(COALESCE(j.refund_qty_breakdown, '[]'::jsonb)) AS elem
        WHERE elem->>'settlement_id' IS NOT NULL AND TRIM(elem->>'settlement_id') <> ''
        GROUP BY 1, 2
      ),
      merged_ref_qty_json AS (
        SELECT sku_norm,
          jsonb_agg(
            jsonb_build_object(
              'settlement_id', settlement_id,
              'qty', qty,
              'posted_date', NULLIF(TRIM(posted_date::text), '')
            ) ORDER BY posted_date DESC NULLS LAST, settlement_id::text NULLS LAST
          ) AS refund_qty_breakdown
        FROM merged_ref_qty
        GROUP BY sku_norm
      ),
      sap_agg AS (
        SELECT
          LOWER(TRIM(COALESCE(j.sku,''))) AS sku_norm,
          SUM(j.qty)::bigint AS so_qty,
          SUM(COALESCE(j.refund_qty,0))::bigint AS so_refund_qty,
          SUM(j.qty - COALESCE(j.refund_qty,0))::bigint AS so_final_qty,
          SUM(j.amount)::numeric(14,4) AS so_amount,
          SUM(COALESCE(j.refund_total,0))::numeric(14,4) AS so_refund_total,
          SUM(j.amount + COALESCE(j.refund_total,0))::numeric(14,4) AS so_final_amount,
          MAX(j.sale_last) AS so_sale_last,
          MAX(COALESCE(NULLIF(TRIM(j.currency::text),''), 'USD')) AS so_currency,
          BOOL_OR(j.has_settlement_breakdown) AS any_settlement,
          BOOL_OR(j.has_refund_breakdown) AS any_refund_breakdown,
          SUM(COALESCE(j.st_sales,0))::numeric(14,4) AS sum_st_sales,
          SUM(COALESCE(j.st_fba_fees,0))::numeric(14,4) AS sum_st_fba_fees,
          SUM(COALESCE(j.st_fba_commission,0))::numeric(14,4) AS sum_st_fba_commission,
          SUM(COALESCE(j.st_variable_fee,0))::numeric(14,4) AS sum_st_variable_fee,
          SUM(COALESCE(j.st_other_charges,0))::numeric(14,4) AS sum_st_other_charges,
          SUM(COALESCE(j.st_total,0))::numeric(14,4) AS sum_st_total,
          SUM(CASE WHEN NOT j.has_settlement_breakdown THEN COALESCE(j.sales_rpt_gross,0) ELSE 0 END)::numeric(14,4) AS sum_sales_rpt_gross_non_settlement,
          SUM(COALESCE(j.refund_sales,0))::numeric(14,4) AS sum_refund_sales,
          SUM(COALESCE(j.refund_fba_fees,0))::numeric(14,4) AS sum_refund_fba_fees,
          SUM(COALESCE(j.refund_fba_commission,0))::numeric(14,4) AS sum_refund_fba_commission,
          SUM(COALESCE(j.refund_variable_fee,0))::numeric(14,4) AS sum_refund_variable_fee,
          SUM(COALESCE(j.refund_other_charges,0))::numeric(14,4) AS sum_refund_other_charges
        FROM joined_with_profit j
        GROUP BY LOWER(TRIM(COALESCE(j.sku,'')))
      )
      SELECT
        sap_agg.*,
        msq.settlement_qty_breakdown,
        mrq.refund_qty_breakdown
      FROM sap_agg
      LEFT JOIN merged_set_qty_json msq ON msq.sku_norm = sap_agg.sku_norm
      LEFT JOIN merged_ref_qty_json mrq ON mrq.sku_norm = sap_agg.sku_norm
      WHERE sap_agg.sku_norm = ANY($1::text[])`;
}

// Sales Orders — sales_data grain; settlement_report (orders tab pivot) for amount, breakdown, and qty-by-settlement
app.get('/api/sales-orders', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    const q = String(req.query.q || '').trim();
    const sort = String(req.query.sort || 'sale_last').toLowerCase();
    const dirRaw = String(req.query.dir || 'desc').toLowerCase();
    const dir = dirRaw === 'asc' ? 'ASC' : 'DESC';
    const sortMap = {
      order_id: 'sa.order_id',
      sku: 'sa.sku',
      qty: 'sa.qty',
      amount: 'sa.amount',
      sale_last: 'sa.sale_last',
      refund_qty: 'sa.refund_qty',
      refund_total: 'sa.refund_total',
      delivery_location: 'sa.delivery_location',
      final_qty: '(sa.qty - COALESCE(sa.refund_qty, 0))',
      final_amount: '(sa.amount + COALESCE(sa.refund_total, 0))',
      per_book_shipped: 'sa.shipped_per_book_usd',
      per_book_profit: 'sa.per_book_profit_usd',
      settlement_posted: 'sa.settlement_posted_max',
    };
    const orderExpr = sortMap[sort] || sortMap.sale_last;

    const searchClause = q
      ? ` WHERE sa.order_id ILIKE $1 OR sa.sku ILIKE $1
          OR COALESCE(sa.listing_title, '') ILIKE $1
          OR COALESCE(sa.publisher, '') ILIKE $1
          OR COALESCE(sa.delivery_location, '') ILIKE $1
          OR COALESCE(sa.asin, '') ILIKE $1
          OR COALESCE(sa.purchase_id::text, '') ILIKE $1`
      : '';

    const salesOrdersBaseCte = buildSalesOrdersJoinedWithProfitCte();

    const wrappedCountSql = `${salesOrdersBaseCte}
      SELECT COUNT(*)::int AS n FROM joined_with_profit sa
      ${searchClause}`;

    const totalsSql = `${salesOrdersBaseCte}
      SELECT
        COALESCE(SUM(sa.qty), 0)::bigint AS sum_qty,
        COALESCE(SUM(COALESCE(sa.refund_qty, 0)), 0)::bigint AS sum_refund_qty,
        COALESCE(SUM(sa.amount), 0)::numeric(14,4) AS sum_amount,
        COALESCE(SUM(COALESCE(sa.refund_total, 0)), 0)::numeric(14,4) AS sum_refund_total,
        COALESCE(SUM(sa.qty - COALESCE(sa.refund_qty, 0)), 0)::bigint AS sum_final_qty,
        COALESCE(SUM(sa.amount + COALESCE(sa.refund_total, 0)), 0)::numeric(14,4) AS sum_final_amount,
        COALESCE(SUM(
          CASE
            WHEN (sa.qty::bigint - COALESCE(sa.refund_qty, 0)::bigint) = 0
            THEN (sa.amount + COALESCE(sa.refund_total, 0))::numeric
            WHEN sa.shipped_per_book_usd IS NOT NULL AND COALESCE(sa.qty, 0)::numeric <> 0
            THEN (
              (sa.amount::numeric / NULLIF(sa.qty::numeric, 0)) - sa.shipped_per_book_usd::numeric
            ) * (sa.qty::numeric - COALESCE(sa.refund_qty, 0)::numeric)
            ELSE 0::numeric
          END
        ), 0)::numeric(14,4) AS sum_book_profit_total,
        COALESCE(MAX(NULLIF(TRIM(sa.currency::text), '')), 'USD') AS sum_amount_currency
      FROM joined_with_profit sa
      ${searchClause}`;

    const dataSql = `${salesOrdersBaseCte}
      SELECT
        order_id,
        sku,
        qty,
        currency,
        sales_rpt_gross,
        sale_first,
        sale_last,
        sale_span_days,
        settlement_qty_breakdown,
        st_qty,
        st_sales,
        st_fba_fees,
        st_fba_commission,
        st_variable_fee,
        st_other_charges,
        st_total,
        has_settlement_breakdown,
        amount,
        purchase_id,
        listing_title,
        asin,
        publisher,
        delivery_location,
        sh_stored_per_book_usd,
        sh_final_net_price_usd,
        sh_commission_usd,
        sh_supplier_shipping_usd,
        sh_warehouse_prep_usd,
        sh_inventory_place_inbound_usd,
        sh_expert_charges_usd,
        sh_other_charges_usd,
        shipped_per_book_usd,
        per_book_profit_usd,
        refund_qty,
        refund_total,
        refund_sales,
        refund_fba_fees,
        refund_fba_commission,
        refund_variable_fee,
        refund_other_charges,
        refund_qty_breakdown,
        has_refund_breakdown,
        order_settlement_ids,
        settlement_posted_min,
        settlement_posted_max
      FROM joined_with_profit sa
      ${searchClause}
      ORDER BY ${orderExpr} ${dir} NULLS LAST, sa.order_id ASC, sa.sku ASC
      LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}`;

    const countParams = q ? [`%${q}%`] : [];
    const dataParams = q ? [`%${q}%`, limit, offset] : [limit, offset];

    const [cnt, data, sums] = await Promise.all([
      pool.query(wrappedCountSql, countParams),
      pool.query(dataSql, dataParams),
      pool.query(totalsSql, countParams),
    ]);

    const total = cnt.rows[0]?.n ?? 0;
    const sumQty = sums.rows[0] != null ? Number(sums.rows[0].sum_qty) || 0 : 0;
    const sumRefundQty = sums.rows[0] != null ? Number(sums.rows[0].sum_refund_qty) || 0 : 0;
    const parsePgNumeric = (v) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'bigint') {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    /** Match sales qty / refund qty columns (may be bigint string, include thousands separators). */
    const parseSalesOrderQty = (v) => {
      if (v === null || v === undefined) return 0;
      if (typeof v === 'bigint') {
        const n = Number(v);
        return Number.isFinite(n) ? Math.trunc(n) : 0;
      }
      const s = String(v).replace(/,/g, '').trim();
      if (s === '') return 0;
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 0;
    };
    const sumAmount = sums.rows[0] != null ? parsePgNumeric(sums.rows[0].sum_amount) : 0;
    const sumRefundTotal = sums.rows[0] != null ? parsePgNumeric(sums.rows[0].sum_refund_total) : 0;
    const sumFinalQty = sums.rows[0] != null ? Number(sums.rows[0].sum_final_qty) || 0 : 0;
    const sumFinalAmount = sums.rows[0] != null ? parsePgNumeric(sums.rows[0].sum_final_amount) : 0;
    const sumBookProfitTotal =
      sums.rows[0] != null ? parsePgNumeric(sums.rows[0].sum_book_profit_total) : 0;
    const sumAmountCurrency = sums.rows[0]?.sum_amount_currency
      ? String(sums.rows[0].sum_amount_currency).trim() || 'USD'
      : 'USD';
    const mapSalesOrderRow = (r) => {
      const qtyN = parseSalesOrderQty(r.qty);
      const rqN = parseSalesOrderQty(r.refund_qty);
      const final_qty = qtyN - rqN;
      const amtN = parsePgNumeric(r.amount);
      const rfN = r.refund_total != null && r.refund_total !== '' ? parsePgNumeric(r.refund_total) : 0;
      const final_amount = amtN + rfN;
      return {
      order_id: r.order_id,
      sku: r.sku,
      qty: r.qty,
      currency: r.currency,
      sales_rpt_gross: r.sales_rpt_gross,
      sale_first: r.sale_first,
      sale_last: r.sale_last,
      sale_span_days: r.sale_span_days,
      settlement_qty_breakdown: r.settlement_qty_breakdown,
      st_qty: r.st_qty,
      st_sales: r.st_sales,
      st_fba_fees: r.st_fba_fees,
      st_fba_commission: r.st_fba_commission,
      st_variable_fee: r.st_variable_fee,
      st_other_charges: r.st_other_charges,
      st_total: r.st_total,
      has_settlement_breakdown: r.has_settlement_breakdown,
      amount: r.amount,
      purchase_id: r.purchase_id ?? null,
      listing_title: r.listing_title ?? null,
      asin: r.asin ?? null,
      publisher: r.publisher ?? null,
      delivery_location: r.delivery_location ?? null,
      refund_qty: r.refund_qty ?? null,
      refund_total: r.refund_total ?? null,
      refund_sales: r.refund_sales ?? null,
      refund_fba_fees: r.refund_fba_fees ?? null,
      refund_fba_commission: r.refund_fba_commission ?? null,
      refund_variable_fee: r.refund_variable_fee ?? null,
      refund_other_charges: r.refund_other_charges ?? null,
      refund_qty_breakdown: r.refund_qty_breakdown ?? null,
      has_refund_breakdown: r.has_refund_breakdown === true,
      order_settlement_ids: r.order_settlement_ids,
      settlement_posted_min: r.settlement_posted_min ?? null,
      settlement_posted_max: r.settlement_posted_max ?? null,
      final_qty,
      final_amount,
    };
    };
    const mapSalesOrderRowWithShipped = (r) => {
      const base = mapSalesOrderRow(r);
      const shippedCostRow = {
        per_book_cost_usd: r.sh_stored_per_book_usd,
        final_net_price_usd: r.sh_final_net_price_usd,
        commission_usd: r.sh_commission_usd,
        supplier_shipping_usd: r.sh_supplier_shipping_usd,
        warehouse_prep_usd: r.sh_warehouse_prep_usd,
        inventory_place_inbound_usd: r.sh_inventory_place_inbound_usd,
        expert_charges_usd: r.sh_expert_charges_usd,
        other_charges_usd: r.sh_other_charges_usd,
      };
      const hasShippedJoin = r.shipped_per_book_usd != null;
      const pbNum = hasShippedJoin ? shippedPerBookFromRow(shippedCostRow) : null;
      return {
        ...base,
        shipped_per_book_usd: hasShippedJoin && pbNum != null && Number.isFinite(pbNum) ? pbNum : null,
        shipped_cost_breakdown: hasShippedJoin
          ? {
              final_net_price_usd: r.sh_final_net_price_usd != null ? Number(r.sh_final_net_price_usd) : null,
              commission_usd: r.sh_commission_usd != null ? Number(r.sh_commission_usd) : null,
              supplier_shipping_usd: r.sh_supplier_shipping_usd != null ? Number(r.sh_supplier_shipping_usd) : null,
              warehouse_prep_usd: r.sh_warehouse_prep_usd != null ? Number(r.sh_warehouse_prep_usd) : null,
              inventory_place_inbound_usd: r.sh_inventory_place_inbound_usd != null ? Number(r.sh_inventory_place_inbound_usd) : null,
              expert_charges_usd: r.sh_expert_charges_usd != null ? Number(r.sh_expert_charges_usd) : null,
              other_charges_usd: r.sh_other_charges_usd != null ? Number(r.sh_other_charges_usd) : null,
            }
          : null,
        has_shipped_cost_tooltip: hasShippedJoin,
        per_book_profit_usd:
          r.per_book_profit_usd == null || r.per_book_profit_usd === ''
            ? null
            : (() => {
                const n = typeof r.per_book_profit_usd === 'number'
                  ? r.per_book_profit_usd
                  : parseFloat(String(r.per_book_profit_usd).replace(/,/g, ''));
                return Number.isFinite(n) ? n : null;
              })(),
      };
    };
    res.json({
      rows: data.rows.map(mapSalesOrderRowWithShipped),
      total,
      limit,
      offset,
      sum_qty: sumQty,
      sum_refund_qty: sumRefundQty,
      sum_amount: sumAmount,
      sum_refund_total: sumRefundTotal,
      sum_final_qty: sumFinalQty,
      sum_final_amount: sumFinalAmount,
      sum_book_profit_total: sumBookProfitTotal,
      sum_amount_currency: sumAmountCurrency,
    });
  } catch (e) {
    console.error('  ❌ sales-orders:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sales Again Purchase — unique MSKU from shipped_to_fba; qty = sum shipped; per-book = qty-weighted average; metadata from latest ship row
app.get('/api/sales-again-purchase', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    const q = String(req.query.q || '').trim();
    const sort = String(req.query.sort || 'msku').toLowerCase();
    const dirRaw = String(req.query.dir || 'asc').toLowerCase();
    const dir = dirRaw === 'desc' ? 'DESC' : 'ASC';
    const sortMap = {
      msku: 'msku',
      title: 'title',
      qty: 'qty_total',
      per_book: 'per_book_weighted',
      total_cost: 'total_cost_usd',
      asin: 'asin',
      fnsku: 'fnsku',
      purchase_id: 'purchase_id',
      delivery_location: 'delivery_location',
    };
    const orderCol = sortMap[sort] || sortMap.msku;
    const sapSum =
      '(COALESCE(s.final_net_price_usd,0)+COALESCE(s.commission_usd,0)+COALESCE(s.supplier_shipping_usd,0)+COALESCE(s.warehouse_prep_usd,0)+COALESCE(s.inventory_place_inbound_usd,0)+COALESCE(s.expert_charges_usd,0)+COALESCE(s.other_charges_usd,0))';
    const baseCte = `
      WITH s AS (
        SELECT *, LOWER(TRIM(COALESCE(msku, ''))) AS nk
        FROM shipped_to_fba
        WHERE TRIM(COALESCE(msku, '')) <> ''
      ),
      by_msku AS (
        SELECT
          nk,
          SUM(GREATEST(COALESCE(s.quantity,0),0))::bigint AS qty_total,
          SUM( ${sapSum} * GREATEST(COALESCE(s.quantity,0),0) ) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS per_book_weighted,
          SUM(COALESCE(s.final_net_price_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_final_net_price_usd,
          SUM(COALESCE(s.commission_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_commission_usd,
          SUM(COALESCE(s.supplier_shipping_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_supplier_shipping_usd,
          SUM(COALESCE(s.warehouse_prep_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_warehouse_prep_usd,
          SUM(COALESCE(s.inventory_place_inbound_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_inventory_place_inbound_usd,
          SUM(COALESCE(s.expert_charges_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_expert_charges_usd,
          SUM(COALESCE(s.other_charges_usd,0) * GREATEST(COALESCE(s.quantity,0),0)) / NULLIF(SUM(GREATEST(COALESCE(s.quantity,0),0)),0) AS w_other_charges_usd,
          BOOL_OR(
            s.final_net_price_usd IS NOT NULL
            OR s.commission_usd IS NOT NULL
            OR s.supplier_shipping_usd IS NOT NULL
            OR s.warehouse_prep_usd IS NOT NULL
            OR s.inventory_place_inbound_usd IS NOT NULL
            OR s.expert_charges_usd IS NOT NULL
            OR s.other_charges_usd IS NOT NULL
            OR s.per_book_cost_usd IS NOT NULL
            OR s.final_total_purchase_cost_usd IS NOT NULL
            OR s.cost_updated_at IS NOT NULL
          ) AS has_cost_components,
          SUM((${sapSum}) * GREATEST(COALESCE(s.quantity, 0), 0))::numeric(16, 4) AS total_cost_usd
        FROM s
        GROUP BY nk
      ),
      latest AS (
        SELECT DISTINCT ON (nk)
          nk,
          msku,
          title,
          asin,
          fnsku,
          shipment_id,
          ship_date,
          publisher_name,
          supplier_name,
          delivery_location,
          purchase_id
        FROM s
        ORDER BY nk, ship_date DESC NULLS LAST, id DESC
      ),
      joined AS (
        SELECT
          latest.msku,
          latest.title,
          latest.asin,
          latest.fnsku,
          latest.ship_date,
          COALESCE(
            NULLIF(TRIM(COALESCE(latest.publisher_name, '')), ''),
            (SELECT p.publisher_name FROM shipped_to_fba p
             WHERE LOWER(TRIM(COALESCE(p.msku, ''))) = latest.nk
               AND TRIM(COALESCE(p.publisher_name, '')) <> ''
             ORDER BY p.ship_date DESC NULLS LAST, p.id DESC
             LIMIT 1)
          ) AS publisher_name,
          COALESCE(
            NULLIF(TRIM(COALESCE(latest.supplier_name, '')), ''),
            (SELECT p.supplier_name FROM shipped_to_fba p
             WHERE LOWER(TRIM(COALESCE(p.msku, ''))) = latest.nk
               AND TRIM(COALESCE(p.supplier_name, '')) <> ''
             ORDER BY p.ship_date DESC NULLS LAST, p.id DESC
             LIMIT 1)
          ) AS supplier_name,
          COALESCE(
            NULLIF(TRIM(COALESCE(latest.delivery_location, '')), ''),
            (SELECT p.delivery_location FROM shipped_to_fba p
             WHERE LOWER(TRIM(COALESCE(p.msku, ''))) = latest.nk
               AND TRIM(COALESCE(p.delivery_location, '')) <> ''
             ORDER BY p.ship_date DESC NULLS LAST, p.id DESC
             LIMIT 1)
          ) AS delivery_location,
          COALESCE(
            NULLIF(TRIM(COALESCE(latest.purchase_id::text, '')), ''),
            (SELECT p.purchase_id::text FROM shipped_to_fba p
             WHERE LOWER(TRIM(COALESCE(p.msku, ''))) = latest.nk
               AND TRIM(COALESCE(p.purchase_id::text, '')) <> ''
             ORDER BY p.ship_date DESC NULLS LAST, p.id DESC
             LIMIT 1)
          ) AS purchase_id,
          latest.shipment_id,
          ss.last_updated AS received_at,
          COALESCE(ss.status, '') AS recon_shipment_status,
          by_msku.qty_total,
          by_msku.per_book_weighted,
          by_msku.has_cost_components,
          by_msku.w_final_net_price_usd,
          by_msku.w_commission_usd,
          by_msku.w_supplier_shipping_usd,
          by_msku.w_warehouse_prep_usd,
          by_msku.w_inventory_place_inbound_usd,
          by_msku.w_expert_charges_usd,
          by_msku.w_other_charges_usd,
          by_msku.total_cost_usd
        FROM latest
        INNER JOIN by_msku ON by_msku.nk = latest.nk
        LEFT JOIN shipment_status ss ON TRIM(ss.shipment_id) = TRIM(COALESCE(latest.shipment_id, ''))
      )`;
    const searchClause = q
      ? ` WHERE joined.msku ILIKE $1 OR joined.title ILIKE $1
          OR COALESCE(joined.asin, '') ILIKE $1
          OR COALESCE(joined.fnsku, '') ILIKE $1
          OR COALESCE(joined.publisher_name, '') ILIKE $1
          OR COALESCE(joined.supplier_name, '') ILIKE $1
          OR COALESCE(joined.delivery_location, '') ILIKE $1
          OR COALESCE(joined.purchase_id::text, '') ILIKE $1
          OR COALESCE(joined.shipment_id::text, '') ILIKE $1`
      : '';
    const countSql = `${baseCte} SELECT COUNT(*)::int AS n FROM joined ${searchClause}`;
    const dataSql = `${baseCte}
      SELECT
        joined.msku,
        joined.title,
        joined.asin,
        joined.fnsku,
        joined.publisher_name,
        joined.supplier_name,
        joined.delivery_location,
        joined.purchase_id,
        joined.shipment_id,
        joined.ship_date,
        joined.received_at,
        joined.recon_shipment_status,
        joined.qty_total,
        joined.per_book_weighted,
        joined.has_cost_components,
        joined.w_final_net_price_usd,
        joined.w_commission_usd,
        joined.w_supplier_shipping_usd,
        joined.w_warehouse_prep_usd,
        joined.w_inventory_place_inbound_usd,
        joined.w_expert_charges_usd,
        joined.w_other_charges_usd,
        joined.total_cost_usd
      FROM joined
      ${searchClause}
      ORDER BY ${orderCol} ${dir} NULLS LAST, joined.msku ASC
      LIMIT $${q ? 2 : 1} OFFSET $${q ? 3 : 2}`;
    const countParams = q ? [`%${q}%`] : [];
    const dataParams = q ? [`%${q}%`, limit, offset] : [limit, offset];
    const [cnt, data] = await Promise.all([pool.query(countSql, countParams), pool.query(dataSql, dataParams)]);
    const total = Number(cnt.rows[0]?.n ?? 0) || 0;
    const norms = [
      ...new Set(
        data.rows
          .map((row) => String(row.msku || '').trim().toLowerCase())
          .filter((k) => k !== '')
      ),
    ];
    let salesByNorm = new Map();
    if (norms.length) {
      try {
        const sapSalesSql = buildSapSalesByMskuSql();
        const sr = await pool.query(sapSalesSql, [norms]);
        salesByNorm = new Map(sr.rows.map((x) => [x.sku_norm, x]));
      } catch (e) {
        console.error('  ⚠️ sales-again-purchase sales_by_msku:', e.message);
      }
    }
    const mapRow = (r) => {
      const nk = String(r.msku || '').trim().toLowerCase();
      const sx = salesByNorm.get(nk);
      const sales_orders = sx
        ? {
            so_qty: sx.so_qty != null ? Number(sx.so_qty) : 0,
            so_refund_qty: sx.so_refund_qty != null ? Number(sx.so_refund_qty) : 0,
            so_final_qty: sx.so_final_qty != null ? Number(sx.so_final_qty) : 0,
            so_amount: sx.so_amount != null ? Number(sx.so_amount) : 0,
            so_refund_total: sx.so_refund_total != null ? Number(sx.so_refund_total) : 0,
            so_final_amount: sx.so_final_amount != null ? Number(sx.so_final_amount) : 0,
            so_sale_last: sx.so_sale_last ?? null,
            so_currency: sx.so_currency != null && String(sx.so_currency).trim() !== '' ? String(sx.so_currency).trim() : 'USD',
            any_settlement: sx.any_settlement === true,
            any_refund_breakdown: sx.any_refund_breakdown === true,
            settlement_qty_breakdown: sx.settlement_qty_breakdown ?? null,
            refund_qty_breakdown: sx.refund_qty_breakdown ?? null,
            sum_st_sales: sx.sum_st_sales != null ? Number(sx.sum_st_sales) : 0,
            sum_st_fba_fees: sx.sum_st_fba_fees != null ? Number(sx.sum_st_fba_fees) : 0,
            sum_st_fba_commission: sx.sum_st_fba_commission != null ? Number(sx.sum_st_fba_commission) : 0,
            sum_st_variable_fee: sx.sum_st_variable_fee != null ? Number(sx.sum_st_variable_fee) : 0,
            sum_st_other_charges: sx.sum_st_other_charges != null ? Number(sx.sum_st_other_charges) : 0,
            sum_st_total: sx.sum_st_total != null ? Number(sx.sum_st_total) : 0,
            sum_sales_rpt_gross_non_settlement:
              sx.sum_sales_rpt_gross_non_settlement != null ? Number(sx.sum_sales_rpt_gross_non_settlement) : 0,
            sum_refund_sales: sx.sum_refund_sales != null ? Number(sx.sum_refund_sales) : 0,
            sum_refund_fba_fees: sx.sum_refund_fba_fees != null ? Number(sx.sum_refund_fba_fees) : 0,
            sum_refund_fba_commission: sx.sum_refund_fba_commission != null ? Number(sx.sum_refund_fba_commission) : 0,
            sum_refund_variable_fee: sx.sum_refund_variable_fee != null ? Number(sx.sum_refund_variable_fee) : 0,
            sum_refund_other_charges: sx.sum_refund_other_charges != null ? Number(sx.sum_refund_other_charges) : 0,
          }
        : null;
      return {
      msku: r.msku,
      title: r.title ?? null,
      asin: r.asin ?? null,
      fnsku: r.fnsku ?? null,
      publisher: r.publisher_name != null && String(r.publisher_name).trim() !== '' ? String(r.publisher_name).trim() : null,
      supplier: r.supplier_name != null && String(r.supplier_name).trim() !== '' ? String(r.supplier_name).trim() : null,
      delivery_location:
        r.delivery_location != null && String(r.delivery_location).trim() !== ''
          ? String(r.delivery_location).trim()
          : null,
      purchase_id: r.purchase_id != null && String(r.purchase_id).trim() !== '' ? String(r.purchase_id).trim() : null,
      /** Same shipment_id as Shipment Recon (latest Shipped-to-FBA line per MSKU). */
      shipment_id: r.shipment_id != null && String(r.shipment_id).trim() !== '' ? String(r.shipment_id).trim() : null,
      /** Ship date on that line (first date in Shipment Recon “Ship date” column). */
      ship_date: r.ship_date ?? null,
      /** Shipment Status last_updated — second date in Shipment Recon (join on shipment_id). */
      received_at: r.received_at ?? null,
      /** shipment_status.status e.g. Closed — same as Shipment Recon badge. */
      recon_shipment_status:
        r.recon_shipment_status != null && String(r.recon_shipment_status).trim() !== ''
          ? String(r.recon_shipment_status).trim()
          : null,
      qty: r.qty_total != null ? Number(r.qty_total) : 0,
      has_cost_components: r.has_cost_components === true,
      per_book_cost_usd:
        r.has_cost_components === true && r.per_book_weighted != null ? Number(r.per_book_weighted) : null,
      total_cost_usd:
        r.has_cost_components === true && r.total_cost_usd != null ? Number(r.total_cost_usd) : null,
      cost_breakdown:
        r.has_cost_components === true
          ? {
              final_net_price_usd: r.w_final_net_price_usd != null ? Number(r.w_final_net_price_usd) : null,
              commission_usd: r.w_commission_usd != null ? Number(r.w_commission_usd) : null,
              supplier_shipping_usd: r.w_supplier_shipping_usd != null ? Number(r.w_supplier_shipping_usd) : null,
              warehouse_prep_usd: r.w_warehouse_prep_usd != null ? Number(r.w_warehouse_prep_usd) : null,
              inventory_place_inbound_usd: r.w_inventory_place_inbound_usd != null ? Number(r.w_inventory_place_inbound_usd) : null,
              expert_charges_usd: r.w_expert_charges_usd != null ? Number(r.w_expert_charges_usd) : null,
              other_charges_usd: r.w_other_charges_usd != null ? Number(r.w_other_charges_usd) : null,
            }
          : null,
      sales_orders,
    };
    };
    res.json({
      rows: data.rows.map(mapRow),
      total,
      limit,
      offset,
    });
  } catch (e) {
    console.error('  ❌ sales-again-purchase:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Individual table data
app.get('/api/data/:table', async (req, res) => {
  const allowed = ['shipped_to_fba','sales_data','fba_receipts','customer_returns','reimbursements','replacements','fc_transfers','adjustments','fba_removals','shipment_status','fba_summary','case_tracker','manual_adjustments'];
  if (!allowed.includes(req.params.table)) return res.status(400).json({ error: 'Invalid table' });
  try {
    const r = await pool.query(`SELECT * FROM ${req.params.table} ORDER BY id DESC LIMIT 5000`);
    res.json({ rows: r.rows, count: r.rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════
//  UPLOAD HISTORY
// ═══════════════════════════════════════════════════════
app.get('/api/upload-history', async (req, res) => {
  try {
    const { type, limit = 100 } = req.query;
    const params = [];
    let q = 'SELECT * FROM uploaded_files';
    if (type) {
      const rt =
        dataTableForUploadHistoryReportType(type) ||
        sanitizeUploadHistoryReportTypeKey(type);
      params.push(rt || type);
      q += ' WHERE report_type=$1';
    }
    q += ` ORDER BY uploaded_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) || 100);
    const r = await pool.query(q, params);
    res.json({ rows: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/**
 * Latest calendar date in each physical data table (same values as Reports tabs).
 * Used when uploaded_files.report_latest_date was never set (older uploads / parse gaps).
 */
async function getLatestDataDatesByReportType(pool) {
  const queries = [
    ['shipped_to_fba', `SELECT MAX(ship_date) AS d FROM shipped_to_fba`],
    ['sales_data', `SELECT MAX(sale_date::date) AS d FROM sales_data`],
    ['fba_receipts', `SELECT MAX(COALESCE(receipt_date::date, receipt_datetime::date)) AS d FROM fba_receipts`],
    ['customer_returns', `SELECT MAX(return_date::date) AS d FROM customer_returns`],
    ['reimbursements', `SELECT MAX(approval_date::date) AS d FROM reimbursements`],
    ['fc_transfers', `SELECT MAX(transfer_date::date) AS d FROM fc_transfers`],
    ['replacements', `SELECT MAX(shipment_date::date) AS d FROM replacements`],
    ['gnr_report', `SELECT MAX(report_date) AS d FROM gnr_report`],
    [
      'fba_removals',
      `SELECT MAX(d) AS d FROM (
         SELECT request_date::date AS d FROM fba_removals WHERE request_date IS NOT NULL
         UNION ALL
         SELECT last_updated::date FROM fba_removals WHERE last_updated IS NOT NULL
       ) t`,
    ],
    [
      'removal_shipments',
      `SELECT MAX(d) AS d FROM (
         SELECT shipment_date::date AS d FROM removal_shipments WHERE shipment_date IS NOT NULL
         UNION ALL
         SELECT request_date::date FROM removal_shipments WHERE request_date IS NOT NULL
       ) t`,
    ],
    [
      'shipment_status',
      `SELECT MAX(d) AS d FROM (
         SELECT created_date AS d FROM shipment_status WHERE created_date IS NOT NULL
         UNION ALL
         SELECT last_updated FROM shipment_status WHERE last_updated IS NOT NULL
       ) t`,
    ],
    ['fba_summary', `SELECT MAX(summary_date) AS d FROM fba_summary`],
    [
      'payment_repository',
      `SELECT MAX(
         CASE
           WHEN posted_datetime ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN substring(trim(posted_datetime::text), 1, 10)::date
           ELSE NULL
         END
       ) AS d FROM payment_repository`,
    ],
    [
      'settlement_report',
      `SELECT MAX(
         CASE
           WHEN posted_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN substring(trim(posted_date::text), 1, 10)::date
           WHEN deposit_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
             THEN substring(trim(deposit_date::text), 1, 10)::date
           ELSE NULL
         END
       ) AS d FROM settlement_report`,
    ],
  ];
  const out = {};
  await Promise.all(
    queries.map(async ([key, sql]) => {
      try {
        const { rows } = await pool.query(sql);
        const d = rows[0]?.d;
        if (d != null) out[key] = d;
      } catch (_) {
        /* table/column missing on older DBs */
      }
    })
  );
  return out;
}

app.get('/api/upload-summary', async (req, res) => {
  try {
    const [r, dataDates] = await Promise.all([
      pool.query(`
      SELECT report_type,
             COUNT(*)         AS upload_count,
             SUM(row_count)   AS total_rows,
             MAX(uploaded_at) AS last_upload,
             (SELECT row_count FROM uploaded_files u2
              WHERE u2.report_type = uf.report_type
              ORDER BY uploaded_at DESC LIMIT 1) AS last_row_count,
             (SELECT report_latest_date FROM uploaded_files u3
              WHERE u3.report_type = uf.report_type
              ORDER BY uploaded_at DESC LIMIT 1) AS last_report_latest_date
      FROM uploaded_files uf
      GROUP BY report_type
    `),
      getLatestDataDatesByReportType(pool),
    ]);
    const rows = r.rows.map((row) => {
      const fromLog = row.last_report_latest_date;
      const fromData = dataDates[row.report_type];
      return {
        ...row,
        last_report_latest_date: fromLog != null ? fromLog : fromData != null ? fromData : null,
        /** True when date comes from live table data, not upload log */
        last_report_date_from_data: fromLog == null && fromData != null,
      };
    });
    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
//  RETURNS RECON
// ═══════════════════════════════════════════════════════
app.get('/api/returns-recon', async (req, res) => {
  try {
    const { from, to, search, disposition, fnsku_status } = req.query;

    // Pre-aggregate reimbursements and cases to avoid row multiplication
    const baseWhere = [];
    const params = [];
    if (from)   { params.push(from);           baseWhere.push(`cr.return_date >= $${params.length}`); }
    if (to)     { params.push(to);             baseWhere.push(`cr.return_date <= $${params.length}`); }
    if (search) { params.push('%'+search+'%'); baseWhere.push(`(cr.msku ILIKE $${params.length} OR cr.fnsku ILIKE $${params.length} OR cr.asin ILIKE $${params.length} OR cr.order_id ILIKE $${params.length})`); }
    if (disposition) { params.push(disposition); baseWhere.push(`cr.disposition ILIKE $${params.length}`); }

    const whereClause = baseWhere.length ? 'WHERE ' + baseWhere.join(' AND ') : '';

    let q = `
      WITH ri_totals AS (
        SELECT msku,
          SUM(quantity) AS total_qty,
          SUM(amount)   AS total_amount
        FROM reimbursements
        WHERE reason ILIKE '%return%'
        GROUP BY msku
      ),
      ct_totals AS (
        SELECT msku,
          COUNT(*)  AS case_count,
          STRING_AGG(DISTINCT case_id, ', ') FILTER (WHERE case_id IS NOT NULL AND case_id <> '') AS case_ids,
          CASE
            WHEN MAX(CASE WHEN status='resolved' THEN 1 ELSE 0 END)=1 THEN 'Resolved'
            WHEN MAX(CASE WHEN status='approved' THEN 1 ELSE 0 END)=1 THEN 'Approved'
            WHEN MAX(CASE WHEN status='raised'   THEN 1 ELSE 0 END)=1 THEN 'Open'
            ELSE 'Pending'
          END AS case_status
        FROM case_tracker
        WHERE recon_type = 'return'
        GROUP BY msku
      )
      SELECT
        cr.order_id,
        cr.fnsku         AS return_fnsku,
        cr.msku,
        cr.asin,
        MAX(cr.title)    AS title,
        SUM(cr.quantity) AS total_returned,
        COUNT(cr.id)     AS return_events,
        STRING_AGG(DISTINCT cr.disposition, ', ')                                   AS dispositions,
        STRING_AGG(DISTINCT cr.reason,      ', ')                                   AS reasons,
        -- FNSKU from original sale for this order_id
        MAX(sd_any.fnsku)   AS sales_fnsku,
        MAX(sd_any.msku)    AS sales_msku,
        -- FNSKU match status
        CASE
          WHEN MAX(sd_any.order_id) IS NULL         THEN 'Order Not Found'
          WHEN MAX(sd_match.order_id) IS NOT NULL   THEN 'Matched FNSKU'
          ELSE 'FNSKU Mismatch'
        END AS fnsku_status,
        -- Reimbursements (per msku)
        COALESCE(MAX(ri.total_qty),    0) AS reimb_qty,
        COALESCE(MAX(ri.total_amount), 0) AS reimb_amount,
        -- Cases (per msku)
        COALESCE(MAX(ct.case_count), 0)   AS case_count,
        MAX(ct.case_ids)                  AS case_ids,
        COALESCE(MAX(ct.case_status), 'No Case') AS case_status,
        MIN(cr.return_date) AS earliest_return,
        MAX(cr.return_date) AS latest_return
      FROM customer_returns cr
      -- Join sales_data by order_id only (to find what was originally sold)
      LEFT JOIN sales_data sd_any   ON cr.order_id = sd_any.order_id
      -- Join sales_data again: order_id + matching fnsku (to verify FNSKU)
      LEFT JOIN sales_data sd_match ON cr.order_id = sd_match.order_id
                                   AND cr.fnsku    = sd_match.fnsku
      LEFT JOIN ri_totals ri ON cr.msku = ri.msku
      LEFT JOIN ct_totals ct ON cr.msku = ct.msku
      ${whereClause}
      GROUP BY cr.order_id, cr.fnsku, cr.msku, cr.asin
      ORDER BY MAX(cr.return_date) DESC NULLS LAST
    `;

    // Post-filter on fnsku_status (can't use WHERE on aliased computed col in same query)
    let allRows = (await pool.query(q, params)).rows;
    if (fnsku_status && fnsku_status !== 'all') {
      allRows = allRows.filter(x => x.fnsku_status === fnsku_status);
    }

    const totalRet  = allRows.reduce((s,x) => s + parseInt(x.total_returned||0), 0);
    const totalRimb = allRows.reduce((s,x) => s + parseFloat(x.reimb_amount||0), 0);
    const matched   = allRows.filter(x => x.fnsku_status === 'Matched FNSKU').length;
    const mismatch  = allRows.filter(x => x.fnsku_status === 'FNSKU Mismatch').length;
    const notFound  = allRows.filter(x => x.fnsku_status === 'Order Not Found').length;

    const { limit, page, offset } = getPagination(req.query);
    const rows = allRows.slice(offset, offset + limit);
    res.json({
      rows,
      stats: {
        total_rows:    allRows.length,
        total_returned: totalRet,
        total_reimb:   totalRimb.toFixed(2),
        with_cases:    allRows.filter(x=>x.case_count>0).length,
        matched, mismatch, not_found: notFound,
      },
      total_count: allRows.length, page, limit,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/returns-log', async (req, res) => {
  try {
    const { from, to, search, disposition } = req.query;
    const { limit, page, offset } = getPagination(req.query);
    let base = `FROM customer_returns cr
      LEFT JOIN case_tracker ct ON cr.msku = ct.msku AND ct.recon_type = 'return'
      WHERE 1=1`;
    const params = [];
    if (from)   { params.push(from);           base += ` AND cr.return_date >= $${params.length}`; }
    if (to)     { params.push(to);             base += ` AND cr.return_date <= $${params.length}`; }
    if (search) { params.push('%'+search+'%'); base += ` AND (cr.msku ILIKE $${params.length} OR cr.fnsku ILIKE $${params.length} OR cr.order_id ILIKE $${params.length})`; }
    if (disposition) { params.push(disposition); base += ` AND cr.disposition = $${params.length}`; }
    const countRes = await pool.query(`SELECT COUNT(*) ${base}`, params);
    const total_count = parseInt(countRes.rows[0].count);
    params.push(limit, offset);
    const r = await pool.query(`SELECT cr.*, ct.case_id, ct.status AS case_status ${base} ORDER BY cr.return_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ rows: r.rows, total_count, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════
//  REPLACEMENT RECON
// ═══════════════════════════════════════════════════════
app.get('/api/replacement-recon', async (req, res) => {
  try {
    const { search, from, to } = req.query;
    let q = `
      SELECT
        rp.msku,
        MAX(rp.asin)                                              AS asin,
        SUM(rp.quantity)                                          AS total_replaced,
        COUNT(rp.id)                                              AS replacement_events,
        STRING_AGG(DISTINCT rp.replacement_order_id, ', ')        AS replacement_order_ids,
        STRING_AGG(DISTINCT rp.original_order_id, ', ')           AS original_order_ids,
        STRING_AGG(DISTINCT rp.fulfillment_center_id, ', ')       AS fulfillment_centers,
        STRING_AGG(DISTINCT rp.replacement_reason_code, ', ')     AS reason_codes,
        MIN(rp.shipment_date)                                     AS earliest_date,
        MAX(rp.shipment_date)                                     AS latest_date,
        COALESCE((SELECT SUM(ri2.quantity) FROM reimbursements ri2
                  WHERE ri2.msku = rp.msku AND ri2.reason ILIKE '%replace%'), 0) AS reimb_qty,
        COALESCE((SELECT SUM(ri2.amount)   FROM reimbursements ri2
                  WHERE ri2.msku = rp.msku AND ri2.reason ILIKE '%replace%'), 0) AS reimb_amount,
        COUNT(DISTINCT ct.id)                                     AS case_count,
        STRING_AGG(DISTINCT ct.case_id, ', ')                     AS case_ids,
        CASE
          WHEN COUNT(DISTINCT ct.id) = 0                                         THEN 'No Case'
          WHEN MAX(CASE WHEN ct.status='resolved' THEN 1 ELSE 0 END)=1           THEN 'Resolved'
          WHEN MAX(CASE WHEN ct.status='approved' THEN 1 ELSE 0 END)=1           THEN 'Approved'
          WHEN MAX(CASE WHEN ct.status='raised'   THEN 1 ELSE 0 END)=1           THEN 'Open'
          ELSE 'Pending'
        END AS case_status
      FROM replacements rp
      LEFT JOIN case_tracker ct ON rp.msku = ct.msku AND ct.recon_type = 'replacement'
      WHERE 1=1`;
    const params = [];
    if (search) { params.push('%'+search+'%'); q += ` AND (rp.msku ILIKE $${params.length} OR rp.asin ILIKE $${params.length})`; }
    if (from)   { params.push(from);           q += ` AND rp.shipment_date >= $${params.length}`; }
    if (to)     { params.push(to);             q += ` AND rp.shipment_date <= $${params.length}`; }
    q += ` GROUP BY rp.msku ORDER BY total_replaced DESC`;
    const { limit, page, offset } = getPagination(req.query);
    const r = await pool.query(q, params);
    const total_count = r.rowCount;
    const paginatedRows = r.rows.slice(offset, offset + limit);
    res.json({
      rows: paginatedRows,
      stats: {
        total_skus:     total_count,
        total_replaced: r.rows.reduce((s,x)=>s+parseInt(x.total_replaced||0),0)
      },
      total_count, page, limit,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Raw replacement log — individual records
app.get('/api/replacements-log', async (req, res) => {
  try {
    const { from, to, search, fc } = req.query;
    const { limit, page, offset } = getPagination(req.query);
    let base = `FROM replacements WHERE 1=1`;
    const params = [];
    if (from)   { params.push(from);           base += ` AND shipment_date >= $${params.length}`; }
    if (to)     { params.push(to);             base += ` AND shipment_date <= $${params.length}`; }
    if (search) { params.push('%'+search+'%'); base += ` AND (msku ILIKE $${params.length} OR asin ILIKE $${params.length} OR replacement_order_id ILIKE $${params.length} OR original_order_id ILIKE $${params.length})`; }
    if (fc)     { params.push('%'+fc+'%');     base += ` AND fulfillment_center_id ILIKE $${params.length}`; }
    const countRes = await pool.query(`SELECT COUNT(*) ${base}`, params);
    const total_count = parseInt(countRes.rows[0].count);
    params.push(limit, offset);
    const r = await pool.query(
      `SELECT id, msku, asin, quantity,
         fulfillment_center_id, original_fulfillment_center_id,
         replacement_reason_code, replacement_order_id, original_order_id,
         shipment_date, uploaded_at
       ${base} ORDER BY shipment_date DESC NULLS LAST, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ rows: r.rows, total_count, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Replacement Analysis — individual records enriched with return + reimb data ───
app.get('/api/replacement-analysis', async (req, res) => {
  try {
    const { from, to, search } = req.query;
    const params = [];
    const where  = [];
    if (from)   { params.push(from);           where.push(`r.shipment_date >= $${params.length}`); }
    if (to)     { params.push(to);             where.push(`r.shipment_date <= $${params.length}`); }
    if (search) {
      params.push('%'+search+'%');
      where.push(`(r.msku ILIKE $${params.length} OR r.asin ILIKE $${params.length} OR r.replacement_order_id ILIKE $${params.length} OR r.original_order_id ILIKE $${params.length})`);
    }
    const whereClause = where.length ? 'WHERE '+where.join(' AND ') : '';

    const q = `
      SELECT
        r.id,
        r.shipment_date,
        r.msku,
        r.asin,
        r.quantity,
        r.replacement_reason_code,
        r.replacement_order_id,
        r.original_order_id,
        r.fulfillment_center_id,
        -- ── Returns: match by MSKU + (replacement_order_id OR original_order_id)
        COALESCE(ret.return_qty,  0)   AS return_qty,
        ret.matched_return_order       AS matched_return_order,
        ret.matched_via                AS return_matched_via,
        ret.dispositions               AS return_dispositions,
        ret.reasons                    AS return_reasons,
        ret.earliest_return            AS return_date,
        -- ── Reimbursements: match by MSKU + (replacement_order_id OR original_order_id)
        COALESCE(ri.reimb_qty,    0)   AS reimb_qty,
        COALESCE(ri.reimb_amount, 0)   AS reimb_amount,
        ri.reimb_reason,
        ri.reimb_approval_date,
        ri.reimb_ids,
        -- ── Payment report (repository): refund lines matched by Replacement OR Original Amazon order id only (no MSKU)
        COALESCE(pref.repo_refund_qty,    0)   AS repo_refund_qty,
        COALESCE(pref.repo_refund_amount, 0)   AS repo_refund_amount,
        COALESCE(pref.repo_refund_lines, '[]'::json) AS repo_refund_lines,
        -- ── Cases: same matching rules as returns/reimb (both order IDs + digit-normalized + reference_id)
        COALESCE(rpc.rp_case_count, 0)::int              AS rp_case_count,
        COALESCE(rpc.rp_case_units_claimed, 0)::int     AS rp_case_units_claimed,
        COALESCE(rpc.rp_case_units_approved, 0)::int    AS rp_case_units_approved,
        COALESCE(rpc.rp_case_amount_approved, 0)::numeric AS rp_case_amount_approved,
        rpc.rp_case_ids,
        rpc.rp_case_top_status
      FROM replacements r
      LEFT JOIN LATERAL (
        SELECT
          SUM(cr.quantity)                                                  AS return_qty,
          STRING_AGG(DISTINCT cr.order_id, ', ')                           AS matched_return_order,
          STRING_AGG(DISTINCT
            CASE WHEN cr.order_id = r.replacement_order_id
                 THEN 'Replacement Order'
                 ELSE 'Original Order' END, ', ')                          AS matched_via,
          STRING_AGG(DISTINCT COALESCE(cr.disposition,''), ', ')           AS dispositions,
          STRING_AGG(DISTINCT COALESCE(cr.reason,''), ', ')                AS reasons,
          MIN(cr.return_date)::text                                         AS earliest_return
        FROM customer_returns cr
        WHERE cr.msku = r.msku
          AND (
            (r.replacement_order_id IS NOT NULL AND cr.order_id = r.replacement_order_id)
            OR
            (r.original_order_id IS NOT NULL    AND cr.order_id = r.original_order_id)
          )
      ) ret ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(ri2.quantity)                                                  AS reimb_qty,
          SUM(ri2.amount)                                                    AS reimb_amount,
          STRING_AGG(DISTINCT COALESCE(ri2.reason,''), ', ')                AS reimb_reason,
          MAX(ri2.approval_date)::text                                       AS reimb_approval_date,
          STRING_AGG(DISTINCT ri2.reimbursement_id, ', ')
            FILTER (WHERE ri2.reimbursement_id IS NOT NULL)                 AS reimb_ids
        FROM reimbursements ri2
        WHERE ri2.msku = r.msku
          AND (
            (r.replacement_order_id IS NOT NULL AND ri2.amazon_order_id = r.replacement_order_id)
            OR
            (r.original_order_id IS NOT NULL    AND ri2.amazon_order_id = r.original_order_id)
          )
      ) ri ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS rp_case_count,
          SUM(COALESCE(ct.units_claimed, 0))::int AS rp_case_units_claimed,
          SUM(COALESCE(ct.units_approved, 0))::int AS rp_case_units_approved,
          SUM(COALESCE(ct.amount_approved, 0))::numeric AS rp_case_amount_approved,
          STRING_AGG(DISTINCT ct.case_id, ', ')
            FILTER (WHERE ct.case_id IS NOT NULL AND BTRIM(ct.case_id) <> '') AS rp_case_ids,
          (ARRAY_AGG(ct.status ORDER BY
            CASE WHEN ct.status='resolved' THEN 5
                 WHEN ct.status='approved' THEN 4
                 WHEN ct.status='raised'   THEN 3
                 WHEN ct.status='pending'  THEN 2
                 WHEN ct.status='rejected' THEN 1
                 ELSE 0 END DESC))[1] AS rp_case_top_status
        FROM case_tracker ct
        WHERE ct.recon_type = 'replacement'
          AND BTRIM(COALESCE(ct.msku, '')) = BTRIM(COALESCE(r.msku, ''))
          AND (
            (NULLIF(BTRIM(r.replacement_order_id), '') IS NOT NULL AND (
              (NULLIF(BTRIM(ct.order_id), '') IS NOT NULL AND (
                BTRIM(ct.order_id) = BTRIM(r.replacement_order_id)
                OR (
                  LENGTH(REGEXP_REPLACE(BTRIM(ct.order_id), '[^0-9]', '', 'g')) >= 15
                  AND REGEXP_REPLACE(BTRIM(ct.order_id), '[^0-9]', '', 'g')
                    = REGEXP_REPLACE(BTRIM(r.replacement_order_id), '[^0-9]', '', 'g')
                )
              ))
              OR (NULLIF(BTRIM(ct.reference_id), '') IS NOT NULL AND (
                BTRIM(ct.reference_id) = BTRIM(r.replacement_order_id)
                OR (
                  LENGTH(REGEXP_REPLACE(BTRIM(ct.reference_id), '[^0-9]', '', 'g')) >= 15
                  AND REGEXP_REPLACE(BTRIM(ct.reference_id), '[^0-9]', '', 'g')
                    = REGEXP_REPLACE(BTRIM(r.replacement_order_id), '[^0-9]', '', 'g')
                )
              ))
            ))
            OR
            (NULLIF(BTRIM(r.original_order_id), '') IS NOT NULL AND (
              (NULLIF(BTRIM(ct.order_id), '') IS NOT NULL AND (
                BTRIM(ct.order_id) = BTRIM(r.original_order_id)
                OR (
                  LENGTH(REGEXP_REPLACE(BTRIM(ct.order_id), '[^0-9]', '', 'g')) >= 15
                  AND REGEXP_REPLACE(BTRIM(ct.order_id), '[^0-9]', '', 'g')
                    = REGEXP_REPLACE(BTRIM(r.original_order_id), '[^0-9]', '', 'g')
                )
              ))
              OR (NULLIF(BTRIM(ct.reference_id), '') IS NOT NULL AND (
                BTRIM(ct.reference_id) = BTRIM(r.original_order_id)
                OR (
                  LENGTH(REGEXP_REPLACE(BTRIM(ct.reference_id), '[^0-9]', '', 'g')) >= 15
                  AND REGEXP_REPLACE(BTRIM(ct.reference_id), '[^0-9]', '', 'g')
                    = REGEXP_REPLACE(BTRIM(r.original_order_id), '[^0-9]', '', 'g')
                )
              ))
            ))
          )
      ) rpc ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(ABS(COALESCE(pr.quantity::numeric, 0))), 0)::numeric AS repo_refund_qty,
          COALESCE(SUM(ABS(COALESCE(pr.total_amount, pr.product_sales, 0::numeric))), 0)::numeric AS repo_refund_amount,
          COALESCE(
            json_agg(
              json_build_object(
                'sku', pr.sku,
                'settlement_id', pr.settlement_id,
                'order_id', pr.order_id,
                'product_sales', pr.product_sales,
                'selling_fees', pr.selling_fees,
                'fba_fees', pr.fba_fees,
                'total_amount', pr.total_amount,
                'quantity', pr.quantity,
                'line_type', pr.line_type
              )
              ORDER BY pr.posted_datetime NULLS LAST, pr.id
            ),
            '[]'::json
          ) AS repo_refund_lines
        FROM payment_repository pr
        WHERE NULLIF(BTRIM(COALESCE(pr.order_id, '')), '') IS NOT NULL
          AND (
            (r.replacement_order_id IS NOT NULL AND (
              BTRIM(pr.order_id) = BTRIM(r.replacement_order_id)
              OR (
                LENGTH(REGEXP_REPLACE(BTRIM(pr.order_id), '[^0-9]', '', 'g')) >= 15
                AND REGEXP_REPLACE(BTRIM(pr.order_id), '[^0-9]', '', 'g')
                  = REGEXP_REPLACE(BTRIM(r.replacement_order_id), '[^0-9]', '', 'g')
              )
            ))
            OR
            (r.original_order_id IS NOT NULL AND (
              BTRIM(pr.order_id) = BTRIM(r.original_order_id)
              OR (
                LENGTH(REGEXP_REPLACE(BTRIM(pr.order_id), '[^0-9]', '', 'g')) >= 15
                AND REGEXP_REPLACE(BTRIM(pr.order_id), '[^0-9]', '', 'g')
                  = REGEXP_REPLACE(BTRIM(r.original_order_id), '[^0-9]', '', 'g')
              )
            ))
          )
          AND (
            COALESCE(BTRIM(pr.line_type), '') ILIKE '%refund%'
            OR COALESCE(pr.description, '') ILIKE '%refund%'
            OR COALESCE(pr.product_sales, 0) < 0
            OR COALESCE(pr.total_amount, 0) < 0
          )
      ) pref ON true
      ${whereClause}
      ORDER BY r.shipment_date DESC NULLS LAST, r.id DESC
    `;
    const result = await pool.query(q, params);
    result.rows.forEach(row => { row.row_source = 'replacement'; });

    /* Sales order lines: product $0 and no replacement log row with same MSKU + Replacement Order ID as sales order_id */
    const salesParams = [];
    const salesW = [
      'COALESCE(sd.product_amount, 0) = 0',
      'BTRIM(COALESCE(sd.msku, \'\')) <> \'\'',
      'BTRIM(COALESCE(sd.order_id, \'\')) <> \'\''
    ];
    if (from) { salesParams.push(from); salesW.push(`sd.sale_date::date >= $${salesParams.length}`); }
    if (to)   { salesParams.push(to);   salesW.push(`sd.sale_date::date <= $${salesParams.length}`); }
    if (search) {
      salesParams.push('%'+search+'%');
      const n = salesParams.length;
      salesW.push(`(sd.msku ILIKE $${n} OR sd.asin ILIKE $${n} OR sd.order_id ILIKE $${n} OR sd.fnsku ILIKE $${n})`);
    }
    const salesZeroSql = `
      SELECT
        (-sd.id)::bigint AS id,
        sd.sale_date AS shipment_date,
        sd.msku,
        sd.asin,
        sd.quantity,
        NULL::text AS replacement_reason_code,
        sd.order_id AS replacement_order_id,
        NULL::text AS original_order_id,
        sd.fc AS fulfillment_center_id,
        0::bigint AS return_qty,
        NULL::text AS matched_return_order,
        NULL::text AS return_matched_via,
        NULL::text AS return_dispositions,
        NULL::text AS return_reasons,
        NULL::text AS return_date,
        0::bigint AS reimb_qty,
        0::numeric AS reimb_amount,
        NULL::text AS reimb_reason,
        NULL::text AS reimb_approval_date,
        NULL::text AS reimb_ids,
        0::numeric AS repo_refund_qty,
        0::numeric AS repo_refund_amount,
        '[]'::json AS repo_refund_lines,
        0::int AS rp_case_count,
        0::int AS rp_case_units_claimed,
        0::int AS rp_case_units_approved,
        0::numeric AS rp_case_amount_approved,
        NULL::text AS rp_case_ids,
        NULL::text AS rp_case_top_status,
        'sales_zero'::text AS row_source,
        sd.order_id AS sales_order_id,
        sd.fnsku,
        COALESCE(sd.product_amount, 0)::numeric AS product_amount
      FROM sales_data sd
      WHERE ${salesW.join(' AND ')}
        AND NOT EXISTS (
          SELECT 1 FROM replacements rp
          WHERE BTRIM(COALESCE(rp.msku, '')) = BTRIM(COALESCE(sd.msku, ''))
            AND NULLIF(BTRIM(COALESCE(rp.replacement_order_id, '')), '') IS NOT NULL
            AND (
              BTRIM(rp.replacement_order_id) = BTRIM(sd.order_id)
              OR (
                LENGTH(REGEXP_REPLACE(BTRIM(rp.replacement_order_id), '[^0-9]', '', 'g')) >= 15
                AND REGEXP_REPLACE(BTRIM(rp.replacement_order_id), '[^0-9]', '', 'g')
                  = REGEXP_REPLACE(BTRIM(sd.order_id), '[^0-9]', '', 'g')
              )
            )
        )
      ORDER BY sd.sale_date DESC NULLS LAST, sd.id DESC
    `;
    const sz = await pool.query(salesZeroSql, salesParams);
    const allRows = [...result.rows, ...sz.rows].sort((a, b) => {
      const ta = a.shipment_date ? new Date(a.shipment_date).getTime() : 0;
      const tb = b.shipment_date ? new Date(b.shipment_date).getTime() : 0;
      return tb - ta;
    });
    const { limit, page, offset } = getPagination(req.query);
    const rows = allRows.slice(offset, offset + limit);
    res.json({
      rows,
      stats: {
        total_records: allRows.length,
        total_qty:     allRows.reduce((s,x) => s + parseInt(x.quantity||0), 0),
        with_returns:  allRows.filter(x => parseInt(x.return_qty||0) > 0).length,
        reimb_total:   allRows.reduce((s,x) => s + parseFloat(x.reimb_amount||0), 0).toFixed(2),
        repo_refund_qty:   allRows.reduce((s,x) => s + parseFloat(x.repo_refund_qty||0), 0).toFixed(2),
        repo_refund_amt: allRows.reduce((s,x) => s + parseFloat(x.repo_refund_amount||0), 0).toFixed(2),
        rows_with_repo_refund: allRows.filter(x => parseFloat(x.repo_refund_qty||0) > 0 || parseFloat(x.repo_refund_amount||0) > 0).length,
        sales_zero_no_repl_log: sz.rowCount,
      },
      total_count: allRows.length, page, limit,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════
//  FC TRANSFER RECON
// ═══════════════════════════════════════════════════════
app.get('/api/fc-transfer-recon', async (req, res) => {
  try {
    const { from, to, search, fc } = req.query;
    let q = `
      SELECT msku, fnsku, asin, MAX(title) AS title,
        SUM(quantity) AS total_qty,
        COUNT(id) AS event_count,
        STRING_AGG(DISTINCT event_type, ', ') AS event_types,
        STRING_AGG(DISTINCT fulfillment_center, ', ') AS fulfillment_centers,
        SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END) AS qty_in,
        SUM(CASE WHEN quantity < 0 THEN ABS(quantity) ELSE 0 END) AS qty_out,
        MIN(transfer_date) AS earliest, MAX(transfer_date) AS latest
      FROM fc_transfers WHERE 1=1`;
    const params = [];
    if (from)   { params.push(from);           q += ` AND transfer_date >= $${params.length}`; }
    if (to)     { params.push(to);             q += ` AND transfer_date <= $${params.length}`; }
    if (search) { params.push('%'+search+'%'); q += ` AND (msku ILIKE $${params.length} OR fnsku ILIKE $${params.length})`; }
    if (fc)     { params.push('%'+fc+'%');     q += ` AND fulfillment_center ILIKE $${params.length}`; }
    q += ` GROUP BY msku, fnsku, asin ORDER BY event_count DESC`;
    const { limit, page, offset } = getPagination(req.query);
    const r = await pool.query(q, params);
    const stats = { total_skus: r.rowCount, total_events: r.rows.reduce((s,x)=>s+parseInt(x.event_count||0),0), total_qty: r.rows.reduce((s,x)=>s+parseInt(x.total_qty||0),0) };
    const total_count = r.rowCount;
    const rows = r.rows.slice(offset, offset + limit);
    res.json({ rows, stats, total_count, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fc-transfer-log', async (req, res) => {
  try {
    const { from, to, search, fc } = req.query;
    const { limit, page, offset } = getPagination(req.query);
    let base = `FROM fc_transfers WHERE 1=1`;
    const params = [];
    if (from)   { params.push(from);           base += ` AND transfer_date >= $${params.length}`; }
    if (to)     { params.push(to);             base += ` AND transfer_date <= $${params.length}`; }
    if (search) { params.push('%'+search+'%'); base += ` AND (msku ILIKE $${params.length} OR fnsku ILIKE $${params.length} OR asin ILIKE $${params.length})`; }
    if (fc)     { params.push('%'+fc+'%');     base += ` AND fulfillment_center ILIKE $${params.length}`; }
    const countRes = await pool.query(`SELECT COUNT(*) ${base}`, params);
    const total_count = parseInt(countRes.rows[0].count);
    params.push(limit, offset);
    const r = await pool.query(`SELECT * ${base} ORDER BY transfer_date DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ rows: r.rows, total_count, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── FC Transfer Analysis — unresolved SKUs with imbalance age & action status ───
app.get('/api/fc-transfer-analysis', async (req, res) => {
  try {
    const { search } = req.query;
    const params = [];
    const whereConditions = ['1=1'];
    if (search) {
      params.push('%'+search+'%');
      whereConditions.push(`(msku ILIKE $${params.length} OR fnsku ILIKE $${params.length} OR asin ILIKE $${params.length})`);
    }
    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    const q = `
      WITH events_daily AS (
        SELECT
          msku, fnsku, asin,
          MAX(title)      AS title,
          transfer_date::date AS tdate,
          SUM(quantity)   AS day_qty,
          STRING_AGG(DISTINCT COALESCE(fulfillment_center,''), ', ')
            FILTER (WHERE fulfillment_center IS NOT NULL AND fulfillment_center <> '') AS day_fcs
        FROM fc_transfers
        ${whereClause}
        GROUP BY msku, fnsku, asin, transfer_date::date
      ),
      running AS (
        SELECT
          msku, fnsku, asin, title, tdate, day_qty, day_fcs,
          SUM(day_qty) OVER (
            PARTITION BY msku
            ORDER BY tdate
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS running_sum
        FROM events_daily
      ),
      -- Last date where the running sum was exactly 0 (fully balanced point)
      last_zero AS (
        SELECT msku, MAX(tdate) AS last_zero_date
        FROM running
        WHERE running_sum = 0
        GROUP BY msku
      ),
      -- Imbalance start = first event date AFTER the last zero-crossing
      -- (or the very first event if the sum never hit zero)
      imbalance_start_cte AS (
        SELECT r.msku, MIN(r.tdate) AS imbalance_start
        FROM running r
        LEFT JOIN last_zero lz ON r.msku = lz.msku
        WHERE lz.last_zero_date IS NULL OR r.tdate > lz.last_zero_date
        GROUP BY r.msku
      ),
      summary AS (
        SELECT
          r.msku,
          MAX(r.fnsku)  AS fnsku,
          MAX(r.asin)   AS asin,
          MAX(r.title)  AS title,
          SUM(r.day_qty) AS net_qty,
          SUM(CASE WHEN r.day_qty > 0 THEN r.day_qty  ELSE 0 END)        AS qty_in,
          SUM(CASE WHEN r.day_qty < 0 THEN ABS(r.day_qty) ELSE 0 END)    AS qty_out,
          COUNT(*)       AS event_days,
          MIN(r.tdate)   AS earliest_date,
          MAX(r.tdate)   AS latest_date,
          STRING_AGG(DISTINCT r.day_fcs, ', ')
            FILTER (WHERE r.day_fcs IS NOT NULL AND r.day_fcs <> '') AS fcs,
          MAX(isc.imbalance_start) AS imbalance_start
        FROM running r
        LEFT JOIN imbalance_start_cte isc ON r.msku = isc.msku
        GROUP BY r.msku
        HAVING SUM(r.day_qty) != 0  -- Negative (not arrived) AND positive (excess received)
      )
      SELECT *,
        (CURRENT_DATE - imbalance_start::date) AS days_pending,
        CASE
          WHEN net_qty > 0                                              THEN 'excess'
          WHEN (CURRENT_DATE - imbalance_start::date) > 60             THEN 'take-action'
          ELSE                                                               'waiting'
        END AS action_status
      FROM summary
      ORDER BY
        CASE
          WHEN net_qty < 0 AND (CURRENT_DATE - imbalance_start::date) > 60 THEN 0
          WHEN net_qty < 0                                                   THEN 1
          ELSE                                                                    2
        END,
        days_pending DESC,
        ABS(net_qty) DESC
    `;
    const result = await pool.query(q, params);
    const allRows = result.rows;
    const { limit, page, offset } = getPagination(req.query);
    const rows = allRows.slice(offset, offset + limit);
    res.json({
      rows,
      stats: {
        total_unresolved:     allRows.filter(x => x.action_status !== 'excess').length,
        take_action_count:    allRows.filter(x => x.action_status === 'take-action').length,
        waiting_count:        allRows.filter(x => x.action_status === 'waiting').length,
        excess_count:         allRows.filter(x => x.action_status === 'excess').length,
        total_unresolved_qty: allRows.filter(x => x.action_status !== 'excess')
                                  .reduce((s,x) => s + Math.abs(parseInt(x.net_qty||0)), 0),
        excess_qty:           allRows.filter(x => x.action_status === 'excess')
                                  .reduce((s,x) => s + parseInt(x.net_qty||0), 0)
      },
      total_count: allRows.length, page, limit,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════
//  GRADE & RESELL
// ═══════════════════════════════════════════════════════
app.get('/api/grade-resell', async (req, res) => {
  try {
    const { status, grade, channel, search, from, to } = req.query;
    let q = `SELECT * FROM grade_resell_items WHERE 1=1`;
    const params = [];
    if (status) { params.push(status);         q += ` AND status=$${params.length}`; }
    if (grade)  { params.push(grade);          q += ` AND grade=$${params.length}`; }
    if (channel){ params.push(channel);        q += ` AND channel=$${params.length}`; }
    if (search) { params.push('%'+search+'%'); q += ` AND (msku ILIKE $${params.length} OR fnsku ILIKE $${params.length} OR title ILIKE $${params.length})`; }
    if (from)   { params.push(from);           q += ` AND graded_date >= $${params.length}`; }
    if (to)     { params.push(to);             q += ` AND graded_date <= $${params.length}`; }
    q += ` ORDER BY created_at DESC`;
    const { limit, page, offset } = getPagination(req.query);
    const r = await pool.query(q, params);
    const stats = {
      total: r.rowCount,
      graded:   r.rows.filter(x=>x.status==='Graded').length,
      listed:   r.rows.filter(x=>x.status==='Listed').length,
      sold:     r.rows.filter(x=>x.status==='Sold').length,
      disposed: r.rows.filter(x=>x.status==='Disposed').length,
      total_value: r.rows.reduce((s,x)=>s+parseFloat(x.resell_price||0)*parseInt(x.quantity||1),0).toFixed(2)
    };
    const total_count = r.rowCount;
    const rows = r.rows.slice(offset, offset + limit);
    res.json({ rows, stats, total_count, page, limit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/grade-resell', async (req, res) => {
  try {
    const {
      source, source_ref, order_id, msku, fnsku, asin, title,
      quantity, grade, resell_price, channel, status, notes, graded_by, graded_date,
      lpn, used_msku, used_fnsku, used_condition, unit_status
    } = req.body;
    if (!msku) return res.status(400).json({ error: 'msku is required' });

    const qty  = parseInt(quantity) || 1;
    const uMsk = (used_msku  || '').trim();
    const uFnk = (used_fnsku || '').trim();

    // UPSERT: if same used_msku + used_fnsku already exists → add qty, update fields
    if (uMsk && uFnk) {
      const exist = await pool.query(
        `SELECT id FROM grade_resell_items WHERE TRIM(used_msku)=$1 AND TRIM(used_fnsku)=$2 LIMIT 1`,
        [uMsk, uFnk]
      );
      if (exist.rowCount > 0) {
        const upd = await pool.query(`
          UPDATE grade_resell_items SET
            quantity       = quantity + $1,
            order_id       = COALESCE($2, order_id),
            lpn            = COALESCE($3, lpn),
            used_condition = COALESCE(NULLIF($4,''), used_condition),
            unit_status    = COALESCE(NULLIF($5,''), unit_status),
            grade          = COALESCE(NULLIF($6,''), grade),
            graded_by      = COALESCE(NULLIF($7,''), graded_by),
            notes          = COALESCE($8::TEXT, notes),
            graded_date    = COALESCE($9, graded_date)
          WHERE id = $10 RETURNING *`,
          [qty,
           order_id||null, lpn||null,
           used_condition||'', unit_status||'',
           grade||'', graded_by||'',
           notes||null,
           graded_date||null,
           exist.rows[0].id]
        );
        return res.json({ row: upd.rows[0], updated: true });
      }
    }

    // INSERT new row
    const r = await pool.query(`
      INSERT INTO grade_resell_items
        (source, source_ref, order_id, msku, fnsku, asin, title,
         quantity, grade, resell_price, channel, status, notes, graded_by, graded_date,
         lpn, used_msku, used_fnsku, used_condition, unit_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [source||'manual', source_ref||null, order_id||null,
       msku, fnsku||null, asin||null, title||null,
       qty, grade||'Good', parseFloat(resell_price)||0,
       channel||'FBA', status||'Graded', notes||null, graded_by||null,
       graded_date||new Date().toISOString().split('T')[0],
       lpn||null, uMsk||null, uFnk||null, used_condition||null, unit_status||'Succeeded']
    );
    res.json({ row: r.rows[0], updated: false });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/grade-resell/:id', async (req, res) => {
  try {
    const ALLOWED = { status:v=>v, grade:v=>v, resell_price:v=>parseFloat(v)||0, channel:v=>v, notes:v=>v||null, graded_by:v=>v||null, graded_date:v=>v||null, title:v=>v||null, fnsku:v=>v||null, asin:v=>v||null, msku:v=>v, quantity:v=>parseInt(v)||1, sold_date:v=>v||null, sold_price:v=>v?parseFloat(v):null };
    const sets=[]; const params=[];
    for (const [k,fn] of Object.entries(ALLOWED)) {
      if (req.body[k] !== undefined) { params.push(fn(req.body[k])); sets.push(`${k}=$${params.length}`); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No valid fields' });
    params.push(req.params.id);
    const r = await pool.query(`UPDATE grade_resell_items SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ row: r.rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/grade-resell/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM grade_resell_items WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// MSKU autocomplete
app.get('/api/msku-suggest', async (req, res) => {
  try {
    const { q: search } = req.query;
    if (!search || search.length < 2) return res.json({ rows: [] });
    const r = await pool.query(`
      SELECT msku, MAX(title) AS title, MAX(fnsku) AS fnsku, MAX(asin) AS asin
      FROM (
        SELECT msku, title, fnsku, asin FROM shipped_to_fba WHERE msku IS NOT NULL AND msku ILIKE $1
        UNION ALL
        SELECT msku, title, fnsku, asin FROM fba_receipts WHERE msku IS NOT NULL AND msku ILIKE $1
        UNION ALL
        SELECT msku, NULL::text AS title, fnsku, NULL::text AS asin FROM fba_removals WHERE msku IS NOT NULL AND msku ILIKE $1
      ) t GROUP BY msku ORDER BY msku LIMIT 20`, ['%'+search+'%']
    );
    res.json({ rows: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// CSV Export
app.get('/api/export/csv', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM reconciliation_summary ORDER BY status');
    if (!r.rows.length) return res.send('No data');
    const headers = Object.keys(r.rows[0]).join(',');
    const rows = r.rows.map(row => Object.values(row).map(v => `"${v??''}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="reconciliation_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(headers + '\n' + rows.join('\n'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// SERVE FRONTEND (after all API routes; use Public/ folder on disk)
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});
app.use(express.static(publicDir));


// ============================================
// AUTO-MIGRATION: Add missing columns safely
// ============================================
async function runAutoMigrations() {
  /* Same instants as settlement_report.uploaded_at (timestamptz); fixes batch delete matching. */
  try {
    await pool.query(`
      ALTER TABLE uploaded_files
        ALTER COLUMN uploaded_at TYPE timestamptz USING uploaded_at::timestamptz
    `);
    console.log('  ✅ Auto-migration: uploaded_files.uploaded_at → timestamptz');
  } catch (e) {
    if (!/already.*timestamptz|duplicate column|does not exist/i.test(String(e.message)))
      console.log('  ⚠️  Auto-migration uploaded_files.uploaded_at note:', e.message);
  }

  try {
    await pool.query(`ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS data_target_table VARCHAR(64)`);
    await pool.query(`
      UPDATE uploaded_files SET data_target_table = 'settlement_report'
      WHERE data_target_table IS NULL
        AND lower(coalesce(report_type::text, '')) LIKE '%settlement%'
        AND lower(coalesce(report_type::text, '')) LIKE '%report%'
    `);
    const mapJoin = uploadHistoryTypeMapSqlValues('m');
    await pool.query(`
      UPDATE uploaded_files uf
      SET data_target_table = m.phys_table
      FROM ${mapJoin}
      WHERE uf.data_target_table IS NULL
        AND lower(trim(both '_' from regexp_replace(
             regexp_replace(trim(both from coalesce(uf.report_type::text, '')), '[[:space:]\\-]+', '_', 'g'),
             '_+', '_', 'g'))) = m.rt_key
    `);
    console.log('  ✅ Auto-migration: uploaded_files.data_target_table');
  } catch (e) {
    console.log('  ⚠️  uploaded_files.data_target_table note:', e.message);
  }

  try {
    await pool.query(`ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS report_latest_date DATE`);
    console.log('  ✅ Auto-migration: uploaded_files.report_latest_date');
  } catch (e) {
    console.log('  ⚠️  uploaded_files.report_latest_date note:', e.message);
  }

  // Grade & Resell table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grade_resell_items (
        id           SERIAL PRIMARY KEY,
        source       VARCHAR(30)   DEFAULT 'manual',
        source_ref   VARCHAR(100),
        msku         VARCHAR(200)  NOT NULL,
        fnsku        VARCHAR(50),
        asin         VARCHAR(20),
        title        TEXT,
        quantity     INT           DEFAULT 1,
        grade        VARCHAR(20)   DEFAULT 'Good',
        resell_price NUMERIC(10,2) DEFAULT 0,
        channel      VARCHAR(30)   DEFAULT 'FBA',
        status       VARCHAR(20)   DEFAULT 'Graded',
        notes        TEXT,
        graded_by    VARCHAR(100),
        graded_date  DATE          DEFAULT CURRENT_DATE,
        sold_date    DATE,
        sold_price   NUMERIC(10,2),
        created_at   TIMESTAMPTZ   DEFAULT NOW()
      )
    `);
    console.log('  ✅ Auto-migration: grade_resell_items OK');
  } catch(e) { console.log('  ⚠️  Auto-migration note:', e.message); }

  // GNR (Grade and Resell) uploaded report table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gnr_report (
        id                    SERIAL PRIMARY KEY,
        report_date           DATE,
        order_id              VARCHAR(50),
        value_recovery_type   VARCHAR(100),
        lpn                   VARCHAR(100),
        manual_order_item_id  VARCHAR(100),
        msku                  VARCHAR(200),
        fnsku                 VARCHAR(50),
        asin                  VARCHAR(20),
        quantity              INT          DEFAULT 1,
        unit_status           VARCHAR(30),
        reason_for_unit_status TEXT,
        used_condition        VARCHAR(100),
        used_msku             VARCHAR(200),
        used_fnsku            VARCHAR(50),
        uploaded_at           TIMESTAMPTZ  DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS gnr_report_order_id_uniq
        ON gnr_report (order_id) WHERE order_id IS NOT NULL
    `);
    console.log('  ✅ Auto-migration: gnr_report OK');
  } catch(e) { console.log('  ⚠️  Auto-migration gnr_report note:', e.message); }

  // Add GNR-specific columns to grade_resell_items for manual entry → GNR Recon feed
  try {
    await pool.query(`
      ALTER TABLE grade_resell_items
        ADD COLUMN IF NOT EXISTS order_id      VARCHAR(50),
        ADD COLUMN IF NOT EXISTS lpn           VARCHAR(100),
        ADD COLUMN IF NOT EXISTS used_msku     VARCHAR(200),
        ADD COLUMN IF NOT EXISTS used_fnsku    VARCHAR(50),
        ADD COLUMN IF NOT EXISTS used_condition VARCHAR(100),
        ADD COLUMN IF NOT EXISTS unit_status   VARCHAR(30)  DEFAULT 'Succeeded'
    `);
    console.log('  ✅ Auto-migration: grade_resell_items GNR columns OK');
  } catch(e) { console.log('  ⚠️  Auto-migration grade_resell_items GNR note:', e.message); }

  try {
    await pool.query(`
      ALTER TABLE removal_receipts
        ADD COLUMN IF NOT EXISTS reimb_qty         INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS reimb_amount      NUMERIC(10,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS post_action       VARCHAR(50),
        ADD COLUMN IF NOT EXISTS action_remarks    TEXT,
        ADD COLUMN IF NOT EXISTS action_date       DATE,
        ADD COLUMN IF NOT EXISTS final_status      VARCHAR(50) DEFAULT 'Pending Action',
        ADD COLUMN IF NOT EXISTS case_id           VARCHAR(100),
        ADD COLUMN IF NOT EXISTS case_type         VARCHAR(50),
        ADD COLUMN IF NOT EXISTS case_raised_at    TIMESTAMP,
        ADD COLUMN IF NOT EXISTS case_tracker_id   INT,
        ADD COLUMN IF NOT EXISTS warehouse_comment TEXT,
        ADD COLUMN IF NOT EXISTS transfer_to       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS wh_status         VARCHAR(50) DEFAULT 'Pending',
        ADD COLUMN IF NOT EXISTS item_title        TEXT,
        ADD COLUMN IF NOT EXISTS bin_location       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS invoice_number     VARCHAR(120),
        ADD COLUMN IF NOT EXISTS attachment_urls   JSONB DEFAULT '[]'::jsonb
    `);
    console.log('  ✅ Auto-migration: removal_receipts columns OK');
  } catch(e) {
    console.log('  ⚠️  Auto-migration note:', e.message);
  }
  try {
    await pool.query(`
      ALTER TABLE removal_shipments
        ADD COLUMN IF NOT EXISTS removal_order_type VARCHAR(50)
    `);
    console.log('  ✅ Auto-migration: removal_shipments columns OK');
  } catch(e) {
    console.log('  ⚠️  Auto-migration note:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_repository (
        id                           SERIAL PRIMARY KEY,
        posted_datetime              TEXT,
        settlement_id                VARCHAR(100),
        line_type                    VARCHAR(200),
        order_id                     VARCHAR(100),
        sku                          VARCHAR(200),
        description                  TEXT,
        quantity                     INT             DEFAULT 0,
        marketplace                  VARCHAR(50),
        account_type                 VARCHAR(100),
        fulfillment                  VARCHAR(200),
        order_city                   VARCHAR(100),
        order_state                  VARCHAR(100),
        order_postal                 VARCHAR(30),
        tax_collection_model         VARCHAR(100),
        product_sales                NUMERIC(14,4),
        product_sales_tax            NUMERIC(14,4),
        shipping_credits             NUMERIC(14,4),
        shipping_credits_tax       NUMERIC(14,4),
        gift_wrap_credits            NUMERIC(14,4),
        gift_wrap_credits_tax       NUMERIC(14,4),
        regulatory_fee               NUMERIC(14,4),
        tax_on_regulatory_fee       NUMERIC(14,4),
        promotional_rebates          NUMERIC(14,4),
        promotional_rebates_tax     NUMERIC(14,4),
        marketplace_withheld_tax     NUMERIC(14,4),
        selling_fees                 NUMERIC(14,4),
        fba_fees                     NUMERIC(14,4),
        other_transaction_fees       NUMERIC(14,4),
        other_amount                 NUMERIC(14,4),
        total_amount                 NUMERIC(14,4),
        transaction_status           VARCHAR(100),
        transaction_release_datetime TEXT,
        uploaded_at                  TIMESTAMPTZ     DEFAULT NOW()
      )
    `);
    console.log('  ✅ Auto-migration: payment_repository OK');
  } catch (e) {
    console.log('  ⚠️  Auto-migration payment_repository note:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settlement_report (
        id                           SERIAL PRIMARY KEY,
        settlement_id                VARCHAR(50),
        settlement_start_date        TEXT,
        settlement_end_date          TEXT,
        deposit_date                 TEXT,
        total_amount                 NUMERIC(14,2),
        currency                     VARCHAR(10),
        transaction_type             VARCHAR(100),
        order_id                     VARCHAR(100),
        merchant_order_id            VARCHAR(100),
        adjustment_id                VARCHAR(100),
        shipment_id                  VARCHAR(100),
        marketplace_name             VARCHAR(100),
        amount_type                  VARCHAR(100),
        amount_description           VARCHAR(200),
        amount                       NUMERIC(14,4),
        fulfillment_id               VARCHAR(20),
        posted_date                  TEXT,
        posted_date_time             TEXT,
        order_item_code              VARCHAR(100),
        merchant_order_item_id       VARCHAR(100),
        merchant_adjustment_item_id  VARCHAR(100),
        sku                          VARCHAR(255),
        quantity_purchased           INT             DEFAULT 0,
        promotion_id                 TEXT,
        uploaded_at                  TIMESTAMPTZ     DEFAULT NOW(),
        upload_file_id               INTEGER
      )
    `);
    await pool.query(
      `ALTER TABLE settlement_report ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ DEFAULT NOW()`
    );
    await pool.query(
      `ALTER TABLE settlement_report ADD COLUMN IF NOT EXISTS upload_file_id INTEGER`
    );
    await pool.query(`
      WITH pairs AS (
        SELECT DISTINCT ON (sr.id)
          sr.id AS sid,
          uf.id AS uf_id
        FROM settlement_report sr
        INNER JOIN uploaded_files uf
          ON lower(trim(both from coalesce(uf.report_type::text, ''))) = 'settlement_report'
         AND sr.upload_file_id IS NULL
         AND (
           sr.uploaded_at IS NOT DISTINCT FROM (uf.uploaded_at::timestamptz)
           OR abs(
             extract(epoch from sr.uploaded_at::timestamptz)
           - extract(epoch from uf.uploaded_at::timestamptz)
           ) < 1.0
         )
        ORDER BY sr.id, uf.id
      )
      UPDATE settlement_report sr
      SET upload_file_id = pairs.uf_id
      FROM pairs
      WHERE sr.id = pairs.sid
    `);
    console.log('  ✅ Auto-migration: settlement_report OK');
  } catch (e) {
    console.log('  ⚠️  Auto-migration settlement_report note:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gnr_recon_remarks (
        used_msku VARCHAR(512) NOT NULL,
        used_fnsku VARCHAR(512) NOT NULL,
        remarks TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (used_msku, used_fnsku)
      )
    `);
    console.log('  ✅ Auto-migration: gnr_recon_remarks');
  } catch (e) {
    console.log('  ⚠️  gnr_recon_remarks note:', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS full_recon_remarks (
        fnsku VARCHAR(256) NOT NULL PRIMARY KEY,
        remarks TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('  ✅ Auto-migration: full_recon_remarks');
  } catch (e) {
    console.log('  ⚠️  full_recon_remarks note:', e.message);
  }

  // ── Performance indexes — reconciliation query columns ──
  const perfIndexes = [
    // shipped_to_fba
    `CREATE INDEX IF NOT EXISTS idx_shipped_msku        ON shipped_to_fba (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_shipped_shipment_id ON shipped_to_fba (shipment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_shipped_ship_date   ON shipped_to_fba (ship_date)`,
    // sales_data
    `CREATE INDEX IF NOT EXISTS idx_sales_msku          ON sales_data (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_sale_date     ON sales_data (sale_date)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_order_id      ON sales_data (order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_asin          ON sales_data (asin)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_fnsku         ON sales_data (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_sales_msku_date     ON sales_data (msku, sale_date)`,
    // fba_receipts
    `CREATE INDEX IF NOT EXISTS idx_receipts_msku       ON fba_receipts (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_fnsku      ON fba_receipts (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_shipment   ON fba_receipts (shipment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_date       ON fba_receipts (receipt_date)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_msku_ship  ON fba_receipts (msku, shipment_id)`,
    // customer_returns
    `CREATE INDEX IF NOT EXISTS idx_returns_msku        ON customer_returns (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_returns_fnsku       ON customer_returns (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_returns_date        ON customer_returns (return_date)`,
    `CREATE INDEX IF NOT EXISTS idx_returns_asin        ON customer_returns (asin)`,
    // reimbursements
    `CREATE INDEX IF NOT EXISTS idx_reimb_msku          ON reimbursements (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_reimb_fnsku         ON reimbursements (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_reimb_asin          ON reimbursements (asin)`,
    // fba_removals
    `CREATE INDEX IF NOT EXISTS idx_removals_msku       ON fba_removals (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_removals_fnsku      ON fba_removals (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_removals_order_id   ON fba_removals (order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_removals_date       ON fba_removals (request_date)`,
    `CREATE INDEX IF NOT EXISTS idx_removals_msku_date  ON fba_removals (msku, request_date)`,
    // fc_transfers
    `CREATE INDEX IF NOT EXISTS idx_fct_msku            ON fc_transfers (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_fct_fnsku           ON fc_transfers (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_fct_date            ON fc_transfers (transfer_date)`,
    // fba_summary
    `CREATE INDEX IF NOT EXISTS idx_fbasumm_msku        ON fba_summary (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_fbasumm_fnsku       ON fba_summary (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_fbasumm_disp        ON fba_summary (disposition)`,
    // replacements
    `CREATE INDEX IF NOT EXISTS idx_repl_msku           ON replacements (msku)`,
    // gnr_report
    `CREATE INDEX IF NOT EXISTS idx_gnr_msku            ON gnr_report (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_gnr_fnsku           ON gnr_report (fnsku)`,
    `CREATE INDEX IF NOT EXISTS idx_gnr_date            ON gnr_report (report_date)`,
    // settlement_report
    `CREATE INDEX IF NOT EXISTS idx_settle_settlement   ON settlement_report (settlement_id)`,
    `CREATE INDEX IF NOT EXISTS idx_settle_sku          ON settlement_report (sku)`,
    `CREATE INDEX IF NOT EXISTS idx_settle_posted       ON settlement_report (posted_date_time)`,
    // payment_repository
    `CREATE INDEX IF NOT EXISTS idx_pay_sku             ON payment_repository (sku)`,
    `CREATE INDEX IF NOT EXISTS idx_pay_order_id        ON payment_repository (order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pay_settlement      ON payment_repository (settlement_id)`,
    // case_tracker
    `CREATE INDEX IF NOT EXISTS idx_case_msku           ON case_tracker (msku)`,
    `CREATE INDEX IF NOT EXISTS idx_case_recon_type     ON case_tracker (recon_type)`,
    `CREATE INDEX IF NOT EXISTS idx_case_status         ON case_tracker (status)`,
  ];
  for (const sql of perfIndexes) {
    try {
      await pool.query(sql);
    } catch (e) {
      // Table may not exist yet (e.g. settlement_report first run) — safe to skip
      if (!/does not exist|undefined/i.test(e.message))
        console.log('  ⚠️  Index note:', e.message);
    }
  }
  console.log('  ✅ Auto-migration: performance indexes OK');
}

// ============================================
// START SERVER
// ============================================
app.listen(PORT, async () => {
  await runAutoMigrations();
  console.log('');
  console.log('  Sales Orders:               GET  /api/sales-orders');
  console.log('  Sales Again Purchase:       GET  /api/sales-again-purchase');
  console.log('  Payment Repository upload: POST /api/upload/payment-repository (or /api/upload/payment_repository)');
  console.log('  Settlement Report upload:  POST /api/upload/settlement-report  (or /api/upload/settlement_report)');
  console.log('  Upload CSV templates: /upload-templates/<type>.csv (+ GET /api/template/:slug)');
  console.log('  Remove upload batch: POST /api/upload-history/:id/delete (settlement: …/delete-settlement)');
  console.log('');
  console.log('  ================================================');
  console.log('   InvenSync ERP - Local Server');
  console.log('  ================================================');
  console.log(`  Browser mein jaao: http://localhost:${PORT}`);
  console.log('  ================================================');
  console.log('');
});

