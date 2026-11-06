import React from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, ChevronRight, ImagePlus, Layers, Plus, RefreshCw, X } from 'lucide-react-native';
import SafeModal, { ModalInsets } from '../../../../components/SafeModal';
import { rf } from '../../../../utils/responsive';
import { C, EmptyBox, SellScreen, cardShadow } from '../kit';

// Small pieces shared by the bulk listing screens.

export const TOTAL_STEPS = 5;
/** Captions under the bulk stepper (Type → Category → Items → Photos → Review). */
export const STEP_LABELS = ['Type', 'Category', 'Items', 'Photos', 'Review'];

/** Back to the Sell tab, dropping the bulk screens from the stack. */
export function goSellHome(navigation) {
  try {
    navigation.popTo('OwnerTabs', { screen: 'Sell' });
  } catch (_) {
    navigation.navigate('Sell');
  }
}

export function DraftLoading({ title, onBack }) {
  return (
    <SellScreen title={title} onBack={onBack}>
      <ActivityIndicator color={C.teal} style={{ marginTop: 60 }} />
    </SellScreen>
  );
}

/** Shown when a bulk screen opens with no batch in progress (e.g. after Done). */
export function NoBatch({ title, navigation }) {
  return (
    <SellScreen title={title} onBack={() => navigation.goBack()}>
      <EmptyBox
        icon={Layers}
        title="No bulk batch in progress"
        sub="Start a bulk listing to add items, photos and prices."
        action="Start Bulk Listing"
        onAction={() => navigation.navigate('BulkListingType')}
      />
    </SellScreen>
  );
}

export function TipBanner({ icon: Icon, title, sub, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.teal, borderRadius: 14, padding: 14, marginTop: 6 }, style]}>
      {Icon ? (
        <View style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color="#FFFFFF" />
        </View>
      ) : null}
      <View style={{ flex: 1, marginLeft: Icon ? 12 : 0 }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: '#FFFFFF' }}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11.5), color: 'rgba(255,255,255,0.85)', marginTop: 3, lineHeight: rf(16) }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** Mint bar, e.g. "Items Added: 4" / "Total Quantity  24". */
export function MintBar({ label, value, style }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.greenBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginTop: 10 }, style]}>
      <Text style={{ flex: 1, fontSize: rf(12.5), fontWeight: '700', color: C.text }}>{label}</Text>
      {value != null ? <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{value}</Text> : null}
    </View>
  );
}

export function IndexBadge({ n, tone = 'teal', style }) {
  const fg = tone === 'red' ? C.red : C.teal;
  return (
    <View style={[{ height: 22, width: 22, borderRadius: 11, backgroundColor: tone === 'red' ? C.redBg : C.mint, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: rf(11), fontWeight: '800', color: fg }}>{n}</Text>
    </View>
  );
}

export function IconButton({ icon: Icon, onPress, color = C.teal, label, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      className="active:opacity-60"
      style={{ height: 36, width: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}
    >
      <Icon size={18} color={color} />
    </Pressable>
  );
}

/** Bottom sheet: title, scrolling body and an optional footer, keyboard-aware. */
export function Sheet({ visible, title, onClose, children, footer, maxHeight = '92%' }) {
  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalInsets>
        {({ bottom }) => (
          <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
            <View style={{ maxHeight, width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingBottom: bottom + 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 4 }}>
                <Text style={{ flex: 1, fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
                <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
                  <X size={20} color={C.text} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
              {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>{footer}</View> : null}
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}

/** Camera / Gallery chooser. */
export function SourceSheet({ visible, title = 'Add photos', onClose, onPick, cameraLabel = 'Take Photo', galleryLabel = 'Choose from Gallery' }) {
  const opt = (Icon, label, source) => (
    <Pressable
      key={source}
      onPress={() => {
        onClose();
        // iOS can't present the picker while this sheet is still sliding away.
        setTimeout(() => onPick(source), Platform.OS === 'ios' ? 450 : 0);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="active:opacity-70"
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
    >
      <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={C.teal} />
      </View>
      <Text style={{ flex: 1, marginLeft: 12, fontSize: rf(14), fontWeight: '700', color: C.text }}>{label}</Text>
      <ChevronRight size={18} color={C.muted} />
    </Pressable>
  );
  return (
    <Sheet visible={visible} title={title} onClose={onClose} maxHeight="50%">
      {opt(Camera, cameraLabel, 'camera')}
      {opt(ImagePlus, galleryLabel, 'gallery')}
    </Sheet>
  );
}

/** Uploaded / uploading / failed photo thumb. Tap: retry on error, else onPress. */
export function PhotoTile({ photo, size = 64, cover, onPress, onRetry, onRemove }) {
  const failed = photo.status === 'error';
  const busy = photo.status === 'uploading';
  const src = photo.url || photo.uri;
  return (
    <View style={{ width: size, height: size, marginRight: 8, marginBottom: 8 }}>
      <Pressable
        onPress={failed ? onRetry : busy ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={failed ? 'Upload failed, tap to retry' : busy ? 'Uploading photo' : cover ? 'Cover photo' : 'Set as cover photo'}
        className="active:opacity-80"
        style={{ flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F3F4F6', borderWidth: cover ? 2 : 1, borderColor: failed ? C.red : cover ? C.green : C.border }}
      >
        {src ? <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        {busy ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={C.teal} />
          </View>
        ) : null}
        {failed ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(253,236,236,0.88)', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
            <RefreshCw size={16} color={C.red} />
            <Text style={{ fontSize: rf(9), fontWeight: '800', color: C.red, marginTop: 2 }}>Retry</Text>
          </View>
        ) : null}
        {cover && !busy && !failed ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.green, paddingVertical: 2 }}>
            <Text style={{ fontSize: rf(9), fontWeight: '800', color: '#FFFFFF', textAlign: 'center' }}>Cover</Text>
          </View>
        ) : null}
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove photo"
          hitSlop={8}
          style={{ position: 'absolute', right: -5, top: -5, height: 20, width: 20, borderRadius: 10, backgroundColor: 'rgba(17,17,17,0.72)', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={12} color="#FFFFFF" strokeWidth={2.6} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function AddTile({ size = 64, label = 'Add', onPress, disabled }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      className="active:opacity-70"
      style={{
        width: size, height: size, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: disabled ? C.border : C.mintLine,
        backgroundColor: disabled ? C.field : C.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: disabled ? 0.6 : 1,
      }}
    >
      <Plus size={18} color={disabled ? C.faint : C.teal} />
      {size >= 60 ? <Text style={{ fontSize: rf(10), fontWeight: '700', color: disabled ? C.faint : C.teal, marginTop: 1 }}>{label}</Text> : null}
    </Pressable>
  );
}

/** Tappable list row with a tinted icon (status screen actions / results). */
export function ActionRow({ icon: Icon, title, sub, onPress, tone = 'teal', right, style, disabled }) {
  const tones = {
    teal: { fg: C.teal, bg: C.mint },
    green: { fg: C.green, bg: C.greenBg },
    amber: { fg: C.amber, bg: C.amberBg },
    red: { fg: C.red, bg: C.redBg },
  };
  const t = tones[tone] || tones.teal;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      className="active:opacity-85"
      style={[{
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: C.border,
        paddingHorizontal: 12, paddingVertical: 12, marginTop: 8, opacity: disabled ? 0.5 : 1, ...cardShadow,
      }, style]}
    >
      {Icon ? (
        <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={t.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, marginLeft: Icon ? 10 : 0 }}>
        <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{title}</Text>
        {sub ? <Text numberOfLines={2} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <ChevronRight size={18} color={C.text} /> : null}
    </Pressable>
  );
}

export function StatTile({ label, value, sub, tone = 'teal', style }) {
  const fg = tone === 'green' ? C.green : tone === 'amber' ? C.amber : C.teal;
  return (
    <View style={[{ flex: 1, backgroundColor: C.mint, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, alignItems: 'center' }, style]}>
      <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: C.muted }}>{label}</Text>
      <Text style={{ fontSize: rf(20), fontWeight: '900', color: fg, marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ fontSize: rf(10), color: C.muted, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}
