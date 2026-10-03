import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Loader } from '../../../components/ui';
import { getScreeningQuestions } from '../../../api/masterData';
import { SELL, SellButton, SellCard, SellFooter, SellIntro, EditingBanner, CheckDot, RadioRing } from './sellTheme';

// Two short answers (Yes / No) sit side by side; anything longer stacks.
const isCompact = (opts) => opts.length === 2 && opts.every((o) => String(o).length <= 12);

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

  const answered = questions.filter((q) => answers[q.id]).length;
  const allAnswered = !questions.some((q) => !answers[q.id]);

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {isEditing ? <EditingBanner text="Your previous answers are pre-selected — change any below." /> : null}
        <SellIntro title="Quick device check" caption="Answer each question about the device's current condition." />
        {questions.map((q, i) => {
          const opts = q.options || ['Yes', 'No'];
          const compact = isCompact(opts);
          return (
            <SellCard key={q.id}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ height: 26, width: 26, borderRadius: 13, backgroundColor: SELL.greenLight, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: SELL.greenDark }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: SELL.ink, lineHeight: 20 }}>{q.question}</Text>
                  {q.helperText ? <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 3, lineHeight: 17 }}>{q.helperText}</Text> : null}
                </View>
              </View>
              <View style={{ flexDirection: compact ? 'row' : 'column', gap: 8, marginTop: 12 }}>
                {opts.map((opt) => {
                  const active = answers[q.id] === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      activeOpacity={0.85}
                      onPress={() => setAnswers({ ...answers, [q.id]: opt })}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={{
                        flex: compact ? 1 : undefined, flexDirection: 'row', alignItems: 'center',
                        minHeight: 46, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5,
                        borderColor: active ? SELL.green : SELL.line, backgroundColor: active ? SELL.greenLight : SELL.card,
                      }}
                    >
                      {active ? <CheckDot size={20} /> : <RadioRing size={20} />}
                      <Text style={{ flex: 1, marginLeft: 10, fontSize: 13, fontWeight: active ? '700' : '600', color: active ? SELL.greenDark : SELL.ink }}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </SellCard>
          );
        })}
      </ScrollView>
      <SellFooter caption={questions.length ? `${answered} of ${questions.length} answered` : null}>
        <SellButton
          title="Continue"
          arrow
          disabled={!allAnswered}
          onPress={() => navigation.navigate('SellScreenCondition', { ...params, device, workingCondition, screeningAnswers: questions.filter((q) => answers[q.id]).map((q) => ({ questionId: q.id, answer: answers[q.id], question: q.question })) })}
        />
      </SellFooter>
    </View>
  );
}
