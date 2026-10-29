import { describe, expect, it } from 'vitest';
import { reachesSurface } from './scenery';

describe('長太密的水草（polish-to-9.md §13.3）', () => {
  it('只有莖草會長到水面，小榕、前景草、莫絲只往旁邊擠', () => {
    expect(reachesSurface('rotala')).toBe(true);
    for (const id of ['anubias', 'eleocharis', 'glosso', 'hydrocotyle', 'moss'] as const) expect(reachesSurface(id)).toBe(false);
  });
});
