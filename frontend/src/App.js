import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useReactMediaRecorder } from 'react-media-recorder';
import './App.css';

function App() {
  // CV & Session State
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [error, setError] = useState(null);
  
  // Audio Analysis State
  const [audioResults, setAudioResults] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Code Execution State
  const [code, setCode] = useState("");
  const [codeResult, setCodeResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Gaze Tracking State
  const [engagement, setEngagement] = useState("Initializing...");
  
  const webcamRef = useRef(null);

  // Set up WebSocket for real-time video processing
  useEffect(() => {
    // Only connect if the session is active (dashboard is visible)
    if (!sessionData) return;

    const ws = new WebSocket("ws://localhost:8000/ws/video-stream");
    let intervalId;

    ws.onopen = () => {
      console.log("WebSocket connected for gaze tracking");
      // Grab a frame from the webcam every 1 second (1000ms)
      intervalId = setInterval(() => {
        if (webcamRef.current) {
          // getScreenshot() returns a base64 encoded JPEG
          const imageSrc = webcamRef.current.getScreenshot();
          if (imageSrc) {
            ws.send(imageSrc);
          }
        }
      }, 1000); 
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEngagement(data.engagement);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      clearInterval(intervalId);
    };

    // Cleanup when component unmounts
    return () => {
      clearInterval(intervalId);
      ws.close();
    };
  }, [sessionData]);

  // Microphone Hook
  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    video: false,
    onStop: async (blobUrl, blob) => {
      setIsAnalyzing(true);
      const audioFile = new File([blob], "candidate_answer.webm", { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioFile);

      try {
        const response = await fetch("http://localhost:8000/api/analyze-audio/", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Audio analysis failed.");
        const data = await response.json();
        setAudioResults(data);
      } catch (err) {
        console.error(err);
        setAudioResults({ error: "Failed to analyze audio." });
      } finally {
        setIsAnalyzing(false);
      }
    }
  });

  const handleFileChange = (event) => {
    setFile(event.target.files[0]);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/upload-cv/", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Failed to process the CV.");
      const data = await response.json();
      setSessionData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async () => {
    if (!code.trim()) return;
    setIsExecuting(true);
    setCodeResult(null);

    try {
      const response = await fetch("http://localhost:8000/api/execute-code/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code }),
      });
      if (!response.ok) throw new Error("Failed to execute code.");
      const data = await response.json();
      setCodeResult(data);
    } catch (err) {
      console.error(err);
      setCodeResult({ status: "error", output: "Execution engine unreachable." });
    } finally {
      setIsExecuting(false);
    }
  };

  // VIEW 1: The Upload Screen
  if (!sessionData) {
    return (
      <div style={{ padding: '50px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h1>InterViewX</h1>
        <p>AI-Augmented Technical Assessment Platform</p>
        <div style={{ margin: '40px auto', padding: '30px', maxWidth: '500px', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>Upload your CV to begin</h3>
          <input type="file" accept=".pdf" onChange={handleFileChange} style={{ margin: '20px 0' }} />
          <br />
          <button onClick={handleUpload} disabled={loading} style={{ padding: '12px 24px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>
            {loading ? "Generating Session..." : "Initialize Sandbox & Start Interview"}
          </button>
          {error && <p style={{ color: 'red', marginTop: '15px' }}>{error}</p>}
        </div>
      </div>
    );
  }

  // VIEW 2: The Live Interview Dashboard
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#333' }}>InterViewX Session Active</h2>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {/* Engagement Status Badge */}
          <span style={{ 
            backgroundColor: engagement === "Engaged" ? '#198754' : '#ffc107', 
            color: engagement === "Engaged" ? 'white' : 'black', 
            padding: '5px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' 
          }}>
            👁️ Status: {engagement}
          </span>
          <span style={{ backgroundColor: '#dc3545', color: 'white', padding: '5px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' }}>
            ⏺ Recording
          </span>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Left Column */}
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', height: '300px', position: 'relative' }}>
            <Webcam 
              audio={true} 
              ref={webcamRef} 
              muted={true} 
              screenshotFormat="image/jpeg" // Required to capture frames
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
            />
          </div>

          {/* Audio Controls */}
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: '#0d6efd' }}>Verbal Response</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={startRecording} disabled={status === 'recording'} style={{ padding: '8px 16px', backgroundColor: status === 'recording' ? '#ccc' : '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Start Answering</button>
              <button onClick={stopRecording} disabled={status !== 'recording'} style={{ padding: '8px 16px', backgroundColor: status !== 'recording' ? '#ccc' : '#198754', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Stop & Submit</button>
              <span style={{ fontSize: '14px', color: '#666', fontWeight: 'bold' }}>Status: {status === 'recording' ? '🔴 Recording...' : status}</span>
            </div>
            {isAnalyzing && <p style={{ color: '#0d6efd', fontWeight: 'bold' }}>Analyzing response via Whisper LLM...</p>}
            {audioResults && !isAnalyzing && (
              <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #0d6efd' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}><strong>Transcript:</strong> {audioResults.transcript}</p>
                <p style={{ margin: 0, color: '#dc3545', fontWeight: 'bold' }}>⚠️ Filler Words: {audioResults.filler_words_detected}</p>
              </div>
            )}
          </div>

          {/* Current Question */}
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: '#0d6efd' }}>Current Question</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '15px', color: '#444' }}>
              {sessionData.interview_questions}
            </pre>
          </div>
        </div>

        {/* Right Column: Editor */}
        <div style={{ flex: '1.5', backgroundColor: '#1e1e1e', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#ccc', fontFamily: 'monospace' }}>Docker Sandbox (Python 3.11)</span>
            <button onClick={handleCodeSubmit} disabled={isExecuting} style={{ padding: '8px 16px', backgroundColor: isExecuting ? '#6c757d' : '#198754', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {isExecuting ? "Executing..." : "▶ Run Code"}
            </button>
          </div>
          
          <textarea 
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="# Write your Python solution here..."
            style={{ flex: 1, backgroundColor: '#2d2d2d', color: '#d4d4d4', fontFamily: 'monospace', fontSize: '16px', padding: '15px', border: '1px solid #444', borderRadius: '8px', resize: 'none', outline: 'none' }}
          />

          <div style={{ height: '150px', backgroundColor: '#000', borderRadius: '8px', padding: '15px', overflowY: 'auto', border: '1px solid #333' }}>
            <span style={{ color: '#888', fontFamily: 'monospace', fontSize: '12px', display: 'block', marginBottom: '5px' }}>--- Console Output ---</span>
            {codeResult ? (
              <>
                <pre style={{ margin: 0, color: codeResult.status === 'success' ? '#0f0' : '#f00', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                  {codeResult.output || "No output returned."}
                </pre>
                {codeResult.execution_time_ms && (
                  <span style={{ display: 'block', marginTop: '10px', color: '#888', fontSize: '12px', fontFamily: 'monospace' }}>
                    [Finished in {codeResult.execution_time_ms}ms]
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: '#555', fontFamily: 'monospace' }}>Awaiting execution...</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;