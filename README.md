# Image Uploader Application

A full-stack application for uploading and managing images with SQL Server storage, featuring a React frontend and Node.js backend.

![Application Screenshot](./public/screenshot.png)

## Features

- ✅ **Drag & Drop** image upload interface  
- 🖼️ **Image Gallery** with thumbnail previews  
- 🗑️ **Delete functionality** for uploaded images  
- 🗄️ **SQL Server** backend storage  
- 🔄 **Custom port configuration** for testing flexibility
- 📱 **Responsive design**  
- 🔐 **Secure file validation** (type and size)

---

## 🧰 Prerequisites

- Node.js v18+
- SQL Server 2019+ with **TCP/IP enabled on port 1433**
- Git (for cloning repo)
- Windows/Linux/macOS

---

## 🚀 Installation Instructions

### 1. 📦 Backend Setup

```bash
cd backend
npm install 
```

Then create a `config.json` file inside the `backend` directory:

```json
{
    "user": "ImageUploaderApp2",
    "password": "ImageUploaderApp2",
    "server": "DESKTOP-89EE1FR\\MSSQLSERVER01",
    "database": "ImageUploadDB",
    "port":3001
  }
  
```

> ⚠️ **Ensure port 1433 is enabled in SQL Server Configuration Manager under TCP/IP settings**

---

### 2. 🎨 Frontend Setup

```bash
cd ../frontend
npm install --legacy-peer-deps

```

### 3. 🔨 Build Both Frontend and Backend

```bash
# Build frontend
# cd frontend -> You must be now at the frontend folder, no need to cd
npm run build

# Build backend
cd ../backend
npm run build
```

---

## ▶️ Run in Development Mode

**Backend:**

```bash
cd backend
npm start
```

**Frontend (optional for dev) {Not really needed}:**

```bash
cd frontend
npm start
```

---

## 📦 Packaging as Standalone Executable

To bundle everything into a single `.exe`:

### 1. Package Backend

```bash
cd ../backend
npm run package #x2 times
#one for puplic creation with an index dummy file
#second for importing built public folder from frontend/public to
#backend/public to dist/public
```

This will generate a `dist/` directory containing:
- `ImageUploader.exe`
- `public/` folder (frontend build)
- `uploads/` folder (for uploaded files)
- `config.json/` (runtime configuration)

> 🗂️ The `dist` folder contains everything needed to run the app as a standalone executable on Windows.

---
Packaged Executable

🚪 Port Configuration Guide

Set port in .env file:
PORT=4000  # Your custom port

Development Environment

1. First Run:

- Prompts: Would you like to set a custom port? (y/n) [default: 3001]:

- Enter y and specify port (e.g., 5000)

- Saves to config.json

2. Subsequent Runs:
- Uses port from config.json

3. Reset to Default:
- Delete config.json to revert to port 3001

💡 Port Priority:

1. .env (development)

2. config.json (production)

3. User prompt (first EXE run)

4. Default 3001





## 🌐 API Endpoints

| Method | Endpoint        | Description        |
|--------|------------------|--------------------|
| POST   | `/api/upload`        | Upload an image    |
| GET    | `/api/images`        | Get all images     |
| DELETE | `/api/images/:id`    | Delete an image    |

---

## 🛠️ Troubleshooting

### ✅ Database Connection Issues

- Ensure SQL Server is **running**
- Enable **TCP/IP** and set port **1433**
- Double-check your **credentials** in `config.json`
- Verify that the SQL database `ImageUploader` exists

### ✅ File Upload Issues

- Ensure the `uploads/` directory exists in the backend
- Ensure the `public/` directory exists in the backend with the same components of the front end `public/` directory
- Default size limit is **5MB**
- Only **JPEG/PNG/GIF** files are allowed

🧹 Clean Installation
To start fresh:

1. Delete backend/config.json

2. Delete backend/uploads/ folder

3. Rebuild frontend and backend



Jest Unit test Documentation:
https://docs.google.com/document/d/17hBR5aBIevJ4_v_e5Y-Zmw75FRHiyQwEwf77p_ryG_4/edit?usp=sharing
