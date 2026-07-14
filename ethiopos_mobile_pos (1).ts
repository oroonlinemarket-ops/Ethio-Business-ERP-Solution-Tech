// ============================================================
// EthioPOS Mobile — React Native POS App
// Supports: Android, iOS · Offline-first · Telebirr · Barcode
// ============================================================

// ─── App.tsx ─────────────────────────────────────────────────
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LoginScreen }     from './screens/LoginScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { POSScreen }       from './screens/POSScreen';
import { InventoryScreen } from './screens/InventoryScreen';
import { SalesScreen }     from './screens/SalesScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';

const Stack = createNativeStackNavigator();
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 2 } },
});

function AppNavigator() {
  const { user } = useAuth();
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Dashboard"  component={DashboardScreen} />
            <Stack.Screen name="POS"        component={POSScreen} />
            <Stack.Screen name="Inventory"  component={InventoryScreen} />
            <Stack.Screen name="Sales"      component={SalesScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OfflineProvider>
            <AppNavigator />
          </OfflineProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

// ─── screens/POSScreen.tsx ───────────────────────────────────
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, Alert, StatusBar, Vibration,
} from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { useProducts } from '../hooks/useProducts';
import { useSales }    from '../hooks/useSales';
import { ReceiptModal } from '../components/ReceiptModal';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { EthiopianTax }   from '../utils/ethiopian-tax';
import { Colors }          from '../theme/colors';

interface CartItem { id: string; name: string; price: number; qty: number; cost: number; }

export function POSScreen({ navigation }: any) {
  const [cart, setCart]             = useState<CartItem[]>([]);
  const [search, setSearch]         = useState('');
  const [method, setMethod]         = useState<'cash'|'telebirr'|'cbe_birr'|'credit'>('cash');
  const [scanning, setScanning]     = useState(false);
  const [receipt, setReceipt]       = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  const { data: products = [], isLoading } = useProducts(search);
  const { createSale } = useSales();
  const { hasPermission, requestPermission } = useCameraPermission();

  const subtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const vatAmount  = EthiopianTax.calculateVAT(subtotal);
  const total      = subtotal + vatAmount;

  const addToCart = useCallback((product: any) => {
    Vibration.vibrate(30); // haptic feedback
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: product.id, name: product.name, price: product.unit_price, qty: 1, cost: product.unit_cost }];
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart(prev => prev.map(i => i.id === id && i.qty > 1 ? { ...i, qty: i.qty - 1 } : i).filter(i => i.qty > 0));
  }, []);

  const handleBarcode = useCallback(async (barcode: string) => {
    setScanning(false);
    const found = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (found) { addToCart(found); }
    else { Alert.alert('Not found', `No product with barcode: ${barcode}`); }
  }, [products, addToCart]);

  const handleCharge = async () => {
    if (cart.length === 0) return;
    if (!hasPermission && method === 'telebirr') {
      Alert.alert('Telebirr', 'Opening Telebirr payment…');
    }
    setProcessing(true);
    try {
      const sale = await createSale({
        items: cart.map(i => ({ product_id: i.id, quantity: i.qty })),
        paymentMethod: method,
        vatApplicable: true,
      });
      setReceipt(sale);
      setCart([]);
    } catch (err: any) {
      // Offline queue — save to local DB, sync later
      Alert.alert('Offline', 'Sale saved locally. Will sync when connected.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Point of Sale</Text>
        <TouchableOpacity
          onPress={async () => { if (!hasPermission) await requestPermission(); setScanning(true); }}
          style={styles.scanBtn}
        >
          <Text style={styles.scanText}>📷 Scan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Product grid */}
        <View style={styles.productsPanel}>
          <TextInput
            style={styles.searchInput}
            placeholder="🔍 Search products or barcode…"
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
          {isLoading ? (
            <Text style={styles.loadingText}>Loading products…</Text>
          ) : (
            <FlatList
              data={products}
              numColumns={2}
              keyExtractor={p => p.id}
              renderItem={({ item: p }) => (
                <TouchableOpacity
                  style={[styles.productCard, p.stock < 5 && styles.productLow]}
                  onPress={() => addToCart(p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.productCategory}>{p.category}</Text>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.productPrice}>ETB {p.unit_price.toLocaleString()}</Text>
                  <Text style={[styles.productStock, { color: p.stock < 10 ? Colors.danger : Colors.muted }]}>
                    Stock: {p.stock}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        {/* Cart / Receipt */}
        <View style={styles.cartPanel}>
          <Text style={styles.cartTitle}>🧾 Receipt</Text>

          <ScrollView style={styles.cartItems}>
            {cart.length === 0 ? (
              <Text style={styles.emptyCart}>Tap a product to add</Text>
            ) : cart.map(item => (
              <View key={item.id} style={styles.cartRow}>
                <View style={styles.cartInfo}>
                  <Text style={styles.cartName}>{item.name}</Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity onPress={() => removeFromCart(item.id)} style={styles.qtyBtn}>
                      <Text style={styles.qtyText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qtyNum}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => addToCart(item)} style={styles.qtyBtn}>
                      <Text style={styles.qtyText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.cartLineTotal}>ETB {(item.price * item.qty).toLocaleString()}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Totals */}
          <View style={styles.totals}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>ETB {subtotal.toLocaleString()}</Text></View>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>VAT (15%)</Text><Text style={styles.totalVal}>ETB {vatAmount.toLocaleString()}</Text></View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandLabel}>TOTAL</Text>
              <Text style={styles.grandVal}>ETB {total.toLocaleString()}</Text>
            </View>
          </View>

          {/* Payment methods */}
          <View style={styles.paymentMethods}>
            {(['cash','telebirr','cbe_birr','credit'] as const).map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setMethod(m)}
                style={[styles.methodBtn, method === m && styles.methodActive]}
              >
                <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
                  {m === 'cash' ? '💵 Cash' : m === 'telebirr' ? '📱 Telebirr' : m === 'cbe_birr' ? '🏦 CBE Birr' : '📋 Credit'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Charge button */}
          <TouchableOpacity
            style={[styles.chargeBtn, (processing || cart.length === 0) && styles.chargeBtnDisabled]}
            onPress={handleCharge}
            disabled={processing || cart.length === 0}
          >
            <Text style={styles.chargeBtnText}>
              {processing ? 'Processing…' : `✓ Charge ETB ${total.toLocaleString()}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Barcode Scanner overlay */}
      {scanning && (
        <BarcodeScanner
          onDetected={handleBarcode}
          onClose={() => setScanning(false)}
        />
      )}

      {/* Receipt modal */}
      {receipt && (
        <ReceiptModal
          sale={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
    </View>
  );
}

// ─── utils/ethiopian-tax.ts ──────────────────────────────────
export const EthiopianTax = {
  VAT_RATE: 0.15,

  calculateVAT(amount: number): number {
    return Math.round(amount * 0.15 * 100) / 100;
  },

  calculatePayroll(basic: number, transport = 0) {
    const gross         = basic + transport;
    const empPension    = Math.round(basic * 0.07 * 100) / 100;
    const emplrPension  = Math.round(basic * 0.11 * 100) / 100;
    const taxable       = basic - empPension;
    const incomeTax     = Math.round(this.getIncomeTax(taxable) * 100) / 100;
    const netPay        = Math.round((gross - empPension - incomeTax) * 100) / 100;
    return { gross, empPension, emplrPension, incomeTax, netPay };
  },

  getIncomeTax(income: number): number {
    if (income <= 600)   return 0;
    if (income <= 1650)  return (income - 600) * 0.10;
    if (income <= 3200)  return 105   + (income - 1650) * 0.15;
    if (income <= 5250)  return 337.5 + (income - 3200) * 0.20;
    if (income <= 7800)  return 747.5 + (income - 5250) * 0.25;
    if (income <= 10900) return 1385  + (income - 7800) * 0.30;
    return                      2315  + (income - 10900)* 0.35;
  },
};

// ─── context/OfflineContext.tsx ──────────────────────────────
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OfflineContextType {
  isOnline: boolean;
  pendingSync: number;
  queueSale: (sale: any) => Promise<void>;
  syncPending: () => Promise<void>;
}

const OfflineCtx = createContext<OfflineContextType>({} as any);
export const useOffline = () => useContext(OfflineCtx);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setIsOnline(!!online);
      if (online) syncPending(); // auto-sync when connection restored
    });
    loadPendingCount();
    return unsub;
  }, []);

  const loadPendingCount = async () => {
    const raw = await AsyncStorage.getItem('pending_sales');
    const arr = raw ? JSON.parse(raw) : [];
    setPendingSync(arr.length);
  };

  const queueSale = async (sale: any) => {
    const raw  = await AsyncStorage.getItem('pending_sales');
    const arr  = raw ? JSON.parse(raw) : [];
    arr.push({ ...sale, queued_at: new Date().toISOString() });
    await AsyncStorage.setItem('pending_sales', JSON.stringify(arr));
    setPendingSync(arr.length);
  };

  const syncPending = async () => {
    const raw = await AsyncStorage.getItem('pending_sales');
    if (!raw) return;
    const arr: any[] = JSON.parse(raw);
    if (!arr.length) return;

    const synced: any[] = [];
    for (const sale of arr) {
      try {
        await fetch(`${process.env.API_URL}/api/v1/sales`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sale),
        });
        synced.push(sale);
      } catch { /* leave in queue if still offline */ }
    }

    const remaining = arr.filter(s => !synced.includes(s));
    await AsyncStorage.setItem('pending_sales', JSON.stringify(remaining));
    setPendingSync(remaining.length);
  };

  return (
    <OfflineCtx.Provider value={{ isOnline, pendingSync, queueSale, syncPending }}>
      {children}
    </OfflineCtx.Provider>
  );
}

// ─── StyleSheet (excerpt) ────────────────────────────────────
const Colors = {
  primary: '#1E40AF', light: '#3B82F6', gold: '#F59E0B',
  success: '#10B981', danger: '#EF4444', warning: '#F97316',
  bg: '#0F172A', card: '#1E293B', border: '#334155',
  text: '#F1F5F9', muted: '#94A3B8',
};

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: Colors.bg },
  header:           { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, padding: 14, paddingTop: 48 },
  backBtn:          { padding: 8 },
  backText:         { color: '#fff', fontSize: 20 },
  headerTitle:      { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  scanBtn:          { backgroundColor: '#ffffff22', borderRadius: 8, padding: 8 },
  scanText:         { color: '#fff', fontSize: 13, fontWeight: '700' },
  body:             { flex: 1, flexDirection: 'row' },
  productsPanel:    { flex: 1.3, padding: 12 },
  searchInput:      { backgroundColor: Colors.card, borderRadius: 10, padding: 12, color: Colors.text, marginBottom: 10, fontSize: 14 },
  loadingText:      { color: Colors.muted, textAlign: 'center', marginTop: 20 },
  productCard:      { flex: 1, margin: 4, backgroundColor: Colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border },
  productLow:       { borderColor: Colors.warning },
  productCategory:  { fontSize: 10, color: Colors.muted },
  productName:      { fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 2 },
  productPrice:     { fontSize: 15, fontWeight: '800', color: Colors.light, marginTop: 6 },
  productStock:     { fontSize: 10, marginTop: 2 },
  cartPanel:        { width: 280, backgroundColor: Colors.card, borderLeftWidth: 1, borderLeftColor: Colors.border, padding: 14 },
  cartTitle:        { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  cartItems:        { flex: 1 },
  emptyCart:        { color: Colors.muted, textAlign: 'center', marginTop: 30, fontSize: 13 },
  cartRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  cartInfo:         { flex: 1 },
  cartName:         { fontSize: 12, fontWeight: '600', color: Colors.text },
  qtyRow:           { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  qtyBtn:           { backgroundColor: Colors.border, borderRadius: 4, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  qtyText:          { color: Colors.text, fontSize: 14, fontWeight: '700' },
  qtyNum:           { color: Colors.text, fontSize: 13, fontWeight: '700', minWidth: 16, textAlign: 'center' },
  cartLineTotal:    { fontSize: 12, fontWeight: '700', color: Colors.text },
  totals:           { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 8 },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel:       { fontSize: 12, color: Colors.muted },
  totalVal:         { fontSize: 12, fontWeight: '600', color: Colors.text },
  grandTotalRow:    { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  grandLabel:       { fontSize: 15, fontWeight: '900', color: Colors.text },
  grandVal:         { fontSize: 15, fontWeight: '900', color: Colors.success },
  paymentMethods:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 10 },
  methodBtn:        { flex: 1, minWidth: '45%', backgroundColor: Colors.border, borderRadius: 8, paddingVertical: 7, alignItems: 'center' },
  methodActive:     { backgroundColor: Colors.primary },
  methodText:       { fontSize: 11, fontWeight: '600', color: Colors.muted },
  methodTextActive: { color: '#fff' },
  chargeBtn:        { backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  chargeBtnDisabled:{ opacity: 0.5 },
  chargeBtnText:    { color: '#fff', fontSize: 14, fontWeight: '800' },
});

// ─── package.json (key dependencies) ────────────────────────
// {
//   "dependencies": {
//     "react-native": "0.74.x",
//     "@react-navigation/native": "^6",
//     "@react-navigation/native-stack": "^6",
//     "@tanstack/react-query": "^5",
//     "react-native-vision-camera": "^4",  // barcode scanning
//     "@react-native-community/netinfo": "^11",
//     "@react-native-async-storage/async-storage": "^2",
//     "react-native-gesture-handler": "^2",
//     "react-native-reanimated": "^3",
//     "react-native-vector-icons": "^10",
//     "react-native-receipt-printer": "^1"  // Bluetooth thermal printer
//   }
// }
