import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import LoginScreen from '../screens/auth/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import DebtorsListScreen from '../screens/debtors/DebtorsListScreen';
import DebtorDetailScreen from '../screens/debtors/DebtorDetailScreen';
import InventoryScreen from '../screens/shop/inventory/InventoryScreen';
import POSScreen from '../screens/shop/pos/POSScreen';
import SalesHistoryScreen from '../screens/shop/sales/SalesHistoryScreen';
import ShopMenuScreen from '../screens/shop/ShopMenuScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import AppearanceScreen from '../screens/settings/AppearanceScreen';
import PrivacyPolicyScreen from '../screens/settings/PrivacyPolicyScreen';
import HabitsScreen from '../screens/habits/HabitsScreen';
import ExpensesScreen from '../screens/expenses/ExpensesScreen';
import ExpensesCategoriesScreen from '../screens/expenses/ExpensesCategoriesScreen';
import SuggestionsScreen from '../screens/suggestions/SuggestionsScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user === null ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="DebtorsList" component={DebtorsListScreen} />
          <Stack.Screen name="DebtorDetail" component={DebtorDetailScreen} />
          <Stack.Screen name="ShopMenu" component={ShopMenuScreen} />
          <Stack.Screen name="Inventory" component={InventoryScreen} />
          <Stack.Screen name="POS" component={POSScreen} />
          <Stack.Screen name="SalesHistory" component={SalesHistoryScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Appearance" component={AppearanceScreen} />
          <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          <Stack.Screen name="Habits" component={HabitsScreen} />
          <Stack.Screen name="Expenses" component={ExpensesScreen} />
          <Stack.Screen name="ExpensesCategories" component={ExpensesCategoriesScreen} />
          <Stack.Screen name="Suggestions" component={SuggestionsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
