const app = document.querySelector('#app');
const dataUrl = new URL('./data/architecture-map.json', document.baseURI);
let graph;
let selectedNodeId = null;
let selectedLayerId = null;
let query = '';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const nodePath = (node) => node.filePath || node.id;
const nodeLabel = (node) => node.name || node.id.split(':').pop();
const getHashNode = () => {
  const match = location.hash.match(/^#node=(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
};
const degrees = () => {
  const result = new Map();
  for (const edge of graph.edges) {
    result.set(edge.source, (result.get(edge.source) || 0) + 1);
    result.set(edge.target, (result.get(edge.target) || 0) + 1);
  }
  return result;
};
const findNode = (id) => graph.nodes.find((node) => node.id === id);
const selectNode = (id) => {
  selectedNodeId = id;
  if (id) location.hash = `node=${encodeURIComponent(id)}`;
  render();
};
const filteredNodes = () => {
  const needle = query.trim().toLowerCase();
  const layer = selectedLayerId && graph.layers.find((item) => item.id === selectedLayerId);
  const layerIds = layer ? new Set(layer.nodeIds) : null;
  return graph.nodes.filter((node) => (!layerIds || layerIds.has(node.id)) && (!needle || `${node.id} ${node.name} ${node.filePath || ''} ${node.summary || ''}`.toLowerCase().includes(needle))).slice(0, 160);
};

function renderStats() {
  const stats = [
    ['1 332', 'вузлів'], ['3 647', 'зв’язків'], ['7', 'шарів'], ['8', 'кроків tour'], ['283', 'файли'], [graph.source.commit.slice(0, 7), 'staging commit'],
  ];
  return `<section class="stats">${stats.map(([value, label]) => `<div class="panel stat"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('')}</section>`;
}

function renderSvg() {
  const degree = degrees();
  const nodes = graph.nodes.filter((node) => node.type === 'file' && node.filePath).sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0)).slice(0, 18);
  const positions = new Map(nodes.map((node, index) => [node.id, { x: 110 + (index % 6) * 150, y: 90 + Math.floor(index / 6) * 110 }]));
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target)).slice(0, 45);
  const edgeSvg = edges.map((edge) => { const a = positions.get(edge.source); const b = positions.get(edge.target); return `<line class="edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`; }).join('');
  const nodeSvg = nodes.map((node) => { const p = positions.get(node.id); const active = selectedNodeId === node.id ? ' selected' : ''; const label = esc(nodeLabel(node).slice(0, 20)); return `<g data-node-id="${esc(node.id)}"><rect class="graph-node${active}" x="${p.x - 55}" y="${p.y - 24}" width="110" height="48" rx="9" /><text class="graph-label" text-anchor="middle" x="${p.x}" y="${p.y - 2}">${label}</text><text class="graph-label" text-anchor="middle" x="${p.x}" y="${p.y + 13}" opacity=".65">${degree.get(node.id) || 0} links</text></g>`; }).join('');
  return `<div class="graph-wrap"><svg viewBox="0 0 960 420" role="img" aria-label="Граф найбільш пов’язаних файлів">${edgeSvg}${nodeSvg}</svg></div>`;
}

function renderDetails() {
  const node = findNode(selectedNodeId);
  if (!node) return '<div class="details muted">Оберіть вузол на графі або в списку нижче.</div>';
  const related = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).slice(0, 12);
  return `<div class="details"><h3>${esc(nodeLabel(node))}</h3><p class="muted"><code>${esc(node.id)}</code></p><p>${esc(node.summary)}</p><p class="muted">Тип: ${esc(node.type)} · Complexity: ${esc(node.complexity || 'n/a')} · Зв’язків у графі: ${related.length}</p></div>`;
}

function renderLayers() {
  return graph.layers.map((layer) => `<button class="layer-button${selectedLayerId === layer.id ? ' active' : ''}" data-layer-id="${esc(layer.id)}"><strong>${esc(layer.name)}</strong><span>${esc(layer.description)} · ${layer.nodeIds.length} вузлів</span></button>`).join('');
}

function renderTour() {
  return graph.tour.map((step) => `<button class="tour-step" data-tour-id="${esc(step.order)}"><strong>${esc(step.order)}. ${esc(step.title)}</strong><span>${step.nodeIds.length} вузлів у кроці</span></button>`).join('');
}

function renderNodeList() {
  const nodes = filteredNodes();
  return nodes.map((node) => `<button class="node-button" data-node-id="${esc(node.id)}"><small>${esc(nodePath(node))}</small><strong>${esc(nodeLabel(node))}</strong><span>${esc(node.summary)}</span></button>`).join('') || '<p class="muted">Нічого не знайдено.</p>';
}

function render() {
  const source = graph.source;
  app.innerHTML = `<div class="notice"><p><strong>Публічна read-only карта.</strong> Містить лише санітизовані метадані; вихідний код і секрети не включені.</p></div>${renderStats()}<div class="grid"><section class="panel"><div class="panel-head"><h2>Карта зв’язків</h2><span class="muted">top 18 за кількістю зв’язків</span></div>${renderSvg()}</section><section class="panel"><h2>Обраний вузол</h2>${renderDetails()}<hr /><h2>Tour</h2><div class="tour-list">${renderTour()}</div></section></div><div class="grid"><section class="panel"><h2>Архітектурні шари</h2><div class="layer-list">${renderLayers()}</div></section><section class="panel"><h2>Snapshot</h2><p class="muted">Джерело: <code>${esc(source.repository)}</code></p><p class="muted">Branch: <code>${esc(source.branch)}</code></p><p class="muted">Commit: <code>${esc(source.commit)}</code></p><p class="muted">Scope: ${source.scope.map(esc).join(', ')}</p></section></div><section class="panel"><div class="panel-head"><h2>Вузли карти</h2><span class="muted">показано до 160 результатів</span></div><div class="toolbar"><input id="node-search" type="search" placeholder="Пошук файлу, функції, класу або summary…" value="${esc(query)}" /><button class="layer-button" id="clear-filter" type="button">Скинути фільтри</button></div><div class="node-list">${renderNodeList()}</div></section><p class="footer">Generated from the sanitized staging snapshot. Structural data: architecture-map.json · Fingerprints: structural-fingerprints.json.</p>`;
  app.querySelector('#node-search').addEventListener('input', (event) => { query = event.target.value; render(); const input = app.querySelector('#node-search'); input.focus(); input.setSelectionRange(query.length, query.length); });
  app.querySelector('#clear-filter').addEventListener('click', () => { query = ''; selectedLayerId = null; render(); });
  app.querySelectorAll('[data-node-id]').forEach((element) => element.addEventListener('click', () => selectNode(element.dataset.nodeId)));
  app.querySelectorAll('[data-layer-id]').forEach((element) => element.addEventListener('click', () => { selectedLayerId = selectedLayerId === element.dataset.layerId ? null : element.dataset.layerId; render(); }));
  app.querySelectorAll('[data-tour-id]').forEach((element) => element.addEventListener('click', () => { const step = graph.tour.find((item) => String(item.order) === element.dataset.tourId); selectedNodeId = step?.nodeIds[0] || null; if (selectedNodeId) location.hash = `node=${encodeURIComponent(selectedNodeId)}`; render(); }));
}

async function boot() {
  try {
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    graph = await response.json();
    selectedNodeId = getHashNode();
    render();
  } catch (error) {
    app.innerHTML = `<section class="notice"><p><strong>Не вдалося завантажити graph data.</strong> ${esc(error.message)}</p></section>`;
    console.error(error);
  }
}
window.addEventListener('hashchange', () => { selectedNodeId = getHashNode(); if (graph) render(); });
boot();
