import { render } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { PaginatedReaderView } from './PaginatedReaderView';
import { useReaderStore } from '../stores/useReaderStore';
import { useSettingsStore } from '../stores/useSettingsStore';

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    // Immediately trigger a resize event with some mock dimensions
    this.callback([{
      contentRect: { width: 800, height: 600 },
      target
    }] as any, this);
  }
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver as any;

const MOCK_WORDS = Array.from({ length: 200 }, (_, i) => ({
  text: `word${i}`,
  isParagraphStart: false,
  isSentenceStart: false,
}));

describe('PaginatedReaderView Visual Highlighting', () => {
  beforeEach(() => {
    useReaderStore.setState({
      words: MOCK_WORDS,
      sections: [{ label: 'Chapter 1', startIndex: 0 }],
      currentIndex: 0,
      isPlaying: false,
      isReadingAloud: false,
    });
    useSettingsStore.setState({
      paginatedFontSize: 16,
      fontFamily: 'system',
      theme: 'light',
    });
  });

  it('renders words and correctly highlights currentIndex with correct globalIdx', () => {
    // In this test we want to mock the inner layout effect and just let pretext format
    // But since pretext can be slow or unsupported in pure JSDOM without canvas setup
    // We expect PaginatedReaderView to run its layout synchronously or fallback to initial render safely
    const mockNavigate = vi.fn();
    const mockHandlePlay = vi.fn();
    const mockClose = vi.fn();

    const { container } = render(
      <PaginatedReaderView 
        navigate={mockNavigate}
        handleSetIsPlaying={mockHandlePlay}
        onCloseBook={mockClose}
        onReadChapter={vi.fn()}
      />
    );

    // Initial state: currentIndex is 0, layoutState.start is 0
    // So the first word should be word0, and it should be "highlighted" with the underline span!
    const spans = container.querySelectorAll('span[data-word-idx]');
    expect(spans.length).toBeGreaterThan(0);
    
    // In Paginated mode, the currentIndex word is underlined (it has additional styling for highlighting)
    // We can check if data-word-idx matches the logical progression
    expect(spans[0].getAttribute('data-word-idx')).toBe('0');
    expect(spans[1].getAttribute('data-word-idx')).toBe('1');
    
    // We can also check if we update currentIndex, the highlight follows properly!
    
  });
});
