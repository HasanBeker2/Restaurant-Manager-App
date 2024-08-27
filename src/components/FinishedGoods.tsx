import React from 'react';
import Layout from './Layout';

interface FinishedGoodsProps {
  logo: string;
  restaurantName: string;
}

const FinishedGoods: React.FC<FinishedGoodsProps> = ({ logo, restaurantName }) => {
  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-6 text-center text-white">Finished Goods</h1>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Menu Items</h2>
          <p>Manage and track available menu items.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Quality Control</h2>
          <p>Implement and monitor quality control measures for finished dishes.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4">
          <h2 className="text-2xl font-semibold mb-4">Pricing</h2>
          <p>Set and adjust prices for menu items based on costs and market factors.</p>
        </div>
        <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Inventory Tracking</h2>
          <p>Monitor inventory levels of prepared dishes and manage restocking.</p>
        </div>
      </div>
    </Layout>
  );
};

export default FinishedGoods;