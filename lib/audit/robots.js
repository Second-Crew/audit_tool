export function parseRobotsTxt(content) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  // Per RFC 9309, consecutive user-agent lines share one group of rules.
  let collectingAgents = false;

  for (const rawLine of (content || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }

    if (key === 'user-agent') {
      if (collectingAgents && current) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      continue;
    }

    collectingAgents = false;

    if (['allow', 'disallow'].includes(key)) {
      if (!current) {
        current = { agents: ['*'], rules: [] };
        groups.push(current);
      }
      // An empty pattern (e.g. bare "Disallow:") matches nothing per RFC 9309.
      if (value) current.rules.push({ type: key, path: value });
    }
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
    const allowed = isAllowedByRobots(parsed, bot, '/', origin);
    access[bot] = {
      allowed,
      evidence: `${bot}: ${allowed ? 'allowed' : 'blocked'} at /`,
    };
    return access;
  }, {});
}

export function isAllowedByRobots(parsedRobots, userAgent, path = '/', origin = '') {
  const groups = parsedRobots?.groups || [];
  const agent = userAgent.toLowerCase();

  // Most specific agent wins: the longest robots.txt token the crawler name starts with.
  let bestTokenLength = -1;
  for (const group of groups) {
    for (const candidate of group.agents) {
      if (candidate !== '*' && agent.startsWith(candidate) && candidate.length > bestTokenLength) {
        bestTokenLength = candidate.length;
      }
    }
  }

  const matchingGroups = groups.filter((group) =>
    bestTokenLength >= 0
      ? group.agents.some((candidate) => candidate !== '*' && agent.startsWith(candidate) && candidate.length === bestTokenLength)
      : group.agents.includes('*')
  );

  if (!matchingGroups.length) return true;

  let winner = null;
  for (const rule of matchingGroups.flatMap((group) => group.rules)) {
    const pattern = normalizeRulePath(rule.path, origin);
    if (!pattern) continue;
    const specificity = matchRulePattern(pattern, path);
    if (specificity === -1) continue;

    if (
      !winner ||
      specificity > winner.specificity ||
      // Equal specificity: allow wins over disallow.
      (specificity === winner.specificity && rule.type === 'allow' && winner.type === 'disallow')
    ) {
      winner = { type: rule.type, specificity };
    }
  }

  return winner ? winner.type !== 'disallow' : true;
}

// Returns pattern specificity (its literal length) when the pattern matches, or -1.
// Supports the "*" wildcard and "$" end anchor used by major crawlers.
function matchRulePattern(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(`^${body.split('*').map(escapeRegExp).join('.*')}${anchored ? '$' : ''}`);
  return regex.test(path) ? body.length : -1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  if (!path.startsWith('/') && !path.startsWith('*')) return `/${path}`;
  return path.replace(origin, '');
}
