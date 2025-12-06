<script>
    import { fade } from 'svelte/transition';
    import { tick } from 'svelte';
    import { csvParse, format } from 'd3';
    import { onMount } from "svelte";

    const matchScore = 0;
    const mismatchScore = 1;
    // Input sequences (you can pass these in later)
    export let seqA = "AGTACGCA";
    export let seqB = "TATGC";    

    const yellow = "cfb700";

    $: seqA = seqA.toUpperCase();
    $: seqB = seqB.toUpperCase();

    // Number of rows/cols for DP table
    $: rows = seqA.length + 1;
    $: cols = seqB.length + 1;

    let local_nrows = 0;
    let local_ncols = 0;
    let local_rowOffset = 0;
    let local_colOffset = 0;

    let frames = [];
    let currentFrame = 0;
    let playing = false;
    let speed = 150;
    let lastDisplayedRow = -1;

    // Initialize empty DP table
    $: table = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => "")
    );

    $: highlights = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => "")
    );

     $: sumPulse = Array.from({ length: rows }, () =>
        Array(cols).fill(false)
    );

    let tableEl;
    let svgEl;
    let tableRect = { left: 0, top: 0, width: 0, height: 0 };

    onMount(() => {
      const rect = tableEl.getBoundingClientRect();
      console.log("rect:", rect);

      svgEl.setAttribute("width", rect.width);
      svgEl.setAttribute("height", rect.height);
    })

    async function fillFirstRow() {
        const values = [1, 2, 3, 4, 5, 6];

        for (let c = 0; c < values.length; c++) {
        table[0][c] = values[c];
        
        // allow DOM to update
        await tick();

        // delay for animation pacing
        await new Promise(res => setTimeout(res, 200));
        }
    }

    // implement the hirschberg algorithm later to properly generate the frames
    function generateFrames() {
      frames = []
      currentFrame = 0;
      clearTable();
      highlights = highlights.map(row => row.map(() => ""));
      //const values = [1, 2, 3, 4, 5, 6];
 
      hirschberg(seqA, seqB, 0, 0);
      frames = dedupeHighlights(frames);
      console.log(frames);
    }

    function applyFrame(i) {
      //TODO: generatee cases based on type variable of frame
      const f = frames[i]
      let clear_row_index = -1;
      let rbound = local_rowOffset + local_nrows;
      let cbound = local_colOffset + local_ncols;

      switch (f.type){
        case "setCell":
          table[f.r][f.c] = f.value;
          clear_row_index = -1;

          


          // Detect start of a new row (topdown pass case)
          if (f.r !== lastDisplayedRow){
            lastDisplayedRow = f.r;
            //console.log(lastDisplayedRow + " | " + Math.floor(rows/2) + " | " + f.c);
            if((lastDisplayedRow - local_rowOffset) < local_nrows/2) { // topdown case
              clear_row_index = lastDisplayedRow - 2;
            } else { // bottomup case
              clear_row_index = lastDisplayedRow + 2;
            }
            
          }

          // end of topdown pass
          if ((f.r === (local_rowOffset + Math.floor(local_nrows/2))) && (f.c === (local_colOffset + local_ncols-1))){
            clear_row_index = f.r-1;
          }

          // end of bottomup pass (redundant now that sumcell exists maybe?)
          if (f.r === (local_rowOffset + Math.floor(local_nrows/2) + 1) && f.c === local_colOffset){
            clear_row_index = f.r+1;
          }

          // clear the row
          if (clear_row_index >= 0 && clear_row_index < rbound){
            for (let c = local_colOffset ; c < cbound; c++){
              table[clear_row_index][c] = "";
            }
          }
          
          break;
        
        // occurs on last row of the bottom up pass
        case "sumCell":
          table[f.r][f.c] += f.value;
          clear_row_index = -1;

          if (f.r === (local_rowOffset + Math.floor(local_nrows/2)) && f.c === local_colOffset){
            clear_row_index = f.r+1;
          }

          // clear the row
          if (clear_row_index >= 0 && clear_row_index < rbound){
            for (let c = local_colOffset ; c < cbound; c++){
              table[clear_row_index][c] = "";
            }
          }

          sumPulse[f.r][f.c] = true;
          setTimeout(() => sumPulse[f.r][f.c] = false, 200); // match animation length

          break;

        case "updateBounds":
          local_nrows = f.r;
          local_ncols = f.c;
          local_rowOffset = f.rowOffset;
          local_colOffset = f.colOffset;
          console.log("updating localbounds", local_nrows, local_ncols, local_rowOffset, local_colOffset);
          break;

        // todo: refactor this to highlight
        case "highlight":
          highlights[f.r][f.c] = "cfb700";
          break;

        case "drawSVG":
          generateAlignmentSVG(35);
          break;
        
        case "clearTable":
          clearTable();
          break;

      }
    }

    function testHighlight() {
      highlights[4][2] = "cfb700";
      highlights[3][1] = "cfb700";
      highlights[2][0] = "cfb700";
      highlights[1][0] = "cfb700";
      highlights[0][0] = "cfb700";

      highlights[5][3] = "cfb700";
      highlights[6][4] = "cfb700";
      highlights[7][5] = "cfb700";
      highlights[8][5] = "cfb700";
    }

    function clearTable() {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          table[r][c] = "";
    }

    function clearSVG() {
      const svg = document.getElementById("svgOverlay");
      if (svg) svg.innerHTML = "";
    }

    function clearAll() {
      clearTable();
      highlights = highlights.map(row => row.map(() => ""));
      clearSVG();
      
    }

    function togglePlay(){
      if (playing) {
        playing = false;
      } else {
        playing = true;
        play();
      }
    }

    async function play() {
      playing = true;
      while (playing && currentFrame < frames.length) {
        const f = frames[currentFrame];
        applyFrame(currentFrame);
        currentFrame++;
        
        const extraDelay = 
        f.type === "highlight" ? 250 : 
        f.type === "updateBounds" ? -speed :
        0;

        await tick();
        await new Promise(res => setTimeout(res, speed + extraDelay));
      }
      // at the end generate path
      if(currentFrame >= frames.length){
        generateAlignmentSVG();
      }
    }

    function pause() {
      playing = false;
    }

    function stepForward() {
      if (currentFrame >= frames.length - 1) return;

      if (currentFrame < frames.length) {
        applyFrame(currentFrame);
        currentFrame++;
        while(frames[currentFrame].type === "updateBounds"){
          currentFrame++;
        }
      }
    }

    function stepBackward() {
      if (currentFrame > 0) {
        currentFrame--;
        while(frames[currentFrame].type === "updateBounds"){
          currentFrame--;
        }
        clearAll();
        for (let i = 0 ; i < currentFrame; i++)
          applyFrame(i);
      }
    }

    // rowOffset represents the row we are starting at, colOffset represents the column we are starting at. the end of the region can be derived from the length of seqA and seqB.
    // so for true index of array 
    // r: rowOffset + i;
    // c: colOffset + j;
    function hirschbergForward(A, B, rowOffset, colOffset) {
      // A = sequenceA, B = sequenceB
      const n = A.length;
      const m = B.length;

      // Only two rows needed; O(m) space
      let prev = Array(m + 1).fill(0);
      let curr = Array(m + 1).fill(0);

      // Initialize first row
      for (let j = 0; j <= m; j++) {
        prev[j] = j;
        frames.push({
            type: "setCell",
            r: rowOffset,
            c: colOffset + j,
            value: prev[j]
        });
      }

      // process the rest of the rows
      for (let i = 1; i <= n ; i++) {
        // first column of each row will always just be the row #
        curr[0] = i;
        frames.push({
            type: "setCell",
            r: rowOffset + i,
            c: colOffset,
            value: curr[0]
        });

        // the rest of the columns are resolved just like needlemanwunsch
        for (let j = 1; j <= m; j++) {
          const cost = (A[i - 1] === B[j - 1] ? 0 : 1);

          curr[j] = Math.min(
            prev[j] + 1,        // delete ↓
            curr[j - 1] + 1,    // insert →
            prev[j - 1] + cost  // match/mismatch ↘
          );

          frames.push({
            type: "setCell",
            r: rowOffset + i,
            c: colOffset + j,
            value: curr[j]
          });

        }
        
        // swap rows
        [prev, curr] = [curr, prev] // funfact: you cant just do prev = curr because variables are assigned by reference with equality operator in js
      }

      return prev;
    }

    // rowOffset represents the row we are starting at, colOffset represents the column we are starting at. the end of the region can be derived from the length of seqA and seqB.
    // so for true index of array 
    // r: rowOffset + i;
    // c: colOffset + j;
    // as of now dont pass in A and B in their reversed form, the for loops account for that
    function hirschbergBackward(A, B, rowOffset, colOffset) {
      // A = sequenceA, B = sequenceB
      const n = A.length;
      const m = B.length;

      // Only two rows needed; O(m) space
      let prev = Array(m + 1).fill(0);
      let curr = Array(m + 1).fill(0);

      // Initialize first row (going from right to left, bottom to top)
      for (let j = m; j > -1; j--) {
        prev[j] = m - j;
        frames.push({
            type: "setCell",
            r: rowOffset + n,   // start on last row (remember theres a `-` so dont need -1)
            c: colOffset + j,   // start on last col (remember theres a '-' so dont need -1)
            value: prev[j]
        });
      }

      // process the rest of the rows
      for (let i = n - 1; i > -1; i--) {
        // last column of each row will always be equal to n - i; which is lastrow# - row# we are on
        curr[m] = n - i;
        if (i != 0){
          frames.push({
            type: "setCell",
            r: rowOffset + i,
            c: colOffset + m,
            value: curr[m]
          });
        } else {
          frames.push({
            type: "sumCell",
            r: rowOffset + i,
            c: colOffset + m,
            value: curr[m]
          });
        }

        // the rest of the columns are resolved just like needlemanwunsch
        for (let j = m - 1; j > -1; j--){
          const cost = A[i] === B[j] ? 0 : 1;
          curr[j] = Math.min(
            prev[j] + 1,          // delete ↑
            curr[j + 1] + 1,      // insert ←
            prev[j + 1] + cost,   // match/mismatch ↖
          );

          if (i != 0){
            frames.push({
              type: "setCell",
              r: rowOffset + i,
              c: colOffset + j,
              value: curr[j]
            });
          } else {
            frames.push({
              type: "sumCell",
              r: rowOffset + i,
              c: colOffset + j,
              value: curr[j]
            })
          }
          
        }

        [prev, curr] = [curr, prev];
      }

      return prev;
    }

    function emitSplitHighlight(forward, backward, rowOffset, colOffset){
      let bestIdx = 0;
      let best = Infinity;

      console.log("Trying highlight, computing scores between ", forward, backward);

      for (let j = 0; j < forward.length; j++) {
        const s = forward[j] + backward[j];
        if (s < best) {
          best = s;
          bestIdx = j;
        }
      }

      frames.push({
        type: "highlight",
        r: rowOffset,
        c: colOffset + bestIdx
      });

      // everytime we find a highlight, we want to clear table for the new subproblem
      frames.push({
        type: "clearTable"
      })

      console.log("minIdx is at", bestIdx);

      return bestIdx;
    }

    function hirschbergBaseCase(A, B, rowOffset, colOffset){
      const n = A.length;
      const m = B.length;

       // Build small DP table (just numbers)
      let dp = Array.from({ length: n + 1 }, () =>
          Array.from({ length: m + 1 }, () => 0)
      );

      // init first col/row
      for (let i = 0; i <= n; i++) dp[i][0] = i;
      for (let j = 0; j <= m; j++) dp[0][j] = j;
      
      // fill remaining cells
      for (let i = 1; i <= n; i++){
        for (let j = 1; j<= m; j++){
          const cost = A[i - 1] === B[j - 1] ? 0 : 1;

          dp[i][j] = Math.min(
            dp[i-1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );

          frames.push({
            type: "setCell",
            r: rowOffset + i,
            c: colOffset + j,
            value: dp[i][j]
          });

        }
      }

      // TRACEBACK
      let i = n;
      let j = m;
      while (i > 0 || j > 0) {
    
        frames.push({
            type: "highlight",
            r: rowOffset + i,
            c: colOffset + j
        });

        // everytime we find a highlight, we want to clear table for the new subproblem
        frames.push({
          type: "clearTable"
        })

        if (i > 0 && j > 0) {
            const cost = A[i - 1] === B[j - 1] ? 0 : 1;
            if (dp[i][j] === dp[i - 1][j - 1] + cost) {
                i--; j--; continue;
            }
        }

        if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
            i--; continue;
        }

        if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
            j--; continue;
        }
      }

      // frames.push({
      //     type: "highlight",
      //     r: rowOffset,
      //     c: colOffset
      // });


    }

    function hirschberg(A, B, rowOffset = 0, colOffset = 0){
      const n = A.length;
      const m = B.length;
      frames.push({
        type: "updateBounds",
        r: n+1,
        c: m+1,
        rowOffset: rowOffset,
        colOffset: colOffset
      })

      if (n === 0) return;
      if ( n === 1 && m === 1) return;
      if (n === 1 || m === 1){
        // Base case:
        hirschbergBaseCase(A, B, rowOffset, colOffset);
        console.log("basecase: ", A, B, "offsets", rowOffset, colOffset);
        return;
      }

      const mid = Math.floor(n / 2);
      //console.log("forward call:", A.slice(0, mid), B);
      //console.log("backwards call", A.slice(mid), B);


      const forward = hirschbergForward(A.slice(0, mid), B, rowOffset, colOffset);
      const backward = hirschbergBackward(A.slice(mid), B, rowOffset + mid, colOffset);

      const splitCol = emitSplitHighlight(forward, backward, rowOffset + mid, colOffset);

      // recurse on both halves
      hirschberg(A.slice(0, mid), B.slice(0, splitCol), rowOffset, colOffset);
      hirschberg(A.slice(mid), B.slice(splitCol), rowOffset + mid, colOffset + splitCol);
      
    }

    function testforward(){
      hirschbergForward("AGTA", seqB, 0, 0);
    }

    function testbackward(){

      hirschbergBackward("CGCA", seqB, 4, 0);
    }

    function getHighlightedCells() {
      const coords = [];
      coords.push([0,0]);

      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          if (highlights[i][j] === "cfb700") {
            coords.push([i, j]);
          }
        }
      }
      coords.push([rows-1, cols-1]);
      console.log("highlighted cells:", coords)
      
      return coords;
    }


    function convertToPixels(cells, cellSize) {
      if (!tableEl) return [];
      const tableRect = tableEl.getBoundingClientRect();
      const wrapperRect = tableEl.closest('.dpWrapper').getBoundingClientRect();
      
      return cells.map(([i, j]) => {
        // Find the actual cell element
        const cellEl = tableEl.querySelector(`tbody tr:nth-child(${i + 1}) td:nth-child(${j + 2})`);
        if (!cellEl) return { x: 0, y: 0 };
        
        const cellRect = cellEl.getBoundingClientRect();
        
        // Get center of cell relative to wrapper
        return {
          x: cellRect.left + cellRect.width / 2 - wrapperRect.left,
          y: cellRect.top + cellRect.height / 2 - wrapperRect.top
        };
      });
    }


    function generateAlignmentSVG(cellSize = 35) {
      const rawCells = getHighlightedCells();
      const points = convertToPixels(rawCells, 35);
      console.log("coordiantes of cells:", points);
      
      // Set SVG to match wrapper size
      if (tableEl) {
        const wrapper = tableEl.closest('.dpWrapper');
        const rect = wrapper.getBoundingClientRect();
        svgEl.setAttribute("width", rect.width);
        svgEl.setAttribute("height", rect.height);
      }
      
      drawPathOnGrid(points);
    }


    function drawPathOnGrid(points) {
      if (!svgEl || !tableRect) return;

      const pts = points
      .map(p => `${p.x},${p.y}`)
      .join(" ");

      console.log("points", pts);

      svgEl.innerHTML = `
        <polyline
          points="${pts}"
          fill="none"
          stroke="white"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      `;

      togglePlay();
    }

    function dedupeHighlights(frames) {
      const seen = new Set();
      const result = [];

      

      for (const f of frames) {
        if (f.type === "highlight") {
          const key = `${f.r},${f.c}`;
          if (seen.has(key) || (f.r === 0 && f.c === 0) || (f.r === rows - 1 && f.c === cols - 1)) {
            continue;
          }
          seen.add(key);
        }
        result.push(f)
      }

      return result;

      
    }

    function cellHighlight(r, c) {
      // Always highlight top-left and bottom-right
      if ((r === 0 && c === 0) || (r === rows - 1 && c === cols - 1)) {
        return "#cfb700"; 
      }

      return highlights[r][c]; // fall back to actual animation highlight
    }

    function getCellElement(r, c) {
      return cellRefs[r]?.[c] ?? null;
    }

    function animateSummingCell(r, c) {
      const cell = getCellElement(r, c);
      cell.classList.add("summing");
      setTimeout(() => cell.classList.remove("summing"), 100);
    }


</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&display=swap');
    :global(body) {
    font-family: "Architects Daughter", cursive;
  }
  .main-container{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 20px;
  }
  .dpWrapper{
    position: relative;
    display: inline-block;
  }
  .dp-table {
    position: relative;
    z-index: 1;
  }
  #svgOverlay {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 10; /*  above the table */
    pointer-events: none;
  }
  table {
    border-collapse: collapse;
    font-size: 18px;
    margin-top: 20px;
  }
  td {
    border: 2px solid #333;
    width: 35px;
    height: 35px;
    text-align: center;
    vertical-align: middle;
  
  }
  thead td {
    font-weight: bold;
    color:black;
    background: #fafafac6;
  }
  .left-header {
    font-weight: bold;
    color:black;
    background: #fafafac6;
  }
  .input-block{
    margin-bottom: 12px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    font: "Architects Daughter";
  }
  .input-block label {
    font-weight: 600;
    font-size: 14px;
    color: #e0e0e0;
    min-width: 120px;
  }
  .input-block textarea {
    flex: 1;
    padding: 3px 6px;
    font-size: 14px;
    font-family: 'Courier New', monospace;
    font-weight: 100;
    letter-spacing: 2px; /* Space out DNA letters */
    text-transform: uppercase; /* Force uppercase */
    border: 2px solid #3a3a3a;
    border-radius: 12px;
    background-color: #1e1e1e;
    color: #4ec9b0; /* Teal/cyan color - DNA themed */
    resize: none; /* Prevent resizing */
    height: 15px;
    transition: all 0.3s ease;
  }
  .input-block textarea:hover {
    border-color: #4a4a4a;
  }
  .input-block textarea:focus {
    outline: none;
    border-color: #4ec9b0;
    background-color: #252525;
    box-shadow: 0 0 20px rgba(78, 201, 176, 0.15);
  }
  .top-buttons{
    display: flex;
    gap: 10px;
  }
  h1{
    text-align: center;
    font-size: 38px;
    margin: 30px 0 40px 0;
    letter-spacing: 2px;
    
  }
  .header-container {
    text-align: center;

  }
  .highlight-pulse {
    animation: pulse 0.2s ease-out forwards;
  }
  @keyframes pulse {
    0%   { background-color: #cfb700; transform: scale(1); }
    50%  { background-color: rgba(255, 217, 0, 0.805)500;   transform: scale(1.12); }
    100% { background-color: #cfb700; transform: scale(1); }
  }

  .sum-pulse {
  animation: sumPulse 0.1s ease-out;
  }

  @keyframes sumPulse {
    0%   { transform: scale(1);   background-color: inherit;  opacity: 1; }
    50%  { transform: scale(1.25); background-color: inherit; opacity: 0.9; }
    100% { transform: scale(1);   background-color: inherit;  opacity: 1; }
  }
  
</style>

<div class="header-container">
  <h1>Hirschberg Algorithm Explainer</h1>
</div>

<div class="main-container">

<div class="input-block">
  <label>DNA Sequence A</label>
  <textarea bind:value={seqA} placeholder="ACGTACGT" spellcheck="false" autocomplete="off"></textarea>
</div>

<div class="input-block">

  <label>DNA Sequence B</label>
  <textarea bind:value={seqB} placeholder="AGTACG" spellcheck="false" autocomplete="off"></textarea>    
</div>

<div class="top-buttons">
  <button on:click={generateFrames}>Align</button>
</div>
<!-- <button on:click={testforward}>genforwardpass</button> -->
<!-- <button on:click={testbackward}>genbackwardpass</button> -->

<!-- <button on:click={generateAlignmentSVG}>testSVG </button> -->
<!-- <button on:click={testHighlight}>highlightCells </button> -->



<!-- Top header row -->
 <div class="dpWrapper">
   <table class="dp-table" id="dpTable" bind:this={tableEl}>
     <thead>
       <tr>
         <td></td> <!-- corner blank -->
         <td class="left-header">—</td>
         {#each seqB as ch}
         <td class="left-header">{ch}</td>
         {/each}
        </tr>
      </thead>
      
      <!-- Body with left header column -->
      <tbody>
        {#each Array(rows) as _, r}
        <tr>
          <td class="left-header">
            {r === 0 ? "—" : seqA[r-1]}
          </td>
          
          {#each Array(cols) as _, c}
          <td style="background: {cellHighlight(r,c)}" class:highlight-pulse={highlights[r][c] === "cfb700"} class:sum-pulse={sumPulse[r][c]}>
            {table[r][c]}
          </td>
          {/each}
        </tr>
        {/each}
      </tbody>
    </table>
    <svg id="svgOverlay" bind:this={svgEl}></svg>
  </div>


<div class="bottom-buttons">
  <button on:click={stepBackward}>⏮ </button>
  <button on:click={togglePlay}>
    {playing ?  "⏸" :  "▶"}
  </button>
  <button on:click={stepForward}>⏭ </button>
  <button on:click={clearAll}>Clear</button>
</div>

</div>