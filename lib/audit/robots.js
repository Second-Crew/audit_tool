export function parseRobotsTxt(content) {
  const groups = [];
  let current = null;

  for (const rawLine of (content || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'user-agent') {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
      continue;
    }

    if (!current && ['allow', 'disallow'].includes(key)) {
      current = { agents: ['*'], rules: [] };
      groups.push(current);
    }

    if (key === 'user-agent' && current) {
      current.agents.push(value.toLowerCase());
    } else if (['allow', 'disallow'].includes(key) && current) {
      current.rules.push({ type: key, path: value || '/' });
    }
  }

  const sitemaps = [];
  for (const rawLine of (content || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*sitemap\s*:\s*(.+)$/i);
    if (match) sitemaps.push(match[1].trim());
  }

  return { groups, sitemaps };
}

export function getBotAccess(robotsTxt, origin) {
  const parsed = parseRobotsTxt(robotsTxt);
  const bots = [
    'Googlebot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'GPTBot',
    'PerplexityBot',
    'ClaudeBot',
    'Claude-SearchBot',
    'Google-Extended',
  ];

  return bots.reduce((access, bot) => {
    access[bot] = {
      allowed: isAllowedByRobots(parsed, bot, '/', origin),
      evidence: `${bot}: ${isAllowedByRobots(parsed, bot, '/', origin) ? 'allowed' : 'blocked'} at /`,
    };
    return access;
  }, {});
}

export function isAllowedByRobots(parsedRobots, userAgent, path = '/', origin = '') {
  const groups = parsedRobots?.groups || [];
  const agent = userAgent.toLowerCase();
  const matchingGroups = groups.filter((group) =>
    group.agents.some((candidate) => candidate === '*' || agent.includes(candidate) || candidate.includes(agent))
  );

  if (!matchingGroups.length) return true;

  const rules = matchingGroups.flatMap((group) => group.rules);
  let winningRule = null;

  for (const rule of rules) {
    const normalizedPath = normalizeRulePath(rule.path, origin);
    if (!normalizedPath) continue;
    if (path.startsWith(normalizedPath)) {
      if (!winningRule || normalizedPath.length > winningRule.path.length) {
        winningRule = { ...rule, path: normalizedPath };
      }
    }
  }

  return winningRule ? winningRule.type !== 'disallow' : true;
}

function normalizeRulePath(path, origin) {
  if (!path) return '';
  if (path.startsWith('http')) {
    try {
      return new URL(path).pathname || '/';
    } catch {
      return '';
    }
  }
  if (!path.startsWith('/')) return `/${path}`;
  return path.replace(origin, '');
}
