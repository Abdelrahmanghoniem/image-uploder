const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');

// Try to load from .env file first for development
dotenv.config();

const app = express();
const baseDir = process.cwd();
const configPath = path.join(baseDir, 'config.json');

// Create upload and public directories if they don't exist
const imageUploadDirectory = path.join(baseDir, 'uploads/images');
const publicDir = path.join(baseDir, 'public');

if (!fs.existsSync(imageUploadDirectory)) {
  fs.mkdirSync(imageUploadDirectory, { recursive: true });
}

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.warn('⚠️ No frontend build found in /public. Creating fallback index.html');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Fallback Page</title>
        <style>
          body { font-family: sans-serif; text-align: center; padding: 2rem; }
        </style>
      </head>
      <body>
        <h1>Image Uploader API</h1>
        <p>No frontend build found. Please build your frontend and copy it to the "public" folder.</p>
      </body>
    </html>
  `);
}

// Setup the readline interface for prompting user
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Function to check if SQL table exists
async function checkAndCreateTable(pool) {
  try {
    // Check if the Images table exists
    const tableResult = await pool.request().query(`
      SELECT OBJECT_ID('dbo.Images') as TableID
    `);
    
    // If table doesn't exist, create it
    if (!tableResult.recordset[0].TableID) {
      console.log('Creating Images table...');
      await pool.request().query(`
        CREATE TABLE Images (
          id INT PRIMARY KEY IDENTITY(1,1),
          image_path NVARCHAR(255) NOT NULL,
          upload_date DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('✅ Images table created successfully');
    } else {
      console.log('✅ Images table already exists');
    }
    return true;
  } catch (err) {
    console.error('Error checking/creating table:', err);
    return false;
  }
}

// Function to load or create configuration
async function getDbConfig() {
  // If config file exists, use it
  if (fs.existsSync(configPath)) {
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (err) {
      console.error('Error reading config file:', err);
    }
  }

  // If environment variables are set, use them
  if (process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_SERVER && process.env.DB_NAME) {
    const config = {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME
    };
    
    // Save config for future use
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return config;
  }

  // Otherwise, prompt for configuration
  console.log('\n=== Database Configuration Setup ===');
  console.log('Please enter your SQL Server credentials:');
  
  const dbUser = await prompt('Username: ');
  const dbPassword = await prompt('Password: ');
  const dbServer = await prompt('Server (e.g. localhost\\SQLEXPRESS): ');
  const dbName = await prompt('Database name: ');
  
  const config = {
    user: dbUser,
    password: dbPassword,
    server: dbServer,
    database: dbName
  };
  
  // Ask if user wants to save the configuration
  const saveConfig = await prompt('Save this configuration for future use? (y/n): ');
  if (saveConfig.toLowerCase() === 'y') {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Configuration saved to config.json');
  }
  
  return config;
}

// Main function to initialize the server
async function initializeServer() {
  try {
    // Get database configuration
    const dbConfig = await getDbConfig();
    
    // Close readline interface after getting config
    rl.close();
    
    // Complete database configuration
    const fullDbConfig = {
      ...dbConfig,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      },
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      }
    };
    
    // Connect to database
    console.log('Connecting to database...');
    const poolConnection = await sql.connect(fullDbConfig);
    console.log('✅ Connected to SQL Server');
    
    // Check and create table if needed
    await checkAndCreateTable(poolConnection);
    
    // Set up Express middlewares
    app.use(cors({
      origin: 'http://localhost:3000',
      methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type']
    }));
    app.use(express.json());
    app.use('/uploads', express.static(path.join(baseDir, 'uploads')));
    app.use(express.static(path.join(baseDir, 'public')));
    
    // Set up multer for file uploads
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, imageUploadDirectory),
      filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      }
    });
    
    const fileFilter = (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
      cb(null, allowedTypes.includes(file.mimetype));
    };
    
    const upload = multer({ 
      storage, 
      fileFilter, 
      limits: { fileSize: 5 * 1024 * 1024 } 
    });
    
    // Define routes
    
    // Upload image
    app.post('/upload', upload.single('image'), async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
      const imagePath = `/uploads/images/${req.file.filename}`;
      try {
        await poolConnection.request()
          .input('path', sql.NVarChar, imagePath)
          .query('INSERT INTO Images (image_path) VALUES (@path)');
    
        res.json({ 
          message: 'Image uploaded successfully', 
          path: imagePath, 
          filename: req.file.filename 
        });
      } catch (err) {
        fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'DB insert failed', details: err.message });
      }
    });
    
    // GeSt all images
    app.get('/images', async (req, res) => {
      try {
        const result = await poolConnection.request().query('SELECT * FROM Images');
        res.json(result.recordset);
      } catch (err) {
        res.status(500).json({ error: 'DB fetch failed', details: err.message });
      }
    });
        
    // Delete image by ID
    app.delete('/images/:id', async (req, res) => {
      // Validate ID is a number
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      
      try {
        const result = await poolConnection.request()
          .input('id', sql.Int, id)
          .query('SELECT image_path FROM Images WHERE id = @id');
    
        if (!result.recordset.length) {
          return res.status(404).json({ error: 'Image not found' });
        }
    
        const imagePath = result.recordset[0].image_path;
        // Remove leading slash if present
        const relativePath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
        const fullPath = path.join(baseDir, relativePath);
        
        // Check if file exists before trying to delete
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        } else {
          console.warn(`File not found: ${fullPath}`);
        }
    
        await poolConnection.request()
          .input('id', sql.Int, id)
          .query('DELETE FROM Images WHERE id = @id');
    
        res.json({ message: 'Image deleted' });
      } catch (err) {
        res.status(500).json({ error: 'Delete failed', details: err.message });
      }
    });
    
    // React fallback
    app.get('*', (req, res) => {
      res.sendFile(path.join(baseDir, 'public', 'index.html'));
    });
    
    // Error middleware
    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ error: err.message });
    });
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      if (poolConnection) {
        await poolConnection.close();
        console.log('🔌 DB connection closed.');
      }
      process.exit(0);
    });
    
    // Start server
    const port = process.env.PORT || 3001;
    app.listen(port, () => {
      console.log(`🚀 Server listening at http://localhost:${port}`);
    });
    
  } catch (err) {
    console.error('❌ Server initialization failed:', err);
    process.exit(1);
  }
}

// Start the server
initializeServer();