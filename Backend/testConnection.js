require('dotenv').config();
console.log("DB_SERVER:", process.env.DB_SERVER); // ADD THIS LINE
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};
sql.connect(config)
  .then(() => {
    console.log("✅ Connected to SQL Server successfully!");
    return sql.close();
  })
  .catch(err => {
    console.error("❌ Connection failed:", err);
  });