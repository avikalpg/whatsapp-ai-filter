import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useAppStore } from '../src/stores/appStore';
import { saveCustomApiKey } from '../src/api/chat';

const SERVER_URL = 'https://whatsapp-ai-filter.vercel.app';

export default function SettingsScreen() {
  const { authToken, trialExpiresAt, unlink } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const trialExpired = trialExpiresAt ? new Date(trialExpiresAt) < new Date() : false;
  const trialDaysLeft = trialExpiresAt
    ? Math.max(0, Math.ceil((new Date(trialExpiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  async function handleSaveApiKey() {
    if (!authToken) return;
    if (!apiKey.startsWith('sk-ant-')) {
      Alert.alert('Invalid Key', 'Please enter a valid Claude API key (starts with sk-ant-)');
      return;
    }
    setSaving(true);
    try {
      await saveCustomApiKey(apiKey, authToken, SERVER_URL);
      Alert.alert('Saved', 'Your API key has been saved securely.');
      setApiKey('');
    } catch (e: unknown) {
      Alert.alert('Error', String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleUnlink() {
    Alert.alert('Unlink WhatsApp', 'This will disconnect your WhatsApp account. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: unlink },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Trial status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {trialExpired ? (
          <View style={styles.trialBadge}>
            <Text style={styles.trialExpiredText}>Free trial expired</Text>
          </View>
        ) : (
          <View style={[styles.trialBadge, styles.trialActive]}>
            <Text style={styles.trialActiveText}>
              Free trial: {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} remaining
            </Text>
          </View>
        )}
      </View>

      {/* Custom API key */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Claude API Key (optional)</Text>
        <Text style={styles.hint}>
          Use your own Anthropic API key for unlimited access. Get one at console.anthropic.com.
        </Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="sk-ant-..."
          placeholderTextColor="#999"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSaveApiKey}
          disabled={saving}
        >
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save API Key'}</Text>
        </TouchableOpacity>
      </View>

      {/* Unlink */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WhatsApp</Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleUnlink}>
          <Text style={styles.dangerButtonText}>Unlink WhatsApp Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 24, gap: 24 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 13, color: '#666', lineHeight: 18 },
  trialBadge: { backgroundColor: '#f0f0f0', borderRadius: 8, padding: 10 },
  trialActive: { backgroundColor: '#e8f5e9' },
  trialActiveText: { color: '#2e7d32', fontSize: 14, fontWeight: '500' },
  trialExpiredText: { color: '#c62828', fontSize: 14, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 14, color: '#333', backgroundColor: '#fafafa',
  },
  button: { backgroundColor: '#007AFF', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dangerButton: { borderWidth: 1, borderColor: '#ff3b30', borderRadius: 8, padding: 14, alignItems: 'center' },
  dangerButtonText: { color: '#ff3b30', fontSize: 15, fontWeight: '600' },
});
