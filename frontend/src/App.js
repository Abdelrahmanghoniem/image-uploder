import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { FaTimes } from 'react-icons/fa';
import './App.css';

function App() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif']
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      
      setUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append('image', acceptedFiles[0]);

      try {
        await axios.post('http://localhost:3001/upload', formData);
        await fetchImages();
      } catch (err) {
        setError(err.response?.data?.message || err.message);
      } finally {
        setUploading(false);
      }
    }
  });

  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:3001/images');
      setImages(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this image?')) return;
    
    try {
      await axios.delete(`http://localhost:3001/images/${id}`);
      setImages(prev => prev.filter(img => img.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete image');
    }
  };

  useEffect(() => { 
    fetchImages(); 
  }, []);

  return (
    <div className="app-container">
      <h1>Image Uploader</h1>
      
      <div 
        {...getRootProps()} 
        className={`dropzone ${isDragActive ? 'active' : ''}`}
      >
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
                <button 
                  className="delete-button"
                  onClick={() => handleDelete(img.id)}
                  aria-label="Delete image"
                >
                  <FaTimes />
                </button>
                <img 
                  src={`http://localhost:3001${img.image_path}`} 
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