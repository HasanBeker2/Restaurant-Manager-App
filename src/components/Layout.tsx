import React from 'react';
import NavBar from './NavBar';

interface LayoutProps {
  logo: string;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ logo, children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar logo={logo} />
      <div className="flex-grow bg-gradient-to-b from-blue-200 to-blue-400">
        {children}
      </div>
    </div>
  );
};

export default Layout;