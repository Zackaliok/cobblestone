import { describe, expect, it } from 'vitest';

import { buildIssueUrl } from './crashReport';

const report = { description: 'Crash au démarrage', version: '0.3.0', os: 'Linux x86_64', log: '' };

describe('buildIssueUrl', () => {
  it('préremplit le formulaire de bug', () => {
    const url = new URL(buildIssueUrl({ ...report, log: 'ligne 1\nligne 2' }));

    expect(url.origin + url.pathname).toBe('https://github.com/Zackaliok/cobblestone/issues/new');
    expect(url.searchParams.get('template')).toBe('1-bug.yml');
    expect(url.searchParams.get('description')).toBe('Crash au démarrage');
    expect(url.searchParams.get('version')).toBe('0.3.0');
    expect(url.searchParams.get('logs')).toContain('ligne 1\nligne 2');
  });

  it('omet le journal quand il est vide', () => {
    expect(new URL(buildIssueUrl(report)).searchParams.has('logs')).toBe(false);
  });

  it('garde la fin du journal quand il est trop long', () => {
    const log = Array.from({ length: 2000 }, (_, index) => `ligne ${index}`).join('\n');
    const url = buildIssueUrl({ ...report, log });

    expect(url.length).toBeLessThanOrEqual(7000);
    const logs = new URL(url).searchParams.get('logs') ?? '';
    expect(logs).toContain('ligne 1999');
    expect(logs).not.toContain('ligne 0\n');
  });
});
