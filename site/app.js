const app = document.querySelector('#app');
const dataUrl = new URL('./data/architecture-map.json', document.baseURI);
const TYPE_LABELS = { service: 'service', file: 'file', function: 'function', class: 'class', document: 'document', config: 'config' };
const state = { query: '', mode: 'overview', selectedTypes: new Set(), selectedLayerId: null, selectedNodeId: null, tourIndex: 0, zoom: 1, pan: { x: 0, y: 0 } };
let graph;
let world = { width: 1600, height: 1000 };
let drag;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const nodeLabel = (node) => node.name || node.id.split(':').pop();
const nodePath = (node) => node.filePath || node.id;
const typeLabel = (type) => TYPE_LABELS[type] || type;
const getNode = (id) => graph.nodes.find((node) => node.id === id);
const getLayer = (id) => graph.layers.find((layer) => layer.id === id);
const getHashNode = () => { const match = location.hash.match(/^#node=(.+)$/); return match ? decodeURIComponent(match[1]) : null; };

function degrees() {
  const result = new Map();
  graph.edges.forEach((edge) => { result.set(edge.source, (result.get(edge.source) || 0) + 1); result.set(edge.target, (result.get(edge.target) || 0) + 1); });
  return result;
}

function layerForNode(id) { return graph.layers.find((layer) => layer.nodeIds.includes(id)); }

function countsByType() {
  return graph.nodes.reduce((counts, node) => { counts[node.type] = (counts[node.type] || 0) + 1; return counts; }, {});
}

function matchesFilters(node) {
  const needle = state.query.trim().toLowerCase();
  const layer = state.selectedLayerId && getLayer(state.selectedLayerId);
  const inType = state.selectedTypes.size === 0 || state.selectedTypes.has(node.type);
  const inLayer = !layer || layer.nodeIds.includes(node.id);
  const inQuery = !needle || `${node.id} ${node.name} ${node.filePath || ''} ${node.summary || ''}`.toLowerCase().includes(needle);
  return inType && inLayer && inQuery;
}

function visibleNodes() {
  const degree = degrees();
  const matching = graph.nodes.filter(matchesFilters);
  const tourIds = state.tourIndex ? new Set(graph.tour[state.tourIndex - 1].nodeIds) : new Set();
  const overviewTypes = new Set(['service', 'file', 'config', 'document']);
  const pool = state.mode === 'overview' ? matching.filter((node) => overviewTypes.has(node.type)) : matching;
  const ranked = pool.slice().sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
  const pinned = [...tourIds].map(getNode).filter(Boolean).filter(matchesFilters);
  const unique = new Map([...pinned, ...ranked].map((node) => [node.id, node]));
  return [...unique.values()].slice(0, state.mode === 'overview' ? 30 : 160);
}

function layout(nodes) {
  const columns = state.mode === 'overview' ? 5 : Math.max(4, Math.ceil(Math.sqrt(nodes.length * 1.42)));
  const gapX = 210;
  const gapY = 112;
  const positions = new Map(nodes.map((node, index) => [node.id, { x: 70 + (index % columns) * gapX, y: 58 + Math.floor(index / columns) * gapY }]));
  world = { width: Math.max(1200, columns * gapX + 150), height: Math.max(820, Math.ceil(nodes.length / columns) * gapY + 130) };
  return positions;
}

function renderGraph() {
  const nodes = visibleNodes();
  const positions = layout(nodes);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const tourIds = state.tourIndex ? new Set(graph.tour[state.tourIndex - 1].nodeIds) : new Set();
  const edges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  const edgeSvg = edges.map((edge) => {
    const a = positions.get(edge.source); const b = positions.get(edge.target);
    const highlight = edge.source === state.selectedNodeId || edge.target === state.selectedNodeId || (tourIds.has(edge.source) && tourIds.has(edge.target));
    return `<line class="edge${highlight ? ' highlight' : ''}" x1="${a.x + 89}" y1="${a.y + 38}" x2="${b.x + 89}" y2="${b.y + 38}" />`;
  }).join('');
  const nodeSvg = nodes.map((node) => {
    const p = positions.get(node.id); const active = node.id === state.selectedNodeId ? ' selected' : ''; const tour = tourIds.has(node.id) ? ' tour-highlight' : '';
    return `<g class="node-card${active}${tour}" data-node-id="${esc(node.id)}" data-type="${esc(node.type)}" transform="translate(${p.x} ${p.y})"><rect width="178" height="76" rx="7" /><text class="node-kind" x="10" y="16">${esc(typeLabel(node.type))}</text><text class="node-name" x="10" y="37">${esc(nodeLabel(node).slice(0, 27))}</text><text class="node-path" x="10" y="56">${esc(nodePath(node).slice(0, 27))}</text><text class="node-links" x="167" y="16" text-anchor="end">${degrees().get(node.id) || 0}</text></g>`;
  }).join('');
  return `<svg class="graph-svg" viewBox="0 0 ${world.width} ${world.height}" role="img" aria-label="Інтерактивний граф архітектури"><g class="graph-content" transform="translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})">${edgeSvg}${nodeSvg}</g></svg>`;
}

function renderTypeChips() {
  const counts = countsByType();
  return Object.keys(TYPE_LABELS).filter((type) => counts[type]).map((type) => `<button class="chip${state.selectedTypes.has(type) ? ' active' : ''}" data-type="${type}"><i class="dot"></i>${typeLabel(type)} <span>${counts[type]}</span></button>`).join('');
}

function renderLayerChips() {
  return graph.layers.map((layer) => `<button class="chip layer-chip${state.selectedLayerId === layer.id ? ' active' : ''}" data-layer-id="${esc(layer.id)}">${esc(layer.name)} <span>${layer.nodeIds.length}</span></button>`).join('');
}

function renderTour() {
  return graph.tour.map((step) => `<button class="tour-item${state.tourIndex === step.order ? ' active' : ''}" data-tour-id="${step.order}"><span><i class="tour-item-index">${String(step.order).padStart(2, '0')}</i><strong>${esc(step.title)}</strong></span><span>${step.nodeIds.length} вузлів у кроці</span></button>`).join('');
}

function renderDetails() {
  const node = getNode(state.selectedNodeId);
  if (!node) return '<div class="details-panel"><p class="viewer-note">Оберіть картку на canvas, щоб побачити її summary, тип і зв’язки.</p></div>';
  const connections = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).slice(0, 12);
  return `<section class="details-panel"><p class="section-label">Selected node</p><h3>${esc(nodeLabel(node))}</h3><p class="details-path mono">${esc(nodePath(node))}</p><div class="details-meta"><span class="meta-pill">${esc(typeLabel(node.type))}</span><span class="meta-pill">${esc(node.complexity || 'n/a')}</span><span class="meta-pill">${connections.length} зв’язків</span></div><p class="details-summary">${esc(node.summary)}</p><p class="section-label">Connections</p><div class="connection-list">${connections.map((edge) => { const other = getNode(edge.source === node.id ? edge.target : edge.source); return `<div class="connection"><b>${esc(edge.type || 'related')}</b> · ${esc(nodeLabel(other || { id: 'unknown' }))}</div>`; }).join('') || '<p class="viewer-note">Немає зв’язків у поточному зрізі.</p>'}</div></section>`;
}

function render() {
  const source = graph.source;
  const nodes = visibleNodes();
  const activeStep = graph.tour[state.tourIndex - 1];
  app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">⌘</span><div><p class="eyebrow">FINDESK · UNDERSTAND ANYTHING VIEW</p><h1>auth + office-user · staging architecture</h1></div></div><div class="top-actions"><span class="status-badge">● READ-ONLY</span><span class="public-badge">PUBLIC · SANITIZED</span></div></header><div class="viewer-grid"><aside class="rail"><section class="rail-section"><div class="snapshot-title"><h2>Project map</h2><span class="tiny-count">${source.commit.slice(0, 7)}</span></div><button class="overview-button${state.mode === 'overview' && !state.selectedLayerId ? ' active' : ''}" data-action="overview"><strong>Overview</strong><span>Ключові вузли та межі сервісів</span></button><button class="overview-button${state.mode === 'deep-dive' ? ' active' : ''}" data-action="deep-dive"><strong>Deep dive</strong><span>${nodes.length} вузлів у поточному зрізі</span></button></section><section class="rail-section"><p class="section-label">Search nodes</p><div class="search-wrap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg><input id="node-search" type="search" value="${esc(state.query)}" placeholder="Файл, функція, клас…" /></div></section><section class="rail-section"><p class="section-label">Node types</p><div class="chip-list">${renderTypeChips()}</div></section><section class="rail-section"><p class="section-label">Architecture layers</p><div class="chip-list layer-list">${renderLayerChips()}</div></section><section class="rail-section"><p class="section-label">Snapshot</p><div class="stats-mini"><div class="stat-mini"><strong>1 332</strong><span>nodes</span></div><div class="stat-mini"><strong>3 647</strong><span>edges</span></div><div class="stat-mini"><strong>7</strong><span>layers</span></div><div class="stat-mini"><strong>8</strong><span>tour steps</span></div></div></section><p class="viewer-note">Source: <span class="mono">${esc(source.repository)}</span><br />Scope: ${source.scope.map(esc).join(' · ')}<br />No source code, secrets or runtime calls.</p></aside><section class="graph-stage"><div class="canvas-toolbar"><span class="mode-pill"><strong>${state.mode === 'overview' ? 'Overview' : 'Deep dive'}</strong> · ${nodes.length} visible / ${graph.nodes.length} total</span><div class="canvas-actions"><button class="fit-button" data-action="fit">Fit view</button><button class="icon-button" data-action="zoom-out" aria-label="Зменшити">−</button><button class="icon-button" data-action="zoom-in" aria-label="Збільшити">+</button></div></div><div class="canvas-viewport">${renderGraph()}</div><div class="canvas-legend"><span><i class="legend-dot"></i>file/service</span><span><i class="legend-dot function"></i>function</span><span><i class="legend-dot class"></i>class</span><span><i class="legend-dot service"></i>config</span></div></section><aside class="tour-sidebar"><div class="tour-header"><h2>Project Tour</h2><span>${state.tourIndex || 0} / ${graph.tour.length}</span></div><div class="tour-progress"><span style="width:${state.tourIndex ? (state.tourIndex / graph.tour.length) * 100 : 0}%"></span></div><div class="tour-list">${renderTour()}</div><div class="tour-controls"><button data-action="tour-prev">← Назад</button><button data-action="tour-next">Далі →</button></div>${activeStep ? `<p class="tour-copy"><strong>${esc(activeStep.title)}</strong><br />Підсвічено ${activeStep.nodeIds.length} вузлів карти.</p>` : '<p class="tour-copy">Оберіть крок, щоб підсвітити пов’язану частину архітектури.</p>'}${renderDetails()}</aside></div></div>`;
  bindEvents();
  applyTransform();
}

function applyTransform() { const content = document.querySelector('.graph-content'); if (content) content.setAttribute('transform', `translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`); }

function fitView() {
  const viewport = document.querySelector('.canvas-viewport');
  if (!viewport) return;
  const scale = Math.min((viewport.clientWidth - 70) / world.width, (viewport.clientHeight - 100) / world.height);
  state.zoom = Math.max(.28, Math.min(1, scale));
  state.pan = { x: Math.max(20, (viewport.clientWidth - world.width * state.zoom) / 2), y: Math.max(34, (viewport.clientHeight - world.height * state.zoom) / 2) };
  applyTransform();
}

function selectNode(id) { state.selectedNodeId = id; if (id) location.hash = `node=${encodeURIComponent(id)}`; render(); }

function toggleType(type) { if (state.selectedTypes.has(type)) state.selectedTypes.delete(type); else state.selectedTypes.add(type); state.mode = 'deep-dive'; render(); fitView(); }
function toggleLayer(id) { state.selectedLayerId = state.selectedLayerId === id ? null : id; state.mode = state.selectedLayerId ? 'deep-dive' : 'overview'; render(); fitView(); }
function selectTour(order) { state.tourIndex = Number(order); state.mode = 'deep-dive'; state.selectedLayerId = null; state.selectedTypes.clear(); state.query = ''; state.selectedNodeId = graph.tour[state.tourIndex - 1].nodeIds[0] || null; render(); fitView(); }

function bindEvents() {
  document.querySelectorAll('[data-node-id]').forEach((element) => element.addEventListener('click', (event) => { event.stopPropagation(); selectNode(element.dataset.nodeId); }));
  document.querySelectorAll('.chip[data-type]').forEach((element) => element.addEventListener('click', () => toggleType(element.dataset.type)));
  document.querySelectorAll('[data-layer-id]').forEach((element) => element.addEventListener('click', () => toggleLayer(element.dataset.layerId)));
  document.querySelectorAll('[data-tour-id]').forEach((element) => element.addEventListener('click', () => selectTour(element.dataset.tourId)));
  document.querySelectorAll('[data-action]').forEach((element) => element.addEventListener('click', () => {
    const action = element.dataset.action;
    if (action === 'overview') { state.mode = 'overview'; state.selectedLayerId = null; state.selectedTypes.clear(); state.query = ''; state.tourIndex = 0; render(); fitView(); }
    if (action === 'deep-dive') { state.mode = 'deep-dive'; render(); fitView(); }
    if (action === 'fit') fitView();
    if (action === 'zoom-in') { state.zoom = Math.min(2, state.zoom * 1.2); applyTransform(); }
    if (action === 'zoom-out') { state.zoom = Math.max(.25, state.zoom / 1.2); applyTransform(); }
    if (action === 'tour-prev') selectTour(Math.max(1, state.tourIndex - 1 || 1));
    if (action === 'tour-next') selectTour(Math.min(graph.tour.length, (state.tourIndex || 0) + 1));
  }));
  const input = document.querySelector('#node-search');
  input?.addEventListener('input', (event) => { state.query = event.target.value; state.mode = 'deep-dive'; render(); const next = document.querySelector('#node-search'); next?.focus(); next?.setSelectionRange(state.query.length, state.query.length); });
  const viewport = document.querySelector('.canvas-viewport');
  viewport?.addEventListener('pointerdown', (event) => { if (event.target.closest('[data-node-id]')) return; drag = { x: event.clientX, y: event.clientY, pan: { ...state.pan } }; viewport.classList.add('dragging'); viewport.setPointerCapture(event.pointerId); });
  viewport?.addEventListener('pointermove', (event) => { if (!drag) return; state.pan = { x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y }; applyTransform(); });
  viewport?.addEventListener('pointerup', () => { drag = null; viewport.classList.remove('dragging'); });
  viewport?.addEventListener('wheel', (event) => { event.preventDefault(); const oldZoom = state.zoom; const nextZoom = Math.max(.25, Math.min(2, oldZoom * (event.deltaY < 0 ? 1.1 : .9))); const rect = viewport.getBoundingClientRect(); const px = event.clientX - rect.left; const py = event.clientY - rect.top; const worldX = (px - state.pan.x) / oldZoom; const worldY = (py - state.pan.y) / oldZoom; state.zoom = nextZoom; state.pan = { x: px - worldX * nextZoom, y: py - worldY * nextZoom }; applyTransform(); }, { passive: false });
}

async function boot() {
  try {
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    graph = await response.json();
    state.selectedNodeId = getHashNode();
    render();
    requestAnimationFrame(fitView);
  } catch (error) {
    app.innerHTML = `<section class="error-card"><strong>Не вдалося завантажити graph data.</strong><br />${esc(error.message)}</section>`;
    console.error(error);
  }
}

window.addEventListener('hashchange', () => { state.selectedNodeId = getHashNode(); if (graph) render(); });
window.addEventListener('keydown', (event) => { if (event.key === '0') fitView(); if (event.key === '+' || event.key === '=') { state.zoom = Math.min(2, state.zoom * 1.2); applyTransform(); } if (event.key === '-') { state.zoom = Math.max(.25, state.zoom / 1.2); applyTransform(); } });
boot();
