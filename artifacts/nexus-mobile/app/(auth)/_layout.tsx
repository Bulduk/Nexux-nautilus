import { useAuth } from "@/lib/auth";
import { Redirect, Stack } from "expo-router";
import React from "react";

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Redirect href="/(tabs)" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0b1326" },
      }}
    />
  );
}
