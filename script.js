const NODES_CSV_PATH = 'data/nodes.csv';
const LINKS_CSV_PATH = 'data/links.csv';

const COLOR_OVERRIDES = {
  TeamId: {
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
    '13': '#7a9a01',
    '14': '#b7791f',
    '15': '#0f766e',
    '16': '#be185d'
  }
};

const colorBySelect = document.getElementById('colorBy');
const layoutModeSelect = document.getElementById('layoutMode');
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

function isCurrentDriver(row) {
  const teamId = Number(row.TeamId);
  return Number.isFinite(teamId) && teamId >= 1 && teamId <= 11;
}

function getTeamGroupLevel(row) {
  const teamId = Number(row.TeamId);
  if (!Number.isFinite(teamId)) return 99;
  if (teamId >= 1 && teamId <= 11) return 1;
  if (teamId === 12) return 2;
  return 3 + (teamId - 13);
}

function buildElements(nodes, links) {
  const nodeElements = nodes.map((row) => ({
    data: {
      id: row.Name,
      label: row.Name,
      isCurrent: isCurrentDriver(row) ? 'true' : 'false',
      groupLevel: getTeamGroupLevel(row),
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
    if (key === 'TeamId') option.selected = true;
    colorBySelect.appendChild(option);
  });
}

function getLegendText(field, value) {
  if (field === 'TeamId') {
    const sampleNode = nodeRows.find((row) => `${row.TeamId}` === `${value}`);
    const teamName = sampleNode?.TeamName?.trim();

    if (teamName) return `${value}: ${teamName}`;
    if (`${value}` === '12') return '12: Former teammate of a current driver';
    return `${value}: Kevin Bacon distance ${value}`;
  }

  return value;
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
    text.textContent = getLegendText(field, value);

    item.appendChild(swatch);
    item.appendChild(text);
    legendEl.appendChild(item);
  });
}

function buildStructuredPositions() {
  const positions = {};
  const centerX = 0;
  const centerY = 0;

  const currentRows = nodeRows
    .filter(isCurrentDriver)
    .sort((a, b) => {
      const teamDiff = Number(a.TeamId) - Number(b.TeamId);
      if (teamDiff !== 0) return teamDiff;
      return a.Name.localeCompare(b.Name);
    });

  const currentRadius = 240;
  currentRows.forEach((row, index) => {
    const angle = (-Math.PI / 2) + ((2 * Math.PI * index) / Math.max(currentRows.length, 1));
    positions[row.Name] = {
      x: centerX + currentRadius * Math.cos(angle),
      y: centerY + currentRadius * Math.sin(angle)
    };
  });

  const ringGroups = new Map();
  nodeRows.filter((row) => !isCurrentDriver(row)).forEach((row) => {
    const ring = getTeamGroupLevel(row);
    if (!ringGroups.has(ring)) ringGroups.set(ring, []);
    ringGroups.get(ring).push(row);
  });

  [...ringGroups.keys()].sort((a, b) => a - b).forEach((ring) => {
    const rows = ringGroups.get(ring).sort((a, b) => a.Name.localeCompare(b.Name));
    const ringIndex = ring - 1;
    const radius = 420 + ((ringIndex - 1) * 170);

    rows.forEach((row, index) => {
      const angle = (-Math.PI / 2) + ((2 * Math.PI * index) / Math.max(rows.length, 1));
      positions[row.Name] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });
  });

  return positions;
}

function buildCenterClusterPositions() {
  const positions = {};
  const centerX = 0;
  const centerY = 0;

  const currentRows = nodeRows
    .filter(isCurrentDriver)
    .sort((a, b) => Number(a.TeamId) - Number(b.TeamId) || a.Name.localeCompare(b.Name));

  const teamBuckets = new Map();
  currentRows.forEach((row) => {
    const key = row.TeamId;
    if (!teamBuckets.has(key)) teamBuckets.set(key, []);
    teamBuckets.get(key).push(row);
  });

  const teamEntries = [...teamBuckets.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const teamRadius = 165;
  teamEntries.forEach(([teamId, rows], teamIndex) => {
    const angle = (-Math.PI / 2) + ((2 * Math.PI * teamIndex) / Math.max(teamEntries.length, 1));
    const anchorX = centerX + teamRadius * Math.cos(angle);
    const anchorY = centerY + teamRadius * Math.sin(angle);

    rows.forEach((row, teammateIndex) => {
      const offsetX = teammateIndex === 0 ? -26 : 26;
      const offsetY = teammateIndex === 0 ? -12 : 12;
      positions[row.Name] = { x: anchorX + offsetX, y: anchorY + offsetY };
    });
  });

  const nonCurrent = nodeRows.filter((row) => !isCurrentDriver(row));
  const ringGroups = new Map();
  nonCurrent.forEach((row) => {
    const ring = getTeamGroupLevel(row);
    if (!ringGroups.has(ring)) ringGroups.set(ring, []);
    ringGroups.get(ring).push(row);
  });

  [...ringGroups.keys()].sort((a, b) => a - b).forEach((ring) => {
    const rows = ringGroups.get(ring).sort((a, b) => a.Name.localeCompare(b.Name));
    const ringIndex = ring - 1;
    const radius = 360 + ((ringIndex - 1) * 150);

    rows.forEach((row, index) => {
      const angle = (-Math.PI / 2) + ((2 * Math.PI * index) / Math.max(rows.length, 1));
      positions[row.Name] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });
  });

  return positions;
}

function getLayoutConfig(layoutMode) {
  if (layoutMode === 'structured-rings') {
    return {
      name: 'preset',
      positions: buildStructuredPositions(),
      fit: true,
      padding: 60,
      animate: false
    };
  }

  if (layoutMode === 'current-center') {
    return {
      name: 'preset',
      positions: buildCenterClusterPositions(),
      fit: true,
      padding: 60,
      animate: false
    };
  }

  return {
    name: 'cose',
    animate: false,
    fit: true,
    padding: 40,
    nodeRepulsion: 250000,
    idealEdgeLength: 90,
    edgeElasticity: 60,
    gravity: 30,
    numIter: 1500
  };
}

function formatNodeSelection(data) {
  const details = [
    `<strong>${data.label}</strong>`,
    `Team ID: ${data.TeamId ?? 'n/a'}`
  ];

  if (data.TeamName) details.push(`Team name: ${data.TeamName}`);
  if (data.Team) details.push(`Legacy team field: ${data.Team}`);

  return details.join('<br>');
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
        selector: 'node[isCurrent = "true"]',
        style: {
          'width': 28,
          'height': 28,
          'border-width': 2
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
        selector: 'edge[weighting = "1"]',
        style: {
          'line-color': 'rgba(30, 41, 59, 0.60)'
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
    layout: getLayoutConfig(layoutModeSelect.value),
    wheelSensitivity: 0.18,
    minZoom: 0.1,
    maxZoom: 6,
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false
  });

  cy.on('tap', 'node', (event) => {
    const data = event.target.data();
    selectionInfoEl.innerHTML = formatNodeSelection(data);
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

function applySelectedLayout() {
  cy.layout(getLayoutConfig(layoutModeSelect.value)).run();
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
    layoutModeSelect.addEventListener('change', applySelectedLayout);
    showLabelsCheckbox.addEventListener('change', refreshLabels);
    fitButton.addEventListener('click', () => cy.fit(undefined, 40));
    rerunLayoutButton.addEventListener('click', applySelectedLayout);
  } catch (error) {
    console.error(error);
    selectionInfoEl.textContent = `Failed to load graph data. ${error.message}`;
  }
}

init();
