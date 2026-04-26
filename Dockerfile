FROM node:18-bullseye-slim

WORKDIR /app

# Salin file konfigurasi
COPY package*.json ./

# Install dependencies Node.js
RUN npm install

# Salin semua kode ke dalam container
COPY . .

# Beri izin eksekusi pada yt-dlp dan ffmpeg-static (jika ada)
RUN chmod +x yt-dlp

# Buat folder downloads dan beri akses penuh agar Hugging Face bisa menulis file
RUN mkdir -p downloads && chmod -R 777 downloads

# Hugging Face mewajibkan aplikasi berjalan sebagai user non-root (ID 1000)
RUN useradd -m -u 1000 user
RUN chown -R user:user /app
USER user

# Ekspos port yang digunakan Hugging Face Spaces
EXPOSE 7860

# Jalankan server
CMD ["npm", "start"]
