import type { ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import './Tabs.css';

export interface TabItem {
  value: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Names the tab list for screen readers. */
  label: string;
  className?: string;
}

/**
 * In-page tabs that switch content without changing the URL. For tabs that
 * navigate between routes use SectionTabs.
 */
export default function Tabs({ items, value, defaultValue, onValueChange, label, className = '' }: TabsProps) {
  return (
    <RadixTabs.Root
      className={`ui-tabs ${className}`.trim()}
      value={value}
      defaultValue={defaultValue ?? (value === undefined ? items[0]?.value : undefined)}
      onValueChange={onValueChange}
    >
      <RadixTabs.List className="ui-tabs__list" aria-label={label}>
        {items.map((item) => (
          <RadixTabs.Trigger key={item.value} value={item.value} disabled={item.disabled} className="ui-tabs__trigger">
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => item.content !== undefined && (
        <RadixTabs.Content key={item.value} value={item.value} className="ui-tabs__panel">
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
