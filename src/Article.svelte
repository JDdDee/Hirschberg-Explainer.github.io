<style>
  .article {
    margin-left: auto;
    margin-right: auto;
    max-width: 78ch;
    padding: 20px;
    line-height: 1.6;
    font-size: 1.1rem;
    text-align: left;
  }

  h1 {
    font-family: "Architects Daughter", cursive;
    font-size: 48px;
    text-align: left;
    text-decoration: none;
    margin-bottom: 0.2em;
  }
  h2 {
    font-family: "Architects Daughter", cursive;
    font-size: 30px;
    margin-top: 2em;
    margin-bottom: 0.4em;
    border-bottom: 1px solid #444;
    padding-bottom: 0.2em;
  }
  h3 {
    font-family: "Architects Daughter", cursive;
    font-size: 22px;
    margin-top: 1.6em;
    margin-bottom: 0.3em;
  }
  p, li {
    font-family: "Roboto", system-ui, sans-serif;
  }
  .lede {
    font-size: 1.15rem;
    color: #cfcfcf;
    border-left: 3px solid #cfb700;
    padding-left: 16px;
    margin-bottom: 2em;
  }
  ul {
    padding-left: 1.4em;
  }
  li {
    margin-bottom: 0.4em;
  }
  code {
    font-family: 'Courier New', monospace;
    background: #1e1e1e;
    color: #4ec9b0;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.92em;
  }
  pre {
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    font-size: 0.88rem;
    line-height: 1.45;
  }
  pre code {
    background: none;
    color: #d8d8d8;
    padding: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-family: "Roboto", system-ui, sans-serif;
    font-size: 0.95rem;
    margin: 1em 0;
  }
  th, td {
    border: 1px solid #444;
    padding: 8px 10px;
    text-align: left;
    width: auto;
    height: auto;
  }
  th {
    background: #2e2e2e;
    font-weight: 600;
  }
  .callout {
    background: #1c1c1c;
    border: 1px solid #3a3a3a;
    border-left: 3px solid #4ec9b0;
    border-radius: 6px;
    padding: 12px 16px;
    margin: 1.4em 0;
  }
  .callout p {
    margin: 0;
  }
  .legend {
    list-style: none;
    padding-left: 0;
  }
  .legend li {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 1px solid #555;
    flex: none;
  }
  .refs {
    font-size: 0.95rem;
    color: #b8b8b8;
  }

  /* app.css switches the page to a white background in light mode, so the
     light-gray text and dark panels above need darker/lighter counterparts. */
  @media (prefers-color-scheme: light) {
    h2 {
      border-bottom-color: #ccc;
    }
    code {
      background: #ececec;
      color: #146356;
    }
    pre {
      background: #f4f4f4;
      border-color: #ddd;
    }
    pre code {
      background: none;
      color: #333;
    }
    .lede {
      color: #444;
    }
    th, td {
      border-color: #ccc;
    }
    th {
      background: #f0f0f0;
    }
    .callout {
      background: #f6f6f6;
      border-color: #ddd;
      border-left-color: #2a9d86;
    }
    .swatch {
      border-color: #999;
    }
    .refs {
      color: #555;
    }
  }
</style>

<div class="article">
  <h1>Understanding the Hirschberg algorithm</h1>

  <p class="lede">
    Needleman-Wunsch finds the best alignment of two sequences, but it needs a table with one cell
    for every pair of characters. Two sequences of 10,000 bases need 100 million cells, which is
    about 400 MB. Hirschberg's algorithm finds an alignment with the same optimal score while
    keeping only two rows of that table in memory at a time.
  </p>

  <h2>The problem it solves</h2>

  <p>
    Sequence alignment lines up two strings so that their similarities show. In bioinformatics the
    strings are usually DNA, RNA, or protein sequences. An alignment is a guess about evolution.
    Matched characters were conserved, mismatches are substitutions, and gaps are insertions or
    deletions.
  </p>

  <p>
    The classic method is the Needleman-Wunsch algorithm. It fills a
    <code>(n+1) &times; (m+1)</code> table, where <code>n</code> and <code>m</code> are the two
    sequence lengths. Cell <code>(i, j)</code> holds the best score for aligning the first
    <code>i</code> characters of A with the first <code>j</code> characters of B. Each cell depends
    on three neighbors.
  </p>

<pre><code>D(i, j) = min(
    D(i-1, j  ) + gap,                  {'//'} delete A[i]      &#8595;
    D(i  , j-1) + gap,                  {'//'} insert B[j]      &#8594;
    D(i-1, j-1) + cost(A[i], B[j])      {'//'} match/mismatch   &#8600;
)</code></pre>

  <p>
    The animation above uses unit edit distance. A match costs <strong>0</strong>, a mismatch
    costs <strong>1</strong>, and a gap costs <strong>1</strong>. Lower is better, so the number
    in the bottom-right corner is the fewest edits that turn A into B.
  </p>

  <p>
    Filling the table takes <code>O(nm)</code> time, and no exact method avoids that. The problem
    is the <code>O(nm)</code> <em>space</em>. A slow job still finishes, but a job that runs out of
    memory does not. At four bytes a cell, two 10,000-base sequences need about 400&nbsp;MB and two
    100,000-base sequences need 40&nbsp;GB.
  </p>

  <h2>Insight 1: the score only needs two rows</h2>

  <p>
    Look at the recurrence again. Row <code>i</code> uses row <code>i-1</code> and the part of row
    <code>i</code> already written. Nothing older. So if you only want the <em>score</em>, keep two
    rows. Fill the new row from the old one, swap them, and reuse the old one. That takes
    <code>O(min(n, m))</code> space, and it is a well-known trick.
  </p>

  <p>
    The catch is that it throws away the alignment. Needleman-Wunsch recovers the alignment by
    walking back from the bottom-right corner and asking, at each cell, which neighbor the value
    came from. That walk needs the whole table. Without the table you know the score but not one
    of the edits behind it.
  </p>

  <div class="callout">
    <p>
      So the score is cheap to compute in linear space, and the alignment is not. The rest of the
      algorithm recovers the alignment without paying for the full table.
    </p>
  </div>

  <h2>Insight 2: find one point on the path, then recurse</h2>

  <p>
    Hirschberg does not recover the whole alignment at once. It finds one cell that the optimal
    path passes through, then solves the two smaller problems on either side of it.
  </p>

  <p>
    Cut sequence A in half at row <code>mid = &#8970;n/2&#8971;</code>. Every alignment crosses that
    row at some column <code>k</code>. The crossing point splits the problem in two. Above the cut,
    the alignment pairs <code>A[0..mid)</code> with <code>B[0..k)</code>. Below it, the alignment
    pairs <code>A[mid..n)</code> with <code>B[k..m)</code>. The two halves are independent.
  </p>

  <p>
    To find <code>k</code>, run the two-row scoring twice.
  </p>

  <ul>
    <li>
      A <strong>forward pass</strong> from the top-left corner down to row <code>mid</code>. Its
      last row gives <code>F[j]</code>, the best score for aligning <code>A[0..mid)</code> with
      <code>B[0..j)</code>, for every <code>j</code> at once.
    </li>
    <li>
      A <strong>backward pass</strong> from the bottom-right corner up to row <code>mid</code>,
      running the same recurrence in reverse. Its last row gives <code>Bk[j]</code>, the best score
      for aligning <code>A[mid..n)</code> with <code>B[j..m)</code>.
    </li>
  </ul>

  <p>
    An alignment that crosses row <code>mid</code> at column <code>j</code> costs exactly
    <code>F[j] + Bk[j]</code>, because the two halves are independent. The best crossing point is
    the column with the smallest sum.
  </p>

<pre><code>k = argmin over j of ( F[j] + Bk[j] )</code></pre>

  <p>
    In the animation, this is where the two moving rows meet. The forward pass leaves its last row
    on the board. The backward pass climbs up to it, and each cell pulses as the backward score is
    added to the forward score. The column with the smallest sum turns gold. That cell is on the
    optimal path, and it is the only result of the round that the algorithm keeps.
  </p>

  <h3>Why the smallest sum is the right answer</h3>

  <p>
    The smallest value of <code>F[j] + Bk[j]</code> equals the optimal score for the whole problem.
    It can't be smaller than the optimum. If it were, joining the two half-alignments at that column
    would give a full alignment cheaper than the optimal one. It can't be larger either. The
    optimal alignment crosses row <code>mid</code> at some column, and the sum at that column is its
    score. So the smallest sum is the optimal score, and the column that reaches it is a cell on an
    optimal path.
  </p>

  <h2>Insight 3: recursion costs at most twice the time</h2>

  <p>
    Once you know the path goes through <code>(mid, k)</code>, you have two smaller alignment
    problems, and you solve each one the same way. The recursion stops when a subproblem has at most
    one row or one column. A table that small is cheap to store, so it is solved with an ordinary
    Needleman-Wunsch walk back.
  </p>

<pre><code>hirschberg(A, B):
    if A or B is trivially small:
        solve directly with full Needleman-Wunsch traceback
        return

    mid = floor(|A| / 2)
    F  = forward_scores (A[0..mid), B)          {'//'} two rows of memory
    Bk = backward_scores(A[mid..],  B)          {'//'} two rows of memory
    k  = argmin_j ( F[j] + Bk[j] )

    hirschberg(A[0..mid), B[0..k))
    hirschberg(A[mid..],  B[k..])</code></pre>

  <p>
    The running time is the surprising part. Each level of the recursion scans the rectangles it
    was given. At each level the rectangles are half as tall as the level above, and together they
    span the same total width. So each level does half the work of the one before.
  </p>

<pre><code>nm + nm/2 + nm/4 + nm/8 + ... &lt; 2nm</code></pre>

  <p>
    Hirschberg does at most about twice the work of Needleman-Wunsch, which is still
    <code>O(nm)</code> time. In exchange, space drops from <code>O(nm)</code> to
    <code>O(n + m)</code>. For two 10,000-base sequences that means about 80 KB instead of 400 MB,
    roughly 5,000 times less memory for twice the time. That is a good trade whenever memory is the
    limit.
  </p>

  <table>
    <thead>
      <tr>
        <th></th>
        <th>Needleman-Wunsch</th>
        <th>Hirschberg</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Time</td>
        <td><code>O(nm)</code></td>
        <td><code>O(nm)</code>, about 2&times; the constant</td>
      </tr>
      <tr>
        <td>Space</td>
        <td><code>O(nm)</code></td>
        <td><code>O(n + m)</code></td>
      </tr>
      <tr>
        <td>Recursion depth</td>
        <td>none</td>
        <td><code>O(log n)</code></td>
      </tr>
      <tr>
        <td>Alignment found</td>
        <td>optimal</td>
        <td>optimal, with the same score</td>
      </tr>
      <tr>
        <td>10k &times; 10k bases</td>
        <td>~400 MB</td>
        <td>~80 KB</td>
      </tr>
    </tbody>
  </table>

  <h2>Reading the animation</h2>

  <p>
    Type two sequences into the boxes at the top and press <strong>Align</strong>. Each box takes
    up to 20 of the letters A, C, G, T, and U. The animation draws the whole recursion in place on
    one grid.
  </p>

  <ul class="legend">
    <li>
      <span class="swatch" style="background:#fafafac6"></span>
      <span>The header row and column hold the two sequences. <code>&mdash;</code> stands for the
      empty prefix.</span>
    </li>
    <li>
      <span class="swatch" style="background:#242424"></span>
      <span>Numbers that appear row by row going down are the forward pass. Numbers that appear
      going up are the backward pass. Rows disappear behind them because the algorithm no longer
      stores them. The empty rows show the linear-space bound directly.</span>
    </li>
    <li>
      <span class="swatch" style="background:#cfb700"></span>
      <span>Gold cells are confirmed points on the optimal path. They are the only information
      carried from one round to the next.</span>
    </li>
    <li>
      <span class="swatch" style="background:#ffffff"></span>
      <span>At the end, a white line joins the gold cells into the finished alignment, from the
      top-left corner to the bottom-right.</span>
    </li>
  </ul>

  <p>
    A pulsing cell is one where a backward score was just added to a forward score, which is where
    the two passes meet. The board clears after each split point is found, because the algorithm
    moves on to a smaller rectangle and no longer needs those numbers.
  </p>

  <p>
    To read the alignment off the path, look at each step. A diagonal step pairs one character of A
    with one character of B, as a match or a substitution. A step down pairs a character of A with
    a gap. A step right pairs a character of B with a gap.
  </p>

  <h3>Things to try</h3>

  <ul>
    <li>
      Enter two identical sequences. The path is a straight diagonal and every score along it is
      zero.
    </li>
    <li>
      Enter sequences of very different lengths, such as <code>AGTACGCATT</code> and
      <code>AC</code>. The path spends most of its length moving straight down through gaps.
    </li>
    <li>
      Compare an odd-length sequence A with an even-length one. When <code>|A|</code> is odd, the
      split row sits just above the middle of the rectangle.
    </li>
    <li>
      Watch how much of the grid is blank at any moment. Needleman-Wunsch would be holding all of
      that in memory.
    </li>
  </ul>

  <h2>Limits and context</h2>

  <p>
    Hirschberg's algorithm returns <em>one</em> optimal alignment, not all of them. When several
    alignments tie, the one you get depends on how ties are broken. This version always takes the
    leftmost column with the smallest sum. Its output is the same every run, but another
    implementation may return a different alignment with the same score.
  </p>

  <p>
    This version uses unit costs because they keep the numbers on screen small. Real biological
    alignment uses substitution matrices such as BLOSUM or PAM, and affine gap penalties, which
    charge more to open a gap than to extend one. The divide-and-conquer structure still works with
    those. Myers and Miller showed how to apply it to affine gaps in 1988.
  </p>

  <p>
    Hirschberg does not help when time is the limit. It still takes <code>O(nm)</code> time, so it
    can't align two whole chromosomes. That needs heuristics such as seed-and-extend, which BLAST and
    minimap2 use. Hirschberg fits sequences long enough to run out of memory but short enough that
    quadratic time is acceptable, when you need a guaranteed optimal alignment.
  </p>

  <h2>References</h2>

  <ul class="refs">
    <li>
      Hirschberg, D. S. (1975). "A linear space algorithm for computing maximal common
      subsequences." <em>Communications of the ACM</em>, 18(6), 341-343.
    </li>
    <li>
      Myers, E. W. &amp; Miller, W. (1988). "Optimal alignments in linear space."
      <em>Computer Applications in the Biosciences</em>, 4(1), 11-17.
    </li>
    <li>
      Needleman, S. B. &amp; Wunsch, C. D. (1970). "A general method applicable to the search for
      similarities in the amino acid sequence of two proteins." <em>Journal of Molecular
      Biology</em>, 48(3), 443-453.
    </li>
  </ul>
</div>
