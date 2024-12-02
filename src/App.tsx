import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { auth } from './firebase';
import { User as FirebaseUser } from 'firebase/auth';
import SignIn from './components/SignIn';
import NavigationHub from './components/NavigationHub';
import Dashboard from './components/Dashboard';
import StaffResources from './components/StaffResources';
import CustomerManagement from './components/CustomerManagement';
import PurchaseOrders from './components/PurchaseOrders';
import RawGoods from './components/RawGoods';
import BOMAssemblies from './components/BOMAssemblies';
import StockCount from './components/StockCount';
import Suppliers from './components/Suppliers';
import SalesOrders from './components/SalesOrders';
import RawGoodsList from './components/RawGoodsList';
import FinishedProductsList from './components/FinishedProductsList';

const App: React.FC = () => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [logo, setLogo] = useState<string>(
    () => localStorage.getItem('restaurantLogo') || '/path-to-dummy-logo.png'
  );
  const [restaurantName, setRestaurantName] = useState<string>(
    () => localStorage.getItem('restaurantName') || 'My Restaurant'
  );

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        // Load user-specific logo and name if available
        const userLogo = localStorage.getItem(`logo_${user.uid}`);
        const userName = localStorage.getItem(`name_${user.uid}`);
        if (userLogo) setLogo(userLogo);
        if (userName) setRestaurantName(userName);
      }
    });
    return () => unsubscribe();
  }, []);

  const updateLogoAndName = (newLogo: string, newName: string) => {
    setLogo(newLogo);
    setRestaurantName(newName);
    if (user) {
      localStorage.setItem(`logo_${user.uid}`, newLogo);
      localStorage.setItem(`name_${user.uid}`, newName);
    }
  };

  const pageProps = { logo, restaurantName };

  return (
    <Router>
      <Routes>
        <Route path="/signin" element={!user ? <SignIn /> : <Navigate to="/" replace />} />
        <Route
          path="/"
          element={
            user ? (
              <NavigationHub
                logo={logo}
                restaurantName={restaurantName}
                updateLogoAndName={updateLogoAndName}
                user={user}
              />
            ) : (
              <Navigate to="/signin" replace />
            )
          }
        />
        <Route path="/dashboard" element={<Dashboard {...pageProps} />} />
        <Route path="/staff-resources" element={<StaffResources {...pageProps} />} />
        <Route path="/customer-management" element={<CustomerManagement {...pageProps} />} />
        <Route path="/purchase-orders" element={<PurchaseOrders {...pageProps} />} />
        <Route path="/raw-goods" element={<RawGoods {...pageProps} />} />
        <Route path="/bom-assemblies" element={<BOMAssemblies {...pageProps} />} />
        <Route path="/stock-count" element={<StockCount {...pageProps} />} />
        <Route path="/suppliers" element={<Suppliers {...pageProps} />} />
        <Route path="/sales-orders" element={<SalesOrders {...pageProps} />} />
        {/* Yeni Rotalar */}
        <Route path="/raw-goods-list" element={<RawGoodsList {...pageProps} />} />
        <Route path="/finished-products-list" element={<FinishedProductsList {...pageProps} />} />
      </Routes>
    </Router>
  );
};

export default App;
