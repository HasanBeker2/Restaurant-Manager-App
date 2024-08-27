import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const HomeButton: React.FC = () => {
  return (
    <Link 
      to="/" 
      className="fixed top-4 left-4 bg-sky-700 text-white p-2 rounded-full shadow-lg hover:bg-sky-600 transition-colors"
      title="Return to Navigation Hub"
    >
      <Home size={24} />
    </Link>
  );
};

export default HomeButton;