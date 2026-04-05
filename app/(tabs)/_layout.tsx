import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getSettings } from "../../src/storage/settings";

export default function TabLayout() {
  const simpleMode = getSettings().simpleMode;

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
          title: "Přehled",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="speedometer-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Zprávy",
          href: simpleMode ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: "Kampaně",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Nastavení",
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
