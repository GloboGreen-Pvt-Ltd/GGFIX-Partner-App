import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';

/*
 * Plays one recorded voice note — the note an owner spoke instead of typing.
 *
 * Shared between the Cash Book entry form (where it plays back the local
 * recording before it is saved) and the account statement (where it plays the
 * stored one), so both surfaces behave identically: one tap starts, a second
 * tap stops, and finishing resets without leaving a loaded sound behind.
 *
 * The sound is created on demand rather than preloaded: a statement can list
 * dozens of entries, and holding a decoder open for every one of them is how a
 * scroll starts stuttering on the cheap Android hardware these shops run.
 */

const INK = '#172117';

const mmss = (total) =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

export default function VoiceNotePlayer({ url, seconds, tint = '#087A0A', compact = false, label }) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const soundRef = useRef(null);

  // Unmounting mid-playback (scrolling the row away, leaving the screen) has to
  // release the decoder, or the audio keeps playing over the next screen.
  useEffect(() => () => {
    const player = soundRef.current;
    soundRef.current = null;
    if (player) { try { player.remove(); } catch {} }
  }, []);

  const toggle = async () => {
    if (busy || !url) return;
    setBusy(true);
    try {
      if (playing) {
        const player = soundRef.current;
        soundRef.current = null;
        setPlaying(false);
        if (player) {
          try { player.pause(); } catch {}
          try { player.remove(); } catch {}
        }
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
    } finally {
      setBusy(false);
    }
  };

  const size = compact ? 30 : 36;
  const text = label || (seconds ? `Voice note · ${mmss(seconds)}` : 'Voice note');

  return (
    <Pressable onPress={toggle} className="flex-row items-center flex-1 active:opacity-70">
      <View
        className="items-center justify-center"
        style={{ height: size, width: size, borderRadius: size / 2, backgroundColor: `${tint}1A` }}
      >
        {playing ? <Pause size={compact ? 15 : 17} color={tint} /> : <Play size={compact ? 15 : 17} color={tint} />}
      </View>
      <Text
        className="font-semibold ml-2.5 flex-1"
        style={{ fontSize: compact ? 12.5 : 13.5, color: playing ? tint : INK }}
        numberOfLines={1}
      >
        {playing ? 'Playing…' : text}
      </Text>
    </Pressable>
  );
}
