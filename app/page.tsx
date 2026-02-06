'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

type FacingMode = 'environment' | 'user';

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');

  // Initialize camera with max resolution
  const initCamera = useCallback(async (facing: FacingMode) => {
    // Stop existing stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    setCameraReady(false);

    try {
      // Request max resolution with 3:4 aspect ratio preference
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
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
  }, [stream]);

  // Initialize on mount
  useEffect(() => {
    initCamera(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Switch camera
  const switchCamera = () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    initCamera(newFacing);
  };

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

    // Mirror the image if using front camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Draw frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get max quality JPEG
    const imageData = canvas.toDataURL('image/jpeg', 1.0);

    // Send to API
    await analyzeImage(imageData);
  };

  // Send image to Claude API with streaming
  const analyzeImage = async (imageData: string) => {
    setLoading(true);
    setError(null);
    setResponse('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          prompt: 'What do you see in this image? Be concise and helpful.',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to analyze image');
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                setResponse(fullText);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze image');
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
      {(response || loading) && (
        <div className="response-overlay">
          <div className="response-header">
            <span className="response-label">
              {loading && !response ? 'Analyzing...' : 'Claude Response'}
            </span>
            <button
              className="close-btn"
              onClick={() => { setResponse(null); setLoading(false); }}
              aria-label="Close response"
            >
              ×
            </button>
          </div>
          <p className="response-text">
            {response || 'Processing image...'}
            {loading && <span className="cursor">▋</span>}
          </p>
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
          style={{
            display: cameraReady ? 'block' : 'none',
            transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
          }}
        />
      </div>

      {/* Controls below camera */}
      <div className="controls">
        <button
          className="switch-btn"
          onClick={switchCamera}
          disabled={loading}
          aria-label="Switch camera"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <path d="M9 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />
            <path d="M17 8l-2 2m0-2l2 2" />
          </svg>
        </button>

        <button
          className="capture-btn"
          onClick={capturePhoto}
          disabled={!cameraReady || loading}
          aria-label="Take photo"
        >
          <div className="capture-btn-inner" />
        </button>

        {/* Placeholder for symmetry */}
        <div className="switch-btn-placeholder" />
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
