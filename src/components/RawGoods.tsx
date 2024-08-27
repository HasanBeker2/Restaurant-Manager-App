import React from 'react';
import Layout from './Layout';

interface RawGoodsProps {
  logo: string;
  restaurantName: string;
}

const RawGoods: React.FC<RawGoodsProps> = ({ logo, restaurantName }) => {
  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-6 text-center text-white">Raw Goods</h1>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Inventory Levels</h2>
          <p>Monitor current stock levels of raw ingredients.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Expiration Tracking</h2>
          <p>Track expiration dates of perishable goods.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Reorder Points</h2>
          <p>Set and manage reorder points for automatic purchase orders.</p>
        </div>
      </div>
    </Layout>
  );
};

export default RawGoods;