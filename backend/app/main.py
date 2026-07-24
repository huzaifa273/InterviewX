from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import PyPDF2
import io
import spacy
from openai import AsyncOpenAI
import whisper
import os
import tempfile
import docker
import time
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
import cv2
import mediapipe as mp
import numpy as np
import base64

app = FastAPI(title="InterViewX API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Allows your React app to connect
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the English NLP model
nlp = spacy.load("en_core_web_sm")

# Load local whisper model (base model is fast and light for real-time processing)
whisper_model = whisper.load_model("base")

FILLER_WORDS = ["um", "uh", "like", "you know", "actually", "basically"]

# Initialize Docker client to spin up sandboxes
docker_client = docker.from_env()

# Data model for incoming code
class CodeSubmission(BaseModel):
    code: str

# Connect to your local LM Studio instance
# host.docker.internal allows the Docker container to talk to your Windows host machine
llm_client = AsyncOpenAI(
    base_url="http://host.docker.internal:1234/v1",
    api_key="lm-studio" # LM Studio doesn't require a real key
)

TECH_SKILLS_DB = {
    "python", "react", "javascript", "docker", "fastapi", 
    "sql", "java", "c++", "machine learning", "nlp", "webrtc", "github"
}

# Initialize MediaPipe Face Mesh for gaze tracking
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

@app.get("/")
def read_root():
    return {"message": "InterViewX Backend is up and running!"}

@app.post("/api/upload-cv/")
async def upload_cv(file: UploadFile = File(...)):

    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    
    try:
        # 1. Read PDF
        pdf_content = await file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
        
        extracted_text = ""
        for page in pdf_reader.pages:
            if page.extract_text():
                extracted_text += page.extract_text() + " "
        
        # 2. Extract Skills
        doc = nlp(extracted_text.lower())
        found_skills = set()
        
        for token in doc:
            if token.text in TECH_SKILLS_DB:
                found_skills.add(token.text)
        for chunk in doc.noun_chunks:
            if chunk.text in TECH_SKILLS_DB:
                found_skills.add(chunk.text)
                
        skills_list = list(found_skills)
        
        # 3. Generate Interview Questions via Local LLM
        if not skills_list:
            skills_list = ["general software engineering"] # Fallback if no skills matched
            
        prompt = f"You are an expert technical interviewer. The candidate has the following skills: {', '.join(skills_list)}. Generate exactly 3 technical interview questions to test their knowledge. Do not provide the answers, just the questions."
        
        response = await llm_client.chat.completions.create(
            model="local-model", # LM Studio ignores this, but the library requires a string
            messages=[
                {"role": "system", "content": "You are a technical hiring manager."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=300
        )
        
        generated_questions = response.choices[0].message.content
            
        return {
            "filename": file.filename,
            "status": "success",
            "skills_extracted": skills_list,
            "interview_questions": generated_questions
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing CV: {str(e)}")


@app.post("/api/analyze-audio/")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        # Save the incoming audio chunk to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            temp_audio.write(await file.read())
            temp_audio_path = temp_audio.name

        # Transcribe locally using your hardware
        result = whisper_model.transcribe(temp_audio_path)
        transcript = result["text"]

        # Clean up the temporary file
        os.remove(temp_audio_path)

        # Simple NLP: Count filler words
        transcript_lower = transcript.lower()
        filler_count = sum(transcript_lower.count(filler) for filler in FILLER_WORDS)

        return {
            "status": "success",
            "transcript": transcript,
            "filler_words_detected": filler_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")

@app.post("/api/execute-code/")
async def execute_code(submission: CodeSubmission):
    try:
        start_time = time.time()

        # Spin up an ephemeral Python container, run the code, and destroy it
        container_output = docker_client.containers.run(
            "python:3.11-slim",
            command=["python", "-c", submission.code],
            remove=True, # Instantly destroys the container after running
            network_mode="none", # No internet access for security
            mem_limit="128m", # Hard memory limit
            cpu_quota=50000, # CPU limit
            stdout=True,
            stderr=True,
            user="1000:1000" # Run as non-root user
        )

        execution_time = round((time.time() - start_time) * 1000, 2) # in milliseconds

        return {
            "status": "success",
            "output": container_output.decode('utf-8').strip(),
            "execution_time_ms": execution_time
        }

    except docker.errors.ContainerError as e:
        # If the candidate's code throws an error (e.g., SyntaxError)
        return {
            "status": "failed",
            "output": e.stderr.decode('utf-8').strip(),
            "execution_time_ms": None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sandbox error: {str(e)}")


    await websocket.accept()
    try:
        while True:
            # 1. Receive the video frame as a base64 string from React
            data = await websocket.receive_text()

            # 2. Decode the image
            header, encoded = data.split(",", 1)
            img_bytes = base64.b64decode(encoded)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            # 3. Process with MediaPipe
            # Convert the BGR image to RGB before processing
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(img_rgb)

            engagement_status = "Looking Away"

            if results.multi_face_landmarks:
                # If a face is detected, we assume basic engagement for now.
                # Later we can add precise iris tracking math here.
                engagement_status = "Engaged"

            # 4. Send the result back to the frontend instantly
            await websocket.send_json({"engagement": engagement_status})

    except WebSocketDisconnect:
        print("Client disconnected from video stream.")
    except Exception as e:
        print(f"Video processing error: {e}")

@app.websocket("/ws/video-stream")
async def video_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # 1. Receive and decode the video frame
            data = await websocket.receive_text()
            header, encoded = data.split(",", 1)
            img_bytes = base64.b64decode(encoded)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            # 2. Process with MediaPipe
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(img_rgb)
            
            engagement_status = "No Face Detected"
            
            if results.multi_face_landmarks:
                # Grab the specific 3D coordinates for the first face detected
                landmarks = results.multi_face_landmarks[0].landmark
                
                # --- GAZE TRACKING MATH ---
                # Horizontal (X-axis) Landmarks
                eye_outer_x = landmarks[33].x
                eye_inner_x = landmarks[133].x
                iris_x = landmarks[468].x
                
                # Vertical (Y-axis) Landmarks (Note: Y=0 is the top of the image)
                eye_top_y = landmarks[159].y
                eye_bottom_y = landmarks[145].y
                iris_y = landmarks[468].y
                
                # Calculate Horizontal width
                left_bound = min(eye_outer_x, eye_inner_x)
                right_bound = max(eye_outer_x, eye_inner_x)
                eye_width = right_bound - left_bound
                
                # Calculate Vertical height
                eye_height = eye_bottom_y - eye_top_y
                
                if eye_width > 0 and eye_height > 0:
                    # Calculate where the iris sits (0.0 to 1.0)
                    iris_h_ratio = (iris_x - left_bound) / eye_width
                    iris_v_ratio = (iris_y - eye_top_y) / eye_height
                    
                    # Create a "Safe Box" in the center of the eye
                    # Horizontal safe zone: 35% to 65%
                    # Vertical safe zone: 30% to 75% (eyelids naturally cover the top of the iris, so the math is slightly shifted)
                    is_horizontally_engaged = 0.35 < iris_h_ratio < 0.65
                    is_vertically_engaged = 0.30 < iris_v_ratio < 0.75
                    
                    if is_horizontally_engaged and is_vertically_engaged:
                        engagement_status = "Engaged"
                    else:
                        engagement_status = "Looking Away"
                else:
                    engagement_status = "Engaged" # Fallback if math errors out
            
            # 4. Send the result back to the frontend instantly
            await websocket.send_json({"engagement": engagement_status})
            
    except WebSocketDisconnect:
        print("Client disconnected from video stream.")
    except Exception as e:
        print(f"Video processing error: {e}")






