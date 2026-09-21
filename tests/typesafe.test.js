import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateTypeSafe, prepareTypeSafePage, MODEL } from '../lib/audit/typesafe.js';

const env = { TYPESAFE_API_KEY: 'test-key', VERCEL_ENV: 'preview' };
const body = '<main><h1>Pipe repair</h1><p>We repair copper supply pipes in occupied homes. Inspections take 45 minutes. A technician isolates the leak and explains the repair choices before work begins.</p></main>';
const page = (n = 0) => ({ url: `https://example.com/services/${n}`, status: 200, html: `<html><head><title>Pipe repair</title></head><body>${body}</body></html>` });
function response(confidence = 0.95) {
  const dimension = { type: 'score', score: 2, confidence, probabilities: { 0: 0, 1: 0, 2: 1, 3: 0 }, legend: { 0: 'none', 1: 'some', 2: 'specific', 3: 'detailed' } };
  return { model: MODEL, usage: { input_tokens: 100, output_tokens: 20 }, answers: {
    pageType: { type: 'choice', choice: 'service', confidence: 0.95, probabilities: { service: 1, product: 0, education: 0, contact: 0, about: 0, pricing: 0, other: 0 } },
    clarity: { ...dimension }, specificity: { ...dimension }, substantiation: { ...dimension },
  } };
}
afterEach(() => vi.useRealTimers());

describe('TypeSafe evidence preparation', () => {
  it('excludes scripts, navigation, hidden content and footer claims', () => {
    const input = page();
    input.html = `<title>Pipe repair</title><body><nav>Contact About</nav>${body}<script>certified FAQ case study</script><p hidden>secret</p><p style="display: none">invisible</p><footer>Award winner</footer></body>`;
    const evidence = prepareTypeSafePage(input);
    expect(evidence.excerpt).toContain('We repair copper');
    expect(evidence.excerpt).not.toMatch(/Contact|certified|secret|invisible|Award/);
    expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records truncation without silently claiming complete page coverage', () => {
    const evidence = prepareTypeSafePage({ ...page(), html: `<body>${'content '.repeat(2000)}</body>` });
    expect(evidence.excerpt).toHaveLength(10000);
    expect(evidence.excerptTruncated).toBe(true);
  });
});

describe('TypeSafe pilot', () => {
  it('skips without a key, with the kill switch, or in production by default', async () => {
    const client = { systemOne: vi.fn() };
    for (const config of [{}, { ...env, TYPESAFE_AUDIT_MODE: 'off' }, { ...env, VERCEL_ENV: 'production' }]) {
      const result = await evaluateTypeSafe({ pages: [page()] }, { env: config, client });
      expect(result.status).toBe('skipped');
      expect(result.score).toBeNull();
    }
    expect(client.systemOne).not.toHaveBeenCalled();
  });

  it('does not call the model for empty, failed, or sparse pages', async () => {
    const client = { systemOne: vi.fn() };
    const result = await evaluateTypeSafe({ pages: [{ ...page(), status: 403 }, { ...page(1), html: '<body>Loading</body>' }] }, { env, client });
    expect(result.status).toBe('unavailable');
    expect(result.score).toBeNull();
    expect(client.systemOne).not.toHaveBeenCalled();
  });

  it('batches independent questions per page, limits requests and saves reusable evidence', async () => {
    const client = { systemOne: vi.fn().mockResolvedValue(response()) };
    const result = await evaluateTypeSafe({ pages: Array.from({ length: 10 }, (_, n) => page(n)) }, { env, client });
    expect(client.systemOne).toHaveBeenCalledTimes(6);
    const [request, options] = client.systemOne.mock.calls[0];
    expect(Object.keys(request.questions)).toEqual(['pageType', 'clarity', 'specificity', 'substantiation']);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(request.model).toBe(MODEL);
    expect(result.score).toBe(67);
    expect(result.coverage).toEqual({ crawled: 10, eligible: 10, sampled: 6, assessed: 6, scored: 6 });
    expect(result.pages[0].pageType.choice).toBe('service');
    expect(result.usage.inputTokens).toBe(600);
    expect(JSON.stringify(result)).not.toContain('test-key');
    expect(result.outreachEligible).toBe(false);
  });

  it('withholds composites for low confidence without replacing uncertainty with zero', async () => {
    const client = { systemOne: vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response(0.4)) };
    const result = await evaluateTypeSafe({ pages: [page(), page(1)] }, { env, client });
    expect(result.status).toBe('partial');
    expect(result.score).toBeNull();
    expect(result.pages[0].score).toBe(67);
    expect(result.pages[1].score).toBeNull();
    expect(result.pages[1].dimensions.clarity.score).toBe(2);
  });

  it.each(['missing', 'out-of-range', 'bad-probabilities', 'inconsistent-score', 'bad-choice'])('fails closed on %s responses', async (kind) => {
    const invalid = response();
    if (kind === 'missing') delete invalid.answers.specificity;
    if (kind === 'out-of-range') invalid.answers.clarity.score = 101;
    if (kind === 'bad-probabilities') invalid.answers.clarity.probabilities = { 0: 0.2, 1: 0.1 };
    if (kind === 'inconsistent-score') invalid.answers.clarity.score = 1;
    if (kind === 'bad-choice') invalid.answers.pageType.choice = 'invented';
    const result = await evaluateTypeSafe({ pages: [page()] }, { env, client: { systemOne: vi.fn().mockResolvedValue(invalid) } });
    expect(result.status).toBe('unavailable');
    expect(result.score).toBeNull();
    expect(result.pages[0].dimensions).toEqual({});
  });

  it('retains service failure as unavailable and strips provider error details', async () => {
    const error = Object.assign(new Error('secret response body and test-key'), { status: 401 });
    const result = await evaluateTypeSafe({ pages: [page()] }, { env, client: { systemOne: vi.fn().mockRejectedValue(error) } });
    expect(result.pages[0].reason).toBe('TypeSafe authentication failed');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('aborts active calls and does not dispatch remaining pages after the total deadline', async () => {
    vi.useFakeTimers();
    const client = { systemOne: vi.fn((_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })) };
    const pending = evaluateTypeSafe({ pages: Array.from({ length: 6 }, (_, n) => page(n)) }, { env, client, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(51);
    const result = await pending;
    expect(client.systemOne).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('unavailable');
    expect(result.pages.every((item) => item.reason === 'TypeSafe time budget exceeded')).toBe(true);
  });
});
