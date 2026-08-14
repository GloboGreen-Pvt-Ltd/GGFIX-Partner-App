import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { rs } from '../../theme/metrics';
import { C, S, SIZE, T } from './ledgerUi';

/* ── filter sheet ─────────────────────────────────────────────────────────
   The Cash Book account list's sort + filter, behind the control on the Net
   Balance card.

   Two rails rather than one long scroll: the sheet answers two independent
   questions ("in what order" and "which accounts"), and stacking them would
   make the second invisible below the fold on a phone. The left column names
   the question, the right column answers it — so the sheet is always one
   screen tall however many groups it grows.

   Draft state, not live: nothing moves under the owner's finger until Apply.
   A list that re-sorted on every radio tap would scroll away from whatever
   they were looking at, and Clear would have no meaning.
   ── */

/**
 * Sort orders, keyed to fields the account list actually carries.
 *
 * `default` is the server's own order (newest account first) and is what Clear
 * returns to. Every other option sorts a copy — see OwnerCashBookScreen — so
 * the default order survives without a refetch.
 */
export const SORT_OPTIONS = [
  { key: 'default', label: 'Default' },
  { key: 'lastPayment', label: 'Last Payment' },
  { key: 'latestActivity', label: 'Latest Activity' },
  { key: 'dueAmount', label: 'Due Amount' },
  { key: 'name', label: 'Name' },
];

/**
 * Which accounts to show at all, by where they stand.
 *
 * "Due" and "Advance" read the same way as the balance on every row and on the
 * Net Balance card: positive is owed to the shop.
 */
export const BALANCE_OPTIONS = [
  { key: 'all', label: 'All Accounts' },
  { key: 'due', label: 'Due Only' },
  { key: 'advance', label: 'Advance Only' },
  { key: 'settled', label: 'Settled' },
];

export const DEFAULT_LEDGER_FILTER = { sort: 'default', balance: 'all' };

/** True when nothing is narrowed — drives the dot on the card's control. */
export const isDefaultFilter = (f) =>
  (f?.sort || 'default') === 'default' && (f?.balance || 'all') === 'all';

const GROUPS = [
  { key: 'sort', title: 'Sort By', options: SORT_OPTIONS },
  { key: 'balance', title: 'Balance', options: BALANCE_OPTIONS },
];

/** Ring + fill, sized off one constant so the dot always sits centred. */
function Radio({ selected }) {
  const outer = rs(21);
  return (
    <View
      className="items-center justify-center"
      style={{
        height: outer,
        width: outer,
        borderRadius: outer / 2,
        borderWidth: 2,
        borderColor: selected ? C.green : C.border,
      }}
    >
      {selected ? (
        <View
          style={{
            height: outer * 0.5,
            width: outer * 0.5,
            borderRadius: outer / 4,
            backgroundColor: C.green,
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * @param {boolean}  visible
 * @param {object}   value     the applied filter — the sheet opens showing it
 * @param {Function} onClose
 * @param {Function} onApply   called with the new filter
 */
export default function LedgerFilterSheet({ visible, value, onClose, onApply }) {
  const [group, setGroup] = useState(GROUPS[0].key);
  const [draft, setDraft] = useState(DEFAULT_LEDGER_FILTER);

  // Re-seed on every open: a sheet dismissed halfway through must not reopen
  // holding the choices that were never applied.
  useEffect(() => {
    if (!visible) return;
    setDraft({ ...DEFAULT_LEDGER_FILTER, ...(value || {}) });
    setGroup(GROUPS[0].key);
  }, [visible, value]);

  const active = GROUPS.find((g) => g.key === group) || GROUPS[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(23, 33, 23, 0.45)' }}
      >
        {/* Swallows the backdrop press so a tap inside can't dismiss. */}
        <Pressable
          onPress={() => {}}
          className="bg-card"
          style={{ borderTopLeftRadius: rs(20), borderTopRightRadius: rs(20) }}
        >
          {/* ── header ─────────────────────────────────────────────── */}
          <View
            className="flex-row items-center"
            style={{
              paddingHorizontal: S.lg,
              paddingVertical: S.md,
              borderBottomWidth: 1,
              borderBottomColor: C.hairline,
            }}
          >
            <Text className="flex-1 font-extrabold" style={{ fontSize: T.screenTitle, color: C.ink }}>
              Filter
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={rs(10)}
              accessibilityRole="button"
              accessibilityLabel="Close filter"
              className="items-center justify-center active:opacity-60"
              style={{ height: SIZE.headerIcon, width: SIZE.headerIcon }}
            >
              <X size={rs(19)} color={C.ink} />
            </Pressable>
          </View>

          {/* ── rails ──────────────────────────────────────────────── */}
          <View className="flex-row" style={{ height: rs(280) }}>
            <View style={{ width: '36%', backgroundColor: C.field }}>
              {GROUPS.map((g) => {
                const on = g.key === active.key;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => setGroup(g.key)}
                    className="justify-center active:opacity-70"
                    style={{
                      paddingVertical: S.lg,
                      paddingHorizontal: S.md,
                      // The marker is a left border rather than a separate view
                      // so the label never shifts by a pixel when it lights up.
                      borderLeftWidth: rs(3),
                      borderLeftColor: on ? C.green : 'transparent',
                      borderBottomWidth: 1,
                      borderBottomColor: C.hairline,
                      backgroundColor: on ? '#FFFFFF' : 'transparent',
                    }}
                  >
                    <Text
                      className="font-extrabold"
                      style={{ fontSize: T.rowTitle, color: on ? C.green : C.ink }}
                    >
                      {g.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingVertical: S.xs }}
              showsVerticalScrollIndicator={false}
            >
              {active.options.map((o) => {
                const on = draft[active.key] === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => setDraft((d) => ({ ...d, [active.key]: o.key }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    className="flex-row items-center active:opacity-70"
                    style={{ paddingHorizontal: S.lg, paddingVertical: S.md }}
                  >
                    <Text
                      className="flex-1"
                      style={{ fontSize: T.rowTitle, color: C.ink, fontWeight: on ? '800' : '500' }}
                    >
                      {o.label}
                    </Text>
                    <Radio selected={on} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── footer ─────────────────────────────────────────────── */}
          <View
            className="flex-row"
            style={{
              paddingHorizontal: S.lg,
              paddingTop: S.md,
              paddingBottom: S.lg,
              borderTopWidth: 1,
              borderTopColor: C.hairline,
            }}
          >
            {/* Clear resets the draft in place instead of applying and closing:
                the owner almost always picks something else straight after, and
                closing the sheet would make them reopen it to do that. */}
            <Pressable
              onPress={() => setDraft(DEFAULT_LEDGER_FILTER)}
              className="flex-1 items-center justify-center rounded-full active:opacity-70"
              style={{
                minHeight: SIZE.buttonMin,
                marginRight: S.sm,
                borderWidth: 1.5,
                borderColor: C.green,
                backgroundColor: '#FFFFFF',
              }}
            >
              <Text className="font-extrabold" style={{ fontSize: T.button, color: C.green }}>
                Clear
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { onApply?.(draft); onClose?.(); }}
              className="flex-1 items-center justify-center rounded-full active:opacity-85"
              style={{ minHeight: SIZE.buttonMin, backgroundColor: C.green }}
            >
              <Text className="font-extrabold" style={{ fontSize: T.button, color: '#FFFFFF' }}>
                Apply
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
