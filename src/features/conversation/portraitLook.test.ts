import { describe, expect, it } from 'vitest';
import { lookFor, sceneFor } from './portraitLook';

const who = (name: string, role = 'Parent') => ({ name, role, initials: 'XX', posterUrl: null });

describe('illustrated avatars', () => {
  it('gives each character a stable look that fits who they are', () => {
    expect(lookFor(who('Ria’s mother'))).toEqual(lookFor(who('Ria’s mother')));
    expect(lookFor(who('Kabir’s father')).kind).toBe('man');
    expect(lookFor(who('Mr. Mehta')).kind).toBe('man');
    expect(lookFor(who('Anaya’s mother')).kind).toBe('woman');
    expect(lookFor(who('ELSA', 'Coach')).kind).toBe('coach');
    for (const name of ['A', 'Bb', 'Ccc', 'Dev’s mother', 'Zoya’s grandmother', '名前']) {
      const look = lookFor(who(name));
      expect(look.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.hair).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.outfit).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('sets the scene from the moment', () => {
    expect(sceneFor({ icon: 'sun', kind: 'programme' })).toBe('gate');
    expect(sceneFor({ icon: 'chat', kind: 'programme' })).toBe('room');
    expect(sceneFor({ icon: 'phone', kind: 'anytime' })).toBe('phone');
    expect(sceneFor({ icon: 'star', kind: 'anytime' })).toBe('festive');
    expect(sceneFor({ icon: 'chat', kind: 'baseline' })).toBe('coach');
  });
});
