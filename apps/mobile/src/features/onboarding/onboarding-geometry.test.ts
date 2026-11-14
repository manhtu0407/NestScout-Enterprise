import { cardWidthFor, clampStep, placeCard, spotlightBox } from './onboarding-geometry';

const screen = { width: 400, height: 800 };

describe('onboarding geometry', () => {
  test('the spotlight grows around the target by the padding and rounds with the shorter side', () => {
    expect(spotlightBox({ x: 100, y: 700, width: 200, height: 60 }, screen, 6, 28)).toEqual({ x: 94, y: 694, width: 212, height: 72, radius: 28 });
    expect(spotlightBox({ x: 100, y: 100, width: 40, height: 40 }, screen, 6, 28)).toEqual({ x: 94, y: 94, width: 52, height: 52, radius: 26 });
  });

  test('the spotlight never leaves the screen', () => {
    expect(spotlightBox({ x: 0, y: 0, width: 400, height: 50 }, screen, 6, 28)).toEqual({ x: 0, y: 0, width: 400, height: 56, radius: 28 });
    expect(spotlightBox({ x: 380, y: 780, width: 40, height: 40 }, screen, 6, 28)).toMatchObject({ x: 374, y: 774, width: 26, height: 26 });
  });

  test('the card is as wide as the screen allows within its maximum', () => {
    expect(cardWidthFor(screen, 372, 20)).toBe(360);
    expect(cardWidthFor({ width: 800, height: 600 }, 372, 20)).toBe(372);
    expect(cardWidthFor({ width: 30, height: 600 }, 372, 20)).toBe(0);
  });

  test('without a target the card is centred', () => {
    expect(placeCard(null, screen, 360, 16, 20)).toEqual({ kind: 'center' });
  });

  test('a target in the lower half puts the card above it', () => {
    const box = { x: 20, y: 700, width: 360, height: 80, radius: 28 };
    expect(placeCard(box, screen, 360, 16, 20)).toEqual({ kind: 'above', left: 20, bottom: 116 });
  });

  test('a target in the upper half puts the card below it', () => {
    const box = { x: 10, y: 10, width: 60, height: 60, radius: 28 };
    expect(placeCard(box, screen, 360, 16, 20)).toEqual({ kind: 'below', left: 20, top: 86 });
  });

  test('the card is kept inside the side gutters', () => {
    const right = placeCard({ x: 340, y: 20, width: 50, height: 50, radius: 25 }, screen, 300, 16, 20);
    expect(right).toEqual({ kind: 'below', left: 80, top: 86 });
    const left = placeCard({ x: 0, y: 20, width: 50, height: 50, radius: 25 }, screen, 300, 16, 20);
    expect(left).toEqual({ kind: 'below', left: 20, top: 86 });
  });

  test('a step index is clamped into the plan', () => {
    expect(clampStep(-3, 4)).toBe(0);
    expect(clampStep(2, 4)).toBe(2);
    expect(clampStep(9, 4)).toBe(3);
  });
});
