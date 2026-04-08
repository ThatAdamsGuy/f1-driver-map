const NODES_CSV_PATH = 'data/nodes.csv';
const LINKS_CSV_PATH = 'data/links.csv';

const COLOR_OVERRIDES = {
  Team: {
    '1': '#ff7f0e',
    '2': '#17becf',
    '3': '#1f77b4',
    '4': '#d62728',
    '5': '#3366cc',
    '6': '#aec7e8',
    '7': '#2ca02c',
    '8': '#c7c7c7',
    '9': '#8c564b',
    '10': '#9467bd',
    '11': '#7f7f7f',
    '12': '#bcbd22',
    '13': '#7a9a01'
  }
};

const TEAM_LABELS = {
  '1': 'Current team 1',
  '2': 'Current team 2',
  '3': 'Current team 3',
  '4': 'Current team 4',
  '5': 'Current team 5',
  '6': 'Current team 6',
  '7': 'Current team 7',
  '8': 'Current team 8',
  '9': 'Current team 9',
  '10': 'Current team 10',
  '11': 'Current team 11',
  '12': 'Former teammate of a current driver',
  '13': 'Never teammate with a current driver'
};

const colorBySelect = document.getElementById('colorBy');
const legendEl = document.getElementById('legend');
const selectionInfoEl = document.getElementById('selectionInfo');
const fitButton = document.getElementById('fitButton');
const rerunLayoutButton = document.getElementById('rerunLayoutButton');
const showLabelsCheckbox = document.getElementById('showLabels');

let cy;
let nodeRows = [];
let edgeRows = [];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? '').trim();
    });
    return row;
  });
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

async function loadCsv(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.text();
}

function getDistinctValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
}

function getNodeColor(nodeData, field) {
  const value = `${nodeData[field] ?? ''}`;
  const overrides = COLOR_OVERRIDES[field] ?? {};
  if (overrides[value]) return overrides[value];

  const fallbackPalette = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ];

  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }

  return fallbackPalette[Math.abs(hash) % fallbackPalette.length];
}

function getEdgeWidth(weighting) {
  const numeric = Number(weighting);
  if (Number.isNaN(numeric)) return 2;
  return Math.max(1.2, 7 - numeric * 1.1);
}

function buildElements(nodes, links) {
  const nodeElements = nodes.map((row) => ({
    data: {
      id: row.Name,
      label: row.Name,
      ...row,
      color: getNodeColor(row, colorBySelect.value)
    }
  }));

  const edgeElements = links.map((row, index) => ({
    data: {
      id: `${row.Source}__${row.Target}__${index}`,
      source: row.Source,
      target: row.Target,
      weighting: row.Weighting,
      width: getEdgeWidth(row.Weighting)
    }
  }));

  return [...nodeElements, ...edgeElements];
}

function populateColourOptions(nodes) {
  const keys = Object.keys(nodes[0] ?? {}).filter((key) => !['Name'].includes(key));
  colorBySelect.innerHTML = '';
  keys.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    if (key === 'Team') option.selected = true;
    colorBySelect.appendChild(option);
  });
}

function renderLegend(nodes, field) {
  const values = getDistinctValues(nodes, field);
  legendEl.innerHTML = '';

  values.forEach((value) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = getNodeColor({ [field]: value }, field);

    const text = document.createElement('span');
    text.textContent = field === 'Team' ? `${value}: ${TEAM_LABELS[value] ?? value}` : value;

    item.appendChild(swatch);
    item.appendChild(text);
    legendEl.appendChild(item);
  });
}

function createGraph() {
  if (cy) cy.destroy();

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: buildElements(nodeRows, edgeRows),
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'label': showLabelsCheckbox.checked ? 'data(label)' : '',
          'font-size': 12,
          'text-wrap': 'none',
          'text-max-width': 180,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 8,
          'color': '#334155',
          'width': 22,
          'height': 22,
          'border-width': 1,
          'border-color': '#ffffff'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 'data(width)',
          'line-color': 'rgba(148, 163, 184, 0.45)',
          'curve-style': 'bezier'
        }
      },
      {
        selector: ':selected',
        style: {
          'border-width': 3,
          'border-color': '#0f172a',
          'line-color': '#0f172a',
          'target-arrow-color': '#0f172a'
        }
      }
    ],
    layout: {
      name: 'cose',
      animate: false,
      fit: true,
      padding: 40,
      nodeRepulsion: 250000,
      idealEdgeLength: 90,
      edgeElasticity: 60,
      gravity: 30,
      numIter: 1500
    },
    wheelSensitivity: 0.18,
    minZoom: 0.1,
    maxZoom: 6,
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false
  });

  cy.on('tap', 'node', (event) => {
    const data = event.target.data();
    selectionInfoEl.innerHTML = `
      <strong>${data.label}</strong><br>
      Team group: ${data.Team ?? 'n/a'}${TEAM_LABELS[data.Team] ? ` (${TEAM_LABELS[data.Team]})` : ''}
    `;
  });

  cy.on('tap', 'edge', (event) => {
    const data = event.target.data();
    selectionInfoEl.innerHTML = `
      <strong>${data.source}</strong> ↔ <strong>${data.target}</strong><br>
      Weighting: ${data.weighting}
    `;
  });

  cy.on('tap', (event) => {
    if (event.target === cy) {
      selectionInfoEl.textContent = 'Click a node or link.';
    }
  });
}

function refreshNodeColours() {
  const field = colorBySelect.value;
  cy.nodes().forEach((node) => {
    const data = node.data();
    node.data('color', getNodeColor(data, field));
  });
  renderLegend(nodeRows, field);
}

function refreshLabels() {
  cy.style()
    .selector('node')
    .style('label', showLabelsCheckbox.checked ? 'data(label)' : '')
    .update();
}

async function init() {
  try {
    const [nodesCsv, linksCsv] = await Promise.all([
      loadCsv(NODES_CSV_PATH),
      loadCsv(LINKS_CSV_PATH)
    ]);

    nodeRows = parseCsv(nodesCsv);
    edgeRows = parseCsv(linksCsv);

    populateColourOptions(nodeRows);
    createGraph();
    renderLegend(nodeRows, colorBySelect.value);

    colorBySelect.addEventListener('change', refreshNodeColours);
    showLabelsCheckbox.addEventListener('change', refreshLabels);
    fitButton.addEventListener('click', () => cy.fit(undefined, 40));
    rerunLayoutButton.addEventListener('click', () => {
      cy.layout({
        name: 'cose',
        animate: 'end',
        fit: true,
        padding: 40,
        nodeRepulsion: 250000,
        idealEdgeLength: 90,
        edgeElasticity: 60,
        gravity: 30,
        numIter: 1500
      }).run();
    });
  } catch (error) {
    console.error(error);
    selectionInfoEl.textContent = `Failed to load graph data. ${error.message}`;
  }
}

init();
