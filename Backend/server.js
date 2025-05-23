const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');

// Try to load from .env file first for development
try {
  dotenv.config();
} catch (err) {
  console.error('⚠️ Error loading .env file:', err.message);
}

const app = express();
const baseDir = process.cwd();
const configPath = path.resolve(baseDir, 'config.json');
// Custom error classes for better error handling
class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.statusCode = 500;
  }
}

class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 503;
  }
}

class FileSystemError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileSystemError';
    this.statusCode = 500;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class ResourceNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResourceNotFoundError';
    this.statusCode = 404;
  }
}

// Create upload and public directories if they don't exist
const imageUploadDirectory = path.resolve(baseDir, 'uploads/images');
const publicDir = path.resolve(baseDir, 'public');

try {
  if (!fs.existsSync(imageUploadDirectory)) {
    fs.mkdirSync(imageUploadDirectory, { recursive: true });
    console.log('✅ Created uploads directory');
  }

  if (!fs.existsSync(path.resolve(publicDir, 'index.html'))) {
    console.warn('⚠️ No frontend build found in /public. Creating fallback index.html');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    fs.writeFileSync(path.resolve(publicDir, 'index.html'), `
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
} catch (err) {
  throw new FileSystemError(`Failed to initialize directories: ${err.message}`);
}

// Setup the readline interface for prompting user
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input with timeout
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
    throw new DatabaseError(`Error checking/creating table: ${err.message}`);
  }
}
// Function to validate database configuration
function validateDbConfig(config) {
  if (!config) {
    throw new ConfigurationError('Database configuration is required');
  }

  const requiredFields = ['user', 'password', 'server', 'database'];
  const missingFields = requiredFields.filter(field => !config[field]);

  if (missingFields.length > 0) {
    throw new ConfigurationError(
      `Missing required database configuration fields: ${missingFields.join(', ')}`
    );
  }

  return true;
}
// Add this function to handle port configuration with proper priority
async function getPortConfiguration() {
  // 1. First check .env file (highest priority)
  if (process.env.PORT) {
    console.log(`Using port ${process.env.PORT} from .env file`);
    return parseInt(process.env.PORT);
  }

  let config = {};
  
  // 2. Check existing config.json
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.port) {
        console.log(`Using port ${config.port} from config.json`);
        return config.port;
      }
    } catch (err) {
      console.error('Error reading config file:', err);
    }
  }

  // 3. Prompt user only when running in EXE mode (not npm start)
  if (process.pkg) {
    const changePort = await prompt('Would you like to set a custom port? (y/n) [default: 3001]: ');
    
    if (changePort.toLowerCase() === 'y') {
      const customPort = await prompt('Enter custom port number: ');
      const portNumber = parseInt(customPort);
      
      if (isNaN(portNumber)) {
        console.log('⚠️ Invalid port number. Using default port 3001');
        return 3001;
        }
      
      // Validate port range
      if (portNumber < 1 || portNumber > 65535) {
        console.log('⚠️ Port must be between 1 and 65535. Using default port 3001');
        return 3001;
      }

      // Save to config
      config.port = portNumber;
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ Custom port ${portNumber} saved to config.json`);
      } catch (err) {
        console.error('Could not save port configuration:', err.message);
      }
      
      return portNumber;
    }
  }

  // 4. Default fallback
  console.log('Using default port 3001');
  return 3001;
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
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch (err) {
        console.error('Warning: Could not save config file:', err.message);
      }
      return config;
    }

  // Otherwise, prompt for configuration
  console.log('\n=== Database Configuration Setup ===');
  console.log('Please enter your SQL Server credentials:');
  
    const dbUser = await prompt('Username: ').catch(() => {
      throw new ConfigurationError('Username prompt failed or timed out');
    });
    
    const dbPassword = await prompt('Password: ').catch(() => {
      throw new ConfigurationError('Password prompt failed or timed out');
    });
    
    const dbServer = await prompt('Server (e.g. localhost\\SQLEXPRESS): ').catch(() => {
      throw new ConfigurationError('Server prompt failed or timed out');
    });
    
    const dbName = await prompt('Database name: ').catch(() => {
      throw new ConfigurationError('Database name prompt failed or timed out');
    });
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
  let poolConnection = null;
  let server=null
  
  try {

    // Get database configuration
    const dbConfig = await getDbConfig();
    validateDbConfig(dbConfig);
        
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
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type']
    }));
    app.use(express.json());
    app.use('/uploads', express.static(path.resolve(baseDir, 'uploads')));
    app.use(express.static(path.resolve(baseDir, 'public')));
    
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
    app.post('/api/upload', upload.single('image'), async (req, res) => {
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
    app.get('/api/images', async (req, res) => {
      try {
        const result = await poolConnection.request().query('SELECT * FROM Images');
        res.json(result.recordset);
      } catch (err) {
        res.status(500).json({ error: 'DB fetch failed', details: err.message });
      }
    });
        
    // Delete image by ID
    app.delete('/api/images/:id', async (req, res) => {
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
        const fullPath = path.resolve(baseDir, relativePath);
        
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
      res.sendFile(path.resolve(baseDir, 'public', 'index.html'));
    });
    
    // Error middleware
    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ error: err.message });
    });
    
    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down server gracefully...');
      console.log('\n🛑 Press Ctrl+C again to exit immediately.');
      console.log('Otherwise, the server will keep running...');
      process.once('SIGINT', () => {
        console.log('\n⚠️ Forcing immediate shutdown...');
        process.exit(1);
      });

        });
        
        
    
    // Start server
    // Get the port configuratio
    const port = await getPortConfiguration();

    const server = app.listen(port, () => {
      console.log(`🚀 Server listening at http://localhost:${port}`);
      console.log(`📁 Upload directory: ${imageUploadDirectory}`);
    });
    
    // Handle server errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
      } else {
        console.error('Server error:', err);
      }
    });
    
  } catch (err) {
    console.error('❌ Server initialization failed:');
    
    try {
      if (poolConnection && poolConnection.connected) {
        await poolConnection.close();
      }
    } catch (closeErr) {
      console.error('Failed to close DB connection:', closeErr.message);
    }
    
  }
}

// Start the server with error handling
initializeServer().catch(err => {
  console.error('Fatal error during initialization:');
    console.log('Process will remain active for debugging. Close manually when ready.');

});

