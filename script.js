const NODES_CSV_PATH = 'data/driver_teams.csv';
const LINKS_CSV_PATH = 'data/driver_edges.csv';

const TEAM_ID_KEY = 'Team Id';
const TEAM_NAME_KEY = 'Team Name';
const DRIVER_A_KEY = 'Driver A';
const DRIVER_B_KEY = 'Driver B';

const COLOR_OVERRIDES = {
  '1': '#ef8733',
  '2': '#75F1D3',
  '3': '#4570C0',
  '4': '#D52E37',
  '5': '#3267D4',
  '6': '#7091f8',
  '7': '#4B9774',
  '8': '#DFE1E2',
  '9': '#EB4526',
  '10': '#479FE2',
  '11': '#AAAADD'
};

const layoutModeSelect = document.getElementById('layoutMode');
const legendEl = document.getElementById('legend');
const selectionInfoEl = document.getElementById('selectionInfo');
const fitButton = document.getElementById('fitButton');
const rerunLayoutButton = document.getElementById('rerunLayoutButton');
const showLabelsCheckbox = document.getElementById('showLabels');

let cy;
let nodeRows = [];
let edgeRows = [];
let adjacency = new Map();

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
    return String(a).localeCompare(String(b));
  });
}

function getNodeColor(row) {
  const value = `${row[TEAM_ID_KEY] ?? ''}`;
  if (COLOR_OVERRIDES[value]) return COLOR_OVERRIDES[value];

  const fallbackPalette = [
    '#5B8FF9', '#61DDAA', '#65789B', '#F6BD16', '#7262FD',
    '#78D3F8', '#9661BC', '#F6903D', '#008685', '#F08BB4'
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
  return Math.max(1.1, 7 - numeric * 1.05);
}

function isCurrentDriver(row) {
  const teamId = Number(row[TEAM_ID_KEY]);
  return Number.isFinite(teamId) && teamId >= 1 && teamId <= 11;
}

function getTeamGroupLevel(row) {
  const teamId = Number(row[TEAM_ID_KEY]);
  if (!Number.isFinite(teamId)) return 99;
  if (teamId >= 1 && teamId <= 11) return 1;
  if (teamId === 12) return 2;
  return Math.max(3, teamId - 10);
}

function buildAdjacency(nodes, links) {
  const map = new Map();
  nodes.forEach((row) => map.set(row.Name, new Set()));
  links.forEach((row) => {
    const a = row[DRIVER_A_KEY];
    const b = row[DRIVER_B_KEY];
    if (!map.has(a)) map.set(a, new Set());
    if (!map.has(b)) map.set(b, new Set());
    map.get(a).add(b);
    map.get(b).add(a);
  });
  return map;
}

function buildElements(nodes, links) {
  const nodeElements = nodes.map((row) => ({
    data: {
      id: row.Name,
      label: row.Name,
      isCurrent: isCurrentDriver(row) ? 'true' : 'false',
      groupLevel: getTeamGroupLevel(row),
      ...row,
      color: getNodeColor(row)
    }
  }));

  const edgeElements = links.map((row, index) => ({
    data: {
      id: `${row[DRIVER_A_KEY]}__${row[DRIVER_B_KEY]}__${index}`,
      source: row[DRIVER_A_KEY],
      target: row[DRIVER_B_KEY],
      weighting: row.Weighting,
      width: getEdgeWidth(row.Weighting)
    }
  }));

  return [...nodeElements, ...edgeElements];
}

function getLegendText(value) {
  const sampleNode = nodeRows.find((row) => `${row[TEAM_ID_KEY]}` === `${value}`);
  const teamName = sampleNode?.[TEAM_NAME_KEY]?.trim();

  if (teamName) return `${value}: ${teamName}`;
  if (`${value}` === '12') return '12: Former teammate of a current driver';
  return `${value}: Kevin Bacon distance ${value}`;
}

function renderLegend(nodes) {
  const values = getDistinctValues(nodes, TEAM_ID_KEY);
  legendEl.innerHTML = '';

  values.forEach((value) => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = getNodeColor({ [TEAM_ID_KEY]: value });

    const text = document.createElement('span');
    text.textContent = getLegendText(value);

    item.appendChild(swatch);
    item.appendChild(text);
    legendEl.appendChild(item);
  });
}

function getCurrentDriverOrder() {
  return nodeRows
    .filter(isCurrentDriver)
    .sort((a, b) => {
      const teamDiff = Number(a[TEAM_ID_KEY]) - Number(b[TEAM_ID_KEY]);
      if (teamDiff !== 0) return teamDiff;
      return a.Name.localeCompare(b.Name);
    });
}

function angleForCurrentTeam(teamId, positionInTeam, teamCount) {
  const teamIndex = teamId - 1;
  const baseAngle = (-Math.PI / 2) + ((2 * Math.PI * teamIndex) / Math.max(teamCount, 1));
  const spread = 0.11;
  if (positionInTeam === 0) return baseAngle - spread;
  if (positionInTeam === 1) return baseAngle + spread;
  return baseAngle + ((positionInTeam - 0.5) * 0.09);
}

function groupRowsByRing() {
  const ringGroups = new Map();
  nodeRows.filter((row) => !isCurrentDriver(row)).forEach((row) => {
    const ring = getTeamGroupLevel(row);
    if (!ringGroups.has(ring)) ringGroups.set(ring, []);
    ringGroups.get(ring).push(row);
  });
  return [...ringGroups.entries()].sort((a, b) => a[0] - b[0]);
}

function normaliseAngle(angle) {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

function circularAngleDiff(a, b) {
  const twoPi = Math.PI * 2;
  let diff = Math.abs(normaliseAngle(a) - normaliseAngle(b));
  if (diff > Math.PI) diff = twoPi - diff;
  return diff;
}

function computeRingRadius(baseRadius, nodeCount, minArcSpacing = 52) {
  const requiredRadius = (nodeCount * minArcSpacing) / (2 * Math.PI);
  return Math.max(baseRadius, requiredRadius);
}

function getPreferredAngleForRow(row, anglesByNode) {
  const neighbourAngles = [...(adjacency.get(row.Name) ?? [])]
    .filter((name) => anglesByNode.has(name))
    .map((name) => anglesByNode.get(name));

  if (!neighbourAngles.length) {
    return null;
  }

  if (neighbourAngles.length === 1) {
    return neighbourAngles[0];
  }

  let sumX = 0;
  let sumY = 0;

  neighbourAngles.forEach((angle) => {
    sumX += Math.cos(angle);
    sumY += Math.sin(angle);
  });

  if (sumX === 0 && sumY === 0) {
    return neighbourAngles[0];
  }

  return normaliseAngle(Math.atan2(sumY, sumX));
}

function placeRowsOnRing(rows, baseRadius, positions, anglesByNode, minArcSpacing = 52) {
  if (!rows.length) return;

  const radius = computeRingRadius(baseRadius, rows.length, minArcSpacing);
  const slotCount = rows.length;
  const slotStep = (Math.PI * 2) / slotCount;

  const decorated = rows.map((row) => ({
    row,
    preferredAngle: getPreferredAngleForRow(row, anglesByNode)
  }));

  const anchored = decorated
    .filter((item) => item.preferredAngle !== null)
    .sort((a, b) => a.preferredAngle - b.preferredAngle || a.row.Name.localeCompare(b.row.Name));

  const unanchored = decorated
    .filter((item) => item.preferredAngle === null)
    .sort((a, b) => a.row.Name.localeCompare(b.row.Name));

  const ordered = [...anchored, ...unanchored];

  let bestRotation = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let test = 0; test < slotCount; test++) {
    const rotation = test * slotStep;
    let score = 0;

    for (let i = 0; i < anchored.length; i++) {
      const slotAngle = normaliseAngle(rotation + (i * slotStep));
      score += circularAngleDiff(slotAngle, anchored[i].preferredAngle);
    }

    if (score < bestScore) {
      bestScore = score;
      bestRotation = rotation;
    }
  }

  ordered.forEach(({ row }, index) => {
    const angle = normaliseAngle(bestRotation + (index * slotStep));
    positions[row.Name] = {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    };
    anglesByNode.set(row.Name, angle);
  });
}

function buildStructuredPositions() {
  const positions = {};
  const anglesByNode = new Map();

  const currentRows = getCurrentDriverOrder();
  const teamBuckets = new Map();
  currentRows.forEach((row) => {
    const key = Number(row[TEAM_ID_KEY]);
    if (!teamBuckets.has(key)) teamBuckets.set(key, []);
    teamBuckets.get(key).push(row);
  });

  const currentRadius = 250;
  [...teamBuckets.entries()].sort((a, b) => a[0] - b[0]).forEach(([teamId, rows]) => {
    rows.sort((a, b) => a.Name.localeCompare(b.Name));
    rows.forEach((row, index) => {
      const angle = angleForCurrentTeam(teamId, index, teamBuckets.size);
      positions[row.Name] = {
        x: currentRadius * Math.cos(angle),
        y: currentRadius * Math.sin(angle)
      };
      anglesByNode.set(row.Name, angle);
    });
  });

  const minArcSpacing = 60;
  groupRowsByRing().forEach(([ring, rows], ringIndex) => {
    const baseRadius = 440 + (ringIndex * 170);
    placeRowsOnRing(rows, baseRadius, positions, anglesByNode, minArcSpacing);
  });

  return positions;
}

function buildCenterClusterPositions() {
  const positions = {};
  const anglesByNode = new Map();
  const currentRows = getCurrentDriverOrder();
  const teamBuckets = new Map();

  currentRows.forEach((row) => {
    const key = Number(row[TEAM_ID_KEY]);
    if (!teamBuckets.has(key)) teamBuckets.set(key, []);
    teamBuckets.get(key).push(row);
  });

  const teamEntries = [...teamBuckets.entries()].sort((a, b) => a[0] - b[0]);
  const teamRadius = 135;
  teamEntries.forEach(([teamId, rows], teamIndex) => {
    const teamAngle = (-Math.PI / 2) + ((2 * Math.PI * teamIndex) / Math.max(teamEntries.length, 1));
    const anchorX = teamRadius * Math.cos(teamAngle);
    const anchorY = teamRadius * Math.sin(teamAngle);

    rows.sort((a, b) => a.Name.localeCompare(b.Name));
    rows.forEach((row, teammateIndex) => {
      const localAngle = teamAngle + (teammateIndex === 0 ? -Math.PI / 2 : Math.PI / 2);
      const offset = rows.length === 1 ? 0 : 20;
      positions[row.Name] = {
        x: anchorX + offset * Math.cos(localAngle),
        y: anchorY + offset * Math.sin(localAngle)
      };
      anglesByNode.set(row.Name, teamAngle + (teammateIndex === 0 ? -0.08 : 0.08));
    });
  });

  const minArcSpacing = 60;
  groupRowsByRing().forEach(([ring, rows], ringIndex) => {
    const baseRadius = 330 + (ringIndex * 165);
    placeRowsOnRing(rows, baseRadius, positions, anglesByNode, minArcSpacing);
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
    nodeRepulsion: 300000,
    idealEdgeLength: 95,
    edgeElasticity: 70,
    gravity: 24,
    gravityRangeCompound: 1.5,
    numIter: 1800,
    initialTemp: 220,
    coolingFactor: 0.96
  };
}

function formatNodeSelection(data) {
  const details = [
    `<strong>${data.label}</strong>`,
    `Team ID: ${data[TEAM_ID_KEY] ?? 'n/a'}`
  ];

  if (data[TEAM_NAME_KEY]) details.push(`Team name: ${data[TEAM_NAME_KEY]}`);
  return details.join('<br>');
}

function shortestPathDistances(startId) {
  const distances = new Map([[startId, 0]]);
  const queue = [startId];

  while (queue.length) {
    const current = queue.shift();
    const currentDistance = distances.get(current);
    for (const neighbour of adjacency.get(current) ?? []) {
      if (!distances.has(neighbour)) {
        distances.set(neighbour, currentDistance + 1);
        queue.push(neighbour);
      }
    }
  }

  return distances;
}

function getOpacityForDistance(distance) {
  if (distance === undefined) return 0.08;
  if (distance <= 1) return 1;
  if (distance === 2) return 0.75;
  if (distance === 3) return 0.5;
  return 0.25;
}

function clearHoverFocus() {
  if (!cy) return;
  cy.nodes().forEach((node) => {
    node.removeClass('hover-dim hover-mid hover-far hover-faint hover-focus');
  });
  cy.edges().forEach((edge) => {
    edge.removeClass('hover-dim hover-mid hover-far hover-faint hover-focus');
  });
}

function applyHoverFocus(nodeId) {
  const distances = shortestPathDistances(nodeId);

  cy.nodes().forEach((node) => {
    const distance = distances.get(node.id());
    node.removeClass('hover-dim hover-mid hover-far hover-faint hover-focus');

    if (distance === 0 || distance === 1) {
      node.addClass('hover-focus');
    } else if (distance === 2) {
      node.addClass('hover-mid');
    } else if (distance === 3) {
      node.addClass('hover-far');
    } else if (distance !== undefined) {
      node.addClass('hover-faint');
    } else {
      node.addClass('hover-dim');
    }
  });

  cy.edges().forEach((edge) => {
    const sourceDistance = distances.get(edge.data('source'));
    const targetDistance = distances.get(edge.data('target'));
    const edgeDistance = Math.min(
      sourceDistance ?? Number.POSITIVE_INFINITY,
      targetDistance ?? Number.POSITIVE_INFINITY
    );

    edge.removeClass('hover-dim hover-mid hover-far hover-faint hover-focus');

    if (edge.data('source') === nodeId || edge.data('target') === nodeId) {
      edge.addClass('hover-focus');
    } else if (edgeDistance === 2) {
      edge.addClass('hover-mid');
    } else if (edgeDistance === 3) {
      edge.addClass('hover-far');
    } else if (Number.isFinite(edgeDistance)) {
      edge.addClass('hover-faint');
    } else {
      edge.addClass('hover-dim');
    }
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
          'text-outline-width': 0,
          'width': 22,
          'height': 22,
          'border-width': 1,
          'border-color': '#ffffff',
          'opacity': 1,
          'transition-property': 'opacity, border-width, line-color, width, height',
          'transition-duration': '120ms'
        }
      },
      {
        selector: 'node[isCurrent = "true"]',
        style: {
          'width': 30,
          'height': 30,
          'border-width': 2
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 'data(width)',
          'line-color': 'rgba(148, 163, 184, 0.45)',
          'curve-style': 'bezier',
          'opacity': 1,
          'transition-property': 'opacity, line-color, width',
          'transition-duration': '120ms'
        }
      },
      {
        selector: 'edge[weighting = "1"]',
        style: {
          'line-color': 'rgba(30, 41, 59, 0.62)'
        }
      },
      {
        selector: '.hover-focus',
        style: {
          'opacity': 1
        }
      },
      {
        selector: '.hover-mid',
        style: {
          'opacity': 0.75
        }
      },
      {
        selector: '.hover-far',
        style: {
          'opacity': 0.5
        }
      },
      {
        selector: '.hover-faint',
        style: {
          'opacity': 0.25
        }
      },
      {
        selector: '.hover-dim',
        style: {
          'opacity': 0.08
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

  cy.on('mouseover', 'node', (event) => {
    applyHoverFocus(event.target.id());
  });

  cy.on('mouseout', 'node', () => {
    clearHoverFocus();
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

function refreshLabels() {
  cy.style()
    .selector('node')
    .style('label', showLabelsCheckbox.checked ? 'data(label)' : '')
    .update();
}

function applySelectedLayout() {
  clearHoverFocus();
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
    adjacency = buildAdjacency(nodeRows, edgeRows);

    createGraph();
    renderLegend(nodeRows);

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
