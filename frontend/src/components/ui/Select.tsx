import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Accessible name. Required because there is no visible label element. */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** Radix rejects an empty item value, but "" is the usual "All" filter here. */
const EMPTY_VALUE = '__ui-select-empty__';

function toRadixValue(value: string): string {
  return value === '' ? EMPTY_VALUE : value;
}

function fromRadixValue(value: string): string {
  return value === EMPTY_VALUE ? '' : value;
}

export default function Select({ value, onValueChange, options, label, placeholder, disabled, id, className = '' }: SelectProps) {
  const hasEmptyOption = options.some((option) => option.value === '');
  const radixValue = value === '' && !hasEmptyOption ? undefined : toRadixValue(value);

  return (
    <RadixSelect.Root
      value={radixValue}
      onValueChange={(nextValue) => onValueChange(fromRadixValue(nextValue))}
      disabled={disabled}
    >
      <RadixSelect.Trigger id={id} className={`ui-select__trigger ${className}`.trim()} aria-label={label}>
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="ui-select__icon">
          <ChevronDown aria-hidden="true" size={18} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="ui-select__content" position="popper" sideOffset={6}>
          <RadixSelect.Viewport className="ui-select__viewport">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={toRadixValue(option.value)}
                disabled={option.disabled}
                className="ui-select__item"
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ui-select__check">
                  <Check aria-hidden="true" size={16} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
