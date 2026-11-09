import { expect, test } from '@playwright/test';
import { generateColumns, getBlockPosition } from '../../src/pages/apprenticeships-timeline/utils';
import type { ZoomLevel } from '../../src/pages/apprenticeships-timeline/types';

function inTimezone(zone: string, check: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    check();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

for (const zone of ['UTC', 'Africa/Cairo', 'Europe/London', 'America/New_York']) {
  test(`timeline columns count calendar days across daylight saving in ${zone}`, () => {
    inTimezone(zone, () => {
      const year = generateColumns('year', new Date(2026, 0, 1), new Date(2026, 11, 31));
      expect(year[0].widthPx).toBeCloseTo(365 * 1.15);
      const leapYear = generateColumns('year', new Date(2028, 0, 1), new Date(2028, 11, 31));
      expect(leapYear[0].widthPx).toBeCloseTo(366 * 1.15);
      const intake = generateColumns('intake', new Date(2026, 8, 1), new Date(2026, 11, 31));
      expect(intake[0].widthPx).toBeCloseTo(122 * 1.2);
      const months = generateColumns('month', new Date(2026, 0, 1), new Date(2026, 11, 31));
      expect(months[3].widthPx).toBeCloseTo(30 * 2.8);
      expect(months[9].widthPx).toBeCloseTo(31 * 2.8);
    });
  });

  test(`module boundaries stay on their calendar days at every zoom in ${zone}`, () => {
    inTimezone(zone, () => {
      const scales: [ZoomLevel, number][] = [['year', 1.15], ['intake', 1.2], ['month', 2.8], ['week', 160], ['day', 32]];
      for (const [zoom, scale] of scales) {
        const cols = generateColumns(zoom, new Date(2026, 0, 1), new Date(2026, 11, 31));
        for (const date of ['2026-04-26', '2026-10-31', '2026-11-02']) {
          const daysFromStart = (Date.parse(date) - Date.parse('2026-01-01')) / 86400000;
          const pos = getBlockPosition(date, date, cols)!;
          expect(pos.left, `${zoom}: ${date}`).toBeCloseTo(daysFromStart * scale);
          expect(pos.width, `${zoom}: one day`).toBeCloseTo(scale);
        }
        const spanning = getBlockPosition('2026-10-24', '2026-11-02', cols)!;
        expect(spanning.width, `${zoom}: range across DST`).toBeCloseTo(10 * scale);
      }
    });
  });
}

test('module ranges clip at the visible calendar boundaries and reject reversed dates', () => {
  inTimezone('Africa/Cairo', () => {
    const cols = generateColumns('month', new Date(2026, 9, 1), new Date(2026, 9, 31));
    expect(getBlockPosition('2026-09-28', '2026-10-02', cols)).toEqual({ left: 0, width: 5.6 });
    const end = getBlockPosition('2026-10-30', '2026-11-04', cols)!;
    expect(end.left).toBeCloseTo(29 * 2.8);
    expect(end.width).toBeCloseTo(2 * 2.8);
    expect(getBlockPosition('2026-11-01', '2026-11-04', cols)).toBeNull();
    expect(getBlockPosition('2026-10-05', '2026-10-01', cols)).toBeNull();
  });
});
