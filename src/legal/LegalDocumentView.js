import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowUp,
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  ListOrdered,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { LEGAL_DOC_TYPES } from './legalContent';
import SafeModal, { ModalInsets } from '../components/SafeModal';

/**
 * Full legal document as an app reading screen.
 *
 *   phones   a "Now reading" bar pinned under the header (current section +
 *            reading progress) that opens the contents as a bottom sheet; a
 *            summary card (title, dates, reading time); the intro and every
 *            section as its own card; a link to the other policy; and a
 *            back-to-top button once the reader is well into the text.
 *   tablets  (>= 768dp) the contents stay open in a side column instead.
 *
 * Only the page chrome (title, summary, reading time, links) is added here;
 * every heading, clause, list and paragraph comes verbatim and in order from
 * legalContent.js, with its own numbering.
 */

const C = {
  ink: '#101828',
  body: '#3B4250',
  muted: '#6B7280',
  subtle: '#98A2B3',
  line: '#E4E9E6',
  page: '#F3F6F4',
  white: '#FFFFFF',
  green: '#609138', // progress, active indicator, bullets
  greenText: '#035C6C', // green text on white (AA)
  greenDeep: '#035C6C',
  greenTint: '#E5F3F5',
  greenSoft: '#E5F3F5',
  greenLine: '#C7E6EA',
};
const WIDE = 768;
const SIDE_NAV = 320; // tablet contents column (at most 38% of the width)
const COLUMN = 760; // max reading width on tablets
const SPY_MARGIN = 56; // a section is "current" once its top is this close to the top edge

// Page chrome per document — same wording as the website pages.
const PAGE = {
  [LEGAL_DOC_TYPES.TERMS]: {
    title: 'Terms and Conditions',
    description: 'The rules for using the Near G Fix app, website and services.',
    Icon: FileText,
    related: { type: LEGAL_DOC_TYPES.PRIVACY, title: 'Privacy Policy', description: 'How we collect, use and protect your data.', Icon: ShieldCheck },
  },
  [LEGAL_DOC_TYPES.PRIVACY]: {
    title: 'Privacy Policy',
    description: 'How Near G Fix collects, uses, shares and protects your information.',
    Icon: ShieldCheck,
    related: { type: LEGAL_DOC_TYPES.TERMS, title: 'Terms and Conditions', description: 'The rules for using Near G Fix.', Icon: FileText },
  },
};

function readingMinutes(doc) {
  const texts = [];
  const add = (block) => {
    if (block.text) texts.push(block.text);
    if (block.items) texts.push(...block.items);
  };
  doc.intro.forEach(add);
  doc.sections.forEach((section) => section.blocks.forEach(add));
  const words = texts.join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/* -------------------------------------------------------------------------- */
/* Document text                                                              */
/* -------------------------------------------------------------------------- */

/** `**` toggles bold; "\n" line breaks render as-is. */
function Rich({ text, style }) {
  const parts = text.split('**');
  return (
    <Text style={style}>
      {parts.map((part, i) => (i % 2 ? <Text key={i} style={styles.bold}>{part}</Text> : part))}
    </Text>
  );
}

// "2.1 Minimum Age" / "1.1. \"Platform\"" -> number + title.
const CLAUSE = /^(\d+(?:\.\d+)+\.?)\s+([\s\S]*)$/;
// "a. text" / "**a. Camera:** text" -> the label gets its own column so
// wrapped lines align with the item text, not under the letter.
const OL_LABEL = /^(\*\*)?([a-z0-9]{1,4}\.)\s+/i;

function Clause({ text }) {
  const m = text.match(CLAUSE);
  if (!m) return <Rich text={text} style={styles.clause} />;
  // Number in its own column: a wrapped title lines up under the title, not
  // under the number, and "1.1." / "2.1" show the same way (display only).
  return (
    <View style={styles.clauseRow}>
      <Text style={[styles.clause, styles.clauseNum]}>{m[1].replace(/.$/, '')}</Text>
      <Rich text={m[2]} style={[styles.clause, styles.flex]} />
    </View>
  );
}

function Block({ block, first }) {
  switch (block.type) {
    case 'h':
      return (
        <View style={first ? null : styles.clauseGap}>
          <Clause text={block.text} />
        </View>
      );
    case 'n':
      return (
        <View style={[styles.numRow, !first && styles.blockGap]}>
          <Text style={styles.num}>{block.num}</Text>
          <Rich text={block.text} style={[styles.para, styles.flex]} />
        </View>
      );
    case 'ul':
      return (
        <View style={[styles.list, !first && styles.listGap]}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.li}>
              <View style={styles.dot} />
              <Rich text={item} style={[styles.para, styles.flex]} />
            </View>
          ))}
        </View>
      );
    case 'ol':
      return (
        <View style={[styles.list, !first && styles.listGap]}>
          {block.items.map((item, i) => {
            const m = item.match(OL_LABEL);
            if (!m) return <Rich key={i} text={item} style={styles.para} />;
            const rest = item.slice(m[0].length);
            return (
              <View key={i} style={styles.li}>
                <Text style={styles.olLabel}>{m[2]}</Text>
                <Rich text={m[1] ? `**${rest}` : rest} style={[styles.para, styles.flex]} />
              </View>
            );
          })}
        </View>
      );
    default:
      return <Rich text={block.text} style={[styles.para, !first && styles.blockGap]} />;
  }
}

function Fact({ Icon, label, value }) {
  return (
    <View style={styles.fact}>
      <View style={styles.factLabelRow}>
        <Icon size={12} color={C.greenText} />
        <Text style={styles.factLabel}>{label}</Text>
      </View>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/**
 * Everything that scrolls. Memoised: it never re-renders while reading, only
 * the "Now reading" bar and the contents lists do.
 */
const DocumentBody = memo(function DocumentBody({ doc, page, minutes, column, onSectionLayout, onOpenDoc }) {
  const { Icon, related } = page;
  const RelatedIcon = related.Icon;
  // The top padding lives here, not on the ScrollView, so section y offsets
  // measured inside this view are also scroll offsets.
  return (
    <View style={[styles.body, column && styles.bodyWide, column]}>
      <LinearGradient colors={[C.greenTint, C.white]} style={[styles.card, styles.summary]}>
        <View style={styles.summaryTop}>
          <View style={styles.summaryIcon}>
            <Icon size={24} color={C.greenText} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>Legal</Text>
            <Text style={styles.summaryTitle} accessibilityRole="header">{page.title}</Text>
          </View>
        </View>
        <Text style={styles.summaryText}>{page.description}</Text>
        <View style={styles.facts}>
          <Fact Icon={CalendarCheck} label="Effective" value={doc.effectiveDate} />
          <View style={styles.factDivider} />
          <Fact Icon={CalendarClock} label="Updated" value={doc.lastUpdated} />
          <View style={styles.factDivider} />
          <Fact Icon={Clock} label="Read time" value={`${minutes} min`} />
        </View>
      </LinearGradient>

      <View style={[styles.card, styles.sectionCard]}>
        {doc.intro.map((block, i) => <Block key={i} block={block} first={i === 0} />)}
      </View>

      {doc.sections.map((section, i) => (
        <View
          key={section.id}
          onLayout={(e) => onSectionLayout(i, e.nativeEvent.layout.y)}
          style={[styles.card, styles.sectionCard]}
        >
          <View style={styles.sectionHead}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{section.num}</Text>
            </View>
            <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
          </View>
          {section.blocks.map((block, j) => <Block key={j} block={block} first={j === 0} />)}
        </View>
      ))}

      {onOpenDoc ? (
        <>
          <Text style={styles.footLabel}>Also read</Text>
          <Pressable
            onPress={() => onOpenDoc(related.type)}
            accessibilityRole="link"
            android_ripple={{ color: C.greenTint }}
            style={[styles.card, styles.related]}
          >
            <View style={styles.relatedIcon}>
              <RelatedIcon size={20} color={C.greenText} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.relatedTitle}>{related.title}</Text>
              <Text style={styles.relatedText}>{related.description}</Text>
            </View>
            <ChevronRight size={20} color={C.subtle} />
          </Pressable>
        </>
      ) : null}
      <Text style={styles.finePrint}>
        {doc.heading} · Last updated {doc.lastUpdated}
      </Text>
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* Contents                                                                   */
/* -------------------------------------------------------------------------- */

function TocRows({ sections, active, onSelect, onItemLayout }) {
  return sections.map((section, i) => {
    const on = i === active;
    return (
      <Pressable
        key={section.id}
        onPress={() => onSelect(i)}
        onLayout={onItemLayout ? (e) => onItemLayout(i, e.nativeEvent.layout.y) : undefined}
        android_ripple={{ color: C.greenTint }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${section.num}. ${section.title}`}
        style={[styles.tocRow, on && styles.tocRowOn]}
      >
        <View style={[styles.tocNum, on && styles.tocNumOn]}>
          <Text style={[styles.tocNumText, on && styles.tocNumTextOn]}>{section.num}</Text>
        </View>
        <Text style={[styles.tocText, on && styles.tocTextOn]} numberOfLines={2}>{section.title}</Text>
      </Pressable>
    );
  });
}

function Progress({ value }) {
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.trackFill, { transform: [{ scaleX: value }] }]} />
    </View>
  );
}

function ReadingBar({ section, total, progress, onPress }) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={section ? `Now reading ${section.num}. ${section.title}. Open contents` : 'Open contents'}
        android_ripple={{ color: C.greenTint }}
        style={styles.barButton}
      >
        <View style={styles.barBadge}>
          {section ? <Text style={styles.barBadgeText}>{section.num}</Text> : <ListOrdered size={16} color={C.greenText} />}
        </View>
        <View style={styles.flex}>
          <Text style={styles.barLabel}>{section ? 'Now reading' : 'Contents'}</Text>
          <Text style={styles.barTitle} numberOfLines={1}>
            {section ? section.title : `Jump to any of ${total} sections`}
          </Text>
        </View>
        <View style={styles.barChevron}>
          <ChevronDown size={18} color={C.greenText} />
        </View>
      </Pressable>
      <Progress value={progress} />
    </View>
  );
}

function ContentsSheet({ open, sections, active, onSelect, onClose }) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const anim = useRef(new Animated.Value(0)).current;
  const listRef = useRef(null);
  const scrolled = useRef(false);

  useEffect(() => {
    if (open) {
      scrolled.current = false;
      setMounted(true);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, anim]);

  // Open with the current section in view.
  const onItemLayout = (i, y) => {
    if (i !== active || scrolled.current) return;
    scrolled.current = true;
    listRef.current?.scrollTo({ y: Math.max(0, y - 140), animated: false });
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  return (
    <SafeModal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* The modal window's own insets — the screen's don't reach it. */}
      <ModalInsets>
        {({ insets }) => (
          <View style={styles.sheetRoot}>
            <Animated.View style={[styles.backdrop, { opacity: anim }]}>
              <Pressable style={styles.fillAbs} onPress={onClose} accessibilityLabel="Close contents" />
            </Animated.View>
            <Animated.View style={[styles.sheet, { maxHeight: height * 0.82, paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}>
              <View style={styles.handle} />
              <View style={styles.sheetHeader}>
                <View style={styles.flex}>
                  <Text style={styles.sheetTitle}>Contents</Text>
                  <Text style={styles.sheetSub}>{sections.length} sections · tap one to jump to it</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close contents" style={styles.sheetClose}>
                  <X size={18} color={C.ink} />
                </Pressable>
              </View>
              <ScrollView ref={listRef} contentContainerStyle={styles.sheetList}>
                <TocRows sections={sections} active={active} onSelect={onSelect} onItemLayout={onItemLayout} />
              </ScrollView>
            </Animated.View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen body                                                                */
/* -------------------------------------------------------------------------- */

/**
 *   doc        LEGAL_DOCS.TERMS or LEGAL_DOCS.PRIVACY
 *   onOpenDoc  optional (type) => void — shows a link to the other policy
 */
export default function LegalDocumentView({ doc, onOpenDoc }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= WIDE;
  const page = PAGE[doc.type] || PAGE[LEGAL_DOC_TYPES.TERMS];
  const sections = doc.sections;
  const minutes = useMemo(() => readingMinutes(doc), [doc]);

  // Tablets: a fixed contents column (ScrollView grows by default, so it is
  // sized explicitly) and one centred reading column.
  const sideWidth = Math.round(Math.min(SIDE_NAV, width * 0.38));
  const column = useMemo(() => {
    if (!wide) return null;
    return { width: Math.min(COLUMN, width - sideWidth - 1 - 64), alignSelf: 'center' };
  }, [wide, width, sideWidth]);

  const scrollRef = useRef(null);
  const navRef = useRef(null);
  const offsets = useRef([]);
  const navItemY = useRef([]);
  const lockTimer = useRef(null); // set while a tap-driven scroll is animating
  const clicked = useRef(null);
  const activeRef = useRef(-1);
  const showTopRef = useRef(false);
  const viewport = useRef({ content: 0, height: 0 });
  const scrollY = useRef(new Animated.Value(0)).current;

  const [active, setActive] = useState(-1); // -1: above the first section
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [maxScroll, setMaxScroll] = useState(1);

  const progress = useMemo(
    () => scrollY.interpolate({ inputRange: [0, Math.max(1, maxScroll)], outputRange: [0, 1], extrapolate: 'clamp' }),
    [scrollY, maxScroll],
  );

  useEffect(() => () => clearTimeout(lockTimer.current), []);

  // Keep the active entry in view in the tablet side column.
  useEffect(() => {
    if (!wide || active < 0) return;
    const y = navItemY.current[active];
    if (y != null) navRef.current?.scrollTo({ y: Math.max(0, y - 160), animated: true });
  }, [active, wide]);

  const select = (i) => {
    activeRef.current = i;
    setActive(i);
  };

  const lock = () => {
    clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => { lockTimer.current = null; }, 900);
  };

  const releaseLock = () => {
    clearTimeout(lockTimer.current);
    lockTimer.current = null;
  };

  const jumpTo = (i) => {
    select(i);
    clicked.current = i;
    lock();
    setSheetOpen(false);
    scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[i] ?? 0) - 12), animated: true });
  };

  const backToTop = () => {
    select(-1);
    lock();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const onScroll = (e) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const y = contentOffset.y;
    scrollY.setValue(y);

    const top = y > 900;
    if (top !== showTopRef.current) {
      showTopRef.current = top;
      setShowTop(top);
    }
    if (lockTimer.current) return;

    const probe = y + SPY_MARGIN;
    let idx = -1;
    for (let i = 0; i < sections.length; i += 1) {
      if ((offsets.current[i] ?? Infinity) <= probe) idx = i;
      else break;
    }
    // The last few sections are too short to reach the top. At the bottom of
    // the page, prefer the one just tapped if it is on screen, else the last.
    if (y > 0 && y + layoutMeasurement.height >= contentSize.height - 4) {
      const c = clicked.current;
      const cTop = c == null ? null : offsets.current[c];
      idx = cTop != null && cTop < y + layoutMeasurement.height ? c : sections.length - 1;
    }
    if (idx !== activeRef.current) select(idx);
  };

  const updateMax = () => {
    const { content, height } = viewport.current;
    setMaxScroll(Math.max(1, content - height));
  };
  const onContentSizeChange = (w, h) => {
    viewport.current.content = h;
    updateMax();
  };
  const onViewportLayout = (e) => {
    viewport.current.height = e.nativeEvent.layout.height;
    updateMax();
  };

  const onSectionLayout = useCallback((i, y) => { offsets.current[i] = y; }, []);
  const onNavItemLayout = useCallback((i, y) => { navItemY.current[i] = y; }, []);

  const body = (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      onScrollBeginDrag={releaseLock}
      scrollEventThrottle={16}
      onContentSizeChange={onContentSizeChange}
      onLayout={onViewportLayout}
      style={styles.fill}
      contentContainerStyle={[styles.scrollContent, wide && styles.scrollContentWide, { paddingBottom: insets.bottom + 32 }]}
    >
      <DocumentBody
        doc={doc}
        page={page}
        minutes={minutes}
        column={column}
        onSectionLayout={onSectionLayout}
        onOpenDoc={onOpenDoc}
      />
    </ScrollView>
  );

  const topButton = showTop ? (
    <Pressable
      onPress={backToTop}
      accessibilityRole="button"
      accessibilityLabel="Back to top"
      style={[styles.topFab, { bottom: insets.bottom + 20 }]}
    >
      <ArrowUp size={20} color={C.greenText} />
    </Pressable>
  ) : null;

  if (wide) {
    return (
      <View style={styles.row}>
        <View style={[styles.side, { width: sideWidth }]}>
          <View style={styles.sideHeader}>
            <Text style={styles.sheetTitle}>Contents</Text>
            <Text style={styles.sheetSub}>{sections.length} sections</Text>
          </View>
          <ScrollView ref={navRef} contentContainerStyle={[styles.sideList, { paddingBottom: insets.bottom + 24 }]}>
            <TocRows sections={sections} active={active} onSelect={jumpTo} onItemLayout={onNavItemLayout} />
          </ScrollView>
        </View>
        <View style={styles.fill}>
          <Progress value={progress} />
          {body}
          {topButton}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <ReadingBar
        section={active >= 0 ? sections[active] : null}
        total={sections.length}
        progress={progress}
        onPress={() => setSheetOpen(true)}
      />
      {body}
      {topButton}
      <ContentsSheet
        open={sheetOpen}
        sections={sections}
        active={active}
        onSelect={jumpTo}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.page },
  fillAbs: { ...StyleSheet.absoluteFillObject },
  row: { flex: 1, flexDirection: 'row', backgroundColor: C.page },
  flex: { flex: 1 },
  bold: { fontWeight: '700', color: C.ink },
  card: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line },
  scrollContent: { paddingHorizontal: 14 },
  scrollContentWide: { paddingHorizontal: 32 },
  body: { paddingTop: 14 },
  bodyWide: { paddingTop: 24 },

  // Summary card
  summary: { padding: 18, borderColor: C.greenLine },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.greenLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { fontSize: 11, fontWeight: '800', color: C.greenText, letterSpacing: 1.2, textTransform: 'uppercase' },
  summaryTitle: { marginTop: 2, fontSize: 22, lineHeight: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  summaryText: { marginTop: 12, fontSize: 14.5, lineHeight: 21, color: C.muted },
  facts: {
    flexDirection: 'row',
    marginTop: 16,
    paddingVertical: 10,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
  },
  fact: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  factLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factLabel: { fontSize: 10.5, fontWeight: '700', color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  factValue: { marginTop: 4, fontSize: 13, fontWeight: '700', color: C.ink, textAlign: 'center' },
  factDivider: { width: 1, marginVertical: 2, backgroundColor: C.line },

  // Section cards
  sectionCard: { marginTop: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  sectionBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBadgeText: { fontSize: 14, fontWeight: '800', color: C.greenDeep, fontVariant: ['tabular-nums'] },
  sectionTitle: { flex: 1, fontSize: 17, lineHeight: 23, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },

  clause: { fontSize: 15.5, lineHeight: 22, fontWeight: '700', color: C.ink },
  clauseRow: { flexDirection: 'row', alignItems: 'flex-start' },
  clauseNum: { minWidth: 44, paddingRight: 8, color: C.greenText, fontVariant: ['tabular-nums'] },
  clauseGap: { marginTop: 18 },
  para: { fontSize: 15, lineHeight: 24, color: C.body, textAlign: 'justify' },
  blockGap: { marginTop: 10 },
  numRow: { flexDirection: 'row', gap: 10 },
  num: { minWidth: 38, fontSize: 15, lineHeight: 24, fontWeight: '700', color: C.greenText, fontVariant: ['tabular-nums'] },
  list: { gap: 6, paddingLeft: 2 },
  listGap: { marginTop: 8 },
  li: { flexDirection: 'row', alignItems: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginTop: 9, marginRight: 12 },
  olLabel: { minWidth: 26, fontSize: 15, lineHeight: 24, fontWeight: '700', color: C.greenText },

  // After the document
  footLabel: { marginTop: 24, marginBottom: 8, marginLeft: 4, fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 1, textTransform: 'uppercase' },
  related: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, overflow: 'hidden' },
  relatedIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  relatedTitle: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  relatedText: { marginTop: 2, fontSize: 13.5, lineHeight: 19, color: C.muted },
  finePrint: { marginTop: 20, textAlign: 'center', fontSize: 12, color: C.subtle },

  // "Now reading" bar + progress (phones)
  bar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  barButton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  barBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: C.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barBadgeText: { fontSize: 14, fontWeight: '800', color: C.greenDeep, fontVariant: ['tabular-nums'] },
  barLabel: { fontSize: 10.5, fontWeight: '800', color: C.muted, letterSpacing: 1, textTransform: 'uppercase' },
  barTitle: { marginTop: 1, fontSize: 14.5, fontWeight: '700', color: C.ink },
  barChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 3, backgroundColor: C.line, overflow: 'hidden' },
  trackFill: { height: 3, backgroundColor: C.green, transformOrigin: 'left' },

  // Contents rows (sheet + tablet column)
  tocRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14 },
  tocRowOn: { backgroundColor: C.greenTint },
  tocNum: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 5,
    borderRadius: 15,
    backgroundColor: '#F1F4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tocNumOn: { backgroundColor: C.greenText },
  tocNumText: { fontSize: 12.5, fontWeight: '700', color: C.muted, fontVariant: ['tabular-nums'] },
  tocNumTextOn: { color: C.white },
  tocText: { flex: 1, fontSize: 14.5, lineHeight: 20, color: C.body },
  tocTextOn: { color: C.greenDeep, fontWeight: '700' },

  side: { backgroundColor: C.white, borderRightWidth: 1, borderRightColor: C.line },
  sideHeader: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  sideList: { padding: 8 },

  // Bottom sheet
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,24,40,0.45)' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D0D5DD', marginTop: 10 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  sheetSub: { marginTop: 2, fontSize: 13, color: C.muted },
  sheetClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F4F2', alignItems: 'center', justifyContent: 'center' },
  sheetList: { padding: 8 },

  // Back to top
  topFab: {
    position: 'absolute',
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: C.ink,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
});
