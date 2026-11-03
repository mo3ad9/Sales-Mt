require("dotenv").config();
const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.use(express.static(path.join(__dirname, "public")));

async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      employee_no VARCHAR(40) UNIQUE NOT NULL,
      full_name VARCHAR(120) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL,
      active BOOLEAN DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS activations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES employees(id),
      package_name VARCHAR(120) NOT NULL,
      amount NUMERIC(10,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const admin = await pool.query(
    "SELECT id FROM employees WHERE employee_no=$1",
    [process.env.BOOTSTRAP_ADMIN_NO]
  );

  if (!admin.rowCount) {
    const hash = await bcrypt.hash(process.env.BOOTSTRAP_ADMIN_PASSWORD, 12);
    await pool.query(
      "INSERT INTO employees(employee_no,full_name,password_hash,role) VALUES($1,$2,$3,'admin')",
      [
        process.env.BOOTSTRAP_ADMIN_NO,
        process.env.BOOTSTRAP_ADMIN_NAME || "مدير النظام",
        hash
      ]
    );
  }
}

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8
});

app.post("/api/login", loginLimit, async (req, res) => {
  const { employeeNo, password } = req.body;

  const result = await pool.query(
    "SELECT * FROM employees WHERE employee_no=$1 AND active=TRUE",
    [employeeNo]
  );

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
  }

  req.session.user = {
    id: user.id,
    name: user.full_name,
    role: user.role
  };

  res.json({ user: req.session.user });
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.post("/api/activations", async (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  const { packageName, amount } = req.body;

  if (!packageName) return res.status(400).json({ error: "اسم الباقة مطلوب" });

  const result = await pool.query(
    "INSERT INTO activations(employee_id,package_name,amount) VALUES($1,$2,$3) RETURNING *",
    [req.session.user.id, packageName, Number(amount || 0)]
  );

  res.status(201).json(result.rows[0]);
});

app.get("/api/activations", async (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  const result = await pool.query(
    "SELECT a.*,e.full_name FROM activations a JOIN employees e ON e.id=a.employee_id ORDER BY a.created_at DESC"
  );

  res.json(result.rows);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initialize().then(() => {
  app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
    console.log("Jeddah Sales Team started");
  });
}).catch(console.error);
