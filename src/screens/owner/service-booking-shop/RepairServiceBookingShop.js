import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../../../theme/colors';
import BackButton from '../../../components/BackButton';

import NewBookingScreen from './NewBookingScreen';
import CustomerDetailsScreen from './CustomerDetailsScreen';
import IdentifyDeviceScreen from './IdentifyDeviceScreen';
import ChooseDeviceScreen from './ChooseDeviceScreen';
// The shared device pickers are ALSO registered here so the whole
// ChooseDevice → SelectBrand → SelectSeries → SelectModel → DeviceColorStorage
// chain stays inside this nested stack. Without this, SelectModel.onPick
// (registered in OwnerNavigator) would call navigate('DeviceColorStorage')
// and RN wouldn't find it because nested-stack screens aren't visible from
// the parent. Both registrations point at the SAME shared file — no
// duplication of code, just two route entries.
import SelectBrandScreen from '../../shared/device/SelectBrandScreen';
import SelectSeriesScreen from '../../shared/device/SelectSeriesScreen';
import SelectModelScreen from '../../shared/device/SelectModelScreen';
import DeviceColorStorageScreen from './DeviceColorStorageScreen';
import DeviceServicesScreen from './DeviceServicesScreen';
import ServicePriceEstimateScreen from './ServicePriceEstimateScreen';
import DeviceInformationScreen from './DeviceInformationScreen';
import DeviceSecurityScreen from './DeviceSecurityScreen';
import DeviceMissingPartsScreen from './DeviceMissingPartsScreen';
import ServiceBookingDevicesListScreen from './ServiceBookingDevicesListScreen';
import BookingThankYouScreen from './BookingThankYouScreen';
import AssignTechnicianScreen from './AssignTechnicianScreen';
import BookingSuccessfulScreen from './BookingSuccessfulScreen';
import ScanQrCodeScreen from './ScanQrCodeScreen';
import ScanImeiScreen from './ScanImeiScreen';
import BookingStatusScreen from './BookingStatusScreen';

const Stack = createNativeStackNavigator();

export default function RepairServiceBookingShop() {
  return (
    <Stack.Navigator
      initialRouteName="NewBooking"
      screenOptions={({ navigation }) => ({
        headerShown: false,
        headerStyle: { backgroundColor: colors.headerBg },
        headerShadowVisible: true,
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontSize: 17, fontWeight: '700', color: colors.headerText },
        headerTitleAlign: 'center',
        headerTitleAllowFontScaling: false,
        headerLeft: () => {
          if (!navigation.canGoBack()) return null;
          return <BackButton onPress={() => navigation.goBack()} />;
        },
        headerBackVisible: false,
      })}
    >
      <Stack.Screen name="NewBooking" component={NewBookingScreen} options={{ title: 'New Booking' }} />
      <Stack.Screen name="CustomerDetails" component={CustomerDetailsScreen} options={{ title: 'Customer Details' }} />
      <Stack.Screen name="IdentifyDevice" component={IdentifyDeviceScreen} options={{ title: 'Identify Device', headerShown: false }} />
      <Stack.Screen name="ChooseDevice" component={ChooseDeviceScreen} options={{ title: 'Choose a Device' }} />
      {/* Shared device pickers — same components OwnerNavigator uses, but
          registered here so ChooseDevice → SelectBrand → ... → DeviceColorStorage
          all resolves within this nested stack. */}
      <Stack.Screen name="SelectBrand" component={SelectBrandScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectSeries" component={SelectSeriesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectModel" component={SelectModelScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeviceColorStorage" component={DeviceColorStorageScreen} options={{ title: 'Device Color & Storage' }} />
      <Stack.Screen name="DeviceServices" component={DeviceServicesScreen} options={{ title: 'Device Services' }} />
      <Stack.Screen name="ServiceBookingDevicesList" component={ServiceBookingDevicesListScreen} options={{ title: 'Service Booking' }} />
      <Stack.Screen name="ServicePriceEstimate" component={ServicePriceEstimateScreen} />
      <Stack.Screen name="DeviceInformation" component={DeviceInformationScreen} />
      <Stack.Screen name="DeviceSecurity" component={DeviceSecurityScreen} />
      <Stack.Screen name="DeviceMissingParts" component={DeviceMissingPartsScreen} />
      <Stack.Screen name="BookingThankYou" component={BookingThankYouScreen} />
      <Stack.Screen name="AssignTechnician" component={AssignTechnicianScreen} />
      <Stack.Screen name="BookingSuccessful" component={BookingSuccessfulScreen} />
      <Stack.Screen name="ScanQrCode" component={ScanQrCodeScreen} />
      <Stack.Screen name="ScanImei" component={ScanImeiScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BookingStatus" component={BookingStatusScreen} />
    </Stack.Navigator>
  );
}
