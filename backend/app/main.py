from fastapi import FastAPI

app = FastAPI(title="InterViewX API")

@app.get("/")
def read_root():
    return {"message": "InterViewX Backend is up and running!"}