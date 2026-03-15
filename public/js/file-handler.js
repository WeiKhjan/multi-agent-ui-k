/**
 * File Handler: upload and download files via authenticated HTTP.
 * Files stay on Mac 2 — only references are shared in chat.
 */
const FileHandler = (() => {
  function init() {
    const fileBtn = document.getElementById('file-btn');
    const fileInput = document.getElementById('file-input');

    fileBtn.addEventListener('click', () => {
      const roomId = RoomUI.getActiveRoomId();
      if (!roomId) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const roomId = RoomUI.getActiveRoomId();
      if (!roomId) return;

      await uploadFile(roomId, file);
      fileInput.value = ''; // Reset
    });
  }

  async function uploadFile(roomId, file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/rooms/${roomId}/upload`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const result = await res.json();
        // Send a message with file reference
        const sizeStr = _formatSize(result.size);
        SocketHandler.sendMessage(roomId, `[FILE] ${result.fileName} (${sizeStr})`);
      } else {
        const err = await res.json();
        alert('Upload failed: ' + err.error);
      }
    } catch (err) {
      console.error('[files] Upload failed:', err);
      alert('Upload failed: network error');
    }
  }

  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return { init, uploadFile };
})();
