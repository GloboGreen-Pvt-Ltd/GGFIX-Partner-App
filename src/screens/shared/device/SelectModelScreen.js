import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  TapGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Smartphone, Check, Pencil, Plus, X, Search, ArrowLeft } from 'lucide-react-native';
import { EmptyState, Loader, ScreenHeader } from '../../../components/rnr';
import DeviceImage from '../../../components/DeviceImage';
import { getModelsByBrand, getSeriesForCategoryBrand, parseModelNumbers } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Canonical "Select Product" picker used by all flows. Series chips at the top
// FILTER the full model grid below (Cashify-style). Search is a header icon that
// opens a full-screen results list (no persistent search box). Routes to
// DeviceColorStorage (booking) / OwnerSellChooseSalesCategory (owner-list) /
// SelectVariant (profile/repair).
const HORIZONTAL_PAD = 16;
const GRID_GAP = 12;
function gridMetrics(screenWidth) {
  const numColumns = screenWidth >= 600 ? 4 : 3;
  const cardWidth = Math.floor((screenWidth - HORIZONTAL_PAD * 2 - GRID_GAP * (numColumns - 1)) / numColumns);
  return { numColumns, cardWidth };
}

// Full-screen gallery image viewer: two-finger pinch-to-zoom, one-finger pan while
// zoomed, double-tap to zoom in / reset, and a horizontal swipe (while un-zoomed) to
// move to the prev/next image. Uses react-native-gesture-handler's component API for
// RELIABLE native multi-touch (PanResponder pinch is flaky on Android) driving plain RN
// Animated values with useNativeDriver — NO reanimated/worklets, so it can't hit the
// worklets "installTurboModule" crash. Scale is clamped to [MIN_SCALE, MAX_SCALE] and the
// pan offset to the image bounds. Zoom/position reset for free via the parent's `key={id}`.
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2;

function ZoomableImage({ url, base64, size, onSwipe }) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  // Rendered scale = committed base * live pinch. Pan uses Animated offset accumulation.
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = useRef(Animated.multiply(baseScale, pinchScale)).current;
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const cur = useRef({ scale: 1, x: 0, y: 0 }).current; // committed values (JS side)

  const panLimit = (s) => Math.max(0, (size * s - size) / 2);
  const setOffset = (x, y) => {
    cur.x = x; cur.y = y;
    panX.setOffset(x); panX.setValue(0);
    panY.setOffset(y); panY.setValue(0);
  };

  // Two-finger pinch — gesture-handler tracks both fingers natively (reliable on Android).
  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPinchStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, cur.scale * e.nativeEvent.scale));
      cur.scale = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
      if (next <= MIN_SCALE + 0.001) setOffset(0, 0);
      else { const l = panLimit(next); setOffset(Math.max(-l, Math.min(l, cur.x)), Math.max(-l, Math.min(l, cur.y))); }
    }
  };

  // One-finger drag: pan while zoomed, or (un-zoomed) a horizontal swipe to change image.
  const onPanEvent = Animated.event([{ nativeEvent: { translationX: panX, translationY: panY } }], { useNativeDriver: true });
  const onPanStateChange = (e) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      const { translationX, translationY } = e.nativeEvent;
      if (cur.scale <= MIN_SCALE + 0.02) {
        setOffset(0, 0); // not zoomed → keep centred
        if (Math.abs(translationX) > 55 && Math.abs(translationX) > Math.abs(translationY)) {
          onSwipe?.(translationX < 0 ? 'next' : 'previous');
        }
        return;
      }
      const l = panLimit(cur.scale);
      setOffset(
        Math.max(-l, Math.min(l, cur.x + translationX)),
        Math.max(-l, Math.min(l, cur.y + translationY)),
      );
    }
  };

  // Double-tap toggles fit (1x) ↔ DOUBLE_TAP_SCALE, always re-centred.
  const onDoubleTap = (e) => {
    if (e.nativeEvent.state !== State.ACTIVE) return;
    if (cur.scale > MIN_SCALE + 0.02) { cur.scale = MIN_SCALE; baseScale.setValue(MIN_SCALE); setOffset(0, 0); }
    else { cur.scale = DOUBLE_TAP_SCALE; baseScale.setValue(DOUBLE_TAP_SCALE); }
  };

  return (
    <PanGestureHandler
      ref={panRef}
      minPointers={1}
      maxPointers={1}
      avgTouches
      simultaneousHandlers={pinchRef}
      onGestureEvent={onPanEvent}
      onHandlerStateChange={onPanStateChange}
    >
      <Animated.View collapsable={false} style={{ flex: 1, alignSelf: 'stretch' }}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={panRef}
          onGestureEvent={onPinchEvent}
          onHandlerStateChange={onPinchStateChange}
        >
          <Animated.View collapsable={false} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <TapGestureHandler numberOfTaps={2} onHandlerStateChange={onDoubleTap}>
              <Animated.View style={{ width: size, height: size, transform: [{ translateX: panX }, { translateY: panY }, { scale }] }}>
                <DeviceImage url={url} base64={base64} style={{ width: size, height: size }} contentFit="contain" />
              </Animated.View>
            </TapGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </PanGestureHandler>
  );
}

export default function SelectModelScreen({ navigation, route }) {
  const flow = route?.params?.flow || 'PROFILE';
  const {
    categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
    brandId, brandName, seriesName: routeSeriesName, editSellOrderId, editHints,
  } = route?.params || {};
  const bookingEditMode = !!route?.params?.editMode;
  const isEditing = !!editSellOrderId || bookingEditMode;
  const currentModelId = editHints?.modelId
    || (bookingEditMode ? route?.params?.modelId : null)
    || null;

  const insets = useSafeAreaInsets();
  const [models, setModels] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null); // index into imageModels for the full-screen viewer
  const [selSeriesId, setSelSeriesId] = useState(
    route?.params?.seriesId || editHints?.seriesId || null,
  );

  const { width: screenWidth } = useWindowDimensions();
  const { cardWidth } = gridMetrics(screenWidth);
  const imgBox = cardWidth - 16;   // image box / tap area (nearly the full card width)
  const imgInner = imgBox;         // image fills the box → big images like the target screenshot

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [modelList, seriesList] = await Promise.all([
          getModelsByBrand(brandId),
          getSeriesForCategoryBrand(categoryId, brandId).catch(() => []),
        ]);
        if (cancelled) return;
        let ms = modelList || [];
        if (UUID_RE.test(String(categoryId || ''))) {
          ms = ms.filter((m) => !m.categoryId || m.categoryId === categoryId);
        }
        // Sell flows (customer trade-in SELL + shop-owner marketplace listing
        // OWNER_LIST) only offer models the admin marked "Sell Active".
        if (flow === 'SELL' || flow === 'OWNER_LIST') ms = ms.filter((m) => m.sellActive !== false);
        setModels(ms);
        setSeries(seriesList || []);
      } catch (_) {
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId, categoryId]);

  const seriesWithModels = useMemo(() => {
    const ids = new Set(models.map((m) => m.seriesId).filter(Boolean));
    return (series || []).filter((s) => ids.has(s.id));
  }, [series, models]);

  const selectedSeries = seriesWithModels.find((s) => s.id === selSeriesId) || null;

  // Grid (chips-filtered) vs search (spans all models).
  const gridModels = useMemo(() => {
    let list = selSeriesId ? models.filter((m) => m.seriesId === selSeriesId) : models;
    if (isEditing && currentModelId) {
      const cur = list.find((m) => m.id === currentModelId);
      if (cur) list = [cur, ...list.filter((m) => m.id !== currentModelId)];
    }
    return list;
  }, [models, selSeriesId, isEditing, currentModelId]);

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];  // empty query → show the "Start typing to search" prompt, not the full list
    return models.filter((m) => (m.name || '').toLowerCase().includes(needle));
  }, [models, q]);

  // Only models with an image can be opened in the gallery; prev/next moves through
  // this list so the viewer always shows a real image.
  const imageModels = useMemo(
    () => gridModels.filter((m) => m.imageUrl || m.imageBase64),
    [gridModels],
  );
  const preview = previewIndex != null && previewIndex < imageModels.length ? imageModels[previewIndex] : null;
  const openPreview = (m) => {
    const i = imageModels.findIndex((x) => x.id === m.id);
    if (i >= 0) setPreviewIndex(i);
  };
  const closePreview = () => setPreviewIndex(null);
  const swipePreview = (direction) => {
    setPreviewIndex((i) => {
      if (i == null) return i;
      if (direction === 'previous') return i > 0 ? i - 1 : i;
      return i < imageModels.length - 1 ? i + 1 : i;
    });
  };

  /**
   * "Other" — a device whose model isn't in the catalogue.
   *
   * BOOKING only, matching SelectBrand. Carries modelId: null with the typed
   * modelName; nothing is written to master data. A custom BRAND arrives here
   * with brandId null and therefore no models at all, so the type-in opens by
   * itself rather than showing an empty list the shop can't get past.
   */
  const allowOther = flow === 'BOOKING';
  const customBrand = !!route?.params?.customBrand;
  const [otherOpen, setOtherOpen] = useState(customBrand && allowOther);
  const [otherName, setOtherName] = useState('');

  const onPickOther = () => {
    const name = otherName.trim();
    if (!name) return;
    setOtherOpen(false);
    navigation.navigate('DeviceColorStorage', {
      ...(route?.params || {}),
      flow, categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
      brandId, brandName,
      modelId: null, modelName: name, customModel: true,
      modelNumber: undefined, modelNumbers: [],
      editSellOrderId, editHints,
    });
  };

  const onPick = (m, chosenModelNumber) => {
    const pickedSeries = (series || []).find((s) => s.id === m.seriesId);
    const numbers = parseModelNumbers(m.modelNumber);
    const modelNumber = chosenModelNumber || numbers[0] || undefined;
    const baseParams = {
      ...(route?.params || {}),
      flow, categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
      brandId, brandName,
      seriesId: m.seriesId || selSeriesId || undefined,
      seriesName: pickedSeries?.name || routeSeriesName || undefined,
      modelId: m.id, modelName: m.name, modelNumber, modelNumbers: numbers,
      modelImageUrl: resolveDeviceImageSource({ url: m.imageUrl, base64: m.imageBase64 }) || undefined,
      editSellOrderId, editHints,
      ...(editSellOrderId && editHints?.modelId === m.id ? {
        ramOptionId: editHints.ramOptionId,
        storageOptionId: editHints.storageOptionId,
        color: editHints.color,
        imei: editHints.imei,
      } : {}),
    };
    if (flow === 'BOOKING') {
      navigation.navigate('DeviceColorStorage', { ...baseParams, imageUrl: baseParams.modelImageUrl });
      return;
    }
    if (flow === 'OWNER_LIST') {
      navigation.navigate('OwnerSellChooseSalesCategory', baseParams);
      return;
    }
    navigation.navigate('SelectVariant', baseParams);
  };

  // Model number is no longer surfaced on this screen, so every selection goes
  // straight to the next step with the model's default number — onPick still
  // forwards that number to the booking/sell payload.
  const handleSelect = (m) => onPick(m, null);

  // ── Full-screen search mode ───────────────────────────────────────────────
  if (searchOpen) {
    return (
      <View className="flex-1 bg-background">
        <View
          className="flex-row items-center px-2 pb-2 bg-card border-b border-border"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={() => { setSearchOpen(false); setQ(''); }}
            className="h-10 w-10 items-center justify-center"
            hitSlop={8}
          >
            <ArrowLeft size={22} color="#172117" />
          </Pressable>
          <View className="flex-1 flex-row items-center rounded-xl px-3" style={{ backgroundColor: '#EFF5EE' }}>
            <Search size={18} color="#8FA08F" />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder={`Search ${brandName || 'model'}`}
              placeholderTextColor="#8FA08F"
              className="flex-1 py-2.5 ml-2 text-text text-[14px]"
              returnKeyType="search"
            />
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <X size={18} color="#667066" />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {searchResults.length === 0 ? (
            <EmptyState
              icon={q ? <Smartphone size={28} color="#087A0A" /> : <Search size={28} color="#087A0A" />}
              title={q ? 'No products found' : 'Search products'}
              description={q ? `Nothing matches "${q.trim()}".` : `Type a model name to search ${brandName || 'products'}.`}
            />
          ) : (
            searchResults.map((m) => {
              const hasImg = !!(m.imageUrl || m.imageBase64);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => handleSelect(m)}
                  className="flex-row items-center px-4 py-2.5 border-b border-border active:bg-primary/5"
                >
                  <View className="h-14 w-14 rounded-lg overflow-hidden items-center justify-center mr-3">
                    {hasImg ? (
                      <DeviceImage url={m.imageUrl} base64={m.imageBase64} style={{ width: 56, height: 56 }} contentFit="contain" />
                    ) : (
                      <Smartphone size={26} color="#087A0A" />
                    )}
                  </View>
                  <Text className="flex-1 text-[14px] text-text" numberOfLines={1}>{m.name}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Normal mode: series chips + model grid ────────────────────────────────
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Select Product"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        sticky={false}
        right={(
          <Pressable onPress={() => setSearchOpen(true)} className="h-10 w-10 items-center justify-center" hitSlop={8}>
            <Search size={22} color="#172117" />
          </Pressable>
        )}
      />
      {isEditing && editHints?.modelName ? (
        <View className="px-4 pt-3 pb-3 bg-card border-b border-border">
          <View className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 flex-row items-center">
            <Pencil size={13} color="#F59E0B" />
            <View className="flex-1 ml-2">
              <Text className="text-[10px] font-extrabold text-warning tracking-wider">
                {flow === 'BOOKING' ? 'EDITING BOOKING' : 'EDITING ORDER'}
              </Text>
              <Text className="text-[12px] text-text font-semibold" numberOfLines={1}>
                Currently: {editHints.brandName ? `${editHints.brandName} · ` : ''}{editHints.modelName}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {loading ? (
        <Loader label="Loading products..." />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, paddingTop: 14, paddingBottom: 28 }}
          showsVerticalScrollIndicator={false}
        >
          {allowOther ? (
            <Pressable
              onPress={() => setOtherOpen(true)}
              className="flex-row items-center bg-card border border-dashed border-primary rounded-2xl px-3.5 py-3 mb-4 active:opacity-80"
            >
              <View className="h-9 w-9 rounded-xl bg-primary/10 items-center justify-center mr-3">
                <Plus size={18} color="#087A0A" />
              </View>
              <View className="flex-1">
                <Text className="text-[13.5px] font-extrabold text-primary">Other — type the model</Text>
                <Text className="text-[11px] text-text-muted mt-0.5">
                  For a device that isn’t in the list
                </Text>
              </View>
            </Pressable>
          ) : null}

          {/* ── Series chips (compact) ────────────────────────────────── */}
          {seriesWithModels.length > 0 ? (
            <View className="mb-5">
              <Text className="text-[15px] font-extrabold text-text mb-2.5">Select Series</Text>
              {selectedSeries ? (
                <View style={{ flexDirection: 'row' }}>
                  <Pressable
                    onPress={() => setSelSeriesId(null)}
                    className="rounded-xl flex-row items-center active:opacity-80"
                    style={{ paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#E2E8E2' }}
                  >
                    <Text className="text-[12.5px] font-bold text-text mr-2" numberOfLines={1}>
                      {selectedSeries.name}
                    </Text>
                    <X size={15} color="#667066" />
                  </Pressable>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
                  {seriesWithModels.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => setSelSeriesId(s.id)}
                      className="rounded-xl items-center justify-center active:opacity-80"
                      style={{ width: cardWidth, minHeight: 40, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#EFF5EE', borderWidth: 1, borderColor: '#E2E8E2' }}
                    >
                      <Text className="text-[12px] font-semibold text-text text-center" numberOfLines={2}>
                        {s.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* ── Models grid ───────────────────────────────────────────── */}
          {gridModels.length === 0 ? (
            <EmptyState
              icon={<Smartphone size={28} color="#087A0A" />}
              title="No products found"
              description="No models published for this selection yet."
            />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              {gridModels.map((m) => {
                const isCurrent = isEditing && m.id === currentModelId;
                const hasImg = !!(m.imageUrl || m.imageBase64);
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => handleSelect(m)}
                    className={`bg-card border rounded-2xl active:opacity-80 ${isCurrent ? 'border-primary' : 'border-border'}`}
                    style={{
                      width: cardWidth,
                      padding: 8,
                      alignItems: 'center',
                      shadowColor: '#172117',
                      shadowOpacity: 0.04,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 1,
                    }}
                  >
                    <Pressable
                      onPress={() => openPreview(m)}
                      disabled={!hasImg}
                      className="rounded-xl items-center justify-center overflow-hidden"
                      style={{ height: imgBox, width: imgBox, marginBottom: 8 }}
                    >
                      {hasImg ? (
                        <DeviceImage
                          url={m.imageUrl}
                          base64={m.imageBase64}
                          style={{ width: imgInner, height: imgInner }}
                          contentFit="contain"
                        />
                      ) : (
                        <Smartphone size={Math.round(imgBox * 0.4)} color="#087A0A" />
                      )}
                    </Pressable>
                    <Text
                      className="text-[11px] font-extrabold text-text"
                      numberOfLines={2}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {m.name}
                    </Text>
                    {isCurrent ? (
                      <View className="flex-row items-center bg-primary/10 border border-primary/30 rounded-full px-2 py-0.5 mt-1.5">
                        <Check size={10} color="#087A0A" />
                        <Text className="text-[9.5px] font-extrabold text-primary ml-1">Current</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Full-screen gallery image viewer (pinch / pan / double-tap + swipe) */}
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={closePreview}>
        {/* RN Modal renders in its own window; gesture-handler needs a local root here (Android). */}
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(23, 33, 23, 0.94)' }}>
            {/* Header: gesture hint + close button */}
            <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text className="text-white/60 text-[11px] font-semibold">🤏 Pinch · double-tap · swipe</Text>
              <Pressable
                onPress={closePreview}
                hitSlop={12}
                style={{ height: 42, width: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            {/* Zoomable image with swipe navigation */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {preview && (preview.imageUrl || preview.imageBase64) ? (
                <ZoomableImage
                  key={preview.id}
                  url={preview.imageUrl}
                  base64={preview.imageBase64}
                  size={screenWidth - 40}
                  onSwipe={swipePreview}
                />
              ) : (
                <Smartphone size={140} color="#FFFFFF" />
              )}
            </View>

            {/* Footer: name + select */}
            <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
              <Text className="text-white text-[15px] font-extrabold mb-3 text-center" numberOfLines={2}>
                {preview?.name}
              </Text>
              <Pressable
                onPress={() => { const m = preview; closePreview(); if (m) handleSelect(m); }}
                className="rounded-2xl py-4 items-center active:opacity-80"
                style={{ backgroundColor: '#087A0A' }}
              >
                <Text className="text-white text-[15px] font-extrabold">Select this product</Text>
              </Pressable>
            </View>
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* Type-in sheet for a model the catalogue doesn't carry. */}
      {otherOpen ? (
        <View className="absolute inset-0 items-center justify-center px-6" style={{ backgroundColor: 'rgba(23, 33, 23, 0.55)' }}>
          <View className="w-full bg-card rounded-2xl p-5">
            <Text className="text-[15px] font-extrabold text-text">Other model</Text>
            <Text className="text-[12px] text-text-muted mt-1 leading-4">
              {brandName ? `Brand: ${brandName}. ` : ''}Type the model as printed on the device.
              It is saved on this booking only — it is not added to the catalogue.
            </Text>
            <TextInput
              autoFocus
              value={otherName}
              onChangeText={setOtherName}
              placeholder="e.g. Blaze 2 Pro"
              placeholderTextColor="#8FA08F"
              className="mt-3 rounded-xl px-3 py-2.5 text-text text-[14px]"
              style={{ backgroundColor: '#EFF5EE' }}
              returnKeyType="done"
              onSubmitEditing={onPickOther}
            />
            <View className="flex-row justify-end mt-4">
              <Pressable
                onPress={() => {
                  setOtherOpen(false);
                  setOtherName('');
                  // A custom brand has no list to fall back to, so cancelling
                  // returns to the brand picker rather than an empty screen.
                  if (customBrand && navigation.canGoBack()) navigation.goBack();
                }}
                className="px-4 py-2 active:opacity-70"
              >
                <Text className="text-[13px] font-bold text-text-muted">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onPickOther}
                disabled={!otherName.trim()}
                className="px-4 py-2 rounded-xl bg-primary active:opacity-80"
                style={{ opacity: otherName.trim() ? 1 : 0.5 }}
              >
                <Text className="text-[13px] font-extrabold text-white">Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
