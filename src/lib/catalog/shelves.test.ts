import { describe, expect, it } from 'vitest';
import { categoryOf } from './shelves';

describe('categoryOf', () => {
  it('finds the genre named by the first subject that names one, most specific first', () => {
    expect(categoryOf(['Adultery', 'Novels'])?.id).toBe('romances');
    expect(categoryOf(['Science fiction', 'Fiction'])?.id).toBe('ficcao-cientifica');
    expect(categoryOf(['Brazilian poetry'])?.id).toBe('poesia');
    expect(categoryOf(['realismo', 'contos'])?.id).toBe('contos');
    expect(categoryOf(['Adultery', 'Catholic Church'])).toBeNull();
    expect(categoryOf(['Machine learning', 'Python (Computer program language)'])?.id).toBe('tecnologia');
    expect(categoryOf(['Computer science'])?.id).toBe('tecnologia');
  });
});
