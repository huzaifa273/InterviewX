FROM python:3.11-slim

WORKDIR /app

# Install ffmpeg for Whisper audio processing
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean

COPY requirements.txt .

# Pin setuptools below v70 and disable build isolation so pip respects the pinned version
RUN pip install "setuptools<70" wheel
RUN pip install --no-cache-dir --no-build-isolation -r requirements.txt
RUN pip install --no-cache-dir https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl

COPY . .

EXPOSE 8000