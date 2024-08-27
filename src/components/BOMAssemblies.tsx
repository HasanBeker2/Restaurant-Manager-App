import React from 'react';
import Layout from './Layout';

interface BOMAssembliesProps {
  logo: string;
  restaurantName: string;
}

const BOMAssemblies: React.FC<BOMAssembliesProps> = ({ logo, restaurantName }) => {
  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-6 text-center text-white">BOM Assemblies</h1>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Recipe Management</h2>
          <p>Create and manage recipes for menu items.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Cost Calculation</h2>
          <p>Calculate costs for finished goods based on raw ingredients.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Inventory Usage</h2>
          <p>Track how recipes impact raw goods inventory levels.</p>
        </div>
      </div>
    </Layout>
  );
};

export default BOMAssemblies;