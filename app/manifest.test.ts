import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import manifest from './manifest';

function readPngHeader(path: string): { width: number; height: number; colorType: number } {
  const data = readFileSync(path);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data.readUInt8(25),
  };
}

test('manifest publishes standard and maskable FSC Forecast icons', () => {
  const value = manifest();

  assert.equal(value.name, 'FSC Forecast');
  assert.equal(value.short_name, 'FSC Forecast');
  assert.equal(value.start_url, '/');
  assert.equal(value.display, 'standalone');
  assert.equal(value.background_color, '#f2f1ec');
  assert.equal(value.theme_color, '#185a52');
  assert.deepEqual(value.icons, [
    {
      src: '/icons/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-192x192-maskable.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/icons/icon-512x512-maskable.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ]);
});

test('generated icon files have the required dimensions and opaque safe-zone variants', () => {
  assert.deepEqual(readPngHeader('public/icons/icon-192x192.png'), {
    width: 192,
    height: 192,
    colorType: 6,
  });
  assert.deepEqual(readPngHeader('public/icons/icon-512x512.png'), {
    width: 512,
    height: 512,
    colorType: 6,
  });
  assert.deepEqual(readPngHeader('public/icons/icon-192x192-maskable.png'), {
    width: 192,
    height: 192,
    colorType: 2,
  });
  assert.deepEqual(readPngHeader('public/icons/icon-512x512-maskable.png'), {
    width: 512,
    height: 512,
    colorType: 2,
  });
  assert.deepEqual(readPngHeader('public/icons/apple-touch-icon.png'), {
    width: 180,
    height: 180,
    colorType: 2,
  });
  assert.deepEqual(readPngHeader('public/icons/favicon-16x16.png'), {
    width: 16,
    height: 16,
    colorType: 2,
  });
  assert.deepEqual(readPngHeader('public/icons/favicon-32x32.png'), {
    width: 32,
    height: 32,
    colorType: 2,
  });
});
