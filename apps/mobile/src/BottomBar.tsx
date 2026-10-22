import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { colors, radius } from "./theme";

export type BottomBarTab = {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  active: boolean;
};

export type BottomBarCenterButton = {
  label: string;
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
};

export function BottomBar({
  tabs,
  center,
}: {
  tabs: BottomBarTab[];
  center?: BottomBarCenterButton;
}) {
  const insets = useSafeAreaInsets();
  const firstTabs = tabs.slice(0, 2);
  const lastTabs = tabs.slice(2, 4);

  function renderTab(tab: BottomBarTab) {
    const color = tab.active ? colors.accent : colors.onDarkMuted;
    return (
      <Pressable
        key={tab.key}
        style={styles.tab}
        onPress={tab.onPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: tab.active }}
        accessibilityLabel={tab.label}
      >
        <Icon name={tab.icon} size={24} color={color} />
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            { color, fontWeight: tab.active ? "700" : "400" },
          ]}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          height: 96 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.tabs}>
        {firstTabs.map(renderTab)}
        <View style={styles.centerSpace} />
        {lastTabs.map(renderTab)}
      </View>
      {center ? (
        <View pointerEvents="box-none" style={styles.centerWrap}>
          <Pressable
            style={[styles.centerButton, center.active && styles.centerActive]}
            onPress={center.onPress}
            accessibilityRole="button"
            accessibilityLabel={center.accessibilityLabel}
          >
            <Icon name={center.icon} size={28} color={colors.text} />
          </Pressable>
          <Text numberOfLines={1} style={styles.centerLabel}>
            {center.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "relative",
    backgroundColor: colors.dark,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  tabs: {
    height: 96,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  centerSpace: {
    width: 96,
  },
  centerWrap: {
    position: "absolute",
    top: 0,
    left: "50%",
    width: 96,
    height: 96,
    marginLeft: -48,
    alignItems: "center",
  },
  centerButton: {
    position: "absolute",
    top: -32,
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 6,
    borderColor: colors.bg,
    borderRadius: radius.pill,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  centerActive: {
    borderColor: colors.onDark,
    borderWidth: 2,
  },
  centerLabel: {
    position: "absolute",
    top: 57,
    maxWidth: 96,
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
});
