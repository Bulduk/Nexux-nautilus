import { useAuth } from "@/lib/auth";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { setAuthTokenGetter } from "@/lib/api";
import * as SecureStore from "expo-secure-store";

const AUTH_TOKEN_KEY = "auth_session_token";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "bolt", selected: "bolt.fill" }} />
        <Label>Nexus</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="signals">
        <Icon sf={{ default: "waveform.path", selected: "waveform.path" }} />
        <Label>Sinyaller</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="council">
        <Icon sf={{ default: "person.3", selected: "person.3.fill" }} />
        <Label>Kurul</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="portfolio">
        <Icon sf={{ default: "creditcard", selected: "creditcard.fill" }} />
        <Label>Portföy</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
        <Label>Daha Fazla</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#00C9A7",
        tabBarInactiveTintColor: "#8e9192",
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : "#0b1326",
          borderTopWidth: 1,
          borderTopColor: "rgba(255,255,255,0.08)",
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0b1326" }]} />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 9,
          fontFamily: "Inter_500Medium",
          letterSpacing: 0.2,
          marginBottom: isWeb ? 0 : 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Nexus",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bolt.fill" tintColor={color} size={21} />
            ) : (
              <Feather name="zap" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="signals"
        options={{
          title: "Sinyaller",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="waveform.path" tintColor={color} size={21} />
            ) : (
              <Feather name="activity" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="council"
        options={{
          title: "Kurul",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.3.fill" tintColor={color} size={21} />
            ) : (
              <Feather name="users" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portföy",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="creditcard.fill" tintColor={color} size={21} />
            ) : (
              <Feather name="briefcase" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Daha Fazla",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="square.grid.2x2.fill" tintColor={color} size={21} />
            ) : (
              <Feather name="grid" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen name="strategy" options={{ title: "Strategy", tabBarButton: () => null }} />
      <Tabs.Screen name="prediction" options={{ title: "Prediction", tabBarButton: () => null }} />
      <Tabs.Screen name="ledger" options={{ title: "Ledger", tabBarButton: () => null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarButton: () => null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { isLoading, isAuthenticated } = useAuth();

  // Wire the token getter synchronously so child API calls have Authorization header.
  setAuthTokenGetter(() => SecureStore.getItemAsync(AUTH_TOKEN_KEY));

  useEffect(() => {
    return () => setAuthTokenGetter(null);
  }, []);

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/sign-in" />;

  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
