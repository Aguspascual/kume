import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack initialRouteName="index">
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="NewWorkScreen" options={{ headerShown: false }} />
      <Stack.Screen name="NewClientScreen" options={{ headerShown: false }} />
      <Stack.Screen name="UsersScreen" options={{ headerShown: false }} />
      <Stack.Screen name="ClientDetailScreen" options={{ headerShown: false }} />
      <Stack.Screen name="WeeklyCalendarScreen" options={{ headerShown: false }} />
      <Stack.Screen name="WorkDetailScreen" options={{ headerShown: false }} />
      <Stack.Screen name="MonthlySummaryScreen" options={{ headerShown: false }} />
      <Stack.Screen name="NewBudgetScreen" options={{ headerShown: false }} />
      <Stack.Screen name="BudgetsScreen" options={{ headerShown: false }} />
      <Stack.Screen name="BudgetDetailScreen" options={{ headerShown: false }} />
      <Stack.Screen name="PendingPaymentsScreen" options={{ headerShown: false }} />
    </Stack>
  );
}