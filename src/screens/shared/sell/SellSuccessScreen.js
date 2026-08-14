import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, Home, ListChecks, Sparkles } from 'lucide-react-native';
import { Button } from '../../../components/rnr';

export default function SellSuccessScreen({ navigation }) {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#16BB05' }}>
        <LinearGradient
          colors={['#16BB05', '#087A0A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingTop: 24, paddingBottom: 36, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: 'center' }}
        >
          <View className="h-16 w-16 rounded-full bg-white/20 items-center justify-center mb-2">
            <View className="h-12 w-12 rounded-full bg-white items-center justify-center">
              <CheckCircle2 size={26} color="#16BB05" />
            </View>
          </View>
          <Text className="text-white text-[18px] font-extrabold">Sale Request Submitted!</Text>
          <Text className="text-white/85 text-[11px] mt-1 text-center px-8" numberOfLines={3}>
            Verified shops will respond with quotes within minutes. We'll notify you the moment a quote arrives.
          </Text>
        </LinearGradient>
      </SafeAreaView>

      <View className="flex-1 px-4 -mt-4">
        <View className="bg-card border border-border rounded-2xl p-3"
              style={{ shadowColor: '#172117', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
          {[
            { icon: ListChecks, color: '#087A0A', bg: 'bg-primary/10', title: 'Request created', sub: 'Shops have been notified' },
            { icon: Sparkles,    color: '#F59E0B', bg: 'bg-warning/10', title: 'Awaiting quotes', sub: 'Usually within 15 mins' },
            { icon: CheckCircle2,color: '#16BB05', bg: 'bg-success/10', title: 'Pick your best offer', sub: 'Then schedule free pickup' },
          ].map((s, i, arr) => {
            const Icon = s.icon;
            return (
              <View key={s.title} className={`flex-row items-center ${i < arr.length - 1 ? 'border-b border-border pb-2 mb-2' : ''}`}>
                <View className={`h-8 w-8 rounded-full items-center justify-center mr-2.5 ${s.bg}`}>
                  <Icon size={14} color={s.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-[12px] font-extrabold text-text">{s.title}</Text>
                  <Text className="text-[10px] text-text-muted mt-0.5">{s.sub}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="px-4 pb-6 pt-3 bg-card border-t border-border flex-row"
            style={{ shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Button
          variant="outline"
          className="flex-1 mr-2"
          onPress={() => navigation.popToTop()}
          leftIcon={<Home size={14} color="#087A0A" />}
        >
          Home
        </Button>
        <Button
          className="flex-1 ml-2"
          onPress={() => { navigation.popToTop(); navigation.navigate('MyOrders'); }}
        >
          View Order
        </Button>
      </View>
    </View>
  );
}
