export default function createStatsGrid(stats) {
    return `<div class="statgrid">
        ${stats.map(stat => `
            <span class='term ${stat.class || ""}' style="padding-right: 0.33em;">${stat.name}</span>
            <span>${stat.value}</span>`).join("")}
        </div>`;
}