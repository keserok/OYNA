import React, { useState, useEffect, useRef, useMemo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight: number;
  className?: string;
}

export const VirtualList = <T,>({
  items,
  renderItem,
  itemHeight,
  className = '',
}: VirtualListProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); // Default fallback

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    // Initialize container height
    setContainerHeight(container.clientHeight);
    container.addEventListener('scroll', handleScroll, { passive: true });

    // Handle window resize or layout changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerHeight(entry.target.clientHeight);
      }
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const totalHeight = items.length * itemHeight;

  const { startIndex, endIndex } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 2); // Buffer of 2 items above
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + 2 // Buffer of 2 items below
    );
    return { startIndex: start, endIndex: end };
  }, [scrollTop, containerHeight, items.length, itemHeight]);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, index) => {
      const originalIndex = startIndex + index;
      return (
        <div
          key={originalIndex}
          style={{
            position: 'absolute',
            top: originalIndex * itemHeight,
            left: 0,
            right: 0,
            height: itemHeight,
          }}
        >
          {renderItem(item, originalIndex)}
        </div>
      );
    });
  }, [items, startIndex, endIndex, itemHeight, renderItem]);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto relative custom-scrollbar ${className}`}
      style={{ height: '100%', width: '100%' }}
    >
      <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
        {visibleItems}
      </div>
    </div>
  );
};
