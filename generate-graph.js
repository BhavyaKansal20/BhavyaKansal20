const fs = require('fs');

async function run() {
  const query = JSON.stringify({
    query: '{ user(login: "BhavyaKansal20") { contributionsCollection { contributionCalendar { weeks { contributionDays { contributionCount } } } } } }'
  });
  
  try {
    const res = await fetch('https://github.com', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.GRAPH_TOKEN,
        'Content-Type': 'application/json',
        'User-Agent': 'node'
      },
      body: query
    });
    
    const body = await res.json();
    if (!body.data || !body.data.user) {
      throw new Error(JSON.stringify(body));
    }
    
    const weeks = body.data.user.contributionsCollection.contributionCalendar.weeks;
    const days = weeks.flatMap(w => w.contributionDays).slice(-30);
    
    let points = '';
    let areaPoints = '20,100 ';
    let currentX = 20;
    
    days.forEach((day, index) => {
      currentX = index * 20 + 20;
      const count = Math.min(day.contributionCount, 10);
      const currentY = 90 - (count * 6);
      points += currentX + ',' + currentY + ' ';
      areaPoints += currentX + ',' + currentY + ' ';
    });
    areaPoints += currentX + ',100';
    
    // Clean SVG string structure with standard quotes to prevent file format corruption
    const svg = `<svg xmlns="http://w3.org" viewBox="0 0 620 120" width="100%" height="100%" style="background:#0d1117; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; border-radius:12px; border:1px solid rgba(0,255,204,0.19);">
      <text x="20" y="28" fill="#00ffcc" font-size="14" font-weight="700" letter-spacing="0.5">Bhavya's Contribution Graph</text>
      <defs>
        <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00ffcc" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#00ffcc" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <polygon points="${areaPoints}" fill="url(#glow)" />
      <polyline fill="none" stroke="#00ffcc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points.trim()}" />
      <line x1="20" y1="100" x2="${currentX}" y2="100" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
    </svg>`;
    
    fs.writeFileSync('activity-graph.svg', svg);
    console.log('Graph generated successfully.');
  } catch (error) {
    console.error('Execution Failed:', error);
    process.exit(1);
  }
}
run();
