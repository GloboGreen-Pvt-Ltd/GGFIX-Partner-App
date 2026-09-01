import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ticketApi } from '../../api/client';
import { confirm, notify } from '../../components/confirm';
import { FEATURE } from '../../subscription/entitlements';
import { showLimitPopup } from '../../subscription/limitPopup';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;

export default function OwnerEmployeeAddScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [acting, setActing] = useState(null);
  const debounceRef = useRef(null);

  const runSearch = useCallback(async (q) => {
    setSearching(true);
    try {
      const data = await ticketApi.get('/technicians/search', { query: { q } });
      setResults(Array.isArray(data) ? data : []);
    } catch {
      // Endpoint not yet available — show empty state instead of an error.
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }, []);

  const onChangeQuery = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < MIN_QUERY) {
      setResults([]);
      setSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
  };

  const handleAdd = async (emp) => {
    if (!emp.relievedFromLastShop) {
      notify('Cannot add', 'This employee has not been relieved from their previous shop yet.', { preset: 'error' });
      return;
    }
    setActing(emp.id);
    try {
      await ticketApi.post('/technicians', {
        body: {
          name: emp.name,
          phone: emp.phone,
          email: emp.email,
          roleLabel: emp.roleLabel,
          sourceUserId: emp.userId,
        },
      });
      notify('Added', `${emp.name} has been added to your shop.`, { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      // 409 = the plan has no seat left. Worth its own branch: the fix is to
      // upgrade or free a seat, not to "try again", which is what the generic
      // message would tell them to do.
      if (e?.status === 409) {
        await handleSeatLimit(e);
        return;
      }
      notify('Could not add', e?.payload?.message || e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setActing(null);
    }
  };

  // One shared dialog for every subscription refusal in the app, so a block
  // here reads exactly like a block on the Employees screen.
  const handleSeatLimit = (e) =>
    showLimitPopup(navigation, FEATURE.EMPLOYEES, null, e?.payload);

  const handleBlock = async (emp) => {
    const ok = await confirm({
      title: 'Block this employee?',
      message: `${emp.name} has not been relieved from their last shop. Blocking will hide them from your search results.`,
      confirmText: 'Block',
      destructive: true,
    });
    if (!ok) return;
    setActing(emp.id);
    try {
      await ticketApi.post(`/technicians/blocklist`, {
        body: { phone: emp.phone, sourceUserId: emp.userId },
      });
      setResults((prev) => prev.filter((r) => r.id !== emp.id));
    } catch (e) {
      notify('Failed', e?.body?.message || e?.message || 'Please try again.', { preset: 'error', haptic: 'error' });
    } finally {
      setActing(null);
    }
  };

  const openWorkRecord = (emp) => {
    navigation.navigate('OwnerEmployeeDetail', { employee: emp, viewOnly: true, tab: 'work' });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.newStaffCard}
          onPress={() => navigation.navigate('OwnerEmployeeDetail', { mode: 'add' })}
          activeOpacity={0.85}
        >
          <View style={styles.newStaffIconWrap}>
            <Ionicons name="people" size={28} color="#16BB05" />
          </View>
          <Text style={styles.newStaffTitle}>New Staff</Text>
          <Text style={styles.newStaffSubtitle}>Add a new employee to your shop</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>or find existing</Text>
          <View style={styles.line} />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color="#8FA08F" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or phone number"
            placeholderTextColor="#8FA08F"
            value={query}
            onChangeText={onChangeQuery}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {searching ? <ActivityIndicator size="small" color="#16BB05" /> : null}
          {!searching && query.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setResults([]);
                setSearched(false);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color="#8FA08F" />
            </TouchableOpacity>
          ) : null}
        </View>

        {query.trim().length > 0 && query.trim().length < MIN_QUERY && (
          <Text style={styles.helpText}>Type at least {MIN_QUERY} characters to search.</Text>
        )}

        {results.map((emp) => {
          const initial = (emp.name || '?').trim().charAt(0).toUpperCase();
          const relieved = !!emp.relievedFromLastShop;
          const lastShop =
            emp.lastShopName || emp.previousShopName || 'Previous shop unknown';
          const statusText = relieved
            ? `Relieved from ${lastShop}`
            : `Relieving not completed at ${lastShop}`;
          return (
            <View key={emp.id} style={styles.resultCard}>
              <View style={styles.resultMain}>
                <View style={styles.resultAvatar}>
                  <Text style={styles.resultAvatarText}>{initial}</Text>
                </View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {emp.name || '—'}
                  </Text>
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {emp.phone || emp.email || '—'}
                  </Text>
                  <Text style={styles.resultMeta} numberOfLines={1}>
                    {lastShop}
                  </Text>
                  <Text
                    style={[styles.resultStatus, relieved ? styles.statusOk : styles.statusBad]}
                    numberOfLines={2}
                  >
                    {statusText}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                {relieved ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.addBtn]}
                    onPress={() => handleAdd(emp)}
                    disabled={acting === emp.id}
                    activeOpacity={0.85}
                  >
                    {acting === emp.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="add" size={14} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.blockBtn]}
                    onPress={() => handleBlock(emp)}
                    disabled={acting === emp.id}
                    activeOpacity={0.85}
                  >
                    {acting === emp.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="ban" size={13} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Block</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.workBtn]}
                  onPress={() => openWorkRecord(emp)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="briefcase" size={12} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Work Record</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {searched && !searching && results.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="search" size={28} color="#CBD5CB" />
            <Text style={styles.emptyTitle}>No employees found</Text>
            <Text style={styles.emptySub}>
              No matching staff from other shops. Try a different name or phone.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F0F8EF' },
  scroll: { flex: 1 },
  content: { padding: 14, paddingBottom: 32 },

  newStaffCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  newStaffIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  newStaffTitle: { fontSize: 15, fontWeight: '700', color: '#172117' },
  newStaffSubtitle: { fontSize: 12, color: '#667066', marginTop: 2 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: '#CBD5CB' },
  dividerText: { marginHorizontal: 10, fontSize: 11, color: '#667066', fontWeight: '500' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8E2',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#172117', padding: 0 },
  helpText: { fontSize: 11, color: '#667066', marginTop: 6, marginLeft: 4 },

  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  resultMain: { flexDirection: 'row', alignItems: 'flex-start' },
  resultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  resultAvatarText: { fontSize: 16, fontWeight: '700', color: '#16BB05' },
  resultInfo: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 14, fontWeight: '700', color: '#172117' },
  resultMeta: { fontSize: 11, color: '#667066', marginTop: 1 },
  resultStatus: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  statusOk: { color: '#087A0A' },
  statusBad: { color: '#DC2626' },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 4,
    minWidth: 76,
  },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  addBtn: { backgroundColor: '#087A0A' },
  blockBtn: { backgroundColor: '#DC2626' },
  workBtn: { backgroundColor: '#087A0A' },

  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { marginTop: 10, fontSize: 13, fontWeight: '700', color: '#172117' },
  emptySub: { marginTop: 4, fontSize: 11, color: '#667066', textAlign: 'center', paddingHorizontal: 24 },
});
