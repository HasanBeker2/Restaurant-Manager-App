import React from 'react';
import NavBar from './NavBar';

interface LayoutProps {
  logo: string;
  restaurantName: string; // Yeni eklenen özellik
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ logo, restaurantName, children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar logo={logo} restaurantName={restaurantName} /> {/* NavBar bileşenine restaurantName prop'unu geçin */}
      <div className="flex-grow bg-gradient-to-b from-blue-200 to-blue-400">
        {children}
      </div>
    </div>
  );
};

export default Layout;
