'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

type FacingMode = 'environment' | 'user';

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');

  // Initialize camera with max resolution
  const initCamera = useCallback(async (facing: FacingMode) => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setCameraReady(false);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facing,
          width: { ideal: 4096 },
          height: { ideal: 3072 },
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
      setError('Could not access camera');
    }
  }, [stream]);

  useEffect(() => {
    initCamera(facingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [stream]);

  // Auto-scroll response
  useEffect(() => {
    if (responseRef.current && response) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  const switchCamera = () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    initCamera(newFacing);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Get original dimensions
    let width = video.videoWidth;
    let height = video.videoHeight;

    // Resize if too large (max 1920px on longest side for API limits)
    const MAX_SIZE = 1920;
    if (width > MAX_SIZE || height > MAX_SIZE) {
      if (width > height) {
        height = Math.round((height * MAX_SIZE) / width);
        width = MAX_SIZE;
      } else {
        width = Math.round((width * MAX_SIZE) / height);
        height = MAX_SIZE;
      }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Use 0.85 quality for good balance of quality and size
    const imageData = canvas.toDataURL('image/jpeg', 0.85);
    await analyzeImage(imageData);
  };

  const analyzeImage = async (imageData: string) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);
    setResponse('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to analyze image');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abortController.signal.aborted) {
          reader.cancel();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                setResponse(fullText);
              }
            } catch {
              // Skip
            }
          }
        }
      }

      if (!abortController.signal.aborted) setLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to analyze image');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="app-container">
      {/* Response area - ALWAYS present, fixed size */}
      <div className="response-area" ref={responseRef}>
        <div className="response-header">
          <span className="response-label">
            {loading ? 'Analyzing...' : 'Response'}
          </span>
        </div>
        {response ? (
          <p className="response-text">
            {response}
            {loading && <span className="cursor">▋</span>}
          </p>
        ) : (
          <p className="response-placeholder">
            {loading ? 'Processing image...' : 'Take a photo to analyze'}
          </p>
        )}
      </div>

      {/* Camera area - ALWAYS centered */}
      <div className="camera-area">
        <div className="camera-container">
          {!cameraReady && !error && (
            <div className="camera-placeholder">
              <svg className="camera-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Initializing...</span>
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
      </div>

      {/* Controls - ALWAYS at bottom */}
      <div className="controls">
        <button className="switch-btn" onClick={switchCamera} aria-label="Switch camera">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <path d="M9 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0" />
            <path d="M17 8l-2 2m0-2l2 2" />
          </svg>
        </button>

        <button
          className="capture-btn"
          onClick={capturePhoto}
          disabled={!cameraReady}
          aria-label="Take photo"
        >
          <div className="capture-btn-inner" />
        </button>

        <div className="switch-btn-placeholder" />
      </div>

      <canvas ref={canvasRef} className="hidden-canvas" />

      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
