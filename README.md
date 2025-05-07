# Image Uploader Application

A full-stack application for uploading and managing images with SQL Server storage, featuring a React frontend and Node.js backend.

![Application Screenshot](./public/screenshot.png)

## Features

- **Drag & Drop** image upload interface
- **Image Gallery** with thumbnail previews
- **Delete functionality** for uploaded images
- **SQL Server** backend storage
- **Responsive design** works on all devices
- **Secure file validation** (type and size)

## Prerequisites

- Node.js 18+
- SQL Server 2019+
- Windows/Linux/macOS

## Installation

### 1. Backend Setup

```bash
cd backend
npm install

Create a config.json file in the backend directory:

json
{
  "sql": {
    "server": "your-server\\instance",
    "user": "your-username",
    "password": "your-password",
    "database": "ImageUploader",
    "options": {
      "encrypt": false,
      "trustServerCertificate": true
    }
  },
  "app": {
    "port": 3001,
    "uploadDir": "./uploads"
  }
}


2. Frontend Setup
bash
cd frontend
npm install


cd frontend
npm start

Copy build to backend:

bash
xcopy /E /I /Y frontend\\build backend\\public


Run production server:

bash
cd backend
npm start


Packaging as Executable
Install pkg:

bash
npm install -g pkg
Package the backend:

bash
cd backend
npm run package
This will create an ImageUploader.exe file.

API Endpoints
POST /upload - Upload an image

GET /images - Get all images

DELETE /images/:id - Delete an image

Troubleshooting
Database Connection Issues:

Verify SQL Server is running

Check TCP/IP is enabled in SQL Config Manager

Confirm credentials in config.json

File Upload Issues:

Ensure uploads directory exists

Check file size limit (5MB default)

Verify file type (JPEG/PNG/GIF only)

"# image-uploder" 
