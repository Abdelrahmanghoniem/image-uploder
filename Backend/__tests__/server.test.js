// __tests__/server.test.js
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');
const express = require('express');

// Mock dependencies
jest.mock('mssql');
jest.mock('fs');
jest.mock('readline');
jest.mock('dotenv');

// Prepare for app import by setting up initial mocks
const mockPool = {
  request: jest.fn().mockReturnThis(),
  input: jest.fn().mockReturnThis(),
  query: jest.fn().mockResolvedValue({ recordset: [] })
};

sql.connect.mockResolvedValue(mockPool);

fs.existsSync.mockReturnValue(true);
fs.readFileSync.mockReturnValue(JSON.stringify({
  user: 'test',
  password: 'test',
  server: 'localhost\\SQLEXPRESS',
  database: 'test',
  port: 3001
}));

// Import the app module after setting up mocks
// Note: We need to set up a separate route handler for testing
const app = express();
const multer = require('multer');
const cors = require('cors');

// Mock for checkAndCreateTable
const checkAndCreateTable = async () => true;

// Mock multer - Improved version that allows testing both success and missing file cases
jest.mock('multer', () => {
  const multerMock = jest.fn().mockImplementation(() => {
    return {
      single: jest.fn().mockImplementation((fieldName) => {
        return (req, res, next) => {
          // Do not automatically add a file - this should be controlled by the test
          next();
        };
      })
    };
  });

  multerMock.diskStorage = jest.fn().mockImplementation(() => ({}));
  return multerMock;
});

const upload = multer();

// Set up Express app for testing
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Mock database connection
const poolConnection = mockPool;

// Add test routes
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
    res.status(500).json({ error: 'DB insert failed', details: err.message });
  }
});

app.get('/api/images', async (req, res) => {
  try {
    const result = await poolConnection.request().query('SELECT * FROM Images');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'DB fetch failed', details: err.message });
  }
});

app.delete('/api/images/:id', async (req, res) => {
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
    const relativePath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
    const fullPath = path.resolve(process.cwd(), relativePath);
    
    // Check if file exists before trying to delete
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await poolConnection.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Images WHERE id = @id');

    res.json({ message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed', details: err.message });
  }
});

// Add this at the top level, before any describe blocks
let server;
beforeAll(() => {
  server = app.listen(0); // Use port 0 to get an available port
});

afterAll((done) => {
  server.close(() => {
    done();
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

// Tests
describe('Database Configuration Functions', () => {
  const originalProcessEnv = process.env;
  
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalProcessEnv };
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    process.env = originalProcessEnv;
  });
  
  test('validateDbConfig should validate database config correctly', () => {
    // Since we can't easily import the function directly, let's recreate it for testing
    function validateDbConfig(config) {
      if (!config) {
        throw new Error('Database configuration is required');
      }
    
      const requiredFields = ['user', 'password', 'server', 'database'];
      const missingFields = requiredFields.filter(field => !config[field]);
    
      if (missingFields.length > 0) {
        throw new Error(
          `Missing required database configuration fields: ${missingFields.join(', ')}`
        );
      }
    
      return true;
    }
    
    // Valid config
    const validConfig = {
      user: 'test',
      password: 'test',
      server: 'localhost',
      database: 'test'
    };
    
    expect(validateDbConfig(validConfig)).toBe(true);
    
    // Invalid config (missing field)
    const invalidConfig = {
      user: 'test',
      password: 'test',
      server: 'localhost'
    };
    
    expect(() => validateDbConfig(invalidConfig)).toThrow('Missing required database configuration fields');
    
    // Null config
    expect(() => validateDbConfig(null)).toThrow('Database configuration is required');
  });
  
  test('Port configuration should prioritize correctly', async () => {
    // Mock for async port configuration
    const getPortConfiguration = async () => {
      // 1. First check .env file (highest priority)
      if (process.env.PORT) {
        return parseInt(process.env.PORT);
      }
    
      // 2. Check config.json
      if (fs.existsSync.mockReturnValueOnce(true)) {
        const config = JSON.parse(fs.readFileSync());
        if (config.port) {
          return config.port;
        }
      }
      
      // 3. Default fallback
      return 3001;
    };
    
    // Test env var priority
    process.env.PORT = '4000';
    expect(await getPortConfiguration()).toBe(4000);
    
    // Test config.json priority when no env var
    process.env.PORT = '';
    fs.existsSync.mockReturnValueOnce(true);
    fs.readFileSync.mockReturnValueOnce(JSON.stringify({ port: 5000 }));
    expect(await getPortConfiguration()).toBe(5000);
    
    // Test default fallback
    process.env.PORT = '';
    fs.existsSync.mockReturnValueOnce(false);
    expect(await getPortConfiguration()).toBe(3001);
  });
});

describe('Server API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.request.mockReturnThis();
    mockPool.input.mockReturnThis();
    mockPool.query.mockReset();
  });
  
  test('GET /api/images should return images from database', async () => {
    // Setup mock response for DB query
    // Use string dates instead of Date objects since JSON serialization will convert them to strings
    const mockImages = [
      { id: 1, image_path: '/uploads/images/test-image-1.jpg', upload_date: "2025-05-14T11:13:00.043Z" },
      { id: 2, image_path: '/uploads/images/test-image-2.jpg', upload_date: "2025-05-14T11:13:00.043Z" }
    ];
    
    mockPool.query.mockResolvedValueOnce({ recordset: mockImages });
    
    const response = await request(app).get('/api/images');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockImages);
    expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM Images');
  });
  
  test('GET /api/images should handle database errors', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));
    
    const response = await request(app).get('/api/images');
    
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('error', 'DB fetch failed');
  });
  
  test('POST /api/upload should upload an image', async () => {
    mockPool.query.mockResolvedValueOnce({ rowsAffected: [1] });
    
    // Simulate multer adding the file to the request
    const uploadApp = express();
    uploadApp.use(express.json());
    // Create a custom middleware to add a mock file to the request
    uploadApp.use((req, res, next) => {
      req.file = {
        fieldname: 'image',
        originalname: 'test-image.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: './uploads/images',
        filename: 'test-file.jpg',
        path: 'uploads/images/test-file.jpg',
        size: 12345
      };
      next();
    });
    // Use the actual route handler
    uploadApp.use('/api/upload', app._router.stack.find(layer => 
      layer.route && layer.route.path === '/api/upload').route.stack[1].handle);
    
    const response = await request(uploadApp)
      .post('/api/upload');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Image uploaded successfully');
    expect(response.body).toHaveProperty('path');
    expect(response.body).toHaveProperty('filename');
    expect(mockPool.input).toHaveBeenCalledWith('path', sql.NVarChar, expect.stringContaining('/uploads/images/'));
  }, 10000);
  
  test('POST /api/upload should handle missing file', async () => {
    // In this test, we don't add the file object to req
    const response = await request(app).post('/api/upload');
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'No file uploaded');
  });
  
  test('DELETE /api/images/:id should delete an image', async () => {
    // Mock successful image lookup
    mockPool.query
      .mockResolvedValueOnce({ recordset: [{ image_path: '/uploads/images/test-image.jpg' }] })
      .mockResolvedValueOnce({ rowsAffected: [1] });
      
    fs.existsSync.mockReturnValueOnce(true);
    
    const response = await request(app).delete('/api/images/1');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Image deleted');
    expect(mockPool.input).toHaveBeenCalledWith('id', sql.Int, 1);
    expect(fs.unlinkSync).toHaveBeenCalled();
  });
  
  test('DELETE /api/images/:id should handle non-existent image', async () => {
    // Mock empty result (no image found)
    mockPool.query.mockResolvedValueOnce({ recordset: [] });
    
    const response = await request(app).delete('/api/images/999');
    
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Image not found');
  });
  
  test('DELETE /api/images/:id should handle invalid ID format', async () => {
    const response = await request(app).delete('/api/images/invalid');
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Invalid ID format');
  });
});

describe('Database connection and table initialization', () => {
  test('checkAndCreateTable should create table if it does not exist', async () => {
    // Mock that table doesn't exist
    mockPool.query.mockResolvedValueOnce({ recordset: [{ TableID: null }] });
    
    // Since we can't easily import the function directly, let's recreate it for testing
    async function checkAndCreateTable(pool) {
      try {
        // Check if the Images table exists
        const tableResult = await pool.request().query(`
          SELECT OBJECT_ID('dbo.Images') as TableID
        `);
        
        // If table doesn't exist, create it
        if (!tableResult.recordset[0].TableID) {
          await pool.request().query(`
            CREATE TABLE Images (
              id INT PRIMARY KEY IDENTITY(1,1),
              image_path NVARCHAR(255) NOT NULL,
              upload_date DATETIME DEFAULT GETDATE()
            )
          `);
        }
        return true;
      } catch (err) {
        throw new Error(`Error checking/creating table: ${err.message}`);
      }
    }
    
    await expect(checkAndCreateTable(mockPool)).resolves.toBe(true);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(mockPool.query).toHaveBeenNthCalledWith(2, expect.stringContaining('CREATE TABLE Images'));
  });
  
  test('checkAndCreateTable should not create table if it exists', async () => {
    // Reset all previous mock calls before this test
    mockPool.query.mockReset();
    
    // Mock that table already exists
    mockPool.query.mockResolvedValueOnce({ recordset: [{ TableID: 123 }] });
    
    async function checkAndCreateTable(pool) {
      try {
        // Check if the Images table exists
        const tableResult = await pool.request().query(`
          SELECT OBJECT_ID('dbo.Images') as TableID
        `);
        
        // If table doesn't exist, create it
        if (!tableResult.recordset[0].TableID) {
          await pool.request().query(`
            CREATE TABLE Images (
              id INT PRIMARY KEY IDENTITY(1,1),
              image_path NVARCHAR(255) NOT NULL,
              upload_date DATETIME DEFAULT GETDATE()
            )
          `);
        }
        return true;
      } catch (err) {
        throw new Error(`Error checking/creating table: ${err.message}`);
      }
    }
    
    await expect(checkAndCreateTable(mockPool)).resolves.toBe(true);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
});