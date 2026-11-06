import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { CalendarDays, Check, ChevronRight, CircleCheck, Cpu, MessageCircle, Phone, Smartphone, Store, Truck, UserPlus, XCircle } from 'lucide-react-native';
import { listingConditionLabel } from '../../../api/nearbyListings';
import { getShopPurchase, setPurchaseFulfilment } from '../../../api/orders';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, Section, SellScreen, Thumb, money } from '../sell/kit';
import { purchaseRoute, specsOf, stepParams } from './purchaseKit';

// Quote Accepted → Purchase Management: the accepted lead, where the purchase
// stands (from the sell order status), the collection method (saved on the
// server) and Manage Pickup → Order Details (assignment, tracking, inspection,
// final price, payment).

const STAGE = { DEVICE_RECEIVED: 2, INSPECTED: 3, PRICE_REVISION_PENDING: 3, REVISION_REJECTED: 3, PRICE_CONFIRMED: 4, PAYMENT_PENDING: 4, PAID: 4, COMPLETED: 5 };
const STEPS = ['Quote\nAccepted', 'Pickup /\nShop Visit', 'Device\nInspection', 'Final Price\nApproval', 'Payment &\nCompletion'];
const CHANGEABLE = ['SELL_CONFIRMED', 'PICKUP_SCHEDULED', 'PICKUP_ASSIGNED'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GREEN_DARK = '#0B6B4B';

const fulfilmentOf = (note) => (/visit the shop/i.test(String(note || '')) ? 'SHOP_VISIT' : 'PICKUP');

function leadDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}


function RoundIcon({ Icon, label, onPress, busy }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} className="active:opacity-70"
      style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: '#F3F5F7', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
      {busy ? <ActivityIndicator size="small" color={C.teal} /> : <Icon size={17} color={C.teal} />}
    </Pressable>
  );
}

function Progress({ done }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {STEPS.map((label, i) => {
        const isDone = i < done;
        return (
          <View key={label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ height: 28, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' }}>
              {i > 0 ? <View style={{ position: 'absolute', left: 0, right: '50%', height: 3, backgroundColor: isDone ? C.green : C.border }} /> : null}
              {i < STEPS.length - 1 ? <View style={{ position: 'absolute', left: '50%', right: 0, height: 3, backgroundColor: isDone ? C.green : C.border }} /> : null}
              <View style={{ height: 26, width: 26, borderRadius: 13, borderWidth: 2, borderColor: isDone ? C.green : '#C9CED6', backgroundColor: isDone ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                {isDone ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
            </View>
            <Text style={{ fontSize: rf(10.5), color: C.text, textAlign: 'center', marginTop: 6, lineHeight: rf(14) }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MethodCard({ Icon, title, sub, selected, dim, busy, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected }} className="active:opacity-80"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? C.green : C.border, backgroundColor: selected ? '#F4FBF8' : '#FFFFFF', paddingVertical: 12, paddingLeft: 10, paddingRight: 6, opacity: dim ? 0.5 : 1 }}>
      <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator size="small" color={C.teal} /> : <Icon size={19} color={C.teal} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 2, lineHeight: rf(14) }}>{sub}</Text>
      </View>
      <ChevronRight size={16} color={C.text} />
    </Pressable>
  );
}

export default function PurchaseManagement({ navigation, lead: l, mine, leadRef, error, onReload, refreshing, onRefresh, onCall, onChat, chatBusy }) {
  const q = mine.quotation;
  const id = mine.purchaseOrderId || mine.sellOrderId;
  // The purchase holds the live collection method; the quote note only has the
  // one chosen when quoting (stale after a change here).
  const [purchase, setPurchase] = useState(null);
  const loadPurchase = useCallback(() => (id ? getShopPurchase(id).then(setPurchase).catch(() => {}) : Promise.resolve()), [id]);
  useEffect(() => { loadPurchase(); }, [loadPurchase, mine]);
  const status = String(purchase?.status || mine.orderStatus || '').toUpperCase();
  const cancelled = status === 'CANCELLED';
  const done = cancelled ? 1 : (STAGE[status] || 1);
  const method = purchase?.fulfilment === 'SHOP_VISIT' ? 'SHOP_VISIT' : purchase?.fulfilment ? 'PICKUP' : fulfilmentOf(q.note);
  const changeable = CHANGEABLE.includes(status);
  const [saving, setSaving] = useState(null);
  const lock = useRef(false);
  const cond = listingConditionLabel(l.condition);
  const { storage, ram } = specsOf(l.description);
  const price = money(q.quotationPrice);

  const openOrder = () => {
    if (!id) {
      showToast({ type: 'error', title: 'Purchase order not found', message: 'Pull down to refresh. If this continues, the server needs the latest update.' });
      return;
    }
    // The page for where the purchase stands: Assign Pickup → Tracking → Inspection → Final Price → Payment → Completed.
    const name = purchaseRoute(status, purchase || undefined);
    navigation.navigate(name, stepParams(name, id, leadRef, purchase || undefined));
  };

  const choose = async (next) => {
    if (next === method) {
      openOrder();
      return;
    }
    if (!changeable) {
      showToast({ type: 'info', title: 'Collection method locked', message: 'It can’t be changed once the pickup has started.' });
      return;
    }
    if (!id || lock.current) return;
    lock.current = true;
    setSaving(next);
    try {
      await setPurchaseFulfilment(id, next);
      await Promise.all([onReload(), loadPurchase()]);
      showToast({ type: 'success', title: next === 'SHOP_VISIT' ? 'Shop visit selected' : 'Pickup selected', message: 'The customer has been notified.' });
    } catch (e) {
      showToast({ type: e?.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error', title: 'Could not change', message: e?.message });
    } finally {
      lock.current = false;
      setSaving(null);
    }
  };

  const badge = cancelled ? { text: 'Cancelled', bg: '#F1F2F4', fg: C.muted, Icon: XCircle }
    : status === 'COMPLETED' ? { text: 'Completed', bg: C.green, fg: '#FFFFFF', Icon: CircleCheck }
      : { text: 'Quote Accepted', bg: C.teal, fg: '#FFFFFF', Icon: CircleCheck };
  const BadgeIcon = badge.Icon;
  const banner = cancelled ? { title: 'Purchase Cancelled', sub: 'This purchase was cancelled.', fg: C.muted, bg: '#F6F7F9', dot: C.muted, Icon: XCircle }
    : status === 'COMPLETED' ? { title: 'Purchase Completed', sub: `You bought this device for ${price}.`, fg: GREEN_DARK, bg: '#EEF8F4', dot: C.green, Icon: Check }
      : { title: 'Quotation Accepted', sub: `The customer has accepted your quote of ${price}.`, fg: GREEN_DARK, bg: '#EEF8F4', dot: C.green, Icon: Check };
  const BannerIcon = banner.Icon;

  return (
    <SellScreen
      title="Purchase Management"
      subtitle={`Lead ${leadRef}`}
      onBack={() => navigation.goBack()}
      rightWidth={80}
      right={(
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <RoundIcon Icon={Phone} label="Call customer" onPress={onCall} />
          <RoundIcon Icon={MessageCircle} label="Chat with customer" onPress={onChat} busy={chatBusy} />
        </View>
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.teal]} tintColor={C.teal} />}
    >
      <View style={{ backgroundColor: '#EEF8F5', borderRadius: 16, padding: 14, marginTop: 6 }}>
        <View style={{ flexDirection: 'row' }}>
          <Thumb uri={l.productImage} size={78} radius={12} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(15.5), fontWeight: '800', color: C.text, marginRight: 6 }}>{l.productName || 'Device'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: badge.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }}>
                <BadgeIcon size={13} color={badge.fg} />
                <Text style={{ fontSize: rf(10.5), fontWeight: '800', color: badge.fg, marginLeft: 4 }}>{badge.text}</Text>
              </View>
            </View>
            {cond ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#DDF3EA', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 6 }}>
                <CircleCheck size={13} color={C.green} />
                <Text style={{ fontSize: rf(11), fontWeight: '700', color: GREEN_DARK, marginLeft: 4 }}>{/condition|working/i.test(cond) ? cond : `${cond} Condition`}</Text>
              </View>
            ) : null}
            {storage || ram ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                {storage ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}>
                    <Smartphone size={14} color={C.text} />
                    <Text style={{ fontSize: rf(11.5), color: C.text, marginLeft: 4 }}>{storage}</Text>
                  </View>
                ) : null}
                {ram ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Cpu size={14} color={C.text} />
                    <Text style={{ fontSize: rf(11.5), color: C.text, marginLeft: 4 }}>{ram} RAM</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: '#D5ECE3', marginVertical: 12 }} />
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: rf(11), color: C.muted }}>Accepted Price</Text>
            <Text style={{ fontSize: rf(18), fontWeight: '800', color: C.green, marginTop: 4 }}>{price}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#D5ECE3' }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: rf(11), color: C.muted }}>Expected Price</Text>
            <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.text, marginTop: 4 }}>{Number(l.expectedPrice) > 0 ? money(l.expectedPrice) : 'Open'}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#D5ECE3' }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: rf(11), color: C.muted }}>Lead Date</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <CalendarDays size={13} color={C.text} />
              <Text style={{ fontSize: rf(11.5), color: C.text, marginLeft: 4 }}>{leadDate(l.createdAt)}</Text>
            </View>
          </View>
        </View>
      </View>

      <Section title="Purchase Progress" right={<Text style={{ fontSize: rf(11.5), color: C.muted }}>{`Step ${done} of ${STEPS.length}`}</Text>}>
        <Progress done={done} />
      </Section>

      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: banner.bg, borderRadius: 14, padding: 14, marginTop: 16 }}>
        <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: banner.dot, alignItems: 'center', justifyContent: 'center' }}>
            <BannerIcon size={18} color="#FFFFFF" strokeWidth={3} />
          </View>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ fontSize: rf(15), fontWeight: '800', color: banner.fg }}>{banner.title}</Text>
          <Text style={{ fontSize: rf(11.5), color: C.text, marginTop: 2 }}>{banner.sub}</Text>
        </View>
      </View>

      {!cancelled ? (
        <Section title="Choose Collection Method">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MethodCard Icon={Truck} title="Pickup" sub="Assign an employee for doorstep pickup" selected={method === 'PICKUP'}
              dim={!changeable && method !== 'PICKUP'} busy={saving === 'PICKUP'} onPress={() => choose('PICKUP')} />
            <MethodCard Icon={Store} title="Shop Visit" sub="Customer will bring the device to your shop" selected={method === 'SHOP_VISIT'}
              dim={!changeable && method !== 'SHOP_VISIT'} busy={saving === 'SHOP_VISIT'} onPress={() => choose('SHOP_VISIT')} />
          </View>
        </Section>
      ) : null}

      {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not refresh.'} onRetry={onReload} style={{ marginTop: 14 }} /> : null}

      <View style={{ gap: 10, marginTop: 18 }}>
        <PrimaryButton title={status === 'COMPLETED' || cancelled ? 'View Purchase' : 'Manage Pickup'} icon={UserPlus} onPress={openOrder} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PrimaryButton title="Call" icon={Phone} variant="outline" style={{ flex: 1 }} onPress={onCall} />
          <PrimaryButton title="Chat" icon={MessageCircle} variant="outline" loading={chatBusy} onPress={onChat} style={{ flex: 1 }} />
        </View>
      </View>
    </SellScreen>
  );
}
