const $ = (id) => document.getElementById(id);
let project = null, dirty = false, saving = null, timer = null;
let playing = false, playbackSeconds = 0, previousFrame = 0, frameHandle = 0;
let lastBubbleKey = '', hasConflict = false;
const maxMessages = 40;

async function request(url, options = {}) {
  const res = await fetch(url, options);
  let data;
  try { data = await res.json(); } catch { throw new Error('Server response was not JSON'); }
  if (!res.ok) { const error = new Error(data.error || 'Request failed'); error.status = res.status; throw error; }
  return data;
}
function status(text, kind = '') {
  $('saveStatus').textContent = text;
  $('saveStatus').className = 'save-pill' + (kind ? ' ' + kind : '');
}
function showError(error) {
  status(error.status === 409 ? '保存競合・再読込が必要' : '保存エラー', 'error');
  console.error(error);
}
function durationText(sec) {
  sec = Math.max(0, Math.floor(sec));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}
async function listAndSelect(id) {
  const { projects } = await request('/api/projects');
  const select = $('projectSelect');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = 'プロジェクトを選択';
  select.append(placeholder);
  for (const item of projects) {
    const el = document.createElement('option');
    el.value = item.id; el.textContent = item.title;
    select.append(el);
  }
  if (id) select.value = id;
}
async function openProject(id) {
  pause();
  if (!id) { $('workspace').hidden = true; $('emptyState').hidden = false; project = null; return; }
  const { project: p } = await request('/api/projects/' + id);
  project = p;
  dirty = false; hasConflict = false; playbackSeconds = 0;
  $('emptyState').hidden = true; $('workspace').hidden = false;
  $('projectTitle').value = p.title;
  $('durationInput').value = p.durationSeconds;
  lastBubbleKey = '';
  renderEditor();
  setupBackground();
  updatePreview();
  status('保存済み');
  $('projectSelect').value = id;
}
async function createNew() {
  try {
    if (dirty) await flushSave();
    const { project: fresh } = await request('/api/projects', { method: 'POST' });
    await listAndSelect(fresh.id);
    await openProject(fresh.id);
  } catch (error) { showError(error); }
}
function changed() {
  if (!project || hasConflict) return;
  dirty = true;
  status('編集中…', 'saving');
  clearTimeout(timer);
  timer = setTimeout(() => flushSave().catch(showError), 550);
}
async function flushSave() {
  clearTimeout(timer);
  if (hasConflict) throw Object.assign(new Error('Reload project to resolve conflict'), { status: 409 });
  if (saving) { await saving; if (dirty) return flushSave(); return; }
  if (!dirty || !project) return;
  dirty = false;
  const draft = JSON.parse(JSON.stringify(project));
  status('保存中…', 'saving');
  saving = (async () => {
    const { project: updated } = await request('/api/projects/' + draft.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft)
    });
    if (project && project.id === updated.id) {
      project.revision = updated.revision;
      project.updatedAt = updated.updatedAt;
    }
  })();
  try {
    await saving;
    status(dirty ? '編集中…' : '保存済み', dirty ? 'saving' : '');
  } catch (error) {
    dirty = true;
    if (error.status === 409) hasConflict = true;
    throw error;
  } finally { saving = null; }
  if (dirty) await flushSave();
}
function label(text) {
  const span = document.createElement('span'); span.textContent = text; return span;
}
function editorCell(name, type, value, handler, extra = {}) {
  const wrap = document.createElement('label'); wrap.className = 'edit-cell';
  wrap.append(label(name));
  const field = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') field.type = type;
  field.value = value;
  if (extra.min !== undefined) field.min = extra.min;
  if (extra.max !== undefined) field.max = extra.max;
  if (extra.step !== undefined) field.step = extra.step;
  if (extra.maxLength !== undefined) field.maxLength = extra.maxLength;
  field.addEventListener(type === 'number' ? 'change' : 'input', () => handler(field.value));
  wrap.append(field);
  return wrap;
}
function renderEditor() {
  if (!project) return;
  $('messageCount').textContent = project.messages.length + ' / ' + maxMessages;
  $('addMessage').disabled = project.messages.length >= maxMessages;
  const list = $('messageList'); list.replaceChildren();
  project.messages.forEach((message, index) => {
    const card = document.createElement('div'); card.className = 'message-card';
    const head = document.createElement('div'); head.className = 'message-card-header';
    const order = document.createElement('span'); order.className = 'message-order'; order.textContent = index + 1;
    const title = document.createElement('strong'); title.textContent = 'Message ' + String(index + 1).padStart(2, '0');
    const remove = document.createElement('button'); remove.className = 'message-remove'; remove.textContent = '×'; remove.type = 'button';
    remove.setAttribute('aria-label', 'メッセージ' + (index + 1) + 'を削除');
    remove.disabled = project.messages.length === 1;
    remove.addEventListener('click', () => {
      project.messages.splice(index, 1);
      renderEditor(); changed(); updatePreview();
    });
    head.append(order, title, remove);
    const top = document.createElement('div'); top.className = 'message-row';
    top.append(
      editorCell('送信者', 'text', message.speaker, (value) => { message.speaker = value; changed(); updatePreview(); }, { maxLength: 32 }),
      editorCell('表示秒', 'number', message.atSeconds, (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        message.atSeconds = Math.round(n * 10) / 10;
        project.messages.sort((a, b) => a.atSeconds - b.atSeconds);
        renderEditor(); changed(); updatePreview();
      }, { min: 0, max: project.durationSeconds - 0.1, step: .1 })
    );
    const content = editorCell('セリフ', 'textarea', message.text, (value) => { message.text = value; changed(); updatePreview(); }, { maxLength: 280 });
    card.append(head, top, content);
    list.append(card);
  });
  updateTimeline();
}
function addMessage() {
  if (!project || project.messages.length >= maxMessages) return;
  const last = project.messages.at(-1)?.atSeconds ?? 0;
  const time = Math.round(Math.min(last + 3, project.durationSeconds - .1) * 10) / 10;
  if (time <= last) { status('動画の長さを延ばしてください', 'error'); return; }
  project.messages.push({ id: 'm' + crypto.randomUUID().slice(0, 12), speaker: 'Me', text: 'New message', atSeconds: time });
  renderEditor(); changed(); updatePreview();
  $('messageList').lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function updateTimeline() {
  const bar = $('timeline'); bar.replaceChildren();
  if (!project) return;
  for (const msg of project.messages) {
    const tick = document.createElement('span'); tick.className = 'timeline-mark';
    tick.style.left = (msg.atSeconds / project.durationSeconds * 100) + '%';
    tick.title = msg.speaker + ' @ ' + msg.atSeconds + 's';
    bar.append(tick);
  }
}
function updatePreview() {
  if (!project) return;
  const visible = project.messages.filter(m => m.atSeconds <= playbackSeconds).slice(-3);
  const key = visible.map(m => [m.id, m.speaker, m.text].join('|')).join('/');
  if (key !== lastBubbleKey) {
    const feed = $('chatMessages'); feed.replaceChildren();
    if (!visible.length) {
      const pending = document.createElement('div'); pending.className = 'empty-preview';
      pending.textContent = 'Waiting for the first message…'; feed.append(pending);
    }
    for (const m of visible) {
      const wrap = document.createElement('div');
      wrap.className = 'bubble ' + (/^(me|you|myself)$/i.test(m.speaker) ? 'me' : 'other');
      const who = document.createElement('span'); who.className = 'bubble-speaker'; who.textContent = m.speaker;
      const txt = document.createElement('div'); txt.className = 'bubble-text'; txt.textContent = m.text;
      wrap.append(who, txt); feed.append(wrap);
    }
    lastBubbleKey = key;
  }
  $('timeSlider').max = project.durationSeconds;
  $('timeSlider').value = playbackSeconds;
  $('timeLabel').textContent = durationText(playbackSeconds) + ' / ' + durationText(project.durationSeconds);
  $('chatTitle').textContent = project.title.length > 28 ? project.title.slice(0, 28) + '…' : project.title;
  if (!playing && $('backgroundVideo').readyState >= 1 && Number.isFinite($('backgroundVideo').duration) && $('backgroundVideo').duration > 0) {
    const desired = playbackSeconds % $('backgroundVideo').duration;
    if (Math.abs($('backgroundVideo').currentTime - desired) > .35) $('backgroundVideo').currentTime = desired;
  }
}
function frame(now) {
  if (!playing) return;
  const diff = Math.max(0, Math.min((now - previousFrame) / 1000, .2));
  previousFrame = now;
  playbackSeconds = Math.min(project.durationSeconds, playbackSeconds + diff);
  updatePreview();
  if (playbackSeconds >= project.durationSeconds) { pause(); return; }
  frameHandle = requestAnimationFrame(frame);
}
function pause() {
  playing = false; cancelAnimationFrame(frameHandle);
  $('playButton').textContent = '▶'; $('playButton').setAttribute('aria-label', '再生');
  $('backgroundVideo').pause();
}
function play() {
  if (!project) return;
  if (playing) { pause(); return; }
  if (playbackSeconds >= project.durationSeconds) playbackSeconds = 0;
  playing = true; previousFrame = performance.now();
  $('playButton').textContent = 'Ⅱ'; $('playButton').setAttribute('aria-label', '一時停止');
  if ($('backgroundVideo').readyState >= 1) {
    const v = $('backgroundVideo');
    if (Number.isFinite(v.duration) && v.duration > 0) v.currentTime = playbackSeconds % v.duration;
    v.play().catch(() => {});
  }
  frameHandle = requestAnimationFrame(frame);
}
function setupBackground() {
  const video = $('backgroundVideo'), file = project.background.file;
  pause();
  video.removeAttribute('src');
  video.load();
  $('backgroundName').textContent = file ? '背景MP4 取込済み' : '背景動画なし';
  $('backgroundDetail').textContent = file ? 'ローカル保存済み。再生位置に追従します。' : '64MB以下のMP4。権利と使用条件を確認してから取り込んでください。';
  $('backgroundInput').value = '';
  $('videoFrame').querySelector('.background-frame').classList.toggle('has-video', Boolean(file));
  if (file) {
    video.src = '/api/projects/' + project.id + '/background?r=' + project.revision;
    video.load();
  }
}
async function uploadBackground(file) {
  if (!file || !project) return;
  if (file.size > 64 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.mp4')) {
    showError(new Error('64MB以下のMP4を選択してください')); return;
  }
  try {
    await flushSave();
    status('背景を保存中…', 'saving');
    const { project: result } = await request('/api/projects/' + project.id + '/background', {
      method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Project-Revision': String(project.revision) },
      body: file
    });
    project.revision = result.revision;
    project.updatedAt = result.updatedAt;
    project.background = result.background;
    setupBackground();
    status('背景も保存済み');
  } catch (error) { if (error.status === 409) hasConflict = true; showError(error); }
}
async function importJson(file) {
  if (!file || !project) return;
  try {
    if (file.size > 65536) throw new Error('JSON is too large');
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.messages) || !data.messages.length) throw new Error('messages array is required');
    await flushSave();
    const old = project;
    project = {
      ...old, title: data.title ?? old.title, language: data.language ?? old.language,
      durationSeconds: data.durationSeconds ?? old.durationSeconds,
      messages: data.messages.map((m, i) => ({
        id: 'm' + String(i+1), speaker: m.speaker, text: m.text, atSeconds: m.atSeconds
      }))
    };
    const draft = JSON.parse(JSON.stringify(project));
    const { project: updated } = await request('/api/projects/' + old.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft)
    });
    project = updated;
    $('projectTitle').value = updated.title; $('durationInput').value = updated.durationSeconds;
    playbackSeconds = 0; lastBubbleKey = ''; renderEditor(); updatePreview();
    await listAndSelect(project.id);
    status('読み込み・保存済み');
  } catch (error) {
    if (project) await openProject(project.id).catch(() => {});
    showError(error);
  } finally { $('importFile').value = ''; }
}
function exportJson() {
  if (!project) return;
  const data = JSON.stringify({ schemaVersion: project.schemaVersion, title: project.title,
    language: project.language, durationSeconds: project.durationSeconds, messages: project.messages }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'shorts-chat-script.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('projectTitle').addEventListener('input', e => {
  if (!project) return;
  project.title = e.target.value;
  if ($('projectSelect').selectedOptions[0]) $('projectSelect').selectedOptions[0].textContent = project.title;
  changed(); updatePreview();
});
$('durationInput').addEventListener('change', e => {
  if (!project) return;
  const duration = Number(e.target.value);
  if (!Number.isInteger(duration) || duration < 10 || duration > 90 || project.messages.some(m => m.atSeconds >= duration)) {
    e.target.value = project.durationSeconds;
    status('長さは10〜90秒。セリフの表示時刻より長くしてください', 'error'); return;
  }
  project.durationSeconds = duration; playbackSeconds = Math.min(playbackSeconds, duration);
  changed(); updateTimeline(); updatePreview();
});
$('addMessage').addEventListener('click', addMessage);
$('newProject').addEventListener('click', createNew);
$('emptyCreate').addEventListener('click', createNew);
$('projectSelect').addEventListener('change', async e => {
  const id = e.target.value;
  try { await flushSave(); await openProject(id); } catch (error) { showError(error); }
});
$('playButton').addEventListener('click', play);
$('timeSlider').addEventListener('input', e => {
  if (!project) return;
  playbackSeconds = Number(e.target.value);
  const video = $('backgroundVideo');
  if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) video.currentTime = playbackSeconds % video.duration;
  updatePreview();
});
$('backgroundInput').addEventListener('change', e => uploadBackground(e.target.files[0]));
$('importScript').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', e => importJson(e.target.files[0]));
$('exportScript').addEventListener('click', exportJson);
window.addEventListener('beforeunload', event => {
  if (dirty || saving) { event.preventDefault(); event.returnValue = ''; }
});
try {
  await listAndSelect();
  const selected = $('projectSelect').options[1]?.value;
  await openProject(selected || '');
} catch (error) {
  $('fatalError').hidden = false;
  $('fatalError').textContent = 'Shorts Studioを開けませんでした: ' + error.message;
  $('emptyState').hidden = true; $('workspace').hidden = true;
  showError(error);
}
