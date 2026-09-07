import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, meetsWcagAA } from './contrast.js';
import {
  PHASE_PRESENTATION,
  THEME_TOKENS,
  cssVariableName,
  resolveTheme,
  themeToCssDeclarations,
  type ThemeTokenKey,
} from './tokens.js';
import { CLOCK_PHASES } from '../domain/enums.js';

describe('contrast helpers', () => {
  it('parses hex colours', () => {
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('0b0f14')).toEqual([11, 15, 20]);
    expect(() => hexToRgb('#12')).toThrow(/Invalid hex/);
  });
  it('computes the canonical black/white ratio', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });
  it('applies the large-text threshold', () => {
    expect(meetsWcagAA('#767676', '#FFFFFF')).toBe(true);
    expect(meetsWcagAA('#8A8A8A', '#FFFFFF')).toBe(false);
    expect(meetsWcagAA('#8A8A8A', '#FFFFFF', true)).toBe(true);
  });
});

describe('theme tokens', () => {
  const backgrounds: ThemeTokenKey[] = ['bg', 'surface', 'surface2'];
  const foregrounds = (Object.keys(THEME_TOKENS) as ThemeTokenKey[]).filter(
    (k) => !backgrounds.includes(k) && k !== 'border',
  );

  it.each(foregrounds.flatMap((f) => backgrounds.map((b) => [f, b] as const)))(
    '%s on %s meets WCAG AA',
    (fg, bg) => {
      expect(contrastRatio(THEME_TOKENS[fg], THEME_TOKENS[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('has a presentation entry for every clock phase', () => {
    for (const phase of CLOCK_PHASES) {
      expect(PHASE_PRESENTATION[phase].label.length).toBeGreaterThan(0);
      expect(THEME_TOKENS[PHASE_PRESENTATION[phase].token]).toMatch(/^#/);
    }
  });

  it('applies only valid overrides', () => {
    const theme = resolveTheme({ court: '#ff0000', team: 'red', unknown: '#123456' });
    expect(theme.court).toBe('#ff0000');
    expect(theme.team).toBe(THEME_TOKENS.team);
    expect((theme as Record<string, string>)['unknown']).toBeUndefined();
  });

  it('emits CSS variable declarations for every token', () => {
    const css = themeToCssDeclarations(resolveTheme());
    for (const key of Object.keys(THEME_TOKENS) as ThemeTokenKey[]) {
      expect(css).toContain(`${cssVariableName(key)}: ${THEME_TOKENS[key]};`);
    }
  });
});
