import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';

interface NavBarProps {
  logo: string;
}

const NavBar: React.FC<NavBarProps> = ({ logo }) => {
  const location = useLocation();

  const getPageName = () => {
    switch(location.pathname) {
      case '/':
        return 'Navigation Hub';
      case '/staff-resources':
        return 'Staff & Resources';
      case '/customer-management':
        return 'Customer Management';
      case '/purchase-orders':
        return 'Purchase Orders';
      case '/raw-goods':
        return 'Raw Goods';
      case '/bom-assemblies':
        return 'BOM Assemblies';
      case '/finished-goods':
        return 'Finished Goods';
      case '/work-orders':
        return 'Work Orders';
      case '/sales-orders':
        return 'Sales Orders';
      case '/dashboard':
        return 'Dashboard';
      default:
        return 'Restaurant Manager';
    }
  };

  return (
    <nav className="bg-blue-600 text-white py-2 px-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center flex-1">
          {logo ? (
            <img src={logo} alt="Restaurant Logo" className="w-16 h-16" />
          ) : (
            <span className="text-5xl">🐝</span>
          )}
        </div>
        <h1 className="text-3xl font-bold flex-2 text-center">{getPageName()}</h1>
        <div className="flex items-center justify-end flex-1">
          <Link to="/" className="bg-blue-500 hover:bg-blue-400 p-3 rounded-full transition-colors">
            <Home size={32} />
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;