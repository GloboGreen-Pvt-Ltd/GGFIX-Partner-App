import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Phone,
  Paperclip,
  Smile,
  Mic,
  Send,
  Camera,
  Check,
  CheckCheck,
  ShieldCheck,
  StopCircle,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Loader } from '../../../components/rnr';
import {
  getShopChat,
  getShopChatMessages,
  sendShopChatMessage,
  markShopChatRead,
  pingShopTyping,
  pingShopPresence,
} from '../../../api/chat';
import { uploadMedia } from '../../../api/masterData';

const GREEN_DARK = '#087A0A';
const GREEN      = '#087A0A';

// ─────────────────────────────────────── helpers

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByDay(messages) {
  const out = [];
  let lastDay = null;
  for (const m of messages) {
    const d = m.createdAt ? new Date(m.createdAt) : new Date();
    const key = d.toDateString();
    if (key !== lastDay) { out.push({ type: 'date', key, label: dayLabel(d) }); lastDay = key; }
    out.push({ type: 'msg', message: m });
  }
  return out;
}

function lastSeenLabel(online, lastSeenAt) {
  if (online) return 'Online · typically replies fast';
  if (!lastSeenAt) return 'Tap to view profile';
  const d = new Date(lastSeenAt);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Last seen just now';
  if (mins < 60) return `Last seen ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  return `Last seen on ${d.toLocaleDateString([], { day: '2-digit', month: 'short' })}`;
}

// ─────────────────────────────────────── voice recording

function useVoiceRecorder() {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  const start = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return null;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return audioRecorder;
    } catch {
      return null;
    }
  }, [audioRecorder]);

  const stop = useCallback(async () => {
    if (!recording) return null;
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRecording(false);
      const dur = elapsed;
      setElapsed(0);
      return { uri, durationSec: dur };
    } catch {
      return null;
    }
  }, [recording, elapsed, audioRecorder]);

  const cancel = useCallback(async () => {
    if (!recording) return;
    try { await audioRecorder.stop(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
    setElapsed(0);
  }, [recording, audioRecorder]);

  return { recording, elapsed, start, stop, cancel };
}

// ─────────────────────────────────────── bubble renderer

function MessageBubble({ m, mine }) {
  const bubbleBg = m.failed
    ? 'bg-red-100 border border-red-300 rounded-2xl rounded-br-sm'
    : mine
      ? `${m.pending ? 'bg-emerald-400' : 'bg-emerald-600'} rounded-2xl rounded-br-sm`
      : 'bg-card border border-border rounded-2xl rounded-bl-sm';
  const txtColor = m.failed ? 'text-red-700' : mine ? 'text-white' : 'text-text';
  const metaColor = m.failed ? 'text-red-600' : mine ? 'text-white/75' : 'text-text-muted';
  const isImage = m.attachmentType === 'IMAGE' && m.attachmentUrl;
  const isAudio = m.attachmentType === 'AUDIO' && m.attachmentUrl;

  return (
    <View className={`${mine ? 'items-end' : 'items-start'} mb-1.5 px-1`}>
      <View className={`max-w-[82%] px-2.5 py-2 ${bubbleBg}`}>
        {isImage ? (
          <Image
            source={{ uri: m.attachmentUrl }}
            style={{ width: 220, height: 160, borderRadius: 10, marginBottom: m.body ? 6 : 0 }}
            resizeMode="cover"
          />
        ) : null}
        {isAudio ? (
          <AudioRow url={m.attachmentUrl} mine={mine} />
        ) : null}
        {m.body ? (
          <Text className={`text-[13.5px] leading-5 px-1 ${txtColor}`}>{m.body}</Text>
        ) : null}
        <View className="flex-row items-center justify-end mt-1 px-1">
          <Text className={`text-[10px] ${metaColor}`}>
            {m.failed ? 'Failed' : (m.pending ? 'Sending…' : formatTime(m.createdAt))}
          </Text>
          {mine && !m.pending && !m.failed ? (
            m.read || m.readAt
              ? <CheckCheck size={11} color="#C8EEBF" style={{ marginLeft: 4 }} />
              : <Check size={11} color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function AudioRow({ url, mine }) {
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef(null);
  const toggle = useCallback(async () => {
    try {
      if (playing) {
        const player = soundRef.current;
        soundRef.current = null;
        setPlaying(false);
        if (player) { try { player.pause(); } catch {} try { player.remove(); } catch {} }
        return;
      }
      const player = createAudioPlayer(url);
      soundRef.current = player;
      player.addListener('playbackStatusUpdate', (st) => {
        if (st?.didJustFinish) {
          setPlaying(false);
          soundRef.current = null;
          try { player.remove(); } catch {}
        }
      });
      player.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [playing, url]);
  return (
    <View className="flex-row items-center px-1 py-1 min-w-[160px]">
      <Pressable onPress={toggle} className="h-8 w-8 rounded-full items-center justify-center"
                 style={{ backgroundColor: mine ? 'rgba(255,255,255,0.25)' : '#E6F7E3' }}>
        {playing
          ? <StopCircle size={18} color={mine ? '#fff' : GREEN_DARK} />
          : <Mic size={16} color={mine ? '#fff' : GREEN_DARK} />}
      </Pressable>
      <Text className={`ml-2 text-[11px] ${mine ? 'text-white/90' : 'text-text-muted'}`}>
        {playing ? 'Playing voice note…' : 'Voice message · tap to play'}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────── main screen

export default function ShopChatThreadScreen({ navigation, route }) {
  const threadId = route?.params?.threadId;
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [head, setHead] = useState(null);   // thread metadata (counterpart name/phone/online…)
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState(false);
  const pollRef = useRef(null);
  const typingTimerRef = useRef(null);
  const scrollRef = useRef(null);
  const voice = useVoiceRecorder();

  const refreshThread = useCallback(async () => {
    try { setHead(await getShopChat(threadId)); } catch {}
  }, [threadId]);

  const refreshMessages = useCallback(async () => {
    try {
      const server = await getShopChatMessages(threadId);
      const serverList = server || [];
      setMessages((prev) => {
        // Preserve optimistic messages the server doesn't echo yet (still
        // sending, or failed) so a poll landing mid-send can't wipe them.
        // Without this a FAILED message silently vanished with no retry surface
        // and the owner believed it was delivered — real message data loss.
        const serverIds = new Set(serverList.map((s) => s.id));
        const unsynced = prev.filter((x) => (x.pending || x.failed) && !serverIds.has(x.id));
        return [...serverList, ...unsynced];
      });
    } catch {}
  }, [threadId]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    pingShopPresence().catch(() => {});
    await Promise.all([refreshThread(), refreshMessages()]);
    markShopChatRead(threadId).catch(() => {});
    setLoading(false);
  }, [refreshThread, refreshMessages, threadId]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  // The Android window resizes when the keyboard opens (adjustResize), so the OS
  // itself lifts the composer above the keyboard — no KeyboardAvoidingView or
  // manual padding needed (either would double-lift or leave a residual gap on
  // dismiss). We only track whether the keyboard is open, to switch the
  // composer's bottom padding (small while typing vs. nav-bar clearance closed).
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Constant clearance so the closed composer looks identical before and after
  // the keyboard has been used.
  const bottomInset = Math.max(insets.bottom, 12);

  // Poll for new messages + presence/typing every 5s.
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      await Promise.all([refreshThread(), refreshMessages()]);
      markShopChatRead(threadId).catch(() => {});
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refreshThread, refreshMessages, threadId]);

  // Debounced typing ping — fire after first keystroke, clear after pause.
  const onChangeText = (v) => {
    setText(v);
    pingShopTyping(threadId, true).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      pingShopTyping(threadId, false).catch(() => {});
    }, 1500);
  };

  const send = async (overrideBody, attachment) => {
    const body = (overrideBody ?? text).trim();
    if (!body && !attachment) return;
    if (!overrideBody && !attachment) setText('');

    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      sender: 'SHOP',
      body,
      attachmentUrl: attachment?.url,
      attachmentType: attachment?.type,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((m) => [...m, optimistic]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

    setSending(true);
    try {
      const sent = await sendShopChatMessage(threadId, {
        body,
        attachmentUrl: attachment?.url,
        attachmentType: attachment?.type,
      });
      setMessages((m) => m.map((x) => (x.id === tempId ? { ...sent, pending: false } : x)));
    } catch {
      setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, failed: true, pending: false } : x)));
    } finally {
      setSending(false);
    }
  };

  const pickImage = async (fromCamera = false) => {
    try {
      setAttaching(true);
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const r = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (r.canceled || !r.assets?.[0]) return;
      const url = await uploadMedia(r.assets[0], 'chat');
      if (url) await send('', { url, type: 'IMAGE' });
    } finally {
      setAttaching(false);
    }
  };

  const toggleVoice = async () => {
    if (voice.recording) {
      const out = await voice.stop();
      if (out?.uri) {
        const asset = {
          uri: out.uri,
          fileName: `voice-${Date.now()}.m4a`,
          mimeType: 'audio/m4a',
        };
        const url = await uploadMedia(asset, 'chat').catch(() => null);
        if (url) await send('', { url, type: 'AUDIO' });
      }
    } else {
      await voice.start();
    }
  };

  if (loading) return <Loader label="Opening chat..." />;

  const groups = groupByDay(messages);
  const name = head?.counterpartName || 'Customer';
  const online = !!head?.counterpartOnline;
  const typing = !!head?.counterpartTyping;

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View className="flex-row items-center px-3 py-2 border-b border-border" style={{ backgroundColor: '#FFFFFF' }}>
          <Pressable
            onPress={() => navigation.goBack()}
            className="h-10 w-10 rounded-full items-center justify-center active:opacity-80"
            style={{ backgroundColor: '#EFF5EE' }}
          >
            <ChevronLeft size={20} color="#172117" />
          </Pressable>
          <View className="h-10 w-10 rounded-full items-center justify-center ml-2" style={{ backgroundColor: '#E6F7E3' }}>
            {head?.counterpartAvatarUrl ? (
              <Image source={{ uri: head.counterpartAvatarUrl }} style={{ height: 40, width: 40, borderRadius: 20 }} />
            ) : (
              <Text className="text-primary text-[13px] font-extrabold">{name.slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
          <View className="flex-1 ml-2.5">
            <Text className="text-text text-[14px] font-extrabold" numberOfLines={1}>{name}</Text>
            <View className="flex-row items-center mt-0.5">
              {online ? <View className="h-1.5 w-1.5 rounded-full bg-primary mr-1" /> : null}
              <Text className="text-text-muted text-[10px]" numberOfLines={1}>
                {typing ? 'typing…' : lastSeenLabel(online, head?.counterpartLastSeenAt)}
              </Text>
            </View>
          </View>
          {head?.counterpartPhone ? (
            <View className="h-10 w-10 rounded-full items-center justify-center ml-1" style={{ backgroundColor: '#EFF5EE' }}>
              <Phone size={16} color="#087A0A" />
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View className="self-center bg-card border border-border rounded-full px-3 py-1 mb-3 flex-row items-center">
            <ShieldCheck size={11} color={GREEN_DARK} />
            <Text className="text-[10px] text-text-muted ml-1">Encrypted via ggfix · Customer chat</Text>
          </View>

          {messages.length === 0 ? (
            <View className="items-center mt-10">
              <Text className="text-[12px] text-text-muted">No messages yet — say hi to start the conversation.</Text>
            </View>
          ) : (
            groups.map((g, idx) => {
              if (g.type === 'date') {
                return (
                  <View key={`d-${idx}`} className="items-center my-2">
                    <View className="bg-card border border-border rounded-full px-3 py-0.5">
                      <Text className="text-[10px] font-bold text-text-muted">{g.label}</Text>
                    </View>
                  </View>
                );
              }
              const m = g.message;
              const mine = m.sender === 'SHOP';
              return <MessageBubble key={m.id || idx} m={m} mine={mine} />;
            })
          )}

          {typing ? (
            <View className="items-start mb-1.5 px-1">
              <View className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2">
                <Text className="text-[12px] text-text-muted italic">typing…</Text>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {/* Composer. When the keyboard is closed, pad the bottom by the safe-area
            inset so the white bar extends behind the nav bar and the input row
            sits just above the nav buttons. When open, only a little breathing
            room is needed. */}
        <View className="px-3 pt-2 bg-card border-t border-border"
              style={{ paddingBottom: keyboardOpen ? 12 : bottomInset }}>
          {voice.recording ? (
            <View className="flex-row items-center bg-red-50 border border-red-200 rounded-2xl px-3 py-2">
              <View className="h-2.5 w-2.5 rounded-full bg-red-500 mr-2" />
              <Text className="text-[12px] font-bold text-red-700 flex-1">
                Recording… {String(Math.floor(voice.elapsed / 60)).padStart(2, '0')}:{String(voice.elapsed % 60).padStart(2, '0')}
              </Text>
              <Pressable onPress={voice.cancel} className="px-2 py-1 mr-1 active:opacity-70">
                <Text className="text-[11px] font-bold text-text-muted">Cancel</Text>
              </Pressable>
              <Pressable onPress={toggleVoice} className="h-9 w-9 rounded-full items-center justify-center" style={{ backgroundColor: GREEN }}>
                <Send size={16} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-end">
              <View className="flex-1 bg-background border border-border rounded-3xl flex-row items-center px-2 py-1">
                <Pressable onPress={() => pickImage(false)} disabled={attaching} className="h-9 w-9 items-center justify-center active:opacity-70">
                  <Paperclip size={18} color="#667066" />
                </Pressable>
                <TextInput
                  placeholder="Type a message…"
                  placeholderTextColor="#8FA08F"
                  value={text}
                  onChangeText={onChangeText}
                  multiline
                  maxLength={1000}
                  className="flex-1 text-text text-[14px] py-2 px-1"
                  style={{ maxHeight: 100 }}
                />
                <Pressable onPress={() => setText((t) => `${t || ''}😊`)} className="h-9 w-9 items-center justify-center active:opacity-70">
                  <Smile size={18} color="#667066" />
                </Pressable>
                <Pressable onPress={() => pickImage(true)} disabled={attaching} className="h-9 w-9 items-center justify-center active:opacity-70">
                  <Camera size={18} color="#667066" />
                </Pressable>
              </View>
              {text.trim() ? (
                <Pressable
                  onPress={() => send()}
                  disabled={sending}
                  className="h-12 w-12 rounded-full ml-2 items-center justify-center"
                  style={{ backgroundColor: GREEN }}
                >
                  <Send size={18} color="#fff" style={{ marginLeft: -2 }} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={toggleVoice}
                  className="h-12 w-12 rounded-full ml-2 items-center justify-center"
                  style={{ backgroundColor: GREEN_DARK }}
                >
                  <Mic size={18} color="#fff" />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
