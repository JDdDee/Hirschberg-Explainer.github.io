<script>
  export let title = "Understanding the Hirschberg Algorithm";
</script>


<style>
  .article {
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    max-width: 78ch;
    padding: 20px;
    line-height: 1.6;
    font-size: 1.1rem;

    text-align: left;
  }

  h1 {
    font-family: "Architects Daughter";
    font-size: 48 px;
  }
  p {
    font-family: "Roboto"
  }
</style>

<div class="article">
    <h1>{title}</h1>

    <p>
        The Hirschberg algorithm is a classic divide-and-conuer method for computing the optimal
        alignment of two sequences. It is based on the Needleman-Wunsch dynamic programming algorithm
        but dramatically reduces memory usage. While the standard Needleman-Wunsch approach requires
        storing an entire 2D scoring matrix, using O(mn) space, Hirschberg cleverly computes the same
        optimal alignment only using linear space, O(m + n), without sacrificing accuracy.
    </p>

    <p>
        The key insight behind Hirschberg's method is that you dont need the full dynamic programming 
        matrix all at once. To calculate a row of values, only the previous row is needed. In order to
        calculate the alignment path, the algorith splits one of the sequences in half and computes a
        forward score and a backward score to locate the optimal "split point" in the alignment. The
        algorithm then recursively divides the problem into two smaller subproblems: aligning the first 
        halves of the sequences and then the second halfs. By stiching all of these partial alignments
        together, Hirschberg reconstructs the full optimal alignment exaclty as Needleman-Wunsch would, 
        but with far less memory.
    </p>

    
  

  <!-- You add your article content here -->
</div>