import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { useReactMediaRecorder } from 'react-media-recorder';
import './App.css';

function App() {
  // --- AUTHENTICATION STATE ---
  const [authToken, setAuthToken] = useState(localStorage.getItem("token") || null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authError, setAuthError] = useState(null);

  // --- INTERVIEW STATE ---
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sessionData, setSessionData] = useState(null);
  const [error, setError] = useState(null);
  
  const [audioResults, setAudioResults] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [code, setCode] = useState("");
  const [codeResult, setCodeResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const [engagement, setEngagement] = useState("Initializing...");
  const engagementHistoryRef = useRef([]);
  
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState(null);

  const webcamRef = useRef(null);

  // --- WEBSOCKET FOR GAZE TRACKING ---
  useEffect(() => {
    if (!sessionData || reportData) return;

    const ws = new WebSocket("ws://localhost:8000/ws/video-stream");
    let intervalId;

    ws.onopen = () => {
      intervalId = setInterval(() => {
        if (webcamRef.current) {
          const imageSrc = webcamRef.current.getScreenshot();
          if (imageSrc) ws.send(imageSrc);
        }
      }, 1000); 
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setEngagement(data.engagement);
      engagementHistoryRef.current.push(data.engagement);
    };

    ws.onclose = () => clearInterval(intervalId);
    return () => { clearInterval(intervalId); ws.close(); };
  }, [sessionData, reportData]);

  // --- AUDIO RECORDING HOOK ---
  const { status, startRecording, stopRecording } = useReactMediaRecorder({
    audio: true,
    video: false,
    onStop: async (blobUrl, blob) => {
      setIsAnalyzing(true);
      const audioFile = new File([blob], "candidate_answer.webm", { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioFile);

      try {
        const response = await fetch("http://localhost:8000/api/analyze-audio/", {method: "POST", headers: { "Authorization": `Bearer ${authToken}` }, body: formData });
        const data = await response.json();
        setAudioResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsAnalyzing(false);
      }
    }
  });

  // --- AUTHENTICATION HANDLER ---
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);
    const endpoint = isLoginMode ? "/api/login/" : "/api/signup/";
    
    try {
      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.detail || "Authentication failed");
      
      localStorage.setItem("token", data.access_token);
      setAuthToken(data.access_token);
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setAuthToken(null);
    setSessionData(null);
    setReportData(null);
  };

  // --- INTERVIEW HANDLERS ---
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/upload-cv/", { method: "POST", headers: { "Authorization": `Bearer ${authToken}` }, body: formData });
      const data = await response.json();
      setSessionData(data);
    } catch (err) {
      setError("Failed to upload CV.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async () => {
    if (!code.trim()) return;
    setIsExecuting(true);
    try {
      const response = await fetch("http://localhost:8000/api/execute-code/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` }, 
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      setCodeResult(data);
    } catch (err) {
      setCodeResult({ status: "error", output: "Execution engine unreachable." });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEndInterview = async () => {
    setIsGeneratingReport(true);
    const history = engagementHistoryRef.current;
    const engagedFrames = history.filter(status => status === "Engaged").length;
    const engagementScore = history.length > 0 ? ((engagedFrames / history.length) * 100).toFixed(1) : 100.0;

    const payload = {
      question: sessionData.interview_questions,
      transcript: audioResults ? audioResults.transcript : "No verbal answer provided.",
      code: code || "No code written.",
      code_output: codeResult ? codeResult.output : "Code was not executed.",
      filler_words: audioResults ? audioResults.filler_words_detected : 0,
      engagement_score: parseFloat(engagementScore)
    };

    try {
      const response = await fetch("http://localhost:8000/api/generate-report/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setReportData(data);
    } catch (err) {
      alert("Error generating report.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // ==========================================
  // VIEW 0: AUTHENTICATION SCREEN
  // ==========================================
  if (!authToken) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f4f6f8', fontFamily: 'sans-serif' }}>
        <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
          <h1 style={{ textAlign: 'center', color: '#0d6efd', margin: '0 0 10px 0' }}>InterViewX</h1>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '30px' }}>AI-Augmented Assessment Platform</p>
          
          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <input 
              type="email" 
              placeholder="Email address" 
              value={authEmail} 
              onChange={(e) => setAuthEmail(e.target.value)} 
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px' }}
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={authPassword} 
              onChange={(e) => setAuthPassword(e.target.value)} 
              required
              style={{ padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px' }}
            />
            {authError && <p style={{ color: '#dc3545', fontSize: '14px', margin: 0 }}>{authError}</p>}
            <button type="submit" style={{ padding: '14px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
              {isLoginMode ? "Sign In" : "Create Account"}
            </button>
          </form>
          
          <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px' }}>
            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => setIsLoginMode(!isLoginMode)} style={{ color: '#0d6efd', cursor: 'pointer', fontWeight: 'bold' }}>
              {isLoginMode ? "Sign up" : "Log in"}
            </span>
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 3: THE FINAL REPORT SCREEN
  // ==========================================
  if (reportData) {
    const evaluation = reportData.llm_evaluation;
    const metrics = reportData.metrics;

    return (
      <div style={{ padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
          <h1 style={{ textAlign: 'center', color: '#333', borderBottom: '2px solid #0d6efd', paddingBottom: '20px' }}>InterViewX Performance Report</h1>
          
          <div style={{ display: 'flex', justifyContent: 'space-around', margin: '40px 0', textAlign: 'center' }}>
            <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', width: '25%' }}>
              <h1 style={{ margin: '0', color: metrics.engagement_score > 80 ? '#198754' : '#dc3545' }}>{metrics.engagement_score}%</h1>
              <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: '#555' }}>Visual Engagement</p>
            </div>
            <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', width: '25%' }}>
              <h1 style={{ margin: '0', color: metrics.filler_words > 5 ? '#dc3545' : '#198754' }}>{metrics.filler_words}</h1>
              <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: '#555' }}>Filler Words</p>
            </div>
            <div style={{ padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px', width: '25%' }}>
              <h1 style={{ margin: '0', color: '#0d6efd' }}>{evaluation.final_verdict.includes('hire') || evaluation.final_verdict.includes('Strong') ? 'PASS' : 'REVIEW'}</h1>
              <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', color: '#555' }}>System Verdict</p>
            </div>
          </div>

          <h3 style={{ color: '#0d6efd', marginTop: '30px' }}>Technical Accuracy</h3>
          <p style={{ lineHeight: '1.6', color: '#444' }}>{evaluation.technical_accuracy}</p>

          <h3 style={{ color: '#0d6efd', marginTop: '30px' }}>Communication Skills</h3>
          <p style={{ lineHeight: '1.6', color: '#444' }}>{evaluation.communication_skills}</p>

          <h3 style={{ color: '#0d6efd', marginTop: '30px' }}>Areas for Improvement</h3>
          <p style={{ lineHeight: '1.6', color: '#444' }}>{evaluation.areas_for_improvement}</p>

          <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#e9f2ff', borderRadius: '8px', borderLeft: '5px solid #0d6efd' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#0d6efd' }}>Final Verdict</h4>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#333' }}>{evaluation.final_verdict}</p>
          </div>
          
          <button onClick={() => { setReportData(null); setSessionData(null); }} style={{ display: 'block', width: '100%', padding: '15px', marginTop: '40px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', cursor: 'pointer' }}>
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 1: THE UPLOAD SCREEN
  // ==========================================
  if (!sessionData) {
    return (
      <div style={{ padding: '50px', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <h1 style={{ margin: 0, color: '#0d6efd' }}>InterViewX</h1>
          <button onClick={handleLogout} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Log Out</button>
        </div>
        <div style={{ margin: '0 auto', padding: '30px', maxWidth: '500px', border: '1px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>Upload your CV to begin</h3>
          <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files[0])} style={{ margin: '20px 0' }} />
          <br />
          <button onClick={handleUpload} disabled={loading} style={{ padding: '12px 24px', backgroundColor: '#0d6efd', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '16px' }}>
            {loading ? "Generating Session..." : "Initialize Sandbox & Start Interview"}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: THE LIVE INTERVIEW DASHBOARD
  // ==========================================
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#333' }}>InterViewX Session Active</h2>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span style={{ backgroundColor: engagement === "Engaged" ? '#198754' : '#ffc107', color: engagement === "Engaged" ? 'white' : 'black', padding: '5px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' }}>
            👁️ Status: {engagement}
          </span>
          <button 
            onClick={handleEndInterview} 
            disabled={isGeneratingReport}
            style={{ backgroundColor: '#dc3545', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isGeneratingReport ? "Generating Report..." : "End Interview"}
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', height: '300px' }}>
            <Webcam audio={true} ref={webcamRef} muted={true} screenshotFormat="image/jpeg" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: '#0d6efd' }}>Verbal Response</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px' }}>
              <button onClick={startRecording} disabled={status === 'recording'} style={{ padding: '8px 16px', backgroundColor: status === 'recording' ? '#ccc' : '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Start Answering</button>
              <button onClick={stopRecording} disabled={status !== 'recording'} style={{ padding: '8px 16px', backgroundColor: status !== 'recording' ? '#ccc' : '#198754', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Stop & Submit</button>
            </div>
            {isAnalyzing && <p style={{ color: '#0d6efd', fontWeight: 'bold' }}>Analyzing via Whisper...</p>}
            {audioResults && !isAnalyzing && (
              <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #0d6efd' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}><strong>Transcript:</strong> {audioResults.transcript}</p>
                <p style={{ margin: 0, color: '#dc3545', fontWeight: 'bold' }}>⚠️ Filler Words: {audioResults.filler_words_detected}</p>
              </div>
            )}
          </div>

          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, color: '#0d6efd' }}>Current Question</h3>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '15px', color: '#444' }}>{sessionData.interview_questions}</pre>
          </div>
        </div>

        <div style={{ flex: '1.5', backgroundColor: '#1e1e1e', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#ccc', fontFamily: 'monospace' }}>Docker Sandbox (Python 3.11)</span>
            <button onClick={handleCodeSubmit} disabled={isExecuting} style={{ padding: '8px 16px', backgroundColor: isExecuting ? '#6c757d' : '#198754', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {isExecuting ? "Executing..." : "▶ Run Code"}
            </button>
          </div>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="# Write your Python solution here..." style={{ flex: 1, backgroundColor: '#2d2d2d', color: '#d4d4d4', fontFamily: 'monospace', fontSize: '16px', padding: '15px', border: '1px solid #444', borderRadius: '8px', resize: 'none', outline: 'none' }} />
          <div style={{ height: '150px', backgroundColor: '#000', borderRadius: '8px', padding: '15px', overflowY: 'auto', border: '1px solid #333' }}>
            {codeResult ? <pre style={{ margin: 0, color: codeResult.status === 'success' ? '#0f0' : '#f00', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{codeResult.output}</pre> : <span style={{ color: '#555', fontFamily: 'monospace' }}>Awaiting execution...</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;