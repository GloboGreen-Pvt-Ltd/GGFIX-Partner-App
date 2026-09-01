import React, { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from './cn';

/** Row height in compact mode — fixed, so the list can scroll to the selection. */
const ROW = 44;

/**
 * Options open in a CENTRED POPUP, never anchored to the field.
 *
 * An anchored version existed briefly and was removed: several Selects here sit
 * inside a Modal (the ready-by sheet), and `measureInWindow` reports screen
 * coordinates while the panel is positioned inside a NEW Modal's own root view.
 * Those two spaces don't agree — the status bar and the host Modal's own offset
 * are not accounted for — so the panel landed away from its field. A centred
 * popup needs no coordinates at all, so it cannot be mispositioned.
 *
 * @param menuWidth  Optional panel width. Without it the panel fills the screen
 *                   less a 24px gutter, which is right for long labels (state,
 *                   district, taluk) and absurd for a list of "01".."12".
 *                   Passing it switches to COMPACT mode: fixed width, centred
 *                   labels, current value highlighted, list opens scrolled to
 *                   that value — which a 60-item minute list needs, or you can't
 *                   see what is set without hunting for it.
 * @param menuTitle  Optional heading. A narrow column of bare numbers floating
 *                   mid-screen doesn't say what it is picking.
 */
export function Select({
  value, options = [], placeholder = 'Select…', onChange, className, displayValue,
  menuWidth, menuTitle,
}) {
  const [open, setOpen] = useState(false);
  const listRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : (displayValue || placeholder);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const compact = !!menuWidth;

  const close = () => setOpen(false);

  // Two rows of context above the selection rather than pinning it to the top,
  // so it reads as a position in the list instead of the start of one. Compact
  // only: the offset is derived from ROW, which the taller `py-3` rows don't use.
  const onListLayout = () => {
    if (!compact || selectedIndex < 3) return;
    listRef.current?.scrollTo({ y: (selectedIndex - 2) * ROW, animated: false });
  };

  const renderRows = () => (
    <ScrollView ref={listRef} onLayout={onListLayout}>
      {options.map((o, i) => {
        const isSel = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => { onChange?.(o.value, o); close(); }}
            className={cn(
              'px-4 justify-center active:bg-background',
              i < options.length - 1 && 'border-b border-border',
              compact ? 'items-center' : 'py-3',
              compact && isSel && 'bg-primary/10',
            )}
            style={compact ? { height: ROW } : null}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
          >
            <Text className={cn('text-base', compact && isSel ? 'text-primary font-bold' : 'text-text')}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
      {options.length === 0 && (
        <View className="px-4 py-6">
          <Text className="text-text-muted text-center">No options</Text>
        </View>
      )}
    </ScrollView>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          'bg-card border border-border rounded-xl px-4 py-3 flex-row items-center justify-between',
          className,
        )}
      >
        <Text className={cn('text-base', selected ? 'text-text' : 'text-text-muted')}>{label}</Text>
        <Ionicons name="chevron-down" size={16} color="#667066" />
      </Pressable>

      {/* Only mount the Modal while open. Keeping it permanently mounted made
          every Select reconcile its whole option list on each parent render —
          on a text-heavy form that per-keystroke cost was enough to stall the
          focused input's caret. */}
      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={close}>
          <Pressable
            className={cn('flex-1 bg-black/50 justify-center px-6', compact && 'items-center')}
            onPress={close}
          >
            <Pressable
              className="bg-card rounded-2xl max-h-80 overflow-hidden"
              style={compact ? { width: menuWidth } : null}
              onPress={(e) => e.stopPropagation()}
            >
              {menuTitle ? (
                <View className="px-4 py-2.5 border-b border-border">
                  <Text className="text-text-muted text-xs font-semibold text-center tracking-wide">
                    {menuTitle}
                  </Text>
                </View>
              ) : null}
              {renderRows()}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
