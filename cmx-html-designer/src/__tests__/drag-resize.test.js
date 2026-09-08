import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clamp, bindHorizontalDrag, bindVerticalDrag } from '../utils/drag-resize.js';

// ── clamp ───────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps to min when below', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('clamps to max when above', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });
  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it('handles negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(0, -10, -1)).toBe(-1);
  });
  it('handles float values', () => {
    expect(clamp(1.5, 1.0, 2.0)).toBe(1.5);
    expect(clamp(0.5, 1.0, 2.0)).toBe(1.0);
  });
});

// ── bindHorizontalDrag ──────────────────────────────────────────────────────

describe('bindHorizontalDrag', () => {
  let splitter;
  let onMove;

  beforeEach(() => {
    splitter = document.createElement('div');
    document.body.appendChild(splitter);
    onMove = vi.fn();
    bindHorizontalDrag(splitter, onMove);
  });

  it('adds dragging class on mousedown', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    expect(splitter.classList.contains('dragging')).toBe(true);
  });

  it('calls onMove with delta on mousemove after mousedown', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 120 }));
    expect(onMove).toHaveBeenCalledWith(20);
  });

  it('accumulates delta across multiple moves', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 80 }));
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove).toHaveBeenNthCalledWith(1, 50);
    expect(onMove).toHaveBeenNthCalledWith(2, 30);
  });

  it('removes dragging class on mouseup', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(splitter.classList.contains('dragging')).toBe(false);
  });

  it('stops calling onMove after mouseup', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('calls onMove with negative delta when moving left', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 70 }));
    expect(onMove).toHaveBeenCalledWith(-30);
  });
});

// ── bindVerticalDrag ────────────────────────────────────────────────────────

describe('bindVerticalDrag', () => {
  let splitter;
  let onMove;

  beforeEach(() => {
    splitter = document.createElement('div');
    document.body.appendChild(splitter);
    onMove = vi.fn();
    bindVerticalDrag(splitter, onMove);
  });

  it('adds dragging class on mousedown', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 200, bubbles: true }));
    expect(splitter.classList.contains('dragging')).toBe(true);
  });

  it('calls onMove with delta on mousemove after mousedown', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 200, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 230 }));
    expect(onMove).toHaveBeenCalledWith(30);
  });

  it('removes dragging class on mouseup', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 200, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(splitter.classList.contains('dragging')).toBe(false);
  });

  it('stops calling onMove after mouseup', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 200, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 300 }));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('calls onMove with negative delta when moving up', () => {
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientY: 200, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientY: 180 }));
    expect(onMove).toHaveBeenCalledWith(-20);
  });
});
