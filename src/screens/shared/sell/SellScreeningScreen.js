import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../../../theme/colors';
import { Card, PrimaryButton, Loader } from '../../../components/ui';
import { getScreeningQuestions } from '../../../api/masterData';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  qTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  qHelp: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  ansRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 6 },
  ansRowActive: { borderColor: '#004C40' },
  ansLabel: { marginLeft: 8, fontSize: 13, color: colors.text },
  editBanner: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 4, flexDirection: 'row', alignItems: 'center' },
  editBannerTitle: { fontSize: 10, fontWeight: '800', color: '#92400E', letterSpacing: 0.5 },
  editBannerText: { fontSize: 12, color: colors.text, fontWeight: '600', marginTop: 2 },
  bottom: { padding: 12, backgroundColor: '#fff', borderTopColor: colors.border, borderTopWidth: 1 },
});

export default function SellScreeningScreen({ navigation, route }) {
  const params = route.params || {};
  const { device, workingCondition, editSellOrderId, editHints } = params;
  const flow = workingCondition === 'DEAD' ? 'DEAD' : 'WORKING';
  const isEditing = !!editSellOrderId;
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  // Look up prior answers by questionId so we can pre-select on first render.
  const priorByQuestionId = useMemo(() => {
    const m = {};
    (editHints?.screeningAnswers || []).forEach((a) => {
      if (a?.questionId && a?.answer) m[a.questionId] = a.answer;
    });
    return m;
  }, [editHints]);

  useEffect(() => {
    (async () => {
      try {
        const list = await getScreeningQuestions(flow, device?.categoryId);
        const fallback = flow === 'DEAD' ? [
          { id: 'd1', question: 'What is the current condition of your phone?', helperText: '', options: ['Phone Dead (Not powering on)', 'Unknown Condition (Not sure / partially working)'] },
          { id: 'd2', question: "Is your phone's display original?", helperText: 'Choose Yes if never changed.', options: ['Yes', 'No'] },
        ] : [
          { id: 'w1', question: 'Is your phone working properly?', helperText: 'Check your phone powers on.', options: ['Yes', 'No'] },
          { id: 'w2', question: 'Is your touchscreen working properly?', helperText: 'Check touch functionality.', options: ['Yes', 'No'] },
          { id: 'w3', question: "Is your phone's display original?", helperText: 'Choose Yes if never changed.', options: ['Yes', 'No'] },
          { id: 'w4', question: 'Is your phone have a valid warranty?', helperText: '', options: ['Yes', 'No'] },
        ];
        const finalList = list.length ? list : fallback;
        setQuestions(finalList);

        // Seed prior answers once the question list is known. Match by id
        // first, then fall back to text-matching the question so we still
        // recover answers when the question IDs differ (admin re-keyed).
        if (isEditing) {
          const seed = {};
          for (const q of finalList) {
            if (priorByQuestionId[q.id]) {
              seed[q.id] = priorByQuestionId[q.id];
            } else {
              const match = (editHints?.screeningAnswers || []).find(
                (a) => a?.question && q.question && a.question.trim().toLowerCase() === q.question.trim().toLowerCase(),
              );
              if (match?.answer) seed[q.id] = match.answer;
            }
          }
          if (Object.keys(seed).length) setAnswers(seed);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, [flow]);

  if (loading) return <Loader />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        {isEditing ? (
          <View style={styles.editBanner}>
            <Ionicons name="create-outline" size={16} color="#92400E" />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.editBannerTitle}>EDITING ORDER</Text>
              <Text style={styles.editBannerText}>Your previous answers are pre-selected — change any below.</Text>
            </View>
          </View>
        ) : null}
        {questions.map((q, i) => (
          <Card key={q.id} style={{ padding: 10, marginVertical: 4 }}>
            <Text style={styles.qTitle}>{i + 1}. {q.question}</Text>
            {q.helperText ? <Text style={styles.qHelp}>{q.helperText}</Text> : null}
            {(q.options || ['Yes', 'No']).map((opt) => {
              const active = answers[q.id] === opt;
              return (
                <TouchableOpacity key={opt} style={[styles.ansRow, active && styles.ansRowActive]} onPress={() => setAnswers({ ...answers, [q.id]: opt })}>
                  <Ionicons name={active ? 'checkmark-circle' : 'radio-button-off'} size={20} color={active ? '#004C40' : colors.textSecondary} />
                  <Text style={styles.ansLabel}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </Card>
        ))}
      </ScrollView>
      <View style={styles.bottom}>
        <PrimaryButton
          title="Continue →"
          disabled={questions.some((q) => !answers[q.id])}
          onPress={() => navigation.navigate('SellScreenCondition', { ...params, device, workingCondition, screeningAnswers: questions.filter((q) => answers[q.id]).map((q) => ({ questionId: q.id, answer: answers[q.id], question: q.question })) })}
        />
      </View>
    </View>
  );
}
