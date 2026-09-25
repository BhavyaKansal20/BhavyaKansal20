const fs = require('fs');

async function run() {
  const query = JSON.stringify({
    query: `
      query {
        user(login: "BhavyaKansal20") {
          repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
            totalCount
            nodes {
              stargazerCount
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    name
                    color
                  }
                }
              }
            }
          }
          contributionsCollection {
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                }
              }
            }
          }
        }
      }
    `
  });

  try {
    const token = process.env.GRAPH_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
       console.log("No token provided, skipping fetch.");
       return;
    }
    
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'node-fetch'
      },
      body: query
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GitHub GraphQL request failed (${res.status}): ${errorText.slice(0, 300)}`);
    }

    const body = await res.json();
    if (!body.data || !body.data.user) {
      throw new Error(JSON.stringify(body));
    }

    const user = body.data.user;

    // --- 1. Process Stats ---
    const repos = user.repositories.nodes;
    const totalRepos = user.repositories.totalCount;
    let totalStars = 0;
    const langStats = {};
    let totalLangSize = 0;

    repos.forEach(repo => {
      totalStars += repo.stargazerCount;
      repo.languages.edges.forEach(edge => {
        const name = edge.node.name;
        const size = edge.size;
        const color = edge.node.color || '#cccccc';
        if (!langStats[name]) {
          langStats[name] = { size: 0, color };
        }
        langStats[name].size += size;
        totalLangSize += size;
      });
    });

    const totalCommits = user.contributionsCollection.totalCommitContributions;
    const totalPRs = user.contributionsCollection.totalPullRequestContributions;
    const totalIssues = user.contributionsCollection.totalIssueContributions;
    const totalContribs = user.contributionsCollection.contributionCalendar.totalContributions;

    // Calculate Streak
    const weeks = user.contributionsCollection.contributionCalendar.weeks;
    const allDays = weeks.flatMap(w => w.contributionDays);
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    for (let i = 0; i < allDays.length; i++) {
      if (allDays[i].contributionCount > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        // Reset streak if we didn't just pass the current day (ignoring today if 0)
        tempStreak = 0;
      }
    }
    
    // Current streak counts backwards from today
    let streakCount = 0;
    for (let i = allDays.length - 1; i >= 0; i--) {
        if (allDays[i].contributionCount > 0) {
            streakCount++;
        } else if (i < allDays.length - 1) { // allow today to be 0
            break;
        }
    }
    currentStreak = streakCount;

    // --- Generate github-stats.svg ---
    const statsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 200" width="450" height="200" style="background:#0d1117; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; border-radius:12px; border:1px solid rgba(0,255,204,0.3); box-shadow: 0 4px 10px rgba(0,255,204,0.1);">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#00ffcc;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0088cc;stop-opacity:1" />
        </linearGradient>
      </defs>
      <text x="30" y="40" fill="url(#grad1)" font-size="20" font-weight="bold" letter-spacing="1">🚀 Github Analytics</text>
      
      <g transform="translate(30, 70)" font-size="14" fill="#ffffff" font-weight="500">
        <text x="0" y="15">⭐ Total Stars:</text>
        <text x="180" y="15" fill="#00ffcc" font-weight="bold">${totalStars}</text>
        
        <text x="0" y="45">🔥 Total Commits:</text>
        <text x="180" y="45" fill="#00ffcc" font-weight="bold">${totalCommits}</text>
        
        <text x="0" y="75">🎯 Total PRs:</text>
        <text x="180" y="75" fill="#00ffcc" font-weight="bold">${totalPRs}</text>
        
        <text x="0" y="105">🐛 Total Issues:</text>
        <text x="180" y="105" fill="#00ffcc" font-weight="bold">${totalIssues}</text>
      </g>
      
      <g transform="translate(250, 70)" font-size="14" fill="#ffffff" font-weight="500">
        <text x="0" y="15">📦 Repositories:</text>
        <text x="130" y="15" fill="#00ffcc" font-weight="bold">${totalRepos}</text>

        <text x="0" y="45">⚡ Contributions:</text>
        <text x="130" y="45" fill="#00ffcc" font-weight="bold">${totalContribs}</text>
        
        <text x="0" y="75">🔥 Current Streak:</text>
        <text x="130" y="75" fill="#00ffcc" font-weight="bold">${currentStreak}</text>
        
        <text x="0" y="105">🏆 Max Streak:</text>
        <text x="130" y="105" fill="#00ffcc" font-weight="bold">${longestStreak}</text>
      </g>
    </svg>`;
    fs.writeFileSync('github-stats.svg', statsSvg);


    // --- Generate top-langs.svg ---
    const sortedLangs = Object.entries(langStats)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5); // top 5
      
    let langBars = '';
    let langY = 70;
    
    sortedLangs.forEach(([name, data]) => {
      const percentage = ((data.size / totalLangSize) * 100).toFixed(1);
      const barWidth = (data.size / sortedLangs[0][1].size) * 200; // relative to max
      
      langBars += `
        <text x="30" y="${langY + 12}" fill="#ffffff" font-size="13" font-weight="500">${name}</text>
        <text x="120" y="${langY + 12}" fill="#888888" font-size="11">${percentage}%</text>
        <rect x="170" y="${langY + 2}" width="200" height="10" rx="5" fill="#222222" />
        <rect x="170" y="${langY + 2}" width="${barWidth}" height="10" rx="5" fill="${data.color}" />
      `;
      langY += 25;
    });

    const langsSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 210" width="450" height="210" style="background:#0d1117; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; border-radius:12px; border:1px solid rgba(0,255,204,0.3);">
      <defs>
        <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#00ffcc;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0088cc;stop-opacity:1" />
        </linearGradient>
      </defs>
      <text x="30" y="40" fill="url(#grad2)" font-size="20" font-weight="bold" letter-spacing="1">💻 Top Languages</text>
      ${langBars}
    </svg>`;
    fs.writeFileSync('top-langs.svg', langsSvg);


    // --- Generate activity-graph.svg ---
    // Smooth bezier curve graph
    const days = allDays.slice(-60); // Last 60 days
    const width = 800;
    const height = 150;
    const padding = 40;
    
    const maxCount = Math.max(...days.map(d => d.contributionCount), 10);
    
    let pathD = `M ${padding} ${height - padding}`;
    let fillD = `M ${padding} ${height - padding}`;
    
    const xStep = (width - padding * 2) / (days.length - 1);
    
    const pointsArray = days.map((day, index) => {
        return {
            x: padding + index * xStep,
            y: (height - padding) - (day.contributionCount / maxCount) * (height - padding * 2)
        };
    });

    // Generate smooth cubic bezier curve
    for (let i = 0; i < pointsArray.length; i++) {
        if (i === 0) {
            pathD += ` L ${pointsArray[i].x} ${pointsArray[i].y}`;
            fillD += ` L ${pointsArray[i].x} ${pointsArray[i].y}`;
        } else {
            const cp1x = pointsArray[i - 1].x + xStep / 2;
            const cp1y = pointsArray[i - 1].y;
            const cp2x = pointsArray[i].x - xStep / 2;
            const cp2y = pointsArray[i].y;
            pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pointsArray[i].x} ${pointsArray[i].y}`;
            fillD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${pointsArray[i].x} ${pointsArray[i].y}`;
        }
    }
    
    fillD += ` L ${pointsArray[pointsArray.length - 1].x} ${height - padding} Z`;

    const activitySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#0d1117; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif; border-radius:12px; border:1px solid rgba(0,255,204,0.3);">
      <text x="30" y="30" fill="#00ffcc" font-size="16" font-weight="bold" letter-spacing="1">📈 Contribution Activity (Last 60 Days)</text>
      <defs>
        <linearGradient id="glowArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00ffcc" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#00ffcc" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      
      <path d="${fillD}" fill="url(#glowArea)" />
      <path d="${pathD}" fill="none" stroke="#00ffcc" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
    </svg>`;
    
    fs.writeFileSync('activity-graph.svg', activitySvg);

    console.log('Successfully generated github-stats.svg, top-langs.svg, and activity-graph.svg');
  } catch (error) {
    console.error('Execution Failed:', error);
    process.exit(1);
  }
}
run();
