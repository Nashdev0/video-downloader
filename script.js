// Initialize icons
lucide.createIcons();

const urlInput = document.getElementById('url-input');
const resSelect = document.getElementById('resolution-select');
const downloadBtn = document.getElementById('download-btn');

const infoLoading = document.getElementById('info-loading');
const infoPreview = document.getElementById('info-preview');
const infoThumbnail = document.getElementById('info-thumbnail');
const infoNoThumbnail = document.getElementById('info-no-thumbnail');
const infoTitle = document.getElementById('info-title');
const infoDuration = document.getElementById('info-duration');

const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const progressPercentage = document.getElementById('progress-percentage');
const progressBar = document.getElementById('progress-bar');

const errorToast = document.getElementById('error-toast');
const errorMsgEl = document.getElementById('error-msg');

let fetchTimeout;
let currentStatus = 'idle';

function formatDuration(seconds) {
  if (!seconds) return 'Unknown length';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateBtnState() {
  if (currentStatus === 'downloading' || currentStatus === 'merging' || !urlInput.value) {
    downloadBtn.disabled = true;
    downloadBtn.className = "w-full py-4 px-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg bg-gray-700 cursor-not-allowed opacity-70";
    if (currentStatus === 'downloading' || currentStatus === 'merging') {
      downloadBtn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> <span>Processing...</span>`;
    } else {
      downloadBtn.innerHTML = `<i data-lucide="download" class="w-5 h-5"></i> <span>Download Now</span>`;
    }
  } else {
    downloadBtn.disabled = false;
    downloadBtn.className = "w-full py-4 px-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg bg-primary hover:bg-primaryHover hover:shadow-primary/25 hover:-translate-y-1";
    if (currentStatus === 'completed') {
      downloadBtn.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5"></i> <span>Downloaded!</span>`;
    } else {
      downloadBtn.innerHTML = `<i data-lucide="download" class="w-5 h-5"></i> <span>Download Now</span>`;
    }
  }
  lucide.createIcons();
}

function showError(msg) {
  errorMsgEl.textContent = msg;
  errorToast.classList.remove('hidden');
}

function hideError() {
  errorToast.classList.add('hidden');
}

urlInput.addEventListener('input', (e) => {
  const url = e.target.value.trim();
  hideError();
  updateBtnState();

  if (!url || !/^https?:\/\//i.test(url)) {
    infoPreview.classList.add('hidden');
    return;
  }

  clearTimeout(fetchTimeout);
  infoLoading.classList.remove('hidden');
  infoPreview.classList.add('hidden');

  fetchTimeout = setTimeout(async () => {
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      infoLoading.classList.add('hidden');
      
      if (res.ok) {
        infoTitle.textContent = data.title || 'Unknown Video';
        infoDuration.textContent = formatDuration(data.duration);
        
        if (data.thumbnail) {
          infoThumbnail.src = data.thumbnail;
          infoThumbnail.classList.remove('hidden');
          infoNoThumbnail.classList.add('hidden');
        } else {
          infoThumbnail.classList.add('hidden');
          infoNoThumbnail.classList.remove('hidden');
        }
        
        infoPreview.classList.remove('hidden');
      } else {
        showError(data.error || 'Failed to fetch video info');
      }
    } catch (err) {
      infoLoading.classList.add('hidden');
      showError('Network error connecting to backend');
    }
    updateBtnState();
  }, 1000);
});

downloadBtn.addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (!url) return;

  currentStatus = 'downloading';
  hideError();
  updateBtnState();
  
  progressContainer.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressPercentage.textContent = '0%';
  progressText.textContent = 'Downloading video & audio...';
  progressBar.classList.remove('bg-purple-500', 'animate-pulse');
  progressBar.classList.add('bg-primary');

  const sseUrl = `/api/download?url=${encodeURIComponent(url)}&resolution=${resSelect.value}`;
  const eventSource = new EventSource(sseUrl);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.status === 'downloading') {
      progressBar.style.width = `${data.progress}%`;
      progressPercentage.textContent = `${data.progress.toFixed(1)}%`;
    } else if (data.status === 'merging') {
      currentStatus = 'merging';
      progressBar.style.width = '100%';
      progressPercentage.textContent = '100%';
      progressText.textContent = 'Merging formats (this might take a moment)...';
      progressBar.classList.remove('bg-primary');
      progressBar.classList.add('bg-purple-500', 'animate-pulse');
      updateBtnState();
    } else if (data.status === 'completed') {
      currentStatus = 'completed';
      eventSource.close();
      
      const downloadUrl = `/api/files/${data.filename}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      progressContainer.classList.add('hidden');
      updateBtnState();
      
      setTimeout(() => {
        currentStatus = 'idle';
        updateBtnState();
      }, 5000);
    } else if (data.status === 'error') {
      currentStatus = 'error';
      showError(data.message || 'An error occurred during download');
      progressContainer.classList.add('hidden');
      eventSource.close();
      updateBtnState();
    }
  };

  eventSource.onerror = (err) => {
    currentStatus = 'error';
    showError('Connection to server lost.');
    progressContainer.classList.add('hidden');
    eventSource.close();
    updateBtnState();
  };
});
