'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Initialize camera with max resolution
  const initCamera = useCallback(async () => {
    try {
      // Request max resolution with 3:4 aspect ratio preference
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: 'environment', // Back camera on mobile
          width: { ideal: 4096 },
          height: { ideal: 3072 }, // 3:4 aspect ratio
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please allow camera permissions.');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [initCamera]);

  // Clear stream on change
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Capture photo at max resolution
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Use actual video dimensions for max quality
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get max quality JPEG
    const imageData = canvas.toDataURL('image/jpeg', 1.0);

    // Send to API
    await analyzeImage(imageData);
  };

  // Send image to Claude API
  const analyzeImage = async (imageData: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          prompt: 'What do you see in this image? Be concise and helpful.',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze image');
      }

      setResponse(data.response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze image');
    } finally {
      setLoading(false);
    }
  };

  // Clear error after 4 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="app-container">
      {/* Response overlay */}
      {response && (
        <div className="response-overlay">
          <div className="response-header">
            <span className="response-label">Claude Response</span>
            <button
              className="close-btn"
              onClick={() => setResponse(null)}
              aria-label="Close response"
            >
              ×
            </button>
          </div>
          <p className="response-text">{response}</p>
        </div>
      )}

      {/* Camera view */}
      <div className="camera-container">
        {!cameraReady && !error && (
          <div className="camera-placeholder">
            <svg className="camera-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Initializing camera...</span>
          </div>
        )}

        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
          style={{ display: cameraReady ? 'block' : 'none' }}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="loading-container">
            <div className="spinner" />
            <span className="loading-text">Analyzing with Claude...</span>
          </div>
        )}

        {/* Capture button */}
        <div className="controls">
          <button
            className="capture-btn"
            onClick={capturePhoto}
            disabled={!cameraReady || loading}
            aria-label="Take photo"
          >
            <div className="capture-btn-inner" />
          </button>
        </div>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden-canvas" />

      {/* Error toast */}
      {error && (
        <div className="error-toast">
          {error}
        </div>
      )}
    </div>
  );
}
