import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { SignInScreen, SignUpScreen } from "../screens/AuthScreens";
import { ClaimDetailScreen } from "../screens/ClaimDetailScreen";
import { ClaimsScreen } from "../screens/ClaimsScreen";
import { AdminHomeScreen } from "../screens/AdminHomeScreen";
import { ExpensesScreen } from "../screens/ExpensesScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { ReviewScreen } from "../screens/ReviewScreen";
import { theme } from "../theme";
import type { AppStackParamList, AuthStackParamList, TabParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: theme.bg },
};

function MainTabs() {
  const auth = useAuth();
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.bg },
        headerShadowVisible: false,
        headerTitleStyle: { color: theme.ink, fontWeight: "700" },
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.line },
        sceneStyle: { backgroundColor: theme.bg },
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === "Home" ? "home-outline" : route.name === "Expenses" ? "receipt-outline" : "wallet-outline";
          return <Ionicons name={name} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen
        name="Home"
        component={auth.isAdmin ? AdminHomeScreen : HomeScreen}
        options={{ title: auth.isAdmin ? "To review" : "SettlAI" }}
      />
      {auth.isAdmin ? null : <Tabs.Screen name="Expenses" component={ExpensesScreen} options={{ title: "Bills" }} />}
      <Tabs.Screen name="Claims" component={ClaimsScreen} options={{ title: "Claims" }} />
    </Tabs.Navigator>
  );
}

function SignedIn() {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerShadowVisible: false,
        headerTintColor: theme.ink,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <AppStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <AppStack.Screen name="Review" component={ReviewScreen} options={{ title: "Confirm bills" }} />
      <AppStack.Screen name="Claim" component={ClaimDetailScreen} options={{ title: "Claim" }} />
    </AppStack.Navigator>
  );
}

function SignedOut() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerShadowVisible: false,
        headerTintColor: theme.ink,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <AuthStack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ title: "Create account" }} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const auth = useAuth();
  if (auth.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.green} />
      </View>
    );
  }

  if (auth.status === "needsProfile") return <OnboardingScreen />;

  return (
    <NavigationContainer theme={navigationTheme}>
      {auth.status === "signedIn" ? <SignedIn /> : <SignedOut />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", backgroundColor: theme.bg, flex: 1, justifyContent: "center" },
});
