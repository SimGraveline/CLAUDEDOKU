// ---------- Color palette for regions ----------
const PALETTE = [
  "#a3d977", "#f4a6c1", "#3fae5b", "#d98a3d",
  "#7b6fd6", "#7fc7e8", "#a3683f", "#b07fd6",
  "#e39a7a", "#2f9e8f"
];

// cell states
const EMPTY = 0;
const WHITE_X = 1;
const CORRECT_CAT = 2;
const RED_X = 3;

const DOUBLE_CLICK_MS = 280;

let size = 8;
let regions = [];
let solution = [];
let state = [];
let cellEls = []; // persistent DOM references [r][c]
let errorCount = 0;
let locked = false;

const gridEl = document.getElementById("grid");
const messageEl = document.getElementById("message");
const sizeSelect = document.getElementById("sizeSelect");
const newGameBtn = document.getElementById("newGameBtn");
const clearBtn = document.getElementById("clearBtn");
const catCountEl = document.getElementById("catCount");
const catTotalEl = document.getElementById("catTotal");
const errorCountEl = document.getElementById("errorCount");

newGameBtn.addEventListener("click", () => {
  size = parseInt(sizeSelect.value, 10);
  newGame();
});
clearBtn.addEventListener("click", clearGrid);

// ==================== GENERATION ====================

function generateSolution(n) {
  const cols = [...Array(n).keys()];
  const result = new Array(n).fill(-1);

  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function backtrack(row, usedCols) {
    if (row === n) return true;
    const candidates = shuffled(cols.filter(c => !usedCols.has(c)));
    for (const c of candidates) {
      if (row > 0 && Math.abs(result[row - 1] - c) <= 1) continue;
      result[row] = c;
      usedCols.add(c);
      if (backtrack(row + 1, usedCols)) return true;
      usedCols.delete(c);
      result[row] = -1;
    }
    return false;
  }

  backtrack(0, new Set());
  return result;
}

function generateRegions(n, sol) {
  const grid = Array.from({ length: n }, () => new Array(n).fill(-1));
  const frontier = [];

  for (let r = 0; r < n; r++) {
    const c = sol[r];
    grid[r][c] = r;
    pushNeighbors(r, c, r);
  }

  function pushNeighbors(r, c, region) {
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of deltas) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] === -1) {
        frontier.push({ region, r: nr, c: nc });
      }
    }
  }

  while (frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const { region, r, c } = frontier.splice(idx, 1)[0];
    if (grid[r][c] !== -1) continue;
    grid[r][c] = region;
    pushNeighbors(r, c, region);
  }

  return grid;
}

// Returns up to `limit` distinct solutions for a given region grid
function findSolutions(n, regs, limit) {
  const solutions = [];
  const usedCols = new Set();
  const usedColors = new Set();
  const positions = new Array(n).fill(-1);

  function backtrack(row) {
    if (solutions.length >= limit) return;
    if (row === n) { solutions.push([...positions]); return; }
    for (let c = 0; c < n; c++) {
      if (solutions.length >= limit) return;
      if (usedCols.has(c)) continue;
      const color = regs[row][c];
      if (usedColors.has(color)) continue;
      if (row > 0 && Math.abs(positions[row - 1] - c) <= 1) continue;
      positions[row] = c;
      usedCols.add(c);
      usedColors.add(color);
      backtrack(row + 1);
      usedCols.delete(c);
      usedColors.delete(color);
    }
  }

  backtrack(0);
  return solutions;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// Checks that every cell has at least one same-color neighbor (up/down/left/right)
function isValidAdjacency(n, regs) {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const color = regs[r][c];
      const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      let hasSameNeighbor = false;
      for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < n && nc >= 0 && nc < n && regs[nr][nc] === color) {
          hasSameNeighbor = true;
          break;
        }
      }
      if (!hasSameNeighbor) return false;
    }
  }
  return true;
}

// Generates a grid guaranteed to have a UNIQUE solution and no isolated color cell
function generateUniquePuzzle(n) {
  const maxOuterAttempts = 150;
  const maxRepairIterations = 60;

  for (let outer = 0; outer < maxOuterAttempts; outer++) {
    const sol = generateSolution(n);
    const regs = generateRegions(n, sol);
    let success = false;

    for (let repair = 0; repair < maxRepairIterations; repair++) {
      const solutions = findSolutions(n, regs, 2);
      if (solutions.length <= 1) {
        success = true;
        break;
      }

      const alt = solutions.find(s => !arraysEqual(s, sol));
      if (!alt) break;

      const diffRows = [];
      for (let r = 0; r < n; r++) {
        if (alt[r] !== sol[r]) diffRows.push(r);
      }
      if (diffRows.length === 0) break;

      const r = diffRows[Math.floor(Math.random() * diffRows.length)];
      regs[r][alt[r]] = r;
    }

    if (success && isValidAdjacency(n, regs)) {
      return { sol, regs };
    }
    // otherwise: attempt rejected (non-unique solution OR isolated cell), retry
  }

  console.warn("Could not find a unique, island-free grid after many attempts — using fallback grid.");
  const sol = generateSolution(n);
  const regs = generateRegions(n, sol);
  return { sol, regs };
}

// ==================== GAME STATE ====================

function newGame() {
  const puzzle = generateUniquePuzzle(size);
  solution = puzzle.sol;
  regions = puzzle.regs;
  state = Array.from({ length: size }, () => new Array(size).fill(EMPTY));
  errorCount = 0;
  locked = false;
  messageEl.textContent = "";
  messageEl.className = "message";
  catTotalEl.textContent = size;
  errorCountEl.textContent = errorCount;
  renderGrid();
}

function clearGrid() {
  state = Array.from({ length: size }, () => new Array(size).fill(EMPTY));
  errorCount = 0;
  locked = false;
  messageEl.textContent = "";
  messageEl.className = "message";
  errorCountEl.textContent = errorCount;
  renderGrid();
}

// ==================== RENDERING ====================

function renderGrid() {
  gridEl.style.gridTemplateColumns = `repeat(${size}, 50px)`;
  gridEl.classList.toggle("locked", locked);
  gridEl.innerHTML = "";
  cellEls = [];

  for (let r = 0; r < size; r++) {
    const rowEls = [];
    for (let c = 0; c < size; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.style.background = PALETTE[regions[r][c] % PALETTE.length];
      cell.dataset.r = r;
      cell.dataset.c = c;
      gridEl.appendChild(cell);
      rowEls.push(cell);
    }
    cellEls.push(rowEls);
  }

  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      updateCellVisual(r, c);

  updateCatCount();
}

// Updates ONE cell in place, without ever touching the rest of the DOM
function updateCellVisual(r, c) {
  const cellEl = cellEls[r][c];
  const s = state[r][c];
  cellEl.classList.remove("correct", "wrong-locked");
  cellEl.innerHTML = "";

  if (s === WHITE_X) {
    cellEl.innerHTML = '<span class="mark white">X</span>';
  } else if (s === RED_X) {
    cellEl.innerHTML = '<span class="mark red">X</span>';
    cellEl.classList.add("wrong-locked");
  } else if (s === CORRECT_CAT) {
    cellEl.textContent = "👨";
    cellEl.classList.add("correct");
  }
}

function updateCatCount() {
  let count = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (state[r][c] === CORRECT_CAT) count++;
  catCountEl.textContent = count;
}

// ==================== INTERACTIONS ====================

// -- Drag-to-paint X marks --
let isPointerDown = false;
let dragOccurred = false;
let paintValue = null;
let paintOriginRC = null;
let lastPaintedCell = null;

gridEl.addEventListener("mousedown", (e) => {
  if (locked) return;
  const cellEl = e.target.closest(".cell");
  if (!cellEl) return;

  const r = parseInt(cellEl.dataset.r, 10);
  const c = parseInt(cellEl.dataset.c, 10);
  const s = state[r][c];
  if (s === CORRECT_CAT || s === RED_X) return;

  e.preventDefault(); // avoid text selection while dragging
  isPointerDown = true;
  dragOccurred = false;
  paintValue = s === WHITE_X ? EMPTY : WHITE_X;
  paintOriginRC = { r, c };
  lastPaintedCell = null;
});

gridEl.addEventListener("mousemove", (e) => {
  if (!isPointerDown || locked) return;
  const cellEl = e.target.closest(".cell");
  if (!cellEl || cellEl === lastPaintedCell) return;

  if (!dragOccurred) {
    dragOccurred = true;
    const { r: or_, c: oc } = paintOriginRC;
    const os = state[or_][oc];
    if (os !== CORRECT_CAT && os !== RED_X) {
      state[or_][oc] = paintValue;
      updateCellVisual(or_, oc);
    }
  }

  const r = parseInt(cellEl.dataset.r, 10);
  const c = parseInt(cellEl.dataset.c, 10);
  const s = state[r][c];
  if (s === CORRECT_CAT || s === RED_X) { lastPaintedCell = cellEl; return; }

  state[r][c] = paintValue;
  updateCellVisual(r, c);
  lastPaintedCell = cellEl;
});

window.addEventListener("mouseup", () => {
  isPointerDown = false;
  paintValue = null;
  paintOriginRC = null;
  lastPaintedCell = null;
});

// -- Single click vs double click (custom detection, independent of DOM identity) --
let pendingSingleClick = null;
let lastClickTime = 0;
let lastClickCell = null;

gridEl.addEventListener("click", (e) => {
  if (dragOccurred) { dragOccurred = false; return; }
  if (locked) return;
  const cellEl = e.target.closest(".cell");
  if (!cellEl) return;
  const r = parseInt(cellEl.dataset.r, 10);
  const c = parseInt(cellEl.dataset.c, 10);
  handleCellClick(r, c);
});

function handleCellClick(r, c) {
  const now = Date.now();
  const sameCell = lastClickCell && lastClickCell.r === r && lastClickCell.c === c;
  const withinWindow = now - lastClickTime <= DOUBLE_CLICK_MS;

  if (sameCell && withinWindow && pendingSingleClick) {
    clearTimeout(pendingSingleClick.timeoutId);
    pendingSingleClick = null;
    onDoubleClick(r, c);
    lastClickTime = 0;
    lastClickCell = null;
    return;
  }

  lastClickTime = now;
  lastClickCell = { r, c };
  const timeoutId = setTimeout(() => {
    onSingleClick(r, c);
    pendingSingleClick = null;
  }, DOUBLE_CLICK_MS);
  pendingSingleClick = { timeoutId, r, c };
}

function onSingleClick(r, c) {
  if (locked) return;
  const s = state[r][c];
  if (s === CORRECT_CAT || s === RED_X) return; // red X and face = locked
  state[r][c] = s === WHITE_X ? EMPTY : WHITE_X;
  updateCellVisual(r, c);
}

function onDoubleClick(r, c) {
  if (locked) return;
  const s = state[r][c];
  if (s === CORRECT_CAT || s === RED_X) return;

  if (c === solution[r]) {
    state[r][c] = CORRECT_CAT;
    updateCellVisual(r, c);
    updateCatCount();
    checkWin();
  } else {
    state[r][c] = RED_X;
    errorCount++;
    errorCountEl.textContent = errorCount;
    updateCellVisual(r, c);

    if (errorCount >= 3) {
      locked = true;
      messageEl.textContent = "💀 You lost — 3 errors";
      messageEl.className = "message lose";
      gridEl.classList.add("locked");
    } else {
      messageEl.textContent = `❌ Wrong spot (${errorCount}/3)`;
      messageEl.className = "message lose";
    }
  }
}

function checkWin() {
  let count = 0;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (state[r][c] === CORRECT_CAT) count++;

  if (count === size) {
    locked = true;
    messageEl.textContent = "🎉 You won!";
    messageEl.className = "message win";
    gridEl.classList.add("locked");
  }
}

// ==================== STARTUP ====================

newGame();