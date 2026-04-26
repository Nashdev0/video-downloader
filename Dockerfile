FROM python:3.9-slim

WORKDIR /app

# Install Node.js, npm, dan ffmpeg (resmi dari sistem)
RUN apt-get update && apt-get install -y curl ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp resmi via pip (dijamin kompatibel dan selalu jalan)
RUN pip install --no-cache-dir yt-dlp

# Install dependencies Node.js
COPY package*.json ./
RUN npm install

# Salin semua file
COPY . .

# Buat folder downloads
RUN mkdir -p downloads && chmod -R 777 downloads

# Hugging Face permissions
RUN chown -R 1000:1000 /app
USER 1000

EXPOSE 7860

CMD ["npm", "start"]
