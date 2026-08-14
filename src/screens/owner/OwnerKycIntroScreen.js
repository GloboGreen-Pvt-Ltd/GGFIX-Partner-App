import React from 'react';
import {
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  ShieldCheck,
  Lock,
  ArrowRight,
  IdCard,
  CreditCard,
  FileText,
  Award,
} from 'lucide-react-native';

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
};

const softShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

// Owner KYC = personal identity documents only (Aadhar front/back + PAN).
const DOCS = [
  { key: 'aadhar', Icon: IdCard,    title: 'Aadhar Card',      desc: 'Identity verification (front & back)', tint: '#E6F7E3', accent: '#16BB05' },
  { key: 'pan',    Icon: CreditCard,title: 'PAN Card',         desc: 'Tax verification',                     tint: '#F0F8EF', accent: '#087A0A' },
];

export default function OwnerKycIntroScreen({ navigation }) {
  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F8EF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 6,
            paddingBottom: 14,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
            >
              <ChevronLeft size={22} color="#172117" />
            </TouchableOpacity>
            <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
              KYC Documents
            </Text>
            <View
              className="px-2.5 py-1 rounded-full flex-row items-center bg-surface-muted"
            >
              <Lock size={11} color="#172117" />
              <Text className="ml-1 text-text text-[10.5px] font-extrabold">SECURE</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
      >
        {/* Hero card */}
        <View style={cardShadow}>
          <LinearGradient
            colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 22, padding: 18, overflow: 'hidden' }}
          >
            <View
              style={{
                position: 'absolute', right: -30, top: -30,
                width: 110, height: 110, borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.10)',
              }}
            />
            <View
              style={{
                position: 'absolute', right: 40, bottom: -40,
                width: 80, height: 80, borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.06)',
              }}
            />
            <View
              style={{
                width: 46, height: 46, borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)',
                marginBottom: 12,
              }}
            >
              <ShieldCheck size={24} color="#FFFFFF" strokeWidth={2.3} />
            </View>
            <Text className="text-white text-[19px] font-extrabold" style={{ letterSpacing: -0.3 }}>
              Let's verify your shop
            </Text>
            <Text className="text-white/85 text-[12.5px] mt-1.5 leading-5">
              Have these documents handy. The whole process takes about 5 minutes.
            </Text>
          </LinearGradient>
        </View>

        {/* Section label */}
        <View className="mt-5 mb-2 ml-1">
          <Text
            className="text-[11px] font-extrabold uppercase"
            style={{ color: BRAND_GREEN_DARK, letterSpacing: 1.2 }}
          >
            Documents you'll need
          </Text>
        </View>

        {/* Doc grid */}
        <View className="flex-row flex-wrap -mx-1">
          {DOCS.map((doc, idx) => {
            const Icon = doc.Icon;
            return (
              <View key={doc.key} style={{ width: '50%', padding: 6 }}>
                <View className="bg-white rounded-2xl p-3.5" style={softShadow}>
                  <View className="flex-row items-center justify-between">
                    <View
                      style={{
                        width: 26, height: 26, borderRadius: 13,
                        backgroundColor: '#E6F7E3',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text
                        className="text-[11px] font-extrabold"
                        style={{ color: BRAND_GREEN_DARK }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 38, height: 38, borderRadius: 12,
                        backgroundColor: doc.tint,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Icon size={18} color={doc.accent} strokeWidth={2.2} />
                    </View>
                  </View>
                  <Text className="text-[13px] font-extrabold text-gray-900 mt-3">
                    {doc.title}
                  </Text>
                  <Text className="text-[11px] text-gray-500 mt-1 leading-4">
                    {doc.desc}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Security reassurance */}
        <View
          className="flex-row items-center mt-3 rounded-2xl px-3 py-3"
          style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
        >
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-2.5"
            style={{ backgroundColor: BRAND_GREEN_DARK }}
          >
            <Lock size={14} color="#FFFFFF" />
          </View>
          <Text
            className="flex-1 text-[11.5px] font-semibold leading-4"
            style={{ color: BRAND_GREEN_DARK }}
          >
            Your documents are encrypted and used only for verification.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('OwnerKycUpload')}
          className="mt-5"
          style={cardShadow}
        >
          <LinearGradient
            colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 18,
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="text-white text-[15px] font-extrabold">Get Started</Text>
            <ArrowRight size={16} color="#FFFFFF" style={{ marginLeft: 8 }} />
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
