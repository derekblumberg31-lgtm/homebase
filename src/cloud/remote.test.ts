import { describe, expect, it } from 'vitest';
import { isMissingObject } from './remote';

describe('what counts as a missing cloud file', () => {
  it('is only a definite "Object not found" from Storage', () => {
    expect(isMissingObject({ statusCode: '404', message: 'Object not found' })).toBe(true);
    expect(isMissingObject({ status: 400, message: 'Object not found' })).toBe(true);
  });

  it('is not any other failure, even a 404 or a message with those words in it', () => {
    expect(isMissingObject({ status: 404, message: '' })).toBe(false);
    expect(isMissingObject({ status: 404, message: 'Not Found' })).toBe(false);
    expect(isMissingObject({ status: 404, message: '<html>404 Page not found</html>' })).toBe(false);
    expect(isMissingObject({ status: 500, message: 'Object not found' })).toBe(false);
    expect(isMissingObject({ message: 'bucket not found' })).toBe(false);
    expect(isMissingObject(new TypeError('Failed to fetch'))).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});
