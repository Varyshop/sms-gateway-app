import { useState, useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getSettings } from "../../src/storage/settings";
import { t, onLocaleChange } from "../../src/i18n";

export default function TabLayout() {
  const simpleMode = getSettings().simpleMode;
  const [, setLangTick] = useState(0);
  useEffect(() => onLocaleChange(() => setLangTick(n => n + 1)), []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#3B82F6",
        tabBarInactiveTintColor: "#888",
        tabBarStyle: {
          backgroundColor: "#111827",
          borderTopColor: "#1F2937",
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t().tabs.dashboard,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="speedometer-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t().tabs.messages,
          href: simpleMode ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: t().tabs.campaigns,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t().tabs.settings,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hide old screens from tab bar */}
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="inbound" options={{ href: null }} />
    </Tabs>
  );
}
