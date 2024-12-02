import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User,
  ShoppingCart,
  Package,
  UserCog,
  CookingPot,
  ClipboardCheck,
  Truck,
  Receipt,
  BarChart,
  LogOut,
  Pencil,
  ClipboardList,
  List,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { User as FirebaseUser } from 'firebase/auth';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label }) => (
  <Link
    to={to}
    className="flex flex-col items-center justify-center w-32 h-32 bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-colors"
  >
    <div className="flex-grow flex items-center justify-center mb-1">{icon}</div>
    <span className="text-sm text-center px-2 pb-2">{label}</span>
  </Link>
);

interface NavigationHubProps {
  logo: string;
  restaurantName: string;
  updateLogoAndName: (logo: string, name: string) => void;
  user: FirebaseUser;
}

const NavigationHub: React.FC<NavigationHubProps> = ({
  logo,
  restaurantName,
  updateLogoAndName,
  user,
}) => {
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const navigate = useNavigate();

  const handleSettingsClick = () => {
    setShowSettingsPopup(true);
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateLogoAndName(reader.result as string, restaurantName);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateLogoAndName(logo, event.target.value);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/signin');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-200 to-blue-400 p-4 relative">
      {/* Sign Out Butonu */}
      <button
        onClick={handleSignOut}
        className="absolute top-4 right-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-400 transition-colors flex items-center"
      >
        <LogOut size={24} className="mr-2" />
        <span>Sign Out</span>
      </button>
      <div className="max-w-3xl mx-auto">
        {/* Logo ve İsim */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <button
              onClick={handleSettingsClick}
              className="absolute -top-2 -left-2 bg-blue-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            >
              <Pencil size={16} />
            </button>
            <div className="flex items-center mb-2">
              {logo ? (
                <img src={logo} alt="Restaurant Logo" className="w-24 h-24 mr-4 object-contain" />
              ) : (
                <span className="text-5xl mr-4">🐝</span>
              )}
              <h1 className="text-3xl font-bold text-blue-600">{restaurantName}</h1>
            </div>
          </div>
        </div>
        {/* Navigasyon Grid'i */}
        <div className="grid grid-cols-3 gap-2 justify-items-center mb-4">
          <NavItem to="/staff-resources" icon={<User size={36} />} label="Staff & Resources" />
          <NavItem to="/customer-management" icon={<UserCog size={36} />} label="Customer Mgmt." />
          <NavItem to="/suppliers" icon={<Truck size={36} />} label="Suppliers" />
          <NavItem to="/raw-goods" icon={<Package size={36} />} label="Raw Goods" />
          <NavItem to="/bom-assemblies" icon={<CookingPot size={36} />} label="BOM Assemblies" />
          <NavItem to="/stock-count" icon={<ClipboardCheck size={36} />} label="Stock Count" />
          <NavItem to="/purchase-orders" icon={<ShoppingCart size={36} />} label="Purchase Orders" />
          <NavItem to="/sales-orders" icon={<Receipt size={36} />} label="Sales Orders" />
          <NavItem to="/dashboard" icon={<BarChart size={36} />} label="Dashboard" />
          {/* Yeni Navigasyon Öğeleri */}
          <NavItem to="/raw-goods-list" icon={<List size={36} />} label="Raw Goods List" />
          <NavItem
            to="/finished-products-list"
            icon={<ClipboardList size={36} />}
            label="Finished Products List"
          />
        </div>
      </div>
      {showSettingsPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <h2 className="text-2xl font-bold mb-4">Change Logo & Name</h2>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="mb-4"
            />
            <input
              type="text"
              value={restaurantName}
              onChange={handleNameChange}
              className="border p-2 mb-4 w-full"
              placeholder="Enter restaurant name"
            />
            <div className="flex justify-end">
              <button
                className="bg-blue-500 text-white px-4 py-2 rounded mr-2 hover:bg-blue-400"
                onClick={() => setShowSettingsPopup(false)}
              >
                Save
              </button>
              <button
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
                onClick={() => setShowSettingsPopup(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NavigationHub;
