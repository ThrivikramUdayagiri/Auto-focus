/**
 * ProcessingStatus Component
 * 
 * Displays and polls the processing status of a video.
 * Shows progress bar, status messages, and live video preview during processing.
 * Uses binary subdivision frame order for progressive preview.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { Loader, CheckCircle, AlertCircle, Play, Pause, Eye, EyeOff } from 'lucide-react';
import '../styles/ProcessingStatus.css';

const API_BASE_URL = 'http://localhost:8000';

const ProcessingStatus = ({ videoId, isHighlight = false, onComplete }) => {
  const [status, setStatus] = useState({
    status: 'processing',
    progress: 0,
    message: 'Initializing...'
  });
  const [error, setError] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(null);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [currentPreviewFrame, setCurrentPreviewFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const pollIntervalRef = useRef(null);
  const previewIntervalRef = useRef(null);
  const playbackIntervalRef = useRef(null);
  const trackingDataFetchedRef = useRef(false);

  /**
   * Fetch current processing status from the server
   */
  const fetchStatus = async () => {
    try {
      const endpoint = isHighlight
        ? `${API_BASE_URL}/api/highlight-status/${videoId}`
        : `${API_BASE_URL}/api/status/${videoId}`;
      
      const response = await axios.get(endpoint);
      setStatus(response.data);

      // If processing is complete, fetch tracking data
      if (response.data.status === 'completed' && !trackingDataFetchedRef.current) {
        trackingDataFetchedRef.current = true;
        clearInterval(pollIntervalRef.current);
        clearInterval(previewIntervalRef.current);
        
        if (isHighlight) {
          // For highlight, just pass the video URL
          onComplete({
            video_url: response.data.video_url
          });
        } else {
          // For initial processing, fetch tracking data
          try {
            const trackingResponse = await axios.get(
              `${API_BASE_URL}/api/tracking-data/${videoId}`
            );
            onComplete({
              trackingData: trackingResponse.data
            });
          } catch (err) {
            setError('Failed to load tracking data');
          }
        }
      }

      // Handle error state
      if (response.data.status === 'error') {
        clearInterval(pollIntervalRef.current);
        clearInterval(previewIntervalRef.current);
        setError(response.data.message || 'Processing failed');
      }
    } catch (err) {
      console.error('Status fetch error:', err);
      // Don't stop polling on network errors, might be temporary
    }
  };

  /**
   * Fetch preview info (how many frames processed)
   */
  const fetchPreviewInfo = useCallback(async () => {
    if (isHighlight) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/preview/${videoId}/info`);
      setPreviewInfo(response.data);
    } catch (err) {
      console.error('Preview info fetch error:', err);
    }
  }, [videoId, isHighlight]);

  /**
   * Fetch a specific preview frame
   */
  const fetchPreviewFrame = useCallback(async (frameNumber) => {
    if (isHighlight) return;
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/preview/${videoId}/frame/${frameNumber}`
      );
      setPreviewFrame(response.data);
    } catch (err) {
      console.error('Preview frame fetch error:', err);
    }
  }, [videoId, isHighlight]);

  /**
   * Toggle preview visibility
   */
  const togglePreview = () => {
    if (showPreview) {
      // Stopping preview - also stop playback
      setIsPlaying(false);
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    } else {
      // Starting preview - start playback automatically
      if (previewInfo?.preview_available) {
        fetchPreviewFrame(0);
        setCurrentPreviewFrame(0);
        setIsPlaying(true);
      }
    }
    setShowPreview(!showPreview);
  };

  /**
   * Toggle play/pause for video preview
   */
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  /**
   * Effect to handle video playback
   */
  useEffect(() => {
    if (isPlaying && showPreview && previewInfo?.total_frames > 0) {
      // Calculate frame interval based on fps (default 30fps -> ~33ms, but we use 100ms for smoother network)
      const frameInterval = 100; // 10 fps for preview
      
      playbackIntervalRef.current = setInterval(() => {
        setCurrentPreviewFrame(prevFrame => {
          const nextFrame = prevFrame + 3; // Skip some frames for smoother playback
          const maxFrame = previewInfo.total_frames - 1;
          
          // Loop back to start when reaching end
          const newFrame = nextFrame > maxFrame ? 0 : nextFrame;
          fetchPreviewFrame(newFrame);
          return newFrame;
        });
      }, frameInterval);
      
      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
        }
      };
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    }
  }, [isPlaying, showPreview, previewInfo, fetchPreviewFrame]);

  /**
   * Start polling for status updates
   */
  useEffect(() => {
    // Initial fetch
    fetchStatus();
    fetchPreviewInfo();

    // Set up polling interval (every 1 second)
    pollIntervalRef.current = setInterval(fetchStatus, 1000);
    
    // Set up preview info polling (every 2 seconds)
    if (!isHighlight) {
      previewIntervalRef.current = setInterval(fetchPreviewInfo, 2000);
    }

    // Cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    };
  }, [videoId, isHighlight, fetchPreviewInfo]);

  /**
   * Get appropriate status icon
   */
  const getStatusIcon = () => {
    switch (status.status) {
      case 'completed':
        return <CheckCircle size={24} className="status-icon success" />;
      case 'error':
        return <AlertCircle size={24} className="status-icon error" />;
      default:
        return <Loader size={24} className="status-icon spinning" />;
    }
  };

  /**
   * Get status label text
   */
  const getStatusLabel = () => {
    switch (status.status) {
      case 'uploaded':
        return 'Preparing...';
      case 'processing':
        return 'Processing';
      case 'completed':
        return 'Complete!';
      case 'error':
        return 'Error';
      default:
        return 'Initializing...';
    }
  };

  return (
    <div className="processing-status">
      {/* Status Header */}
      <div className="status-header">
        {getStatusIcon()}
        <span className="status-label">{getStatusLabel()}</span>
        
        {/* Preview Toggle Button - Only show during processing, not for highlights */}
        {!isHighlight && status.status === 'processing' && previewInfo?.preview_available && (
          <button 
            className="preview-toggle-btn"
            onClick={togglePreview}
            title={showPreview ? "Hide Preview" : "Show Preview"}
          >
            {showPreview ? <EyeOff size={18} /> : <Eye size={18} />}
            <span>{showPreview ? "Hide Preview" : "Show Preview"}</span>
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="progress-container">
        <div className="progress-bar">
          <div
            className={`progress-fill ${status.status === 'error' ? 'error' : ''}`}
            style={{ width: `${status.progress}%` }}
          />
        </div>
        <span className="progress-percentage">{status.progress}%</span>
      </div>

      {/* Status Message */}
      <div className="status-message">
        {status.message}
      </div>

      {/* Preview Info */}
      {!isHighlight && status.status === 'processing' && previewInfo && (
        <div className="preview-info">
          <span className="preview-info-text">
            Frames processed: {previewInfo.processed_frames || 0} / {previewInfo.total_frames || 0}
          </span>
          <span className="preview-info-text binary-hint">
            (Binary subdivision order for quick preview)
          </span>
        </div>
      )}

      {/* Live Preview Panel - Video Playback */}
      {showPreview && !isHighlight && (
        <div className="preview-panel">
          <div className="preview-header">
            <span>Live Video Preview</span>
            <span className="frame-indicator">
              Frame: {currentPreviewFrame + 1} / {previewInfo?.total_frames || 0}
              {previewFrame && !previewFrame.is_exact_match && <span className="nearest-label"> (nearest available)</span>}
            </span>
          </div>
          <div className="preview-video-container">
            {previewFrame ? (
              <img 
                src={`data:image/jpeg;base64,${previewFrame.image}`} 
                alt="Preview frame"
                className="preview-image"
              />
            ) : (
              <div className="preview-loading">
                <Loader size={32} className="spinning" />
                <span>Loading preview...</span>
              </div>
            )}
            {previewFrame?.frame_data?.players?.length > 0 && (
              <div className="preview-players-info">
                {previewFrame.frame_data.players.length} player(s) detected
              </div>
            )}
            {/* Play/Pause Overlay Button */}
            <button 
              className="preview-play-overlay"
              onClick={togglePlayback}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={48} /> : <Play size={48} />}
            </button>
          </div>
          <div className="preview-controls">
            <button 
              onClick={togglePlayback} 
              className={`preview-play-btn ${isPlaying ? 'playing' : ''}`}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <div className="preview-progress-bar">
              <div 
                className="preview-progress-fill"
                style={{ width: `${((currentPreviewFrame + 1) / (previewInfo?.total_frames || 1)) * 100}%` }}
              />
            </div>
            <span className="preview-time">
              {Math.floor(currentPreviewFrame / 30)}s / {Math.floor((previewInfo?.total_frames || 0) / 30)}s
            </span>
          </div>
        </div>
      )}

      {/* Processing Steps */}
      {!isHighlight && status.status === 'processing' && (
        <div className="processing-steps">
          <div className={`step ${status.progress > 0 ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Detecting Players</span>
          </div>
          <div className={`step ${status.progress > 30 ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Extracting Masks</span>
          </div>
          <div className={`step ${status.progress > 60 ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Tracking IDs</span>
          </div>
          <div className={`step ${status.progress > 90 ? 'active' : ''}`}>
            <span className="step-number">4</span>
            <span className="step-label">Generating Preview</span>
          </div>
        </div>
      )}

      {/* Highlight Processing Steps */}
      {isHighlight && status.status === 'processing' && (
        <div className="processing-steps">
          <div className={`step ${status.progress > 0 ? 'active' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Loading Masks</span>
          </div>
          <div className={`step ${status.progress > 30 ? 'active' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Applying Glow</span>
          </div>
          <div className={`step ${status.progress > 60 ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Blurring Others</span>
          </div>
          <div className={`step ${status.progress > 90 ? 'active' : ''}`}>
            <span className="step-number">4</span>
            <span className="step-label">Encoding Video</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Animated Background */}
      <div className="processing-animation">
        <div className="wave wave1" />
        <div className="wave wave2" />
        <div className="wave wave3" />
      </div>
    </div>
  );
};

export default ProcessingStatus;
