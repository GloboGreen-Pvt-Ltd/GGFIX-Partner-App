import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, Search, X, Package, Truck, User, Phone, Smartphone, Clock, Mic, MicOff, Camera } from 'lucide-react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { ticketApi } from '../../api/client';
import { listShopRepairBookings } from '../../api/orders';
import { pickupsOnly } from './AllBooking/bookingScopes';
import { loadSearchableModels, searchModels } from '../../utils/deviceSearch';
import { navigateDeviceAction } from '../../utils/deviceActions';
import DeviceActionSheet from '../../components/DeviceActionSheet';
import { useResponsive } from '../../theme/responsive';

/**
 * Owner search — one surface over two different things:
 *
 *   DEVICES   the master catalogue. Touching a result opens the action sheet
 *             (Book Service / Sell / Buy) rather than navigating, so the shop
 *             picks the device once and then picks what to do with it.
 *   WORK      this shop's own tickets and pickups, by tracking ID, customer
 *             name, mobile, or pickup ID. Touching one opens that record.
 *
 * Devices are listed first: typing "oppo a5" is far more often the start of a
 * booking than a lookup of a booking that happens to mention it.
 *
 * SOURCES
 *   · models   `loadSearchableModels()` — whole catalogue, cached, matched and
 *              ranked locally. Local is what makes autocomplete instant; the
 *              catalogue is small enough to hold and it barely changes.
 *   · tickets  server-side via `?q=`, the same /tickets call the Bookings list
 *              makes, so results agree with that screen.
 *   · pickups  `listShopRepairBookings()` returns the feed whole with no `q`
 *              parameter, so those are matched client-side with `pickupsOnly`,
 *              the same predicate the Bookings list uses.
 *
 * This screen replaced an intent router that parsed "in repair / in sell / in
 * buy" out of the query and jumped into a flow without ever looking at a ticket
 * or a model.
 */

const GREEN = '#087A0A';
const GREEN_DARK = '#087A0A';
const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;
const RECENTS_KEY = 'owner.search.recents';
// Web Speech API (Chrome / Edge / Safari); Android uses its speech intent.
const WebSpeech = Platform.OS === 'web' && typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;
const MAX_RECENTS = 6;

// Work-record needle: case-insensitive with '#' and spaces dropped, so
// "#CSPEN 8848351", "cspen8848351" and "CSPEN8848351" are the same search.
// Device matching has its own normaliser in utils/deviceSearch.
const norm = (v) => String(v ?? '').toLowerCase().replace(/[#\s]/g, '');

function pickupMatches(b, needle) {
  return [b.bookingNumber, b.customerName, b.customerMobile, b.id]
    .filter(Boolean)
    .some((v) => norm(v).includes(needle));
}

export default function OwnerSearchScreen({ navigation, route }) {
  // Live layout facts — recomputed on rotation, fold and split-screen, unlike
  // the module-level scales in utils/responsive.js.
  const r = useResponsive();
  const [query, setQuery] = useState('');
  const [catalogue, setCatalogue] = useState([]);
  const [devices, setDevices] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [pickups, setPickups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [recents, setRecents] = useState([]);
  const [sheetFor, setSheetFor] = useState(null);

  // Guards against an older, slower response overwriting a newer one — typing
  // fast fires several requests and they do not necessarily land in order.
  const reqRef = useRef(0);

  const inputRef = useRef(null);
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);

  // No in-app speech engine (Expo Go / unsupported browser): the keyboard's own
  // mic still dictates, so focus the field and say so. Alert, not a toast, so
  // the answer can't be missed.
  const voiceFallback = useCallback(() => {
    setListening(false);
    Alert.alert('Voice search', 'Use the microphone on your keyboard to dictate the device, ticket or customer.', [{ text: 'OK' }]);
    setTimeout(() => inputRef.current?.focus?.(), 150);
  }, []);

  // Voice search — same engines as the Customer app's Search: Android's speech
  // recogniser via intent, the Web Speech API on web. The heard text becomes
  // the query, which the debounced search below runs.
  const startVoice = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        setListening(true);
        const r = await IntentLauncher.startActivityAsync('android.speech.action.RECOGNIZE_SPEECH', {
          extra: {
            'android.speech.extra.LANGUAGE_MODEL': 'free_form',
            'android.speech.extra.LANGUAGE': 'en-IN',
            'android.speech.extra.PROMPT': 'Say a device, ticket ID or customer',
          },
        });
        const heard = r?.extra?.['android.speech.extra.RESULTS']?.[0];
        if (heard) setQuery(String(heard));
      } catch (_) {
        voiceFallback();
      } finally {
        setListening(false);
      }
      return;
    }
    if (!WebSpeech) { voiceFallback(); return; }
    try {
      recRef.current?.abort?.();
      const rec = new WebSpeech();
      rec.lang = 'en-IN';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const text = Array.from(e.results).map((x) => x[0]?.transcript || '').join(' ').trim();
        if (text) setQuery(text);
      };
      rec.onerror = voiceFallback;
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    } catch (_) {
      voiceFallback();
    }
  }, [voiceFallback]);
  const stopVoice = useCallback(() => {
    try { recRef.current?.stop?.(); } catch (_) {}
    setListening(false);
  }, []);
  useEffect(() => () => { try { recRef.current?.abort?.(); } catch (_) {} }, []);

  // Camera = the existing visual device scanner (ScanSearchScreen lens mode).
  const openLens = useCallback(() => navigation.navigate('ProductScan'), [navigation]);

  // Home's mic / camera buttons open this screen with `launch`.
  const launched = route?.params?.launch;
  useEffect(() => {
    if (launched === 'voice') startVoice();
    else if (launched === 'image') openLens();
    if (launched) navigation.setParams({ launch: undefined }); // don't re-fire on re-render
  }, [launched, startVoice, openLens, navigation]);

  // ScanSearchScreen hands off here (a "multiple matches" or "single device"
  // scan result) with a query already known — land on the real result list
  // instead of an empty search box the owner has to retype.
  const prefillQuery = route?.params?.prefillQuery;
  useEffect(() => {
    if (prefillQuery) setQuery(prefillQuery);
  }, [prefillQuery]);

  // Catalogue up front so the first keystroke already has something to match.
  useEffect(() => {
    let cancelled = false;
    loadSearchableModels()
      .then((rows) => { if (!cancelled) setCatalogue(rows); })
      .catch(() => { if (!cancelled) setCatalogue([]); });
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => { if (!cancelled && raw) setRecents(JSON.parse(raw) || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pushRecent = useCallback((term) => {
    const t = String(term || '').trim();
    if (t.length < MIN_QUERY) return;
    setRecents((prev) => {
      const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENTS);
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(RECENTS_KEY).catch(() => {});
  }, []);

  const run = useCallback(async (raw) => {
    const q = String(raw || '').trim();
    const needle = norm(q);
    if (needle.length < MIN_QUERY) {
      setDevices([]); setTickets([]); setPickups([]); setSearched(false); setError(null);
      return;
    }

    // Devices resolve synchronously off the cached catalogue — no await, so
    // autocomplete never waits on the network round-trip below.
    setDevices(searchModels(catalogue, q));

    const seq = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const [tRes, pRes] = await Promise.allSettled([
        ticketApi.get('/tickets', { query: { page: 0, size: 100, q } }),
        listShopRepairBookings(),
      ]);
      if (seq !== reqRef.current) return; // a newer search has already started

      if (tRes.status === 'fulfilled') {
        const d = tRes.value;
        const rows = Array.isArray(d) ? d : d?.content ?? d?.data ?? [];
        // The server applied `q` but knows nothing about '#'/space stripping,
        // so re-filter locally to catch "#CSPEN 884…".
        setTickets(rows.filter((t) => [t.trackingId, t.customerName, t.customerMobile, t.customerPhone, t.id]
          .filter(Boolean).some((v) => norm(v).includes(needle))));
      } else setTickets([]);

      if (pRes.status === 'fulfilled') {
        setPickups(pickupsOnly(pRes.value || []).filter((b) => pickupMatches(b, needle)));
      } else setPickups([]);

      if (tRes.status === 'rejected' && pRes.status === 'rejected') {
        setError('Could not reach the server. Check your connection and try again.');
      }
      setSearched(true);
    } finally {
      if (seq === reqRef.current) setLoading(false);
    }
  }, [catalogue]);

  // Debounced so a 12-character tracking ID is one request, not twelve.
  useEffect(() => {
    const t = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, run]);

  /**
   * Action → flow. The device object is passed WHOLE (ids included) so no
   * downstream screen re-searches by name and lands on a different record.
   *
   * Routes live in utils/deviceActions.js (shared with the product camera).
   */
  const onAction = (key, device) => {
    // Refuses to navigate without a real model id, per the spec's guard.
    if (!device?.modelId) {
      setSheetFor(null);
      Alert.alert('Device unavailable', 'That model is missing its catalogue id, so the flow cannot be started from here.', [{ text: 'OK' }]);
      return;
    }
    setSheetFor(null);
    pushRecent(query);
    navigateDeviceAction(navigation, key, device);
  };

  const openWorkRecord = (item) => {
    pushRecent(query);
    if (item.kind === 'pickup') navigation.navigate('OwnerPickupServiceDetail', { id: item.row.id, booking: item.row });
    else navigation.navigate('DeviceDetail', { ticketId: item.row.id });
  };

  // One flat list, section-tagged, so devices and work records scroll together.
  const data = useMemo(() => {
    const out = [];
    if (devices.length) {
      out.push({ type: 'header', key: 'h-dev', label: `DEVICES · ${devices.length}` });
      devices.forEach((d) => out.push({ type: 'device', key: `d-${d.modelId}`, row: d }));
    }
    const work = [
      ...tickets.map((t) => ({ type: 'work', kind: 'ticket', key: `t-${t.id}`, row: t })),
      ...pickups.map((p) => ({ type: 'work', kind: 'pickup', key: `p-${p.id}`, row: p })),
    ];
    if (work.length) {
      out.push({ type: 'header', key: 'h-work', label: `BOOKINGS & PICKUPS · ${work.length}` });
      out.push(...work);
    }
    return out;
  }, [devices, tickets, pickups]);

  const renderDevice = (d) => (
    <Pressable
      onPress={() => setSheetFor(d)}
      accessibilityRole="button"
      accessibilityLabel={`${d.brandName} ${d.modelName}, choose an action`}
      className="bg-white rounded-2xl px-3.5 py-3 mb-2 active:opacity-80"
      style={{ borderWidth: 1, borderColor: '#EFF5EE' }}
    >
      <View className="flex-row items-center">
        <View
          className="h-11 w-11 rounded-xl items-center justify-center mr-3 overflow-hidden"
          style={{ backgroundColor: '#F8F8F8' }}
        >
          {d.modelImageUrl
            ? <Image source={{ uri: d.modelImageUrl }} style={{ width: '86%', height: '86%' }} resizeMode="contain" />
            : <Smartphone size={20} color="#8FA08F" strokeWidth={2} />}
        </View>
        <View className="flex-1">
          <Text className="text-[13px] font-extrabold text-gray-900" numberOfLines={1}>
            {d.displayName}
          </Text>
          <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
            {[d.categoryName, d.modelNumber].filter(Boolean).join(' · ') || 'Device'}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  const renderWork = (item) => {
    const r = item.row;
    const isPickup = item.kind === 'pickup';
    const ref = isPickup
      ? String(r.bookingNumber || r.id || '').replace(/^#+/, '')
      : (r.trackingId || String(r.id || '').slice(0, 8).toUpperCase());
    const title = isPickup
      ? (r.issueSummary || 'Pickup request')
      : (r.deviceDisplayName || r.deviceModelName || r.modelName || 'Device');
    const name = r.customerName || '-';
    const phone = r.customerMobile || r.customerPhone || '';

    return (
      <Pressable
        onPress={() => openWorkRecord(item)}
        className="bg-white rounded-2xl px-3.5 py-3 mb-2 active:opacity-80"
        style={{ borderWidth: 1, borderColor: '#EFF5EE' }}
      >
        <View className="flex-row items-center">
          <View className="h-9 w-9 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: '#F0F8EF' }}>
            {isPickup ? <Truck size={17} color={GREEN_DARK} strokeWidth={2} /> : <Package size={17} color={GREEN_DARK} strokeWidth={2} />}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text className="text-[10px] font-extrabold" style={{ color: GREEN }}>#{ref}</Text>
              <Text className="text-[9.5px] font-bold text-gray-400 ml-2">{isPickup ? 'PICKUP' : 'BOOKING'}</Text>
            </View>
            <Text className="text-[13px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>{title}</Text>
            <View className="flex-row items-center mt-1">
              <User size={11} color="#667066" strokeWidth={2} />
              <Text className="text-[11px] text-gray-600 ml-1" numberOfLines={1}>{name}</Text>
              {phone ? (
                <>
                  <Phone size={11} color="#667066" strokeWidth={2} style={{ marginLeft: 10 }} />
                  <Text className="text-[11px] text-gray-600 ml-1">{phone}</Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderItem = ({ item }) => {
    if (item.type === 'header') {
      return <Text className="text-[11px] font-extrabold text-gray-500 tracking-wide mb-2 mt-1">{item.label}</Text>;
    }
    return item.type === 'device' ? renderDevice(item.row) : renderWork(item);
  };

  const tooShort = norm(query).length > 0 && norm(query).length < MIN_QUERY;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: r.spacing.md,
            paddingBottom: r.spacing.lg,
            paddingHorizontal: r.spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: r.maxWidth('list'), alignSelf: 'center' }}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={10}
              className="h-9 w-9 rounded-full items-center justify-center mr-1"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <ChevronLeft size={20} color="#172117" strokeWidth={2} />
            </Pressable>
            <View
              className="flex-1 flex-row items-center bg-white rounded-2xl px-3.5 py-2.5"
              style={{ shadowColor: '#172117', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 }}
            >
              <Search size={16} color={GREEN} strokeWidth={2} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={() => { pushRecent(query); run(query); }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Device, ticket or customer"
                placeholderTextColor="#8FA08F"
                style={{ flex: 1, marginLeft: 8, color: '#172117', fontSize: 13, padding: 0 }}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={6} className="w-6 h-6 rounded-full items-center justify-center mr-1" style={{ backgroundColor: '#EFF5EE' }}>
                  <X size={13} color="#667066" strokeWidth={2} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={listening ? stopVoice : startVoice}
                accessibilityRole="button"
                accessibilityLabel={listening ? 'Stop voice search' : 'Voice search'}
                hitSlop={6}
                className="w-7 h-7 rounded-full items-center justify-center mr-1"
                style={{ backgroundColor: '#F0F8EF' }}
              >
                {listening
                  ? <MicOff size={15} color={GREEN_DARK} strokeWidth={2} />
                  : <Mic size={15} color={GREEN_DARK} strokeWidth={2} />}
              </Pressable>
              <Pressable
                onPress={openLens}
                accessibilityRole="button"
                accessibilityLabel="Product scanner"
                hitSlop={6}
                className="w-7 h-7 rounded-full items-center justify-center"
                style={{ backgroundColor: '#F0F8EF' }}
              >
                <Camera size={15} color={GREEN_DARK} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        contentContainerStyle={{
          padding: r.spacing.lg,
          width: '100%',
          maxWidth: r.maxWidth('list'),
          alignSelf: 'center',
          // Landscape has plenty of width and very little height, so the last
          // row must clear the home indicator / gesture bar.
          paddingBottom: r.spacing.lg + r.insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          loading ? (
            <View className="items-center pt-10"><ActivityIndicator color={GREEN} /></View>
          ) : error ? (
            <Text className="text-[12px] text-danger text-center pt-10">{error}</Text>
          ) : tooShort ? (
            <Text className="text-[12px] text-gray-500 text-center pt-10">
              Keep typing — at least {MIN_QUERY} characters.
            </Text>
          ) : searched ? (
            <View className="items-center pt-10 px-6">
              <Text className="text-[13px] font-extrabold text-gray-700">No matches</Text>
              <Text className="text-[12px] text-gray-500 text-center mt-1 leading-5">
                Nothing found for “{query.trim()}”. Try a device like “OPPO A5”, a tracking ID, or a customer name.
              </Text>
            </View>
          ) : recents.length ? (
            <View>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[11px] font-extrabold text-gray-500 tracking-wide">RECENT</Text>
                <Pressable onPress={clearRecents} hitSlop={8}>
                  <Text className="text-[11px] font-extrabold" style={{ color: GREEN_DARK }}>Clear</Text>
                </Pressable>
              </View>
              {recents.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setQuery(t)}
                  className="flex-row items-center bg-white rounded-xl px-3.5 py-3 mb-2 active:opacity-80"
                  style={{ borderWidth: 1, borderColor: '#EFF5EE' }}
                >
                  <Clock size={14} color="#8FA08F" strokeWidth={2} />
                  <Text className="ml-2.5 text-[13px] text-gray-700 flex-1" numberOfLines={1}>{t}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-[12px] text-gray-500 text-center pt-10 leading-5">
              Search a device to book, sell or buy —{'\n'}or a ticket ID, customer name or pickup ID.
            </Text>
          )
        }
      />

      <DeviceActionSheet
        visible={!!sheetFor}
        device={sheetFor}
        onAction={onAction}
        onClose={() => setSheetFor(null)}
      />
    </View>
  );
}
