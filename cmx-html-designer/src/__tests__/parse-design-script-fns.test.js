import { describe, it, expect } from 'vitest';
import { parseDesignPageFunctionDeclarations } from '../utils/parse-design-script-fns.js';

describe('parseDesignPageFunctionDeclarations', () => {
  it('parses a simple function', () => {
    const src = `// hi
function foo(a, b) {
  return a + b;
}`;
    const fns = parseDesignPageFunctionDeclarations(src);
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe('foo');
    expect(fns[0].params).toBe('a, b');
    expect(fns[0].body).toContain('return a + b');
  });

  it('parses async function', () => {
    const fns = parseDesignPageFunctionDeclarations('async function bar() {\n  await 1;\n}');
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe('bar');
    expect(fns[0].params).toBe('');
  });

  it('parses multiple functions', () => {
    const fns = parseDesignPageFunctionDeclarations(
      'function a() { return 1; }\nfunction b(x) { return x; }',
    );
    expect(fns.map((f) => f.name)).toEqual(['a', 'b']);
  });

  it('handles paren in string in params', () => {
    const fns = parseDesignPageFunctionDeclarations(
      'function f(s) { return s; }',
    );
    expect(fns).toHaveLength(1);
    expect(fns[0].name).toBe('f');
  });
});
