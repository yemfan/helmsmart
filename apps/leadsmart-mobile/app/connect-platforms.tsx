import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Stack, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  disconnectMobileLinkedIn,
  disconnectMobileMeta,
  disconnectMobileTikTok,
  disconnectMobileYouTube,
  fetchMobileConnections,
  initMobileLinkedInConnect,
  initMobileMetaConnect,
  initMobileTikTokConnect,
  initMobileYouTubeConnect,
  type MobileConnection,
} from "../lib/leadsmartMobileApi";
import {
  hapticButtonPress,
  hapticError,
  hapticSuccess,
} from "../lib/haptics";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/**
 * Mobile equivalent of the web /dashboard/leads/generate/connect
 * page. Currently surfaces Meta + LinkedIn. The OAuth round-trip
 * works the same for both:
 *
 *   1. Call /api/mobile/leads-gen/connect/<network>/init with
 *      Bearer auth to mint a signed OAuth URL (state token
 *      includes the agent's id + the mobile deep-link).
 *   2. Open the URL via `WebBrowser.openAuthSessionAsync` with
 *      the deep-link as the resolve URL.
 *   3. The web /api/leads-gen/connect/<network>/callback redirects
 *      to the deep link with `?status=...&count=...&network=...`.
 *   4. The in-app browser closes; we parse the status, show a
 *      flash, and refresh the connections list.
 */

const RETURN_TO_DEEP_LINK = "leadsmart://leads-gen/connect/callback";

type Network = "meta" | "linkedin" | "tiktok" | "youtube";

/**
 * The revoke-from-the-provider instructions used to sit under every card as
 * a paragraph of grey text, four times over, on a screen whose one job is a
 * Connect button. They matter about once a year. Behind an "i" now; the
 * alert is the phone's equivalent of hover.
 */
function InfoButton({ network, body }: { network: string; body: string }) {
  const { t } = useTranslation("mobile_misc_screens");
  const tokens = useThemeTokens();
  return (
    <Pressable
      onPress={() => Alert.alert(network, body)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t("connectPlatforms.about", { network })}
    >
      <Ionicons name="information-circle-outline" size={18} color={tokens.textSubtle} />
    </Pressable>
  );
}

export default function ConnectPlatformsScreen() {
  const { t } = useTranslation("mobile_misc_screens");
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [connections, setConnections] = useState<MobileConnection[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchMobileConnections();
    if (res.ok === false) {
      setError(res.message);
      setConnections([]);
      return;
    }
    setConnections(res.connections);
  }, []);

  // Refresh on each focus — covers the case where the user came back
  // from the in-app browser after granting / cancelling.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const [connectingNetwork, setConnectingNetwork] = useState<Network | null>(
    null,
  );

  const onConnect = useCallback(
    async (network: Network) => {
      hapticButtonPress();
      setError(null);
      setConnectingNetwork(network);
      setConnecting(true);
      try {
        const init =
          network === "linkedin"
            ? await initMobileLinkedInConnect(RETURN_TO_DEEP_LINK)
            : network === "tiktok"
              ? await initMobileTikTokConnect(RETURN_TO_DEEP_LINK)
              : network === "youtube"
                ? await initMobileYouTubeConnect(RETURN_TO_DEEP_LINK)
                : await initMobileMetaConnect(RETURN_TO_DEEP_LINK);
        if (init.ok === false) {
          throw new Error(init.message);
        }
        // openAuthSessionAsync intercepts the deep-link redirect so
        // the in-app browser closes automatically when /callback
        // redirects to leadsmart://leads-gen/connect/callback?status=...
        const result = await WebBrowser.openAuthSessionAsync(
          init.url,
          RETURN_TO_DEEP_LINK,
        );
        if (result.type === "cancel" || result.type === "dismiss") {
          setFlash("Connection cancelled.");
          hapticError();
        } else if (result.type === "success" && result.url) {
          const parsed = (() => {
            try {
              const u = new URL(result.url);
              return {
                status: u.searchParams.get("status"),
                count: u.searchParams.get("count"),
                reason: u.searchParams.get("reason"),
                network: u.searchParams.get("network"),
              };
            } catch {
              return { status: null, count: null, reason: null, network: null };
            }
          })();
          if (parsed.status === "success") {
            hapticSuccess();
            const inferredNetwork = (parsed.network ?? network) as Network;
            if (inferredNetwork === "linkedin") {
              setFlash("LinkedIn connected.");
            } else if (inferredNetwork === "tiktok") {
              setFlash("TikTok connected.");
            } else if (inferredNetwork === "youtube") {
              setFlash("YouTube connected.");
            } else {
              const n = Number(parsed.count) || 1;
              setFlash(`Linked ${n} Facebook ${n === 1 ? "Page" : "Pages"}.`);
            }
          } else {
            hapticError();
            setFlash(parsed.reason ?? "Connection failed.");
          }
          await load();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start OAuth");
        hapticError();
      } finally {
        setConnecting(false);
        setConnectingNetwork(null);
      }
    },
    [load],
  );

  const onDisconnect = useCallback(
    async (conn: MobileConnection) => {
      const networkLabel =
        conn.platform === "linkedin"
          ? "LinkedIn"
          : conn.platform === "tiktok"
            ? "TikTok"
            : conn.platform === "youtube"
              ? "YouTube"
              : "Facebook";
      const label =
        conn.platform === "meta" ? conn.fbPageName ?? "this Page" : conn.displayName ?? `your ${networkLabel}`;
      Alert.alert(
        `Disconnect ${networkLabel}`,
        `Disconnect ${label}? Posts already published will stay live on ${networkLabel}.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              hapticButtonPress();
              setDisconnectingId(conn.id);
              const res =
                conn.platform === "linkedin"
                  ? await disconnectMobileLinkedIn({ id: conn.id })
                  : conn.platform === "tiktok"
                    ? await disconnectMobileTikTok({ id: conn.id })
                    : conn.platform === "youtube"
                      ? await disconnectMobileYouTube({ id: conn.id })
                      : await disconnectMobileMeta({ id: conn.id });
              setDisconnectingId(null);
              if (res.ok === false) {
                hapticError();
                Alert.alert(t("connectPlatforms.disconnectFailed"), res.message);
                return;
              }
              hapticSuccess();
              await load();
            },
          },
        ],
      );
    },
    [load],
  );

  const metaConnections = useMemo(
    () => (connections ?? []).filter((c) => c.platform === "meta"),
    [connections],
  );
  const linkedinConnections = useMemo(
    () => (connections ?? []).filter((c) => c.platform === "linkedin"),
    [connections],
  );
  const tiktokConnections = useMemo(
    () => (connections ?? []).filter((c) => c.platform === "tiktok"),
    [connections],
  );
  const youtubeConnections = useMemo(
    () => (connections ?? []).filter((c) => c.platform === "youtube"),
    [connections],
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Stack.Screen
        options={{ title: "Connect Platforms", headerBackTitle: "Back" }}
      />

      {flash && (
        <View style={styles.flash}>
          <Text style={styles.flashText}>{flash}</Text>
          <Pressable onPress={() => setFlash(null)} hitSlop={10}>
            <Ionicons name="close" size={16} color={tokens.textSubtle} />
          </Pressable>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={tokens.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Meta card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{t("connectPlatforms.facebookInstagram")}</Text>
              <InfoButton
                network={t("connectPlatforms.facebookInstagram")}
                body={t("connectPlatforms.meta.details")}
              />
            </View>
            <Text style={styles.cardSubtitle}>{t("connectPlatforms.meta.subtitle")}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => onConnect("meta")}
          disabled={connecting}
          style={[
            styles.connectButton,
            connecting && styles.connectButtonBusy,
          ]}
        >
          {connecting && connectingNetwork === "meta" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-facebook" size={16} color="#fff" />
              <Text style={styles.connectButtonText}>
                {metaConnections.length > 0
                  ? "Connect another"
                  : "Connect Facebook"}
              </Text>
            </>
          )}
        </Pressable>

        {connections === null ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={tokens.accent} />
          </View>
        ) : metaConnections.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>
              {t("connectPlatforms.meta.empty")}
            </Text>
          </View>
        ) : (
          <View style={styles.connectionsList}>
            {metaConnections.map((c) => (
              <View key={c.id} style={styles.connectionRow}>
                <View style={styles.connectionLeft}>
                  {c.pictureUrl ? (
                    <Image
                      source={{ uri: c.pictureUrl }}
                      style={styles.connectionAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.connectionAvatar,
                        styles.connectionAvatarFallback,
                      ]}
                    >
                      <Text style={styles.connectionAvatarFallbackText}>
                        {(c.fbPageName ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName} numberOfLines={1}>
                      {c.fbPageName ?? "Facebook Page"}
                    </Text>
                    {c.igBusinessUsername && (
                      <View style={styles.igBadge}>
                        <Text style={styles.igBadgeText}>
                          IG @{c.igBusinessUsername}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Pressable
                  onPress={() => onDisconnect(c)}
                  disabled={disconnectingId === c.id}
                  style={styles.disconnectButton}
                >
                  <Text style={styles.disconnectButtonText}>
                    {disconnectingId === c.id ? "…" : "Disconnect"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

      </View>

      {/* LinkedIn card */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{t("connectPlatforms.linkedin")}</Text>
              <InfoButton
                network={t("connectPlatforms.linkedin")}
                body={t("connectPlatforms.li.details")}
              />
            </View>
            <Text style={styles.cardSubtitle}>{t("connectPlatforms.li.subtitle")}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => onConnect("linkedin")}
          disabled={connecting}
          style={[
            styles.connectButton,
            styles.connectButtonLinkedIn,
            connecting && styles.connectButtonBusy,
          ]}
        >
          {connecting && connectingNetwork === "linkedin" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-linkedin" size={16} color="#fff" />
              <Text style={styles.connectButtonText}>
                {linkedinConnections.length > 0
                  ? "Reconnect"
                  : "Connect LinkedIn"}
              </Text>
            </>
          )}
        </Pressable>

        {connections === null ? null : linkedinConnections.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>
              {t("connectPlatforms.notConnected")}
            </Text>
          </View>
        ) : (
          <View style={styles.connectionsList}>
            {linkedinConnections.map((c) => (
              <View key={c.id} style={styles.connectionRow}>
                <View style={styles.connectionLeft}>
                  {c.pictureUrl ? (
                    <Image
                      source={{ uri: c.pictureUrl }}
                      style={styles.connectionAvatar}
                    />
                  ) : (
                    <View
                      style={[
                        styles.connectionAvatar,
                        styles.connectionAvatarLinkedInFallback,
                      ]}
                    >
                      <Text style={styles.connectionAvatarFallbackText}>
                        {(c.displayName ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName} numberOfLines={1}>
                      {c.displayName ?? "LinkedIn member"}
                    </Text>
                    {c.linkedinMemberEmail && (
                      <Text style={styles.connectionSubtext} numberOfLines={1}>
                        {c.linkedinMemberEmail}
                      </Text>
                    )}
                  </View>
                </View>
                <Pressable
                  onPress={() => onDisconnect(c)}
                  disabled={disconnectingId === c.id}
                  style={styles.disconnectButton}
                >
                  <Text style={styles.disconnectButtonText}>
                    {disconnectingId === c.id ? "…" : "Disconnect"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

      </View>

      {/* TikTok card */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{t("connectPlatforms.tiktok")}</Text>
              <InfoButton
                network={t("connectPlatforms.tiktok")}
                body={t("connectPlatforms.tt.details")}
              />
            </View>
            <Text style={styles.cardSubtitle}>{t("connectPlatforms.tt.subtitle")}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => onConnect("tiktok")}
          disabled={connecting}
          style={[styles.connectButton, { backgroundColor: "#000" }, connecting && styles.connectButtonBusy]}
        >
          {connecting && connectingNetwork === "tiktok" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-tiktok" size={16} color="#fff" />
              <Text style={styles.connectButtonText}>
                {tiktokConnections.length > 0 ? "Reconnect" : "Connect TikTok"}
              </Text>
            </>
          )}
        </Pressable>

        {connections === null ? null : tiktokConnections.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>{t("connectPlatforms.notConnected")}</Text>
          </View>
        ) : (
          <View style={styles.connectionsList}>
            {tiktokConnections.map((c) => (
              <View key={c.id} style={styles.connectionRow}>
                <View style={styles.connectionLeft}>
                  {c.pictureUrl ? (
                    <Image source={{ uri: c.pictureUrl }} style={styles.connectionAvatar} />
                  ) : (
                    <View style={[styles.connectionAvatar, styles.connectionAvatarFallback]}>
                      <Text style={styles.connectionAvatarFallbackText}>
                        {(c.displayName ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName} numberOfLines={1}>
                      {c.displayName ?? "TikTok account"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => onDisconnect(c)}
                  disabled={disconnectingId === c.id}
                  style={styles.disconnectButton}
                >
                  <Text style={styles.disconnectButtonText}>{disconnectingId === c.id ? "…" : "Disconnect"}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

      </View>

      {/* YouTube card */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>{t("connectPlatforms.youtube")}</Text>
              <InfoButton
                network={t("connectPlatforms.youtube")}
                body={t("connectPlatforms.yt.details")}
              />
            </View>
            <Text style={styles.cardSubtitle}>{t("connectPlatforms.yt.subtitle")}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => onConnect("youtube")}
          disabled={connecting}
          style={[styles.connectButton, { backgroundColor: "#FF0000" }, connecting && styles.connectButtonBusy]}
        >
          {connecting && connectingNetwork === "youtube" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="logo-youtube" size={16} color="#fff" />
              <Text style={styles.connectButtonText}>
                {youtubeConnections.length > 0 ? "Reconnect" : "Connect YouTube"}
              </Text>
            </>
          )}
        </Pressable>

        {connections === null ? null : youtubeConnections.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>{t("connectPlatforms.notConnected")}</Text>
          </View>
        ) : (
          <View style={styles.connectionsList}>
            {youtubeConnections.map((c) => (
              <View key={c.id} style={styles.connectionRow}>
                <View style={styles.connectionLeft}>
                  {c.pictureUrl ? (
                    <Image source={{ uri: c.pictureUrl }} style={styles.connectionAvatar} />
                  ) : (
                    <View style={[styles.connectionAvatar, styles.connectionAvatarFallback]}>
                      <Text style={styles.connectionAvatarFallbackText}>
                        {(c.displayName ?? "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.connectionInfo}>
                    <Text style={styles.connectionName} numberOfLines={1}>
                      {c.displayName ?? "YouTube channel"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => onDisconnect(c)}
                  disabled={disconnectingId === c.id}
                  style={styles.disconnectButton}
                >
                  <Text style={styles.disconnectButtonText}>{disconnectingId === c.id ? "…" : "Disconnect"}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

      </View>
    </ScrollView>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: tokens.bg },
    scrollContent: { padding: 16, paddingBottom: 48 },
    flash: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: tokens.infoBg,
      borderWidth: 1,
      borderColor: tokens.infoBorder,
      marginBottom: 12,
    },
    flashText: {
      flex: 1,
      fontSize: 13,
      color: tokens.infoText,
    },
    errorBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      padding: 10,
      borderRadius: 8,
      backgroundColor: tokens.dangerBg,
      borderWidth: 1,
      borderColor: tokens.dangerBorder,
      marginBottom: 12,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      color: tokens.danger,
    },
    card: {
      backgroundColor: tokens.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    cardHeaderText: {
      flex: 1,
    },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: tokens.text,
    },
    cardSubtitle: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 19,
      color: tokens.textSecondary,
    },
    connectButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: "#1877F2", // Facebook blue
    },
    connectButtonLinkedIn: {
      backgroundColor: "#0A66C2", // LinkedIn blue
    },
    connectButtonBusy: {
      opacity: 0.7,
    },
    connectButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#fff",
    },
    loadingBlock: {
      alignItems: "center",
      paddingVertical: 24,
    },
    emptyBlock: {
      marginTop: 14,
      padding: 14,
      borderRadius: 10,
      backgroundColor: tokens.surfaceMuted,
      borderWidth: 1,
      borderColor: tokens.borderSubtle,
      borderStyle: "dashed",
    },
    emptyText: {
      fontSize: 13,
      color: tokens.textSubtle,
      lineHeight: 19,
    },
    connectionsList: {
      marginTop: 14,
      gap: 8,
    },
    connectionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: tokens.surfaceMuted,
      borderWidth: 1,
      borderColor: tokens.borderSubtle,
    },
    connectionLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    connectionAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.surface,
    },
    connectionAvatarFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.accentLight,
    },
    connectionAvatarLinkedInFallback: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E0F2FE", // sky-100
    },
    connectionAvatarFallbackText: {
      fontWeight: "700",
      color: tokens.accent,
    },
    connectionInfo: { flex: 1 },
    connectionName: {
      fontSize: 14,
      fontWeight: "700",
      color: tokens.text,
    },
    connectionSubtext: {
      fontSize: 12,
      color: tokens.textSubtle,
      marginTop: 2,
    },
    igBadge: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: "#FCE7F3",
    },
    igBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#BE185D",
    },
    disconnectButton: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: tokens.surface,
      borderWidth: 1,
      borderColor: tokens.border,
    },
    disconnectButtonText: {
      fontSize: 11,
      fontWeight: "700",
      color: tokens.text,
    },
  });
}
