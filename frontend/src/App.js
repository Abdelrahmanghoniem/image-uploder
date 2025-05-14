import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { FaTimes } from 'react-icons/fa';
import './App.css';

// Use relative paths in production, absolute in development
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3000/api'
});

function App() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.gif'] },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (!acceptedFiles.length) return;
      
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('image', acceptedFiles[0]);

      try {
        await api.post('/upload', formData);
        await fetchImages();
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setUploading(false);
      }
    }
  });

  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/images');
      setImages(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;
    
    try {
      await api.delete(`/images/${id}`);
      setImages(prev => prev.filter(img => img.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete image');
    }
  };

  useEffect(() => { fetchImages(); }, []);

  return (
    <div className="app-container">
      <h1>Image Uploader</h1>
      
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="upload-status">
            <div className="spinner"></div>
            <p>Uploading...</p>
          </div>
        ) : (
          <>
            <p>{isDragActive ? 'Drop image here' : 'Drag & drop image, or click to select'}</p>
            <small>JPEG, PNG, GIF (Max 5MB)</small>
          </>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading images...</p>
        </div>
      ) : images.length > 0 ? (
        <div className="gallery-container">
          <h2>Uploaded Images</h2>
          <div className="images-grid">
            {images.map((img) => (
              <div key={img.id} className="image-card">
                <button className="delete-button" onClick={() => handleDelete(img.id)}>
                  <FaTimes />
                </button>
                <img 
                  src={img.image_path.startsWith('/') ? img.image_path : `/${img.image_path}`}
                  alt={`Uploaded content ${img.id}`}
                  className="image-preview"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No images uploaded yet</p>
        </div>
      )}
    </div>
  );
}

export default App;