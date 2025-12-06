<script>
    import { onMount } from "svelte";

    let tableEl;
    let svgEl;

    // hardcoded example path
    let points = [
        { x: 17.5, y: 17.5 },
        { x: 17.5, y: 52.5 },
        { x: 17.5, y: 87.5 },
        { x: 52.5, y: 122.5 },
        { x: 87.5, y: 157.5 }
    ];

    // Draw after SVG is sized
    function draw() {
        const pts = points.map(p => `${p.x},${p.y}`).join(" ");
        svgEl.innerHTML = `
            <polyline
                points="${pts}"
                fill="none"
                stroke="red"
                stroke-width="4"
            />
        `;
    }

    onMount(() => {
        // table is guaranteed to exist at this point
        const rect = tableEl.getBoundingClientRect();

        // size SVG to match table
        svgEl.setAttribute("width", rect.width);
        svgEl.setAttribute("height", rect.height);

        draw();
    });
</script>

<div class="wrapper">
    <table class="grid" bind:this={tableEl}>
        <tr><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td></tr>
        <tr><td></td><td></td><td></td></tr>
    </table>

    <svg bind:this={svgEl}></svg>
</div>

<style>
    .wrapper {
        position: relative;
        display: inline-block;
    }
    table.grid {
        border-collapse: collapse;
    }
    table.grid td {
        border: 1px solid #888;
        width: 35px;
        height: 35px;
    }
    svg {
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 10;
    }
</style>
