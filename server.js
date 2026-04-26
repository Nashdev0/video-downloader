import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000; // Switch back to 5000 since there is no concurrently anymore

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/*
 * ============================================================================
 * PRASYARAT SISTEM (SYSTEM REQUIREMENTS)
 * ============================================================================
 * Backend ini membutuhkan `yt-dlp` dan `FFmpeg` terinstal di sistem operasi:
 * 
 * 1. FFmpeg (untuk menggabungkan video & audio 1080p):
 *    - Ubuntu/Debian: `sudo apt install ffmpeg`
 *    - macOS: `brew install ffmpeg`
 *    - Windows: Unduh dari situs resmi atau via winget `winget install ffmpeg`
 * 
 * 2. yt-dlp (untuk mengekstrak dan mengunduh video):
 *    - Ubuntu/Debian: `sudo apt install yt-dlp` atau via pip `pip3 install yt-dlp`
 *    - macOS: `brew install yt-dlp`
 *    - Windows: `winget install yt-dlp` atau via pip
 * 
 * Pastikan kedua command tersebut (`ffmpeg -version` dan `yt-dlp --version`) 
 * bisa dijalankan dari terminal.
 * ============================================================================
 */


// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Route to get video info
app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Use yt-dlp to dump json info
  const ytDlpPath = path.join(__dirname, 'yt-dlp');
  const ytdlp = spawn(ytDlpPath, ['--dump-json', url]);

  let data = '';
  let errorData = '';

  ytdlp.stdout.on('data', (chunk) => {
    data += chunk;
  });

  ytdlp.stderr.on('data', (chunk) => {
    errorData += chunk;
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp info error:', errorData);
      return res.status(500).json({ error: 'Failed to fetch video info. Make sure the URL is valid.' });
    }
    
    try {
      const info = JSON.parse(data);
      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        formats: info.formats
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// Route to download
app.get('/api/download', (req, res) => {
  const { url, resolution } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Format selector based on resolution
  let formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
  if (resolution === '1080p') {
    formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
  } else if (resolution === '720p') {
    formatSelector = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
  } else if (resolution === '360p') {
    formatSelector = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
  }

  const filename = `video_${Date.now()}.mp4`;
  const filepath = path.join(downloadsDir, filename);

  const args = [
    url,
    '-f', formatSelector,
    '--merge-output-format', 'mp4',
    '-o', filepath
  ];

  const ytDlpPath = path.join(__dirname, 'yt-dlp');
  const ytdlp = spawn(ytDlpPath, args);

  // Use SSE to send progress to the client
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Match yt-dlp progress: [download]  15.3% of 10.00MiB at  1.50MiB/s ETA 00:05
  const progressRegex = /\[download\]\s+([\d\.]+)%/;

  ytdlp.stdout.on('data', (data) => {
    const text = data.toString();
    const match = text.match(progressRegex);
    if (match && match[1]) {
      res.write(`data: ${JSON.stringify({ status: 'downloading', progress: parseFloat(match[1]) })}\n\n`);
    } else if (text.includes('[Merger]')) {
      res.write(`data: ${JSON.stringify({ status: 'merging', progress: 100 })}\n\n`);
    }
  });

  ytdlp.stderr.on('data', (data) => {
    console.error(`yt-dlp stderr: ${data}`);
  });

  ytdlp.on('close', (code) => {
    if (code === 0) {
      // Send completion event with the download URL
      res.write(`data: ${JSON.stringify({ status: 'completed', filename })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ status: 'error', message: 'Download failed' })}\n\n`);
    }
    res.end();
  });
});

// Route to serve the downloaded file
app.get('/api/files/:filename', (req, res) => {
  const filepath = path.join(downloadsDir, req.params.filename);
  if (fs.existsSync(filepath)) {
    res.download(filepath, (err) => {
      if (!err) {
        // Delete file after download to save space
        setTimeout(() => {
          if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        }, 1000 * 60 * 5); // Delete after 5 minutes
      }
    });
  } else {
    res.status(404).send('File not found');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Ensure yt-dlp and FFmpeg are installed on the system for this to work.');
});
