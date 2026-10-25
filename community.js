(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);

  const authBox = $('#authBox');
  const authModal = $('#authModal');
  const authForm = $('#authForm');
  const authMsg = $('#authMsg');
  const uploadModal = $('#uploadModal');
  const uploadForm = $('#uploadForm');
  const uploadMsg = $('#uploadMsg');
  const photoInput = $('#photoInput');
  const preview = $('#preview');
  const dropText = $('#dropText');
  const grid = $('#photoGrid');
  const emptyMsg = $('#photoEmpty');
  const lightbox = $('#lightbox');
  const toastEl = $('#toast');
  if (!authBox || !authModal || !uploadModal || !grid) return;

  const MAX_BYTES = 5 * 1024 * 1024;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const DROP_DEFAULT = dropText.textContent;
  const EMPTY_DEFAULT = emptyMsg.textContent;

  let me = null;
  let photos = [];
  let loadError = '';
  let authMode = 'login';
  let afterLogin = null;
  let lastFocus = null;
  let previewUrl = null;
  let toastTimer = null;

  // ---------- Tiện ích ----------
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function api(url, options = {}) {
    let res;
    try {
      res = await fetch(url, { credentials: 'same-origin', ...options });
    } catch {
      throw new Error('Không kết nối được máy chủ. Hãy chạy "npm start" và mở trang qua địa chỉ http://localhost:3000.');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Có lỗi xảy ra, vui lòng thử lại.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function showMsg(node, text, ok = false) {
    node.textContent = text;
    node.classList.toggle('ok', ok);
  }

  function setBusy(form, busy) {
    form.querySelectorAll('button[type=submit]').forEach((b) => (b.disabled = busy));
  }

  // ---------- Hộp thoại ----------
  function openModal(modal) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const target =
      [...modal.querySelectorAll('input:not([type=file]):not(.sr-only), textarea')].find((n) => n.offsetParent !== null) ||
      modal.querySelector('.modal-close');
    if (target) target.focus();
  }

  function closeModal(modal) {
    modal.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('modal-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) closeModal(modal);
    });
    modal.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal(modal)));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.modal:not([hidden])')].pop();
    if (open) closeModal(open);
  });

  // ---------- Đăng nhập / đăng ký ----------
  function renderAuth() {
    authBox.replaceChildren();
    if (me) {
      const hello = el('span', 'hello', 'Chào, ' + me.displayName);
      const out = el('button', 'btn btn-ghost', 'Đăng xuất');
      out.type = 'button';
      out.addEventListener('click', logout);
      authBox.append(hello, out);
    } else {
      const inBtn = el('button', 'btn btn-primary', 'Đăng nhập');
      inBtn.type = 'button';
      inBtn.addEventListener('click', () => showAuth('login'));
      authBox.append(inBtn);
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    $('#authTitle').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    $('#authSubmit').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    authModal.querySelectorAll('.tab').forEach((tab) => {
      const on = tab.dataset.mode === mode;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    authModal.querySelectorAll('.reg-only').forEach((n) => (n.hidden = mode !== 'register'));
    authForm.elements.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    showMsg(authMsg, '');
  }

  function showAuth(mode, notice) {
    setAuthMode(mode);
    if (notice) showMsg(authMsg, notice, true);
    openModal(authModal);
  }

  authModal.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode))
  );

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = authForm.elements;
    const username = f.username.value.trim();
    const password = f.password.value;

    if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
      return showMsg(authMsg, 'Tên đăng nhập gồm 3–20 ký tự: chữ cái không dấu, số, dấu _ hoặc .');
    }
    if (authMode === 'register' && password.length < 8) {
      return showMsg(authMsg, 'Mật khẩu cần từ 8 ký tự trở lên.');
    }
    if (!password) return showMsg(authMsg, 'Vui lòng nhập mật khẩu.');

    const body = { username, password };
    if (authMode === 'register') body.displayName = f.displayName.value.trim() || username;

    setBusy(authForm, true);
    try {
      const data = await api('/api/' + authMode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      me = data.user;
      authForm.reset();
      closeModal(authModal);
      renderAuth();
      await loadPhotos();
      toast(authMode === 'register' ? 'Tạo tài khoản thành công. Chào mừng bạn!' : 'Đăng nhập thành công.');
      if (afterLogin) {
        const next = afterLogin;
        afterLogin = null;
        next();
      }
    } catch (err) {
      showMsg(authMsg, err.message);
    } finally {
      setBusy(authForm, false);
    }
  });

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* vẫn coi như đã thoát phía giao diện */
    }
    me = null;
    renderAuth();
    await loadPhotos();
    toast('Bạn đã đăng xuất.');
  }

  // ---------- Tải ảnh lên ----------
  function checkFile(file) {
    if (!TYPES.includes(file.type)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
    if (file.size > MAX_BYTES) return 'Ảnh quá lớn, tối đa 5 MB.';
    return '';
  }

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.hidden = true;
    preview.removeAttribute('src');
    dropText.textContent = DROP_DEFAULT;
  }

  function openUpload() {
    uploadForm.reset();
    clearPreview();
    showMsg(uploadMsg, '');
    openModal(uploadModal);
  }

  $('#openUpload').addEventListener('click', () => {
    if (!me) {
      afterLogin = openUpload;
      showAuth('login', 'Vui lòng đăng nhập để tải ảnh lên.');
      return;
    }
    openUpload();
  });

  photoInput.addEventListener('change', () => {
    clearPreview();
    const file = photoInput.files[0];
    if (!file) return;
    const problem = checkFile(file);
    if (problem) {
      photoInput.value = '';
      showMsg(uploadMsg, problem);
      return;
    }
    showMsg(uploadMsg, '');
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
    dropText.textContent = file.name;
  });

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = photoInput.files[0];
    if (!file) return showMsg(uploadMsg, 'Hãy chọn một ảnh để tải lên.');
    const problem = checkFile(file);
    if (problem) return showMsg(uploadMsg, problem);

    const fd = new FormData();
    fd.append('caption', uploadForm.elements.caption.value.trim());
    fd.append('photo', file);

    setBusy(uploadForm, true);
    showMsg(uploadMsg, 'Đang tải ảnh lên…', true);
    try {
      await api('/api/photos', { method: 'POST', body: fd });
      closeModal(uploadModal);
      clearPreview();
      uploadForm.reset();
      await loadPhotos();
      toast('Đã đăng ảnh. Cảm ơn bạn đã chia sẻ!');
    } catch (err) {
      if (err.status === 401) {
        me = null;
        renderAuth();
        closeModal(uploadModal);
        afterLogin = openUpload;
        showAuth('login', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
      } else {
        showMsg(uploadMsg, err.message);
      }
    } finally {
      setBusy(uploadForm, false);
    }
  });

  // ---------- Danh sách ảnh ----------
  async function loadPhotos() {
    try {
      const data = await api('/api/photos');
      photos = data.photos || [];
      loadError = '';
    } catch (err) {
      photos = [];
      loadError = err.message;
    }
    renderPhotos();
  }

  function renderPhotos() {
    grid.replaceChildren();
    if (loadError) {
      emptyMsg.textContent = loadError;
      emptyMsg.hidden = false;
      return;
    }
    emptyMsg.textContent = EMPTY_DEFAULT;
    emptyMsg.hidden = photos.length > 0;

    for (const p of photos) {
      const card = el('figure', 'photo-card');

      const btn = el('button', 'photo-btn');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Xem ảnh lớn' + (p.caption ? ': ' + p.caption : ''));
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = p.url;
      img.alt = p.caption || 'Ảnh do cộng đồng chia sẻ';
      btn.append(img);
      btn.addEventListener('click', () => openLightbox(p));

      const info = el('figcaption', 'photo-info');
      if (p.caption) info.append(el('p', '', p.caption));
      info.append(el('small', '', p.author + ' · ' + new Date(p.createdAt).toLocaleDateString('vi-VN')));
      if (p.canDelete) {
        const del = el('button', 'photo-del', 'Xóa ảnh');
        del.type = 'button';
        del.addEventListener('click', () => removePhoto(p));
        info.append(del);
      }

      card.append(btn, info);
      grid.append(card);
    }
  }

  async function removePhoto(p) {
    if (!window.confirm('Bạn chắc chắn muốn xóa ảnh này?')) return;
    try {
      await api('/api/photos/' + encodeURIComponent(p.id), { method: 'DELETE' });
      await loadPhotos();
      toast('Đã xóa ảnh.');
    } catch (err) {
      toast(err.message);
    }
  }

  function openLightbox(p) {
    $('#lightboxImg').src = p.url;
    $('#lightboxImg').alt = p.caption || 'Ảnh do cộng đồng chia sẻ';
    $('#lightboxCap').textContent = p.caption ? p.caption + ' — ' + p.author : 'Ảnh của ' + p.author;
    openModal(lightbox);
  }

  // ---------- Khởi động ----------
  (async function init() {
    renderAuth();
    try {
      const data = await api('/api/me');
      me = data.user;
    } catch {
      me = null;
    }
    renderAuth();
    await loadPhotos();
  })();
})();
