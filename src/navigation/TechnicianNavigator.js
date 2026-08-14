import React from 'react';
import { Button } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../theme/colors';
import BackButton from '../components/BackButton';
import TechnicianProfileScreen from '../screens/owner/technician/TechnicianProfileScreen';
import TechnicianDashboardScreen from '../screens/owner/technician/TechnicianDashboardScreen';
import AssignedTicketsScreen from '../screens/owner/technician/AssignedTicketsScreen';
import TechnicianTicketDetailScreen from '../screens/owner/technician/TechnicianTicketDetailScreen';
import UpdateStatusScreen from '../screens/owner/technician/UpdateStatusScreen';
import AddRepairNotesScreen from '../screens/owner/technician/AddRepairNotesScreen';
import UploadRepairImagesScreen from '../screens/owner/technician/UploadRepairImagesScreen';
import TechnicianApplyLeaveScreen from '../screens/owner/technician/TechnicianApplyLeaveScreen';
import TechnicianKycUploadScreen from '../screens/owner/technician/TechnicianKycUploadScreen';

const Stack = createNativeStackNavigator();

export default function TechnicianNavigator({ session, onLogout }) {
  return (
    <Stack.Navigator
      initialRouteName="TechnicianProfile"
      screenOptions={({ navigation }) => ({
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
      <Stack.Screen
        name="TechnicianProfile"
        component={TechnicianProfileScreen}
        options={{ title: 'My Profile', headerRight: () => <Button onPress={onLogout} title="Log out" color={colors.primary} /> }}
      />
      <Stack.Screen name="TechnicianDashboard" component={TechnicianDashboardScreen} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="AssignedTickets" component={AssignedTicketsScreen} options={{ title: 'My Tickets' }} />
      <Stack.Screen name="TechnicianTicketDetail" component={TechnicianTicketDetailScreen} options={{ title: 'Ticket Detail' }} />
      <Stack.Screen name="UpdateStatus" component={UpdateStatusScreen} options={{ title: 'Update Status' }} />
      <Stack.Screen name="AddRepairNotes" component={AddRepairNotesScreen} options={{ title: 'Add Note' }} />
      <Stack.Screen name="UploadRepairImages" component={UploadRepairImagesScreen} options={{ title: 'Upload Images' }} />
      <Stack.Screen name="TechnicianApplyLeave" component={TechnicianApplyLeaveScreen} options={{ title: 'Apply for leave' }} />
      <Stack.Screen name="TechnicianKycUpload" component={TechnicianKycUploadScreen} options={{ title: 'My KYC' }} />
    </Stack.Navigator>
  );
}
