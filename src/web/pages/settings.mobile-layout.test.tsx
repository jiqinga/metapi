import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Settings mobile layout', () => {
  it('collapses fixed form grids behind the shared mobile breakpoint', () => {
    const settingsDir = resolve(process.cwd(), 'src/web/pages/settings');
    const sectionSources = readdirSync(settingsDir)
      .filter((name) => name.endsWith('.tsx'))
      .map((name) => readFileSync(resolve(settingsDir, name), 'utf8'))
      .join('\n');

    expect(sectionSources).toContain("import { useIsMobile } from '../../components/useIsMobile.js'");
    expect(sectionSources).toContain('const isMobile = useIsMobile()');
    expect(sectionSources).toContain("gridTemplateColumns: isMobile ? '1fr' : '180px 180px auto'");
    expect(sectionSources).toContain("gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'");
    expect(sectionSources).toContain("gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr'");
  });
});
